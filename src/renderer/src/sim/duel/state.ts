// The duel's state (spec §8, §13): today's SimState for the Cutter interior, the tactical state, who is present, and
// the repair progress of each tactical room. Only the interior systems the duel lists ever run on `interior`.
import { RECRUIT } from '../characters';
import { DoorState, roomAt } from '../grid';
import type { ShipLayout } from '../ship/schema';
import { createSimState, disposeSimState, type SimState } from '../state';
import { StationKind } from '../stationKinds';
import { validateMap } from '../tactical/map';
import { classIndexById, DUEL_CLASSES, ShipClass } from '../tactical/defs';
import { createTacticalState, type TacticalState } from '../tactical/state';
import { DUEL_REPAIR_POINTS } from './tuning';

/** Sci-2 spec §3: a duel crew is 2, 3 or 4 players, fixed for the run. Every value indexed by player is n long. */
export const DUEL_CREW_MIN = 2, DUEL_CREW_MAX = 4;
export type DuelCrew = 2 | 3 | 4;
/** Valkyrn spec §4.4: a local duel (single player) may have a crew of one; online keeps DUEL_CREW_MIN. */
export const LOCAL_CREW_MIN = 1;

export interface RepairPoint { tacticalRoom: number; room: number; tile: number }

/** Per-tick repair and fire events (H-0c-ii-a spec §4, duel-fire spec §1.5), for telemetry and views. Derived, not
 *  state: cleared every tick and not hashed. `room` is always a tactical Room. `repairWork`: a player added repair work
 *  to a Room this tick. `repairDone`: the Room's level dropped this tick; `players` names everyone who worked on it this
 *  tick, ascending. `fireWork`: a player worked on putting out the Room's fire. `fireOut`: the fire went out this tick,
 *  `players` as for repairDone. `fireStart`: an enemy hit set the Room's repair room alight. */
export type RepairEvent =
  | { kind: 'repairWork'; player: number; room: number }
  | { kind: 'repairDone'; room: number; players: number[] }
  | { kind: 'fireWork'; player: number; room: number }
  | { kind: 'fireOut'; room: number; players: number[] }
  | { kind: 'fireStart'; room: number };

/** Per-tick health events (duel-health spec §1.7), derived and unhashed like RepairEvent. `crewHurt`: pid lost `amount`
 *  health this tick to a fire or a hit. `downed`: pid reached 0 and went down. `revived`: pid stood up at 1 health; `by`
 *  names the teammates in reach, ascending. */
export type HealthEvent =
  | { kind: 'crewHurt'; player: number; amount: number; cause: 'fire' | 'hit' }
  | { kind: 'downed'; player: number }
  | { kind: 'revived'; player: number; by: number[] };

export interface DuelState {
  interior: SimState;
  tactical: TacticalState;
  /** Whether each player is at the keyboard (spec §8 "present or away"), n long (Sci-2 spec §4.1), all true at creation. */
  present: boolean[];
  /** Repair progress per tactical Room (index = Room), in REPAIR_UNITS. */
  repair: [number, number, number];
  /** Resolved repair points, in tactical Room order. */
  points: RepairPoint[];
  /** Station indices of the two consoles that are roles (spec §8). */
  nav: number; weapons: number;
  /** The Science console's station index (Sci-1 spec §6.1), or −1 when the layout has none. */
  science: number;
  /** This tick's repair and fire events: every repairWork or fireWork in player order, then each Room's repairDone or
   *  fireOut in Room order (repairPhase), then any fireStart in tactical event order (firePhase, after stepDuel), then the
   *  health events (healthPhase): crewHurt from hits in tactical event order, crewHurt from fire, downed, revived. */
  events: (RepairEvent | HealthEvent)[];
  /** The round module (H-2 spec §7): this round's index from 0, the player seated at the Helm when it began, the
   *  encounter tick it began on, and the tick right after its deciding step (−1 while it runs). helmPlayer is a player id
   *  0..n−1 (Sci-2 spec §4.1). */
  round: number; helmPlayer: number; baseTick: number; decidedTick: number;
  /** The helm module (Artemis spec §5.1): the Helm's throttle level, an integer −1..4 (sim/duel/throttle.ts). Kept
   *  across stand and sit; 0 in a fresh duel, so a new round starts at STOP. */
  throttle: number;
  /** The helm module (Feel-ii spec §1.1): the heading index 0..255 the Helm holds (click-to-heading), or −1 for none.
   *  Set by the `heading` command; A/D or auto-face held at the Helm clears it. −1 in a fresh duel and every new round. */
  holdHeading: number;
  /** Valkyrn spec §6.1: the crew slot's class index (SHIP_CLASSES): createDuel's `cls`, else the layout's `shipClass`,
   *  else the Cutter. Hashed and snapshotted as the tactical `systems.0.cls`, which always equals it, and carried in the
   *  snapshot header; a rematch keeps it. */
  crewClass: number;
}

/**
 * A duel on `layout` (the Hound in the app; the Cutter in older tests): `crew` trait-free Recruits (1..4 locally,
 * Valkyrn spec §4.4; online callers keep 2..4; equal to the layout's `crew` when it sets one; no XP is ever awarded,
 * since xpSystem never runs), every door held open, every player standing at the layout's spawns in player order with
 * every console free (start-aboard spec §1; `helmPlayer` is kept for the round module and the wire but seats no one),
 * and a tactical state from the same seed, its crew slot of class `cls` (else the layout's `shipClass`, else the Cutter;
 * Valkyrn spec §6.1), whose map must validate. Round 0, beginning on tick 0, the throttle at STOP. Throws if the crew,
 * the Helm player, the class, the map or a repair point is invalid, so a bad seed or layout fails loudly; the crew and
 * class checks run before anything is allocated.
 */
export function createDuel(layout: ShipLayout, seed: number, helmPlayer = 0, crew: number = DUEL_CREW_MIN, cls?: number): DuelState {
  if (!Number.isInteger(crew) || crew < LOCAL_CREW_MIN || crew > DUEL_CREW_MAX) throw new Error(`invalid duel crew ${String(crew)}`);
  if (layout.crew !== undefined && layout.crew !== crew) throw new Error(`duel layout ${layout.id} is crewed by ${layout.crew}, not ${crew}`);   // Valkyrn spec §4.4: one source
  if (crew > layout.spawns.length) throw new Error(`duel layout ${layout.id} has ${layout.spawns.length} spawns, too few for a crew of ${crew}`);
  if (!Number.isInteger(helmPlayer) || helmPlayer < 0 || helmPlayer >= crew) throw new Error(`invalid duel helm player ${String(helmPlayer)}`);
  const crewClass = cls ?? (layout.shipClass !== undefined ? classIndexById(layout.shipClass) : ShipClass.Cutter);
  const tactical = createTacticalState(seed, DUEL_CLASSES.length, crewClass);   // throws for a class that is not a crew class
  const problems = validateMap(tactical.map);
  if (problems.length > 0) throw new Error(`invalid duel map for seed ${seed}: ${problems[0]}`);
  const interior = createSimState(layout, crew, seed, Array<number>(crew).fill(RECRUIT));
  try {
    interior.doors.state.fill(DoorState.HeldOpen);
    const nav = interior.derived.stationOfKind[StationKind.Navigation]!, weapons = interior.derived.stationOfKind[StationKind.Weapons]!;
    if (nav < 0 || weapons < 0) throw new Error('duel layout needs Navigation and Weapons consoles');
    const science = interior.derived.stationOfKind[StationKind.Science] ?? -1;   // Sci-1 spec §6.1: the third seat
    // Valkyrn spec §5: Navigation and Weapons share one console group (the Flight seat) only for a crew of one.
    const gn = interior.derived.stationGroup[nav]!;
    if (gn >= 0 && gn === interior.derived.stationGroup[weapons] && crew !== 1) throw new Error(`duel layout ${layout.id} puts Navigation and Weapons in one console group; only a crew of one may share them`);
    // Start aboard (start-aboard spec §1): nobody is seated; both stand at the layout's spawns and walk to a console.
    const defs = DUEL_REPAIR_POINTS[layout.id];
    if (!defs) throw new Error(`no duel repair points for layout ${layout.id}`);
    const points = defs.map((p) => {
      const room = interior.derived.roomIndex.get(p.room) ?? -1, [tx, ty] = p.tile;
      if (room < 0 || roomAt(interior, tx + 0.5, ty + 0.5) !== room) throw new Error(`repair point ${p.room} ${tx},${ty} is not inside its room`);
      return { tacticalRoom: p.tacticalRoom, room, tile: ty * interior.derived.width + tx };
    });
    return { interior, tactical, present: Array<boolean>(crew).fill(true), repair: [0, 0, 0], points, nav, weapons, science, events: [], round: 0, helmPlayer, baseTick: 0, decidedTick: -1, throttle: 0, holdHeading: -1, crewClass };
  } catch (err) {
    disposeSimState(interior);   // release its entities and component storage before rethrowing
    throw err;
  }
}

/** Release the duel's interior entities and storage (idempotent, like disposeSimState). */
export function disposeDuel(d: DuelState): void { disposeSimState(d.interior); }

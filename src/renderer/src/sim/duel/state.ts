// The duel's state (spec §8, §13): today's SimState for the Cutter interior, the tactical state, who is present, and
// the repair progress of each tactical room. Only the interior systems the duel lists ever run on `interior`.
import { RECRUIT } from '../characters';
import { DoorState, roomAt } from '../grid';
import type { ShipLayout } from '../ship/schema';
import { createSimState, disposeSimState, type SimState } from '../state';
import { StationKind } from '../stationKinds';
import { sitDown } from '../stations';
import { validateMap } from '../tactical/map';
import { createTacticalState, type TacticalState } from '../tactical/state';
import { DUEL_REPAIR_POINTS } from './tuning';

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

export interface DuelState {
  interior: SimState;
  tactical: TacticalState;
  /** Whether each player is at the keyboard (spec §8 "present or away"). */
  present: [boolean, boolean];
  /** Repair progress per tactical Room (index = Room), in REPAIR_UNITS. */
  repair: [number, number, number];
  /** Resolved repair points, in tactical Room order. */
  points: RepairPoint[];
  /** Station indices of the two consoles that are roles (spec §8). */
  nav: number; weapons: number;
  /** This tick's repair and fire events: every repairWork or fireWork in player order, then each Room's repairDone or
   *  fireOut in Room order (repairPhase), then any fireStart in tactical event order (firePhase, after stepDuel). */
  events: RepairEvent[];
  /** The round module (H-2 spec §7): this round's index from 0, the player seated at the Helm when it began, the
   *  encounter tick it began on, and the tick right after its deciding step (−1 while it runs). */
  round: number; helmPlayer: 0 | 1; baseTick: number; decidedTick: number;
}

/**
 * A duel on `layout` (the Hound in the app; the Cutter in older tests): two trait-free Recruits (no XP is ever awarded, since xpSystem never runs), every
 * door held open, `helmPlayer` (default 0) seated at Navigation and the other player at Weapons, and a tactical state
 * from the same seed whose map must validate. Round 0, beginning on tick 0. Throws if the map, a repair point or
 * `helmPlayer` is invalid, so a bad seed or layout fails loudly.
 */
export function createDuel(layout: ShipLayout, seed: number, helmPlayer: 0 | 1 = 0): DuelState {
  if (helmPlayer !== 0 && helmPlayer !== 1) throw new Error(`invalid duel helm player ${String(helmPlayer)}`);
  const tactical = createTacticalState(seed);
  const problems = validateMap(tactical.map);
  if (problems.length > 0) throw new Error(`invalid duel map for seed ${seed}: ${problems[0]}`);
  const interior = createSimState(layout, 2, seed, [RECRUIT, RECRUIT]);
  try {
    interior.doors.state.fill(DoorState.HeldOpen);
    const nav = interior.derived.stationOfKind[StationKind.Navigation]!, weapons = interior.derived.stationOfKind[StationKind.Weapons]!;
    if (nav < 0 || weapons < 0) throw new Error('duel layout needs Navigation and Weapons consoles');
    const gn = interior.derived.stationGroup[nav]!;
    if (gn >= 0 && gn === interior.derived.stationGroup[weapons]) throw new Error(`duel layout ${layout.id} puts Navigation and Weapons in one console group; the two players need separate seats`);
    sitDown(interior, helmPlayer, nav);
    sitDown(interior, 1 - helmPlayer, weapons);
    const defs = DUEL_REPAIR_POINTS[layout.id];
    if (!defs) throw new Error(`no duel repair points for layout ${layout.id}`);
    const points = defs.map((p) => {
      const room = interior.derived.roomIndex.get(p.room) ?? -1, [tx, ty] = p.tile;
      if (room < 0 || roomAt(interior, tx + 0.5, ty + 0.5) !== room) throw new Error(`repair point ${p.room} ${tx},${ty} is not inside its room`);
      return { tacticalRoom: p.tacticalRoom, room, tile: ty * interior.derived.width + tx };
    });
    return { interior, tactical, present: [true, true], repair: [0, 0, 0], points, nav, weapons, events: [], round: 0, helmPlayer, baseTick: 0, decidedTick: -1 };
  } catch (err) {
    disposeSimState(interior);   // release its entities and component storage before rethrowing
    throw err;
  }
}

/** Release the duel's interior entities and storage (idempotent, like disposeSimState). */
export function disposeDuel(d: DuelState): void { disposeSimState(d.interior); }

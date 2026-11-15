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
import { CUTTER_REPAIR_POINTS } from './tuning';

export interface RepairPoint { tacticalRoom: number; room: number; tile: number }

/** Per-tick repair events (H-0c-ii-a spec §4), for telemetry and views. Derived, not state: cleared every tick and not
 *  hashed. `repairWork`: a player added repair work to a tactical Room this tick. `repairDone`: the Room's level dropped
 *  this tick; `players` names everyone who worked on it this tick, ascending. */
export type RepairEvent =
  | { kind: 'repairWork'; player: number; room: number }
  | { kind: 'repairDone'; room: number; players: number[] };

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
  /** This tick's repair events, in the order repairPhase makes them (every repairWork, then any repairDone in Room order). */
  events: RepairEvent[];
}

/**
 * A duel on `layout` (the Cutter): two trait-free Recruits (no XP is ever awarded, since xpSystem never runs), every
 * door held open, player 0 seated at Navigation and player 1 at Weapons, and a tactical state from the same seed whose
 * map must validate. Throws if the map or a repair point is invalid, so a bad seed or layout fails loudly.
 */
export function createDuel(layout: ShipLayout, seed: number): DuelState {
  const tactical = createTacticalState(seed);
  const problems = validateMap(tactical.map);
  if (problems.length > 0) throw new Error(`invalid duel map for seed ${seed}: ${problems[0]}`);
  const interior = createSimState(layout, 2, seed, [RECRUIT, RECRUIT]);
  try {
    interior.doors.state.fill(DoorState.HeldOpen);
    const nav = interior.derived.stationOfKind[StationKind.Navigation]!, weapons = interior.derived.stationOfKind[StationKind.Weapons]!;
    if (nav < 0 || weapons < 0) throw new Error('duel layout needs Navigation and Weapons consoles');
    sitDown(interior, 0, nav);
    sitDown(interior, 1, weapons);
    const points = CUTTER_REPAIR_POINTS.map((p) => {
      const room = interior.derived.roomIndex.get(p.room) ?? -1, [tx, ty] = p.tile;
      if (room < 0 || roomAt(interior, tx + 0.5, ty + 0.5) !== room) throw new Error(`repair point ${p.room} ${tx},${ty} is not inside its room`);
      return { tacticalRoom: p.tacticalRoom, room, tile: ty * interior.derived.width + tx };
    });
    return { interior, tactical, present: [true, true], repair: [0, 0, 0], points, nav, weapons, events: [] };
  } catch (err) {
    disposeSimState(interior);   // release its entities and component storage before rethrowing
    throw err;
  }
}

/** Release the duel's interior entities and storage (idempotent, like disposeSimState). */
export function disposeDuel(d: DuelState): void { disposeSimState(d.interior); }

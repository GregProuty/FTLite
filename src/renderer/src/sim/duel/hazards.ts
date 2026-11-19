// Engineering spike spec §4, §5 (docs/superpowers/specs/2026-11-18-engineering-spike-design.md): the duel's own pieces
// of the interior hazards: the door and airlock toggles the ship-view clicks send (any player, no range check). Tasks 6
// and 7 add Life Support injection, breach sites, firefighting tiles, work jobs and patching.
import { DoorState } from '../grid';
import { DuelSystem, effectiveBars, OXY_FACTOR_BY_BARS } from '../tactical/bars';
import { HAZARD_DT, INJECT_FRAC } from '../tuning';
import type { DuelState } from './state';

/** A door edge index of the layout. */
export function validDoor(d: DuelState, edge: number): boolean {
  const de = d.interior.derived;
  return Number.isInteger(edge) && edge >= 0 && edge < de.edgeIsDoor.length && de.edgeIsDoor[edge] === 1;
}
/** An airlock index of the layout. */
export function validAirlock(d: DuelState, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < d.interior.derived.airlockRoom.length;
}
/** Spec §5 (Decision 14): auto (Closed or Open) → held open; held open → auto (Closed). Sealed never occurs in the duel. */
export function toggleDoor(d: DuelState, edge: number): void {
  const doors = d.interior.doors;
  doors.state[edge] = doors.state[edge] === DoorState.HeldOpen ? DoorState.Closed : DoorState.HeldOpen;
  doors.closeTimer[edge] = 0; doors.sealRequested[edge] = 0;
}
/** Spec §5: an airlock opens to space, or closes. */
export function toggleAirlock(d: DuelState, index: number): void {
  const open = d.interior.airlocks.open;
  open[index] = open[index] ? 0 : 1;
}

/** Spec §4 Life Support injection, before each oxygenStep: every room asks INJECT_FRAC × V × HAZARD_DT ×
 *  OXY_FACTOR[Oxygen bars]; oxygenStep's clamp to free volume and its venting skip apply. Bypasses the sector
 *  lifeSupportInjection (its station output and seated bonus). */
export function duelInjection(d: DuelState): void {
  const st = d.interior, V = st.derived.volume, inj = st.injectionScratch;
  const f = OXY_FACTOR_BY_BARS[effectiveBars(d.tactical.systems[0], DuelSystem.Oxygen)]!;
  for (let r = 0; r < V.length; r++) inj[r] = INJECT_FRAC * V[r]! * HAZARD_DT * f;
}

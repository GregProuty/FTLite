// Engineering spike spec §4, §5 (docs/superpowers/specs/2026-11-18-engineering-spike-design.md): the duel's own pieces
// of the interior hazards: the door and airlock toggles the ship-view clicks send (any player, no range check). Tasks 6
// and 7 add Life Support injection, breach sites, firefighting tiles, work jobs and patching.
import { DoorState } from '../grid';
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

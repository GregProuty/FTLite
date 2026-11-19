// Engineering spike spec §4, §5 (docs/superpowers/specs/2026-11-18-engineering-spike-design.md): the duel's own pieces
// of the interior hazards: the door and airlock toggles the ship-view clicks send (any player, no range check). Tasks 6
// and 7 add Life Support injection, breach sites, firefighting tiles, work jobs and patching.
import { DoorState } from '../grid';
import { repairBreach } from '../hazards/breach';
import { inReachOfTile } from '../interact';
import { DuelSystem, effectiveBars, OXY_FACTOR_BY_BARS } from '../tactical/bars';
import { HAZARD_DT, INJECT_FRAC } from '../tuning';
import type { DuelState, RepairPoint } from './state';
import { DUEL_EXTINGUISH_RATE_SOLO, DUEL_EXTINGUISH_RATE_TEAM, DUEL_EXTINGUISH_UNITS } from './tuning';

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

/** The room's lowest-index breach site, or −1 (spec §4: the Hound has exactly one per room). */
export function siteOfRoom(d: DuelState, room: number): number {
  const sites = d.interior.derived.siteRoom;
  for (let s = 0; s < sites.length; s++) if (sites[s] === room) return s;
  return -1;
}

/** Spec §4: where a room's fire is fought: its repair point's tile if it has one, else its breach-site tile, else −1. */
export function fireTileOf(d: DuelState, room: number): number {
  const point = d.points.find((p) => p.room === room);
  if (point) return point.tile;
  const s = siteOfRoom(d, room);
  return s >= 0 ? d.interior.derived.siteTile[s]! : -1;
}

/** One worker's job this tick (spec §4 work precedence, Decision 11). */
export type WorkJob =
  | { kind: 'pointFire'; point: RepairPoint }
  | { kind: 'fire'; room: number }
  | { kind: 'breach'; site: number }
  | { kind: 'repair'; point: RepairPoint };

/** The job of a standing worker `eid` in room `here`: the room's fire (at its point, else its breach-site tile), then an
 *  active breach site in reach (ascending), then the point's damaged Room; null when none is in reach. */
export function workJob(d: DuelState, eid: number, here: number): WorkJob | null {
  if (here < 0) return null;
  const st = d.interior, point = d.points.find((p) => p.room === here);
  if (st.rooms.fire[here]! > 0) {
    if (point) { if (inReachOfTile(st, eid, point.tile)) return { kind: 'pointFire', point }; }
    else { const tile = fireTileOf(d, here); if (tile >= 0 && inReachOfTile(st, eid, tile)) return { kind: 'fire', room: here }; }
  }
  const sites = st.derived.siteRoom;
  for (let s = 0; s < sites.length; s++) if (sites[s] === here && st.breaches.active[s] && inReachOfTile(st, eid, st.derived.siteTile[s]!)) return { kind: 'breach', site: s };
  if (point && d.tactical.systems[0].rooms[point.tacticalRoom]! > 0 && inReachOfTile(st, eid, point.tile)) return { kind: 'repair', point };
  return null;
}

/** Spec §4 patching: `workers` add the fire work loop's units to the site's breaches.repair (a 0..1 fraction of
 *  DUEL_EXTINGUISH_UNITS, in whole units); true when the breach is patched (repairBreach). */
export function patchWork(d: DuelState, site: number, workers: number): boolean {
  const done = d.interior.breaches.repair, units = Math.round(done[site]! * DUEL_EXTINGUISH_UNITS) + (workers === 1 ? DUEL_EXTINGUISH_RATE_SOLO : workers * DUEL_EXTINGUISH_RATE_TEAM);
  if (units >= DUEL_EXTINGUISH_UNITS) { repairBreach(d.interior, site); return true; }
  done[site] = units / DUEL_EXTINGUISH_UNITS;
  return false;
}

import type { SimState } from './state';
import { Position, Seated } from './components';
import { StationKind } from './stationKinds';
import { STATION_MAX } from './tuning';
import { skillLevel, skillCurve } from './skills';
import { warnedTargets, targetRef } from './debrisTargets';

export function stationOnline(state: SimState, i: number): boolean {
  return state.stations.failed[i] === 0 && state.stations.level[i]! > 0;
}

/** Effect multiplier: level over STATION_MAX, times the skill curve (spec 2a-i section 5); exceeds 1 while overdriven (2b-i). Offline is 0. */
export function stationOutput(state: SimState, i: number): number {
  if (!stationOnline(state, i)) return 0;
  const kind = state.derived.stationKind[i]!, occ = state.stations.occupant[i]!;
  return (state.stations.level[i]! / STATION_MAX[kind]!) * skillCurve(occ >= 0 ? skillLevel(state, occ, kind) : 0);
}

export function failedStationCount(state: SimState): number {
  let n = 0; for (const f of state.stations.failed) if (f) n++; return n;
}

/** Seating resets gameplay targets; card focus belongs to the client. */
function resetTarget(state: SimState, i: number): void {
  const d = state.derived, kind = d.stationKind[i]!;
  if (kind === StationKind.Weapons) { state.weapons.target = targetRef(state, warnedTargets(state)[0] ?? -1); return; }
  if (kind === StationKind.Science) { state.science.target = targetRef(state, warnedTargets(state, false)[0] ?? -1); return; }
}

/** Seat a player: snap to the console tile centre and reset gameplay targets (spec section 4). At a console group the player sits at every member, on the first tab; the client reconciles focus and repeat (spec Demo-x-a section 1). */
export function sitDown(state: SimState, pid: number, i: number): void {
  const eid = state.crew[pid]!, d = state.derived, g = d.stationGroup[i]!;
  const members = g >= 0 ? d.groupStations[g]! : [i];
  for (const j of members) { state.stations.occupant[j] = pid; resetTarget(state, j); }
  if (g >= 0) { state.groups.tab[g] = 0; }
  Seated.station[eid] = members[0]!;
  const t = d.stationTile[i]!, tx = t % d.width;
  Position.x[eid] = tx + 0.5; Position.y[eid] = (t - tx) / d.width + 0.5;
}

/** Switch a seated player's console group to tab k: the seat follows the active tab (spec Demo-x-a section 1). */
export function selectTab(state: SimState, pid: number, g: number, k: number): void {
  state.groups.tab[g] = k; Seated.station[state.crew[pid]!] = state.derived.groupStations[g]![k]!;
}

/** A station went offline (failed, or no bars): its occupant stands, unless it sits at a console group with another member still online; then only that tab is offline (spec Demo-x-a section 1). */
export function releaseOffline(state: SimState, i: number): void {
  const occ = state.stations.occupant[i]!;
  if (occ < 0) return;
  const g = state.derived.stationGroup[i]!;
  if (g >= 0 && state.derived.groupStations[g]!.some((j) => j !== i && stationOnline(state, j))) return;
  standUp(state, occ);
}

/** Stand a player up (voluntary or forced): every member of a console group is cleared. No-op when not seated. */
export function standUp(state: SimState, pid: number): void {
  const eid = state.crew[pid]!, i = Seated.station[eid]!, d = state.derived;
  if (i < 0) return;
  const g = d.stationGroup[i]!;
  Seated.station[eid] = -1;
  for (const j of g >= 0 ? d.groupStations[g]! : [i]) {
    state.stations.occupant[j] = -1;   // standing resets the Engineering page (spec Loop-ii section 2)
    if (d.stationKind[j] === StationKind.Science) state.science.scanning = 0;   // spec 2b-ii section 4: any stand pauses the scan
  }
}

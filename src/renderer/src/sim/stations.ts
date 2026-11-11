import type { SimState } from './state';
import { Position, Seated } from './components';
import { StationKind } from './stationKinds';
import { STATION_MAX } from './tuning';
import { skillLevel, skillCurve } from './skills';
import { warnedTargets } from './debrisTargets';

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

/** Seat a player: snap to the console tile centre, reset stick state, reset the cursor per kind (spec §4). */
export function sitDown(state: SimState, pid: number, i: number): void {
  const eid = state.crew[pid]!, d = state.derived;
  Seated.station[eid] = i; state.stations.occupant[i] = pid;
  const t = d.stationTile[i]!, tx = t % d.width;
  Position.x[eid] = tx + 0.5; Position.y[eid] = (t - tx) / d.width + 0.5;
  state.stick.heldDir[pid] = 0; state.stick.repeat[pid] = 0;
  const kind = d.stationKind[i]!;
  state.stations.cursor[i] = kind === StationKind.Engineering ? StationKind.Engineering
    : kind === StationKind.Doors ? (d.doorEdges.length ? 0 : -1)
    : kind === StationKind.Weapons || kind === StationKind.Science ? (warnedTargets(state)[0] ?? -1)
    : 0;
}

/** Stand a player up (voluntary or forced). No-op when not seated. */
export function standUp(state: SimState, pid: number): void {
  const eid = state.crew[pid]!, i = Seated.station[eid]!;
  if (i < 0) return;
  Seated.station[eid] = -1; state.stations.occupant[i] = -1;
  state.stick.heldDir[pid] = 0; state.stick.repeat[pid] = 0;
  if (state.derived.stationKind[i] === StationKind.Science) state.science.scanning = 0;   // spec 2b-ii section 4: any stand pauses the scan
}

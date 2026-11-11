import type { SimState } from './state';
import { StationKind } from './stationKinds';
import { STATION_MAX, STATION_OVERDRIVE, BONUS_BAR_LEVELS } from './tuning';
import { standUp, stationOnline } from './stations';
import { Life, LifeState } from './components';
import { Skill, skillLevelOf } from './skills';

export function powerUsed(state: SimState): number { let t = 0; for (const v of state.stations.level) t += v; return t; }
export function powerPool(state: SimState): number { return state.power.capacity - powerUsed(state); }

/** Power failure: offline until repaired. Bars return to the pool except Engineering's, which keeps its level frozen (spec §5). */
export function failStation(state: SimState, i: number): void {
  state.stations.failed[i] = 1; state.stations.repair[i] = 0;
  if (state.derived.stationKind[i] !== StationKind.Engineering) state.stations.level[i] = 0;
  const occ = state.stations.occupant[i]!;
  if (occ >= 0) standUp(state, occ);
}

/** Repair complete: Engineering comes back at its kept level (>= 1); any other station comes back at level 0. */
export function repairStation(state: SimState, i: number): void {
  state.stations.failed[i] = 0; state.stations.repair[i] = 0;
}

/** Highest level a station may hold: STATION_MAX plus the overdrive bar for every kind except Engineering (spec 2b-i section 4). */
export function maxLevel(kind: number): number {
  return STATION_MAX[kind]! + (kind === StationKind.Engineering ? 0 : STATION_OVERDRIVE);
}

/** Engineering operator moves one bar to (+1) or from (-1) station i. Returns whether the allocation changed. */
export function shiftBar(state: SimState, i: number, delta: 1 | -1): boolean {
  const d = state.derived, eng = d.stationOfKind[StationKind.Engineering]!;
  if (state.stations.failed[eng]) return false;                       // allocations frozen while Engineering is failed
  if (state.stations.failed[i]) return false;
  const kind = d.stationKind[i]!, level = state.stations.level[i]!;
  if (delta > 0) {
    if (level >= maxLevel(kind) || powerPool(state) <= 0) return false;
    state.stations.level[i] = level + 1; return true;
  }
  const floor = kind === StationKind.Engineering ? 1 : 0;
  if (level <= floor) return false;
  state.stations.level[i] = level - 1;
  if (level - 1 === 0) { const occ = state.stations.occupant[i]!; if (occ >= 0) standUp(state, occ); }
  return true;
}

/** Bonus bars from a Conscious operator seated at an online Engineering: one per BONUS_BAR_LEVELS Engineering levels (spec 3-i section 7). */
export function bonusBars(state: SimState): number {
  const eng = state.derived.stationOfKind[StationKind.Engineering]!;
  if (eng < 0 || !stationOnline(state, eng)) return 0;
  const occ = state.stations.occupant[eng]!;
  if (occ < 0 || Life.state[state.crew[occ]!] !== LifeState.Conscious) return 0;
  return Math.floor(skillLevelOf(state, occ, Skill.Engineering) / BONUS_BAR_LEVELS);
}

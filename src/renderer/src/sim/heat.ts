import type { SimState } from './state';
import { StationKind } from './stationKinds';
import { stationOnline } from './stations';
import { STATION_MAX, HEAT_COOL_UNIT, COOLANT_POOL, COOLANT_MAX_PER_STATION } from './tuning';

/** A station is overdriven while online above its STATION_MAX. A failed station has level 0 and is never overdriven. */
export function isOverdriven(state: SimState, i: number): boolean {
  return stationOnline(state, i) && state.stations.level[i]! > STATION_MAX[state.derived.stationKind[i]!]!;
}

/** Heat removed per coolant unit per hazard tick. Increment 3 adds a floor-rounded term from the seated Engineering operator's skill here. */
export function coolingPerUnit(_state: SimState): number {
  return HEAT_COOL_UNIT;
}

export function coolantUsed(state: SimState): number { let t = 0; for (const v of state.stations.coolant) t += v; return t; }

/** Engineering Confirm: cycle station i's coolant 0, 1, 2, 0; a step the pool cannot supply wraps to 0. Engineering itself holds none. Returns whether the value changed. */
export function cycleCoolant(state: SimState, i: number): boolean {
  if (i < 0 || state.derived.stationKind[i] === StationKind.Engineering) return false;
  const c = state.stations.coolant[i]!;
  let next = c + 1;
  if (next > COOLANT_MAX_PER_STATION || COOLANT_POOL - coolantUsed(state) < 1) next = 0;
  state.stations.coolant[i] = next;
  return next !== c;
}

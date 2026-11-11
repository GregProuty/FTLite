import type { SimState } from './state';
import { StationKind } from './stationKinds';
import { stationOnline } from './stations';
import { nextFloat } from '../../../shared/rng';
import { failStation } from './power';
import { igniteRoom } from './hazards/fire';
import { STATION_MAX, HEAT_COOL_UNIT, COOLANT_POOL, COOLANT_MAX_PER_STATION, HEAT_MAX, HEAT_RISE, HEAT_COOL_IDLE, OVERHEAT_FIRE_CHANCE } from './tuning';

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

function overheat(state: SimState, i: number): void {
  failStation(state, i);                                        // the existing power failure: bars return, the occupant stands, repair is the usual loop
  state.stations.heat[i] = 0;
  if (nextFloat(state.rng.hazards) < OVERHEAT_FIRE_CHANCE) igniteRoom(state, state.derived.stationRoom[i]!);   // draw always consumed; no-op if already burning
}

/** Hazard tick: heat rises while overdriven and falls per coolant unit, otherwise decays at the idle rate; HEAT_MAX overheats. Ascending station index (spec 2b-i section 5). */
export function heatStep(state: SimState): void {
  const st = state.stations, cool = coolingPerUnit(state);
  for (let i = 0; i < st.level.length; i++) {
    if (isOverdriven(state, i)) st.heat[i] = Math.max(0, Math.min(HEAT_MAX, st.heat[i]! + HEAT_RISE - st.coolant[i]! * cool));
    else st.heat[i] = Math.max(0, st.heat[i]! - HEAT_COOL_IDLE);
    if (st.heat[i]! >= HEAT_MAX) overheat(state, i);
  }
}

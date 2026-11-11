import type { SimState } from './state';
import { StationKind } from './stationKinds';
import { stationOnline, stationOutput } from './stations';
import { DT, TORP_LOAD_TIME, TORP_REGEN_TIME, TORP_CAP } from './tuning';

/** Once per tick: one stock unit regenerates every TORP_REGEN_TIME s while Weapons is online, seated or not; holds at the cap (spec 2b-ii section 5). */
export function regenTorpedo(state: SimState): void {
  const wpn = state.derived.stationOfKind[StationKind.Weapons]!, w = state.weapons;
  if (wpn < 0 || !stationOnline(state, wpn) || w.torpedoStock >= TORP_CAP) return;
  w.torpedoRegen = Math.min(1, w.torpedoRegen + DT / TORP_REGEN_TIME);
  if (w.torpedoRegen >= 1) { w.torpedoStock += 1; w.torpedoRegen = 0; }
}

/** Once per tick: the tube loads while Weapons is online and occupied, empty, with stock; completion moves one unit from stock into the tube. */
export function loadTorpedo(state: SimState): void {
  const wpn = state.derived.stationOfKind[StationKind.Weapons]!, w = state.weapons;
  if (wpn < 0 || !stationOnline(state, wpn) || state.stations.occupant[wpn]! < 0) return;
  if (w.torpedoLoaded || w.torpedoStock <= 0) return;
  w.torpedoLoad = Math.min(1, w.torpedoLoad + DT * stationOutput(state, wpn) / TORP_LOAD_TIME);
  if (w.torpedoLoad >= 1) { w.torpedoLoaded = 1; w.torpedoStock -= 1; w.torpedoLoad = 0; }
}

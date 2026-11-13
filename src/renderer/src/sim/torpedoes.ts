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

/** Once per tick: the tube loads while Weapons is online and occupied, empty, with stock; completion moves one unit from stock into the tube. On a magazine ship the tube loads only a delivered torpedo (torpedoFed), whose stock was spent at the pickup (spec Coop-ii amendment D4). */
export function loadTorpedo(state: SimState): void {
  const wpn = state.derived.stationOfKind[StationKind.Weapons]!, w = state.weapons;
  if (wpn < 0 || !stationOnline(state, wpn) || state.stations.occupant[wpn]! < 0) return;
  if (state.derived.magazineTile >= 0) {
    if (w.torpedoLoaded || !w.torpedoFed) return;
    w.torpedoLoad = Math.min(1, w.torpedoLoad + DT * stationOutput(state, wpn) / TORP_LOAD_TIME);
    if (w.torpedoLoad >= 1) { w.torpedoLoaded = 1; w.torpedoFed = 0; w.torpedoLoad = 0; }
    return;
  }
  if (w.torpedoLoaded || w.torpedoStock <= 0) return;
  w.torpedoLoad = Math.min(1, w.torpedoLoad + DT * stationOutput(state, wpn) / TORP_LOAD_TIME);
  if (w.torpedoLoad >= 1) { w.torpedoLoaded = 1; w.torpedoStock -= 1; w.torpedoLoad = 0; }
}

/** Whether a carried torpedo can go into the tube now: a magazine ship, the tube empty and nothing loading (spec Coop-ii amendment D5). */
export function canDeliver(state: SimState): boolean {
  const w = state.weapons;
  return state.derived.magazineTile >= 0 && !w.torpedoLoaded && !w.torpedoFed;
}
/** Pickup at the magazine: stock - 1 and the crew member carries one; false when empty or already carrying (amendment D5). */
export function pickUpTorpedo(state: SimState, pid: number): boolean {
  if (state.derived.magazineTile < 0 || state.carrying[pid] || state.weapons.torpedoStock <= 0) return false;
  state.weapons.torpedoStock -= 1; state.carrying[pid] = 1; return true;
}
/** Delivery at the Weapons console: the torpedo goes into the loader and the existing load timer starts (amendment D4). */
export function deliverTorpedo(state: SimState, pid: number): boolean {
  if (!state.carrying[pid] || !canDeliver(state)) return false;
  state.carrying[pid] = 0; state.weapons.torpedoFed = 1; state.weapons.torpedoLoad = 0; return true;
}
/** A downed carrier drops the torpedo back into the magazine, capped at TORP_CAP; a return at the cap is lost and stamped for the HUD (amendment D5). */
export function dropTorpedo(state: SimState, pid: number): void {
  if (!state.carrying[pid]) return;
  state.carrying[pid] = 0;
  if (state.weapons.torpedoStock < TORP_CAP) state.weapons.torpedoStock += 1; else state.weapons.torpedoDropTick = state.tick;
}

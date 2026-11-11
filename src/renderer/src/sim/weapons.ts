import type { SimState } from './state';
import { nextFloat } from '../../../shared/rng';
import { StationKind } from './stationKinds';
import { stationOnline, stationOutput } from './stations';
import { removeDebris } from './debris';
import { cycleTarget } from './debrisTargets';
import { Dir } from './dir';
import { DT, BEAM_CHARGE_TIME, BEAM_MATCH_BASE, BEAM_MATCH_SCALE, BEAM_MISS_BASE, BEAM_MISS_SCALE, TORP_HIT_BASE, TORP_HIT_SCALE } from './tuning';

/** The four-slot weapon selector (spec 2b-ii section 5): beams tuned to frequency selector + 1, then the torpedo. */
export const Weapon = { BeamF1: 0, BeamF2: 1, BeamF3: 2, Torpedo: 3 } as const;
const WEAPON_COUNT = 4;

/** Pure beam threshold: matched to the object's frequency or not. */
export function beamHits(u: number, output: number, match: boolean): boolean {
  return u < (match ? BEAM_MATCH_BASE + BEAM_MATCH_SCALE * output : BEAM_MISS_BASE + BEAM_MISS_SCALE * output);
}

/** Pure torpedo threshold: homing, so frequency plays no part. */
export function torpedoHits(u: number, output: number): boolean {
  return u < TORP_HIT_BASE + TORP_HIT_SCALE * output;
}

/** Once per tick: the beam charges while Weapons is online and occupied; the charge is kept otherwise (spec 2a-ii section 5). */
export function chargeBeam(state: SimState): void {
  const wpn = state.derived.stationOfKind[StationKind.Weapons]!;
  if (wpn < 0 || !stationOnline(state, wpn) || state.stations.occupant[wpn]! < 0) return;
  state.weapons.charge = Math.min(1, state.weapons.charge + DT * stationOutput(state, wpn) / BEAM_CHARGE_TIME);
}

/** Fire the selected weapon at the cursor's object. Beam needs a full charge, torpedo a loaded tube; one rng.combat draw; the readiness resets either way. */
export function fireWeapon(state: SimState): boolean {
  const wpn = state.derived.stationOfKind[StationKind.Weapons]!, db = state.debris, w = state.weapons;
  if (wpn < 0 || !stationOnline(state, wpn) || state.stations.occupant[wpn]! < 0) return false;
  const c = state.stations.cursor[wpn]!;
  if (c < 0 || !db.active[c] || !db.warned[c]) return false;
  const output = stationOutput(state, wpn);
  let hit: boolean;
  if (w.selector === Weapon.Torpedo) {
    if (!w.torpedoLoaded) return false;
    hit = torpedoHits(nextFloat(state.rng.combat), output);
    w.torpedoLoaded = 0;                                                       // the stock was spent when the tube loaded
  } else {
    if (w.charge < 1) return false;
    hit = beamHits(nextFloat(state.rng.combat), output, w.selector + 1 === db.frequency[c]);   // the true frequency decides, scanned or not
    w.charge = 0;
  }
  if (hit) removeDebris(state, c);
  return hit;
}

/** Seated Weapons input: Up/Down cycle warned targets, Left/Right cycle the selector with wrap, Confirm fires. */
export function weaponsInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  cycleTarget(state, i, dir);
  if (dir === Dir.Left) state.weapons.selector = (state.weapons.selector + WEAPON_COUNT - 1) % WEAPON_COUNT;
  else if (dir === Dir.Right) state.weapons.selector = (state.weapons.selector + 1) % WEAPON_COUNT;
  if (confirm) fireWeapon(state);
}

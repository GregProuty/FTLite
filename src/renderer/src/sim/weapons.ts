import type { SimState } from './state';
import { nextFloat } from '../../../shared/rng';
import { StationKind } from './stationKinds';
import { stationOnline, stationOutput } from './stations';
import { removeDebris } from './debris';
import { warnedTargets } from './debrisTargets';
import { Dir } from './dir';
import { DT, BEAM_CHARGE_TIME, BEAM_HIT_BASE, BEAM_HIT_SCALE } from './tuning';

/** Pure hit threshold: a roll u in [0, 1) hits when below base + scale x Weapons output. */
export function beamHits(u: number, output: number): boolean {
  return u < BEAM_HIT_BASE + BEAM_HIT_SCALE * output;
}

/** Once per tick: the beam charges while Weapons is online and occupied; the charge is kept otherwise (spec 2a-ii section 5). */
export function chargeBeam(state: SimState): void {
  const wpn = state.derived.stationOfKind[StationKind.Weapons]!;
  if (wpn < 0 || !stationOnline(state, wpn) || state.stations.occupant[wpn]! < 0) return;
  state.weapons.charge = Math.min(1, state.weapons.charge + DT * stationOutput(state, wpn) / BEAM_CHARGE_TIME);
}

/** Fire at the cursor's object if the beam is charged and the target is warned and live. One rng.combat draw; charge resets either way. */
export function fireBeam(state: SimState): boolean {
  const wpn = state.derived.stationOfKind[StationKind.Weapons]!, db = state.debris;
  if (wpn < 0 || !stationOnline(state, wpn) || state.stations.occupant[wpn]! < 0) return false;   // defensive: a seated operator is always online today, but never fire from a dead console
  const c = state.stations.cursor[wpn]!;
  if (state.weapons.charge < 1 || c < 0 || !db.active[c] || !db.warned[c]) return false;
  const hit = beamHits(nextFloat(state.rng.combat), stationOutput(state, wpn));
  state.weapons.charge = 0;
  if (hit) removeDebris(state, c);
  return hit;
}

/** Seated Weapons input: up/down cycle warned targets in StableId order with wrap; Confirm fires. Left/right are reserved for 2b. */
export function weaponsInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  const list = warnedTargets(state), c = state.stations.cursor;
  if (!list.length) c[i] = -1;
  else if (dir === Dir.Up || dir === Dir.Down) {
    const k = list.indexOf(c[i]!), n = list.length;
    c[i] = list[k < 0 ? 0 : dir === Dir.Up ? (k + n - 1) % n : (k + 1) % n]!;
  }
  if (confirm) fireBeam(state);
}

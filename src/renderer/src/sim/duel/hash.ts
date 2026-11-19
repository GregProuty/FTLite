// The duel hash: SIM_VERSION, then the duel's modules in canonical order (sim/duel/modules.ts): the whole tactical
// state, presence and repair progress, then the interior SimState's whole canonical flatten (spec §4: same seed and
// inputs give the same hash). Hashing the full interior flatten, not hand-picked fields, means any interior system the
// duel later turns on (fire, oxygen, power, ...) is covered automatically. SIM_VERSION comes first (H-0c-ii-a spec §6),
// so a version bump changes the duel hash as it does the sector one. Per-tick events (d.events) are derived and not
// hashed. The values are exactly the hash-completeness order; the duel golden pins them.
import { hashF64 } from '../../../../shared/hash';
import { SIM_VERSION } from '../tuning';
import type { MapDef } from '../tactical/map';
import { flattenDuelModules } from './modules';
import type { DuelState } from './state';

export function flattenDuel(d: DuelState): Float64Array {
  const out: number[] = [SIM_VERSION];
  flattenDuelModules(d, out);
  // −0 written as 0 (flatten() already canonicalises the interior's). A plain loop: Float64Array.from with a mapper takes
  // V8's iterator path, about fourteen times slower for the same values (Perf-i spec §2.1).
  const values = new Float64Array(out.length);
  for (let k = 0; k < out.length; k++) { const v = out[k]!; values[k] = v === 0 ? 0 : v; }
  return values;
}

export function hashDuel(d: DuelState): string { return hashF64(flattenDuel(d)); }

const mapHashes = new WeakMap<MapDef, string>();
/** The map's identity (engine refactor spec §6): hashF64 over the planet (x, y, r), each asteroid's x, y and r in
 *  index order, the belt count, the cluster sizes, the gaps and both spawns (x, y, vx, vy, heading). */
export function mapHash(map: MapDef): string {
  let h = mapHashes.get(map);
  if (h === undefined) {
    const v: number[] = [map.planet.x, map.planet.y, map.planet.r];
    for (const a of map.asteroids) v.push(a.x, a.y, a.r);
    v.push(map.beltCount, ...map.clusterSizes, ...map.gaps);
    for (const s of map.spawns) v.push(s.x, s.y, s.vx, s.vy, s.heading);
    h = hashF64(Float64Array.from(v, (x) => (x === 0 ? 0 : x)));
    mapHashes.set(map, h);
  }
  return h;
}

// The duel hash: SIM_VERSION, then the whole tactical flatten, presence and repair progress, then the interior
// SimState's whole canonical flatten (spec §4: same seed and inputs give the same hash). Hashing the full interior
// flatten, not hand-picked fields, means any interior system the duel later turns on (fire, oxygen, power, ...) is
// covered automatically. SIM_VERSION comes first (H-0c-ii-a spec §6), so a version bump changes the duel hash as it
// does the sector one. Per-tick events (d.events) are derived and not hashed.
import { hashF64 } from '../../../../shared/hash';
import { flatten } from '../flatten';
import { flattenTactical } from '../tactical/hash';
import { SIM_VERSION } from '../tuning';
import type { DuelState } from './state';

export function flattenDuel(d: DuelState): Float64Array {
  const tactical = flattenTactical(d.tactical), interior = flatten(d.interior);
  const head = [SIM_VERSION, ...tactical, d.present[0] ? 1 : 0, d.present[1] ? 1 : 0, ...d.repair];
  const out = new Float64Array(head.length + interior.length);
  out.set(head); out.set(interior, head.length);   // flatten() already canonicalises -0 to 0
  for (let k = 0; k < head.length; k++) if (out[k] === 0) out[k] = 0;
  return out;
}

export function hashDuel(d: DuelState): string { return hashF64(flattenDuel(d)); }

// The duel hash: the whole tactical flatten plus the interior fields the duel can change (spec §4: same seed and
// inputs give the same hash). The sector flatten covers far more than the duel touches, so it is not used here.
import { hashF64 } from '../../../../shared/hash';
import { Position, Seated } from '../components';
import { flattenTactical } from '../tactical/hash';
import type { DuelState } from './state';

export function flattenDuel(d: DuelState): Float64Array {
  const out: number[] = [...flattenTactical(d.tactical), d.interior.tick, d.present[0] ? 1 : 0, d.present[1] ? 1 : 0, ...d.repair];
  for (let pid = 0; pid < 2; pid++) { const eid = d.interior.crew[pid]!; out.push(Position.x[eid]!, Position.y[eid]!, Seated.station[eid]!); }
  for (const v of d.interior.stations.occupant) out.push(v);
  for (const v of d.interior.doors.state) out.push(v);
  return Float64Array.from(out, (v) => (v === 0 ? 0 : v));
}

export function hashDuel(d: DuelState): string { return hashF64(flattenDuel(d)); }

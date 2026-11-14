// Canonical flatten and hash of the tactical state (spec §4: same seed and inputs give the same hash).
// The map is a pure function of the seed, so only its asteroid count is flattened. −0 is written as 0.
import { hashF64 } from '../../../../shared/hash';
import type { TacticalState } from './state';

export function flattenTactical(s: TacticalState): Float64Array {
  const out: number[] = [s.tick, s.seed, s.rng.s, s.map.asteroids.length];
  for (const sh of s.ships) {
    out.push(sh.x, sh.y, sh.vx, sh.vy, sh.heading, sh.headingAcc, sh.hull, sh.rooms[0], sh.rooms[1], sh.rooms[2], sh.planetHits, sh.asteroidHits, sh.shipHits,
      sh.released ? 1 : 0, sh.skidBudget, sh.skidSign);
    for (const g of sh.graceUntil) out.push(g);
  }
  return Float64Array.from(out, (v) => (v === 0 ? 0 : v));
}

export function hashTactical(s: TacticalState): string { return hashF64(flattenTactical(s)); }

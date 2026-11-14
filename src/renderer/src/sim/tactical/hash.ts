// Canonical flatten and hash of the tactical state (spec §4: same seed and inputs give the same hash).
// The map is a pure function of the seed, so only its asteroid count is flattened. Per-tick events are outputs, reset
// every tick, and not hashed. −0 is written as 0. tests/tacticalDeterminism.test.ts guards the field lists.
import { hashF64 } from '../../../../shared/hash';
import type { Missile, TacticalState } from './state';

/** Values per missile slot: a presence flag, then x, y, vx, vy, heading, headingAcc, age (zeros when empty). */
export const MISSILE_SLOT = 8;

function missile(out: number[], m: Missile | null): void {
  if (!m) { for (let k = 0; k < MISSILE_SLOT; k++) out.push(0); return; }
  out.push(1, m.x, m.y, m.vx, m.vy, m.heading, m.headingAcc, m.age);
}

export function flattenTactical(s: TacticalState): Float64Array {
  const out: number[] = [s.tick, s.seed, s.rng.s, s.map.asteroids.length, s.outcome];
  for (const sh of s.ships) {
    out.push(sh.x, sh.y, sh.vx, sh.vy, sh.heading, sh.headingAcc, sh.hull, sh.rooms[0], sh.rooms[1], sh.rooms[2], sh.planetHits, sh.asteroidHits, sh.shipHits,
      sh.released ? 1 : 0, sh.skidBudget, sh.skidSign,
      sh.shields, sh.shieldClock, sh.laserCharge, sh.laserHold, sh.fireHeld ? 1 : 0, sh.lock, sh.magazine, sh.magazineClock,
      sh.shots, sh.laserHits, sh.layersStripped, sh.missilesLaunched, sh.missileHits, sh.missilesLost);
    for (const g of sh.graceUntil) out.push(g);
  }
  missile(out, s.missiles[0]); missile(out, s.missiles[1]);
  const h = s.hunter;
  out.push(h.mode, h.room, h.timer, h.working ? 1 : 0, h.fireAt, h.lastLaunch, h.trailHead);
  for (const v of h.trail) out.push(v);
  return Float64Array.from(out, (v) => (v === 0 ? 0 : v));
}

export function hashTactical(s: TacticalState): string { return hashF64(flattenTactical(s)); }

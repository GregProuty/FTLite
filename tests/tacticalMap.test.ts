import { describe, expect, it } from 'vitest';
import { createRng } from '../src/shared/rng';
import { circularSpeed, clusterOf, generateMap, laneBand, laneOf, validateMap } from '../src/renderer/src/sim/tactical/map';
import { initRocks, RockKind, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';
import { withSwitches } from './helpers/rockArena';
import { ASTEROID_GAP, CLUSTER_RADIUS, CLUSTER_RHO_SEPARATION, CLUSTER_R_MAX, LANES, SPAWN_RADIUS } from '../src/renderer/src/sim/tactical/tuning';

describe('duel map (spec §3)', () => {
  it('every seed from 1 to 200 gives a valid map', () => {
    for (let seed = 1; seed <= 200; seed++) expect(validateMap(generateMap(createRng(seed))), `seed ${seed}`).toEqual([]);
  });
  it('is a pure function of the seed', () => {
    expect(generateMap(createRng(42))).toEqual(generateMap(createRng(42)));
    expect(generateMap(createRng(42))).not.toEqual(generateMap(createRng(43)));
  });
  it('places the spawns on opposite sides in the same clockwise circular orbit', () => {
    const [a, b] = generateMap(createRng(7)).spawns;
    expect(Math.sqrt(a.x * a.x + a.y * a.y)).toBeCloseTo(SPAWN_RADIUS, 6);
    expect(a.x + b.x).toBeCloseTo(0, 6);
    expect(a.y + b.y).toBeCloseTo(0, 6);
    for (const s of [a, b]) {
      expect(Math.sqrt(s.vx * s.vx + s.vy * s.vy)).toBeCloseTo(circularSpeed(SPAWN_RADIUS), 6);
      expect(s.x * s.vy - s.y * s.vx).toBeGreaterThan(0);   // clockwise on screen (y down)
    }
  });
  it('matches the stated gravity: about 100 u/s for a circular orbit at r = 250', () => {
    expect(circularSpeed(250)).toBeCloseTo(99.52, 1);
  });
});


describe('lanes and rigid clusters (asteroids-iii §3.5)', () => {
  it('over 200 seeds: 17, 36 and 17 rocks on their lane radii in their size bands, clusters at least 420 apart in ρ', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const m = generateMap(createRng(seed));
      expect(m.laneSizes, `seed ${seed}`).toEqual(LANES.map((l) => l.count));
      for (let k = 0; k < m.beltCount; k++) {
        const a = m.asteroids[k]!, lane = LANES[laneOf(m, k)]!;
        expect(Math.abs(Math.hypot(a.x, a.y) - lane.rho)).toBeLessThan(1e-9);
        expect(a.r).toBeGreaterThanOrEqual(lane.rMin); expect(a.r).toBeLessThanOrEqual(lane.rMax);
      }
      expect(m.clusterRho).toHaveLength(m.clusterSizes.length);
      for (let i = 1; i < m.clusterRho.length; i++) expect(m.clusterRho[i]! - m.clusterRho[i - 1]!).toBeGreaterThanOrEqual(CLUSTER_RHO_SEPARATION - 1e-9);
      for (let k = m.beltCount; k < m.asteroids.length; k++) {
        const a = m.asteroids[k]!, c = m.clusterRho[clusterOf(m, k)]!;
        expect(Math.abs(Math.hypot(a.x, a.y) - c)).toBeLessThanOrEqual(CLUSTER_RADIUS + 1e-9);
      }
    }
  });
  it('rocks of different lanes can never touch: neighbouring lane radii minus the largest radius sum leave the gap', () => {
    for (let i = 1; i < LANES.length; i++) expect(LANES[i]!.rho - LANES[i - 1]!.rho - LANES[i]!.rMax - LANES[i - 1]!.rMax).toBeGreaterThanOrEqual(ASTEROID_GAP);
    expect(laneBand(LANES[1]!)).toEqual([1200 - 45 - ASTEROID_GAP, 1200 + 45 + ASTEROID_GAP]);
    expect(CLUSTER_RHO_SEPARATION).toBe(2 * (CLUSTER_RADIUS + CLUSTER_R_MAX) + ASTEROID_GAP);
  });
  it('validateMap names a rock off its lane, a lane count, and clusters too close in ρ', () => {
    const m = generateMap(createRng(9));
    const off = { ...m, asteroids: m.asteroids.map((a, k) => (k === 0 ? { ...a, x: a.x * 1.01, y: a.y * 1.01 } : a)) };
    expect(validateMap(off).some((e) => /belt asteroid 0 is off its lane/.test(e))).toBe(true);
    expect(validateMap({ ...m, laneSizes: [16, 37, 17] }).some((e) => /lane/.test(e))).toBe(true);
    expect(validateMap({ ...m, clusterRho: [1600, 1900, 2500] }).some((e) => /clusters 0 and 1 are closer than 420/.test(e))).toBe(true);
  });
  it('seeded rails (§13.1): a belt rock a Rail centred on itself; a cluster rock a Tumble (switch on) or Rail (off) on its cluster centre with its offset', () => {
    const m = generateMap(createRng(4));
    for (const tumble of [true, false]) withSwitches({ clusterTumble: tumble }, () => {
      const v = initRocks(m);
      for (let k = 0; k < m.asteroids.length; k++) {
        const a = m.asteroids[k]!, slot = Array.from(v.subarray(k * ROCK_STRIDE, k * ROCK_STRIDE + 5));
        if (k < m.beltCount) { expect(slot).toEqual([RockKind.Rail, a.x, a.y, 0, 0]); continue; }
        const c = m.clusterCentres[clusterOf(m, k)]!;
        expect(slot).toEqual([tumble ? RockKind.Tumble : RockKind.Rail, c.x, c.y, a.x - c.x, a.y - c.y]);
        expect(Math.hypot(c.x, c.y)).toBeCloseTo(m.clusterRho[clusterOf(m, k)]!, 9);
      }
    });
  });
});

import { describe, expect, it } from 'vitest';
import { createRng } from '../src/shared/rng';
import { circularSpeed, generateMap, validateMap } from '../src/renderer/src/sim/tactical/map';
import { buildGrid, queryGrid } from '../src/renderer/src/sim/tactical/grid';
import { SPAWN_RADIUS } from '../src/renderer/src/sim/tactical/tuning';

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

describe('broad phase (spec §4)', () => {
  it('finds every asteroid a brute-force search finds, in ascending order', () => {
    const m = generateMap(createRng(3)), g = buildGrid(m.asteroids, m.rMap);
    for (const [x, y] of [[0, -1200], [1250, 40], [-900, 900], [2500, 0], [3000, 3000]] as const) {
      const r = 20 + 55;
      const brute = m.asteroids.flatMap((a, i) => (Math.abs(a.x - x) <= r + a.r && Math.abs(a.y - y) <= r + a.r ? [i] : []));
      const got = queryGrid(g, x, y, r);
      for (const i of brute) expect(got).toContain(i);
      expect(got).toEqual([...got].sort((a, b) => a - b));
      expect(new Set(got).size).toBe(got.length);
    }
  });
});

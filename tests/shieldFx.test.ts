// UI round Part 3 spec §3.2: the shield fx model (hex shimmer, bubble, HUD flash), pure.
import { describe, expect, it } from 'vitest';
import {
  addShieldHit, bubbleAlpha, COLLAPSE_S, createShieldFx, ellipsePoint, FLICKER_S, hexPoints, PATCH_RINGS, RING_STEP_S,
  shieldCells, shieldFlash, SHIMMER_S, stepShieldFx, type Ellipse
} from '../src/renderer/src/render/shieldFx';

const E: Ellipse = { cx: 100, cy: 100, rx: 60, ry: 40 };
const NOSE = { x: 1, y: 0 };
const STAR = { x: 0, y: 1 };
const CELL = 8;

function hitAt(age: number, drop = false, last = false, a = 0) {
  const fx = createShieldFx(2);
  addShieldHit(fx, 0, a, drop, last);
  if (age > 0) stepShieldFx(fx, age);
  return fx;
}
const cells = (fx: ReturnType<typeof createShieldFx>) => shieldCells(fx, 0, E, CELL, NOSE, STAR);
const dist = (c: { x: number; y: number }, p: { x: number; y: number }) => Math.hypot(c.x - p.x, c.y - p.y);

describe('shieldFx', () => {
  it('a hit at age 0 lights only ring 0 (one cell, near the impact)', () => {
    const cs = cells(hitAt(0));
    expect(cs.length).toBe(1);
    const p = ellipsePoint(E, 0, NOSE, STAR);
    expect(dist(cs[0]!, p)).toBeLessThan(CELL * 1.5);
    expect(cs[0]!.alpha).toBeGreaterThan(0);
  });

  it('at 2 ring steps rings 0-2 light, ring 2 dimmer than ring 0', () => {
    const cs = cells(hitAt(2 * RING_STEP_S + 1e-6));
    // the nose impact sits at the ellipse edge, so rings are clipped: more than ring 0-1 alone, at most 19
    expect(cs.length).toBeGreaterThan(7);
    expect(cs.length).toBeLessThanOrEqual(1 + 6 + 12);
    // compare the ring-0 cell (the impact cell, lit alone at age 0) with a ring-2 cell, both at the same age
    const ring0 = cells(hitAt(0))[0]!;
    const norm = (c: { x: number; y: number }) => ((c.x - E.cx) / E.rx) ** 2 + ((c.y - E.cy) / E.ry) ** 2;
    const colStep = Math.sqrt(3) * CELL;
    const ring2 = cs.filter((c) => Math.abs(Math.hypot(c.x - ring0.x, c.y - ring0.y) - 2 * colStep) < 1e-6 || Math.abs(Math.hypot(c.x - ring0.x, c.y - ring0.y) - 3 * CELL) < 1e-6);
    expect(ring2.length).toBeGreaterThan(0);
    const raw = (c: { x: number; y: number; alpha: number }) => c.alpha / (0.45 + 0.55 * norm(c));
    const at = cs.find((c) => c.x === ring0.x && c.y === ring0.y)!;
    for (const c of ring2) expect(raw(c)).toBeLessThan(raw(at));
  });

  it('every alpha is near 0 just under SHIMMER_S, lit just after the start, and the hit is removed after a step past SHIMMER_S', () => {
    expect(cells(hitAt(SHIMMER_S - 0.001)).every((c) => c.alpha < 0.01)).toBe(true);
    expect(cells(hitAt(0.01)).some((c) => c.alpha > 0.3)).toBe(true);
    const fx = hitAt(SHIMMER_S + 0.01);
    expect(cells(fx).length).toBe(0);
    expect(fx.hits[0]!.length).toBe(0);
  });

  it('PATCH_RINGS bounds the patch', () => {
    const cs = cells(hitAt(1.0 * (PATCH_RINGS + 2) * RING_STEP_S - 0.001 + 0));
    // by 0.4 s all rings lit: at most 1+6+12+18 cells
    expect(cs.length).toBeLessThanOrEqual(37);
  });

  it('stepShieldFx with dt 0 changes nothing', () => {
    const fx = hitAt(0.1, true, true);
    const before = JSON.stringify(fx);
    stepShieldFx(fx, 0);
    expect(JSON.stringify(fx)).toBe(before);
  });

  it('a drop hit flickers the whole grid at age 0.05, not at 0.2', () => {
    const near = ellipsePoint(E, 0, NOSE, STAR);
    const far = shieldCells(hitAt(0.05, true), 0, E, CELL, NOSE, STAR);
    expect(far.some((c) => dist(c, near) > 80)).toBe(true);
    const later = cells(hitAt(FLICKER_S + 0.05, true));
    expect(later.some((c) => dist(c, near) > 80)).toBe(false);
  });

  it('edge cells are brighter than centre cells under a flicker', () => {
    const cs = cells(hitAt(0.14, true, false, 0)); // hit at the nose; look at the far side
    const norm = (c: { x: number; y: number }) => ((c.x - E.cx) / E.rx) ** 2 + ((c.y - E.cy) / E.ry) ** 2;
    const edge = cs.filter((c) => norm(c) > 0.7 && c.x < E.cx).map((c) => c.alpha);
    const mid = cs.filter((c) => norm(c) < 0.2).map((c) => c.alpha);
    expect(edge.length).toBeGreaterThan(0);
    expect(mid.length).toBeGreaterThan(0);
    expect(Math.min(...edge)).toBeGreaterThan(Math.max(...mid));
  });

  it('a delayed hit draws nothing until stepped by the delay', () => {
    const fx = createShieldFx(1);
    addShieldHit(fx, 0, 0, false, false, 0.1);
    expect(shieldCells(fx, 0, E, CELL, NOSE, STAR).length).toBe(0);
    stepShieldFx(fx, 0.05);
    expect(shieldCells(fx, 0, E, CELL, NOSE, STAR).length).toBe(0);
    stepShieldFx(fx, 0.05);
    expect(shieldCells(fx, 0, E, CELL, NOSE, STAR).length).toBeGreaterThan(0);
  });

  it('bubbleAlpha: 0 with up 0, rising with up, capped 0.5', () => {
    const fx = createShieldFx(1);
    expect(bubbleAlpha(fx, 0, 0)).toBe(0);
    expect(bubbleAlpha(fx, 0, 1)).toBeCloseTo(0.2, 6);
    expect(bubbleAlpha(fx, 0, 2)).toBeGreaterThan(bubbleAlpha(fx, 0, 1));
    expect(bubbleAlpha(fx, 0, 100)).toBe(0.5);
  });

  it('after a last hit the bubble fades over COLLAPSE_S', () => {
    const fx = createShieldFx(1);
    addShieldHit(fx, 0, 0, true, true);
    const a0 = bubbleAlpha(fx, 0, 0);
    expect(a0).toBeGreaterThan(0);
    stepShieldFx(fx, COLLAPSE_S / 2);
    const a1 = bubbleAlpha(fx, 0, 0);
    expect(a1).toBeGreaterThan(0);
    expect(a1).toBeLessThan(a0);
    stepShieldFx(fx, COLLAPSE_S);
    expect(bubbleAlpha(fx, 0, 0)).toBe(0);
    expect(fx.collapse[0]).toBe(-1);
  });

  it('a last hit flickers brighter than a plain drop', () => {
    const sum = (fx: ReturnType<typeof createShieldFx>) => cells(fx).reduce((s, c) => s + c.alpha, 0);
    expect(sum(hitAt(0.1, true, true))).toBeGreaterThan(sum(hitAt(0.1, true, false)));
  });

  it('ellipsePoint on the nose and starboard bearings', () => {
    const n = ellipsePoint(E, 0, NOSE, STAR);
    expect(n.x).toBeCloseTo(160, 6);
    expect(n.y).toBeCloseTo(100, 6);
    const s = ellipsePoint(E, Math.PI / 2, NOSE, STAR);
    expect(s.x).toBeCloseTo(100, 6);
    expect(s.y).toBeCloseTo(140, 6);
  });

  it('every impact bearing lights at least one cell at age 0, all inside the ellipse (rx 100, ry 60, cell 8)', () => {
    const e: Ellipse = { cx: 100, cy: 100, rx: 100, ry: 60 };
    for (const a of [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI]) {
      const fx = createShieldFx(1); addShieldHit(fx, 0, a, false, false);
      const cs = shieldCells(fx, 0, e, 8, NOSE, STAR);
      expect(cs.length, `bearing ${a}`).toBeGreaterThan(0);
      expect(cs.some((c) => c.alpha > 0.4 * 0.45), `bearing ${a}`).toBe(true);
      for (const c of cs) expect(((c.x - e.cx) / e.rx) ** 2 + ((c.y - e.cy) / e.ry) ** 2).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('shieldFlash: the layer fixed on the hit (not the live up), alpha 1 right after a drop, null after 0.3 s', () => {
    const fx = createShieldFx(1);
    addShieldHit(fx, 0, 0, true, false, 0, 2);
    expect(shieldFlash(fx, 0, 0)).toEqual({ layer: 2, alpha: 1 });
    expect(shieldFlash(fx, 0, 5)).toEqual({ layer: 2, alpha: 1 });   // `up` changing later does not move the flash
    stepShieldFx(fx, 0.31);
    expect(shieldFlash(fx, 0, 3)).toBeNull();
    const plain = createShieldFx(1);
    addShieldHit(plain, 0, 0, false, false);
    expect(shieldFlash(plain, 0, 3)).toBeNull();
  });

  it('hexPoints returns 12 numbers at distance r', () => {
    const p = hexPoints(10, 20, 5);
    expect(p.length).toBe(12);
    for (let i = 0; i < 12; i += 2) expect(Math.hypot(p[i]! - 10, p[i + 1]! - 20)).toBeCloseTo(5, 6);
  });
});

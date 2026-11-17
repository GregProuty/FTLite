import { describe, expect, it } from 'vitest';
import { dashCircle, dashLine, hatchSegments, isConvex } from '../src/renderer/src/render/tactical/dashModel';

const lengths = (s: readonly number[]): number[] => { const out: number[] = []; for (let i = 0; i < s.length; i += 4) out.push(Math.hypot(s[i + 2]! - s[i]!, s[i + 3]! - s[i + 1]!)); return out; };

describe('dashLine (CRT map spec section 2)', () => {
  it('6 on, 4 off along a straight line, the last dash cut at the end', () => {
    const s = dashLine([0, 0, 25, 0], 6, 4);
    expect(s).toEqual([0, 0, 6, 0, 10, 0, 16, 0, 20, 0, 25, 0]);
  });
  it('carries the pattern across a vertex', () => {
    const s = dashLine([0, 0, 3, 0, 3, 10], 6, 4);
    expect(lengths(s).map((v) => +v.toFixed(6))).toEqual([3, 3, 3]);   // 3 along x and 3 up (one dash of 6), a gap of 4, then 3 to the end
    expect(s.slice(4)).toEqual([3, 0, 3, 3, 3, 7, 3, 10]);
  });
  it('dotted 1 on 3 off; empty and zero-length input give nothing', () => {
    expect(lengths(dashLine([0, 0, 12, 0], 1, 3))).toEqual([1, 1, 1]);
    expect(dashLine([], 6, 4)).toEqual([]); expect(dashLine([5, 5, 5, 5], 6, 4)).toEqual([]);
  });
  it('writes into the array it is given, cleared first', () => {
    const out = [9, 9, 9]; const r = dashLine([0, 0, 6, 0], 6, 4, out);
    expect(r).toBe(out); expect(out).toEqual([0, 0, 6, 0]);
  });
});

describe('dashCircle', () => {
  it('a whole number of periods closes the circle; every chord end lies on it', () => {
    const r = 50, s = dashCircle(10, 20, r, 6, 4);
    expect(s.length / 4).toBe(Math.round((2 * Math.PI * r) / 10));
    for (let i = 0; i < s.length; i += 2) expect(Math.hypot(s[i]! - 10, s[i + 1]! - 20)).toBeCloseTo(r, 9);
    for (const v of lengths(s)) expect(v).toBeCloseTo(6, 0);
  });
  it('a tiny circle still gets one dash; radius 0 none', () => {
    expect(dashCircle(0, 0, 1, 6, 4).length).toBeGreaterThan(0);
    expect(dashCircle(0, 0, 0, 6, 4)).toEqual([]);
  });
});

describe('isConvex', () => {
  it('tells convex from concave', () => {
    expect(isConvex([0, 0, 10, 0, 10, 10, 0, 10])).toBe(true);
    expect(isConvex([0, 0, 10, 0, 5, 2, 10, 10, 0, 10])).toBe(false);
  });
});

describe('hatchSegments', () => {
  it('45-degree lines 4 apart, clipped to the polygon: every end on its boundary, inside a square', () => {
    const sq = [0, 0, 20, 0, 20, 20, 0, 20], s = hatchSegments(sq, 4, Math.PI / 4);
    expect(s.length / 4).toBeGreaterThan(5);
    for (let i = 0; i < s.length; i += 2) {
      const x = s[i]!, y = s[i + 1]!;
      expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(20 + 1e-9); expect(y).toBeGreaterThanOrEqual(-1e-9); expect(y).toBeLessThanOrEqual(20 + 1e-9);
      expect(Math.min(x, y, 20 - x, 20 - y)).toBeCloseTo(0, 9);
    }
    for (let i = 0; i < s.length; i += 4) expect(Math.abs((s[i + 3]! - s[i + 1]!) / (s[i + 2]! - s[i]!))).toBeCloseTo(1, 9);
    // Neighbouring lines are 4 apart, measured along the normal.
    const c = (i: number): number => -s[i]! * Math.SQRT1_2 + s[i + 1]! * Math.SQRT1_2;
    expect(c(4) - c(0)).toBeCloseTo(4, 9);
  });
  it('sits on the screen lattice, so two polygons sharing an edge get matching lines', () => {
    const a = hatchSegments([0, 0, 10, 0, 10, 10, 0, 10], 4, Math.PI / 4), b = hatchSegments([10, 0, 20, 0, 20, 10, 10, 10], 4, Math.PI / 4);
    const offsets = (s: number[]): number[] => { const o: number[] = []; for (let i = 0; i < s.length; i += 4) o.push(+(-s[i]! * Math.SQRT1_2 + s[i + 1]! * Math.SQRT1_2).toFixed(6)); return o; };
    for (const o of [...offsets(a), ...offsets(b)]) expect(Math.abs((o / 4) - Math.round(o / 4))).toBeLessThan(1e-6);
  });
});

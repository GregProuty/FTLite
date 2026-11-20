// Asteroids-iii §7.3 (D10): the cracks are fixed per rock, grow with wear as prefixes, and stay strictly inside the outline.
import { describe, expect, it } from 'vitest';
import { asteroidShape, CRACK_MIN_PX, crackDraw, crackPaths, outlineRadius } from '../src/renderer/src/render/tactical/tacticalModel';

const TAU = Math.PI * 2;
/** Ray-casting point-in-polygon against the rock's 9-vertex outline (unit radius). */
function inside(index: number, x: number, y: number): boolean {
  const poly = asteroidShape(index).map((m, k) => ({ x: m * Math.cos((k / 9) * TAU), y: m * Math.sin((k / 9) * TAU) }));
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
const length = (line: { x: number; y: number }[]): number => line.slice(1).reduce((t, p, i) => t + Math.hypot(p.x - line[i]!.x, p.y - line[i]!.y), 0);

describe('crack paths (spec §7.3)', () => {
  it('outlineRadius meets the vertices exactly and, between two, the edge joining them', () => {
    const shape = asteroidShape(7);
    for (let k = 0; k < 9; k++) expect(outlineRadius(shape, (k / 9) * TAU)).toBeCloseTo(shape[k]!, 12);
    const mid = outlineRadius(shape, (0.5 / 9) * TAU);
    expect(mid).toBeLessThanOrEqual(Math.max(shape[0]!, shape[1]!));
    expect(mid).toBeGreaterThan(Math.min(shape[0]!, shape[1]!) * Math.cos(Math.PI / 9) - 1e-12);
  });
  it('8 points along every segment lie strictly inside the outline for indices 0 to 500 at wear 0.25, 0.5, 0.75 and 1', () => {
    const outside: string[] = [];
    for (let index = 0; index <= 500; index++) for (const wear of [0.25, 0.5, 0.75, 1]) for (const line of crackPaths(index, wear))
      for (let s = 0; s + 1 < line.length; s++) for (let j = 0; j < 8; j++) {
        const t = j / 7, x = line[s]!.x + (line[s + 1]!.x - line[s]!.x) * t, y = line[s]!.y + (line[s + 1]!.y - line[s]!.y) * t;
        if (!inside(index, x, y)) outside.push(`${index}@${wear}`);
      }
    expect(outside).toEqual([]);
  });
  it('wear shows ceil(wear · 4) cracks cut to (0.35 + 0.45 wear) of their length; higher wear holds lower wear as a prefix', () => {
    expect(crackPaths(3, 0)).toEqual([]);
    for (const index of [0, 11, 250]) {
      let previous = crackPaths(index, 0.01);
      for (const wear of [0.25, 0.4, 0.5, 0.75, 0.9, 1]) {
        const now = crackPaths(index, wear);
        expect(now.length).toBeGreaterThanOrEqual(previous.length);
        previous.forEach((line) => {   // the same crack (or branch) starts at the same fixed point; a cut ends part-way along a
          // segment, so compare every point but the last, and the lengths
          const later = now.find((l) => l[0]!.x === line[0]!.x && l[0]!.y === line[0]!.y)!;
          expect(later).toBeDefined();
          expect(later.length).toBeGreaterThanOrEqual(line.length);
          line.slice(0, -1).forEach((p, j) => { expect(later[j]!.x).toBeCloseTo(p.x, 12); expect(later[j]!.y).toBeCloseTo(p.y, 12); });
          expect(length(later)).toBeGreaterThanOrEqual(length(line) - 1e-12);
        });
        previous = now;
      }
    }
    const one = crackPaths(5, 0.25), full = crackPaths(5, 1);
    expect(one.length).toBe(1);
    expect(length(one[0]!) / length(full[0]!)).toBeCloseTo(0.4625 / 0.8, 9);   // (0.35 + 0.45·0.25) / (0.35 + 0.45·1)
  });
  it('is stable across calls, and cracks 1 and 3 fork once (4 mains and 2 branches at full wear)', () => {
    expect(crackPaths(42, 0.6)).toEqual(crackPaths(42, 0.6));
    expect(crackPaths(42, 1).length).toBe(6);
  });
  it('crackDraw: nothing under CRACK_MIN_PX on screen; otherwise each cut segment and its highlight 0.6 px off perpendicular', () => {
    expect(crackDraw(9, 1, 100, 100, CRACK_MIN_PX - 0.1)).toEqual([]);
    const segs = crackDraw(9, 1, 100, 100, 40), cuts = segs.filter((s) => !s.light), lights = segs.filter((s) => s.light);
    expect(cuts.length).toBe(lights.length);
    expect(cuts.length).toBeGreaterThan(0);
    cuts.forEach((c, i) => {
      const l = lights[i]!, ex = c.x2 - c.x1, ey = c.y2 - c.y1, len = Math.hypot(ex, ey);
      expect(Math.abs(((l.x1 - c.x1) * ex + (l.y1 - c.y1) * ey) / len)).toBeLessThan(1e-9);
      expect(Math.hypot(l.x1 - c.x1, l.y1 - c.y1)).toBeCloseTo(0.6, 9);
    });
  });
  it('the cracks turn with the outline (§13.5): crackDraw with a spin is the unspun strokes turned about the centre', () => {
    const a = crackDraw(9, 1, 100, 100, 40), b = crackDraw(9, 1, 100, 100, 40, Math.PI / 2);
    a.forEach((s, i) => { expect(b[i]!.x1).toBeCloseTo(100 - (s.y1 - 100), 9); expect(b[i]!.y1).toBeCloseTo(100 + (s.x1 - 100), 9); });
  });
});

// Asteroids-iv spec §3.1, §3.2, §5.2, §5.3: the lattice, the templates and the mask maths (pure).
import { describe, expect, it } from 'vitest';
import { buildTemplate, cellHash, components, cutSides, HIT_K, popcount, shapeOf, shatterGroups, shellFor, type CutOut } from '../src/renderer/src/sim/tactical/rockCells';

const out: CutOut = { left: 0, right: 0, ux: 0, uy: 0 };
const each = (run: (index: number, R: number) => void): void => { for (let i = 0; i < 120; i++) run(i, 15 + (i * 7) % 41); };

describe('templates (spec §3.2)', () => {
  it('7, 19 or 31 cells before the drops by radius, and never under the floor of 4, 13 or 25', () => {
    expect([shellFor(15).full, shellFor(20).full, shellFor(20.1).full, shellFor(40).full, shellFor(40.1).full, shellFor(55).full]).toEqual([7, 7, 19, 19, 31, 31]);
    each((i, R) => { const t = buildTemplate(i, R, i * 13), sh = shellFor(R); expect(t.fullCount).toBe(sh.full); expect(t.n).toBeGreaterThanOrEqual(sh.floor); expect(t.n).toBeLessThanOrEqual(sh.full); expect(popcount(t.full)).toBe(t.n); });
  });
  it('is the same for the same inputs, and the drops vary with the index and the salt', () => {
    const a = buildTemplate(4, 44, 99), b = buildTemplate(4, 44, 99);
    expect(Array.from(a.x)).toEqual(Array.from(b.x)); expect(a.full).toBe(b.full);
    const counts = new Set<number>(); for (let i = 0; i < 40; i++) counts.add(buildTemplate(i, 44, i * 31).n);
    expect(counts.size).toBeGreaterThan(2);
    expect(cellHash(1, 0, 0, 5)).not.toBe(cellHash(1, 0, 0, 6));
  });
  it('is connected, centred on its centre of mass, and its farthest hit circle touches R exactly', () => {
    const groups: number[] = [];
    each((i, R) => {
      const t = buildTemplate(i, R, i);
      expect(components(t, t.full, groups)).toBe(1);
      let sx = 0, sy = 0, far = 0;
      for (let c = 0; c < t.n; c++) { sx += t.x[c]!; sy += t.y[c]!; far = Math.max(far, Math.hypot(t.x[c]!, t.y[c]!)); }
      expect(Math.abs(sx / t.n)).toBeLessThan(1e-9); expect(Math.abs(sy / t.n)).toBeLessThan(1e-9);
      expect(far + t.hitR).toBeCloseTo(R, 9);
      expect(t.hitR).toBeCloseTo(t.d * HIT_K, 12); expect(t.contactR).toBeCloseTo(t.d / 2, 12);
    });
  });
  it('neighbours are one spacing apart and the relation is symmetric', () => {
    each((i, R) => {
      const t = buildTemplate(i, R, 3);
      for (let a = 0; a < t.n; a++) for (let b = 0; b < t.n; b++) {
        const near = ((t.nb[a]! >>> b) & 1) === 1;
        expect(near).toBe(((t.nb[b]! >>> a) & 1) === 1);
        if (near) expect(Math.hypot(t.x[a]! - t.x[b]!, t.y[a]! - t.y[b]!)).toBeCloseTo(t.d, 9);
      }
    });
  });
});

describe('masks (spec §3.3, §5.2 step 4)', () => {
  const t = buildTemplate(2, 50, 7);
  it('popcount counts bits', () => { expect([popcount(0), popcount(1), popcount(0b1011), popcount(0x7fffffff)]).toEqual([0, 1, 3, 31]); });
  it('components: removing a band through the middle leaves two groups that share no cell', () => {
    let column = 0;   // rows are offset by half a spacing, so a band three half-columns wide is what parts the two sides
    for (let c = 0; c < t.n; c++) if (Math.abs(t.x[c]!) < t.d * 0.75) column |= 1 << c;
    const rest = t.full & ~column, groups: number[] = [], n = components(t, rest, groups);
    expect(n).toBe(2);
    expect(groups[0]! & groups[1]!).toBe(0); expect(groups[0]! | groups[1]!).toBe(rest);
    expect(groups[0]! & -groups[0]!).toBeLessThan(groups[1]! & -groups[1]!);   // ascending by lowest cell
  });
  it('shapeOf: the count, the centre of mass, the bounding radius, the aim cell; memoised per mask', () => {
    const half = (() => { let m = 0; for (let c = 0; c < t.n; c++) if (t.x[c]! < 0) m |= 1 << c; return m; })(), s = shapeOf(t, half);
    expect(s.n).toBe(popcount(half)); expect(shapeOf(t, half)).toBe(s);
    let gx = 0; for (let c = 0; c < t.n; c++) if ((half >>> c) & 1) gx += t.x[c]!;
    expect(s.gx).toBeCloseTo(gx / s.n, 12); expect(s.gx).toBeLessThan(0);
    let far = 0, near = Infinity, aim = -1;
    for (let j = 0; j < s.n; j++) { const d = Math.hypot(s.ox[j]!, s.oy[j]!); far = Math.max(far, d); if (d < near) { near = d; aim = j; } }
    expect(s.r).toBeCloseTo(far + t.hitR, 12); expect(s.aim).toBe(aim);
    expect(() => shapeOf(t, 0)).toThrow();
  });
});

describe('the cut (spec §5.2)', () => {
  const t = buildTemplate(2, 50, 7);
  it('a line through the middle puts each cell on its side: left is cross(u, cell − P) ≥ 0', () => {
    cutSides(t, t.full, 0, 0, 0, 1, out);
    expect(out.left | out.right).toBe(t.full); expect(out.left & out.right).toBe(0);
    expect(out.left).not.toBe(0); expect(out.right).not.toBe(0);
    for (let c = 0; c < t.n; c++) expect(((out.left >>> c) & 1) === 1).toBe(0 * (t.y[c]! - 0) - 1 * (t.x[c]! - 0) >= 0);
    expect([out.ux, out.uy]).toEqual([0, 1]);
  });
  it('a line that misses the rock is moved through the centre of mass', () => {
    cutSides(t, t.full, 500, 0, 0, 1, out);
    expect(out.left).not.toBe(0); expect(out.right).not.toBe(0); expect(out.left | out.right).toBe(t.full);
  });
  it('two cells lying along u are still divided (the quarter turn)', () => {
    const a = 0, b = (() => { for (let c = 1; c < t.n; c++) if ((t.nb[a]! >>> c) & 1) return c; return -1; })(), mask = (1 << a) | (1 << b);
    const ux = t.x[b]! - t.x[a]!, uy = t.y[b]! - t.y[a]!;
    cutSides(t, mask, t.x[a]!, t.y[a]!, ux / t.d, uy / t.d, out);
    expect(popcount(out.left)).toBe(1); expect(popcount(out.right)).toBe(1);
  });
});

describe('the shatter (spec §5.3, amendment 5)', () => {
  it('takes the struck cell as the crater and leaves at least two groups that share no cell, for every cell of every template', () => {
    const groups: number[] = [];
    for (let i = 0; i < 40; i++) {
      const t = buildTemplate(i, 25 + (i % 4) * 10, i * 5);
      for (let c = 0; c < t.n; c++) {
        const n = shatterGroups(t, t.full, t.x[c]!, t.y[c]!, 0.6, -0.8, groups);
        let all = 0;
        for (let g = 0; g < n; g++) { expect(all & groups[g]!).toBe(0); all |= groups[g]!; }
        expect((all >>> c) & 1).toBe(0);                       // the struck cell is dust
        expect(n).toBeGreaterThanOrEqual(2);
        for (let k = 0; k < t.n; k++) if (!((all >>> k) & 1)) expect(Math.hypot(t.x[k]! - t.x[c]!, t.y[k]! - t.y[c]!)).toBeLessThanOrEqual(0.75 * t.d + 1e-9);
      }
    }
  });
});

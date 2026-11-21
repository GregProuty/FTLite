// Asteroids-iv spec §7: a mask's outline is the boundary of its cells (closed loops, every rim edge once), its seams the
// edges between two live neighbours; both about the rock's centre of mass, cached per template and mask.
import { describe, expect, it } from 'vitest';
import { buildTemplate, components, popcount, shapeOf } from '../src/renderer/src/sim/tactical/rockCells';
import { rockOutline } from '../src/renderer/src/render/tactical/rockOutline';

const t = buildTemplate(2, 50, 7);
const rimEdges = (mask: number): number => { let n = 0; for (let c = 0; c < t.n; c++) if ((mask >>> c) & 1) n += 6 - popcount(t.nb[c]! & mask); return n; };
const pairs = (mask: number): number => { let n = 0; for (let c = 0; c < t.n; c++) if ((mask >>> c) & 1) n += popcount(t.nb[c]! & mask); return n / 2; };

describe('rockOutline (spec §7)', () => {
  it('a whole rock: one closed loop with one corner per rim edge, and a seam per pair of neighbours', () => {
    const o = rockOutline(t, t.full);
    expect(o.loops).toHaveLength(1);
    expect(o.loops[0]!.length / 2).toBe(rimEdges(t.full));
    expect(o.seams.length / 4).toBe(pairs(t.full));
    expect(rockOutline(t, t.full)).toBe(o);
  });
  it('every point lies within the bounding radius plus the jitter and easing of the centre of mass', () => {
    for (const mask of [t.full, t.full & 0x2aaaaaaa | 1, 0b111]) {
      const groups: number[] = []; const n = components(t, mask, groups);
      for (let g = 0; g < n; g++) {
        if (popcount(groups[g]!) < 2) continue;
        const o = rockOutline(t, groups[g]!), r = shapeOf(t, groups[g]!).r + 0.4 * t.d;
        for (const loop of o.loops) for (let i = 0; i < loop.length; i += 2) expect(Math.hypot(loop[i]!, loop[i + 1]!)).toBeLessThanOrEqual(r);
      }
    }
  });
  it('two halves of a cut fit exactly: every corner along the cut is the same point in both outlines (no corner moves when a rock is divided)', () => {
    let left = 0; for (let c = 0; c < t.n; c++) if (t.x[c]! < 0) left |= 1 << c;
    const right = t.full & ~left, a = rockOutline(t, left), b = rockOutline(t, right), ga = shapeOf(t, left), gb = shapeOf(t, right);
    const key = (x: number, y: number): string => `${x.toFixed(6)},${y.toFixed(6)}`;
    const ptsA = new Set<string>(), ptsB = new Set<string>();
    for (const loop of a.loops) for (let i = 0; i < loop.length; i += 2) ptsA.add(key(loop[i]! + ga.gx, loop[i + 1]! + ga.gy));
    for (const loop of b.loops) for (let i = 0; i < loop.length; i += 2) ptsB.add(key(loop[i]! + gb.gx, loop[i + 1]! + gb.gy));
    let shared = 0; for (const p of ptsA) if (ptsB.has(p)) shared++;
    let cutEdges = 0; for (let c = 0; c < t.n; c++) if ((left >>> c) & 1) cutEdges += popcount(t.nb[c]! & right);
    expect(shared).toBe(cutEdges + 1);   // a cut of n edges is a path of n + 1 corners, each in both outlines
  });
  it('a ring (the middle cell gone) has two loops, the larger first', () => {
    let mid = -1; for (let c = 0; c < t.n; c++) if (Math.hypot(t.x[c]!, t.y[c]!) < t.d * 0.6) mid = c;
    const o = rockOutline(t, t.full & ~(1 << mid));
    expect(o.loops).toHaveLength(2); expect(o.loops[0]!.length).toBeGreaterThan(o.loops[1]!.length);
  });
});

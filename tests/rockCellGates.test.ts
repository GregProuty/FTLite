// Asteroids-iv final review: coverage for two gates: the planet gate in stepRocks (a cell on the planet turns a rock to
// dust; a bounding circle alone does not) and rockPairContact's early skip (it equals a brute-force minimum over all pairs).
import { describe, expect, it } from 'vitest';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { popcount, shapeOf, templateFor } from '../src/renderer/src/sim/tactical/rockCells';
import { makeCells, rockAlive, rockAt, rockCellsInto } from '../src/renderer/src/sim/tactical/rocks';
import { makeContact, rockCircleContact, rockPairContact } from '../src/renderer/src/sim/tactical/rockShape';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { arena, mover, rockEvents, shaped, tmplOf } from './helpers/rockArena';

describe('the planet gate in stepRocks', () => {
  it('a cell on the planet turns a free cell rock to dust "planet" on the next step', () => {
    const st = arena(), tm = tmplOf(st, 31), pr = st.map.planet.r, hit = makeContact();
    let y = 5 * pr, found = false;
    for (; y > 0; y -= 1) { shaped(st, 3, tm, 0, y); if (rockCircleContact(st, 3, 0, 0, pr, hit)) { found = true; break; } }
    expect(found).toBe(true);
    shaped(st, 3, tm, 0, y - 5);
    expect(rockCircleContact(st, 3, 0, 0, pr, hit)).toBe(true);
    stepDuel(st, IDLE_INPUT);
    expect(rockEvents(st, 'dust').some((e) => e.what === 'dust')).toBe(true);
    expect(rockAlive(st, 3)).toBe(false);
  });
  it('a bounding circle on the planet with no cell on it does not turn the rock to dust', () => {
    const st = arena(), tm = tmplOf(st, 31), t = templateFor(st.map, tm), pr = st.map.planet.r, hit = makeContact();
    let mask = 0; for (let c = 0; c < t.n; c++) if (t.x[c]! < -0.9 * t.d) mask |= 1 << c;
    expect(popcount(mask)).toBeGreaterThanOrEqual(4);
    const sh = shapeOf(t, mask);
    let X = 0, found = false;
    for (X = -(pr + sh.r + 50); X < 0; X += 1) {
      shaped(st, 3, tm, X, 0, 0, 0, mask);
      if (Math.abs(X) < sh.r + pr - 2 && !rockCircleContact(st, 3, 0, 0, pr, hit) && hit.depth < -3) { found = true; break; }
    }
    expect(found).toBe(true);
    stepDuel(st, IDLE_INPUT);
    expect(rockEvents(st, 'dust')).toHaveLength(0);
    expect(rockAlive(st, 3)).toBe(true);
  });
});

describe('rockPairContact against a brute-force minimum over every cell pair', () => {
  const cA = makeCells(), cB = makeCells();
  function brute(st: ReturnType<typeof arena>, a: number, b: number) {
    rockCellsInto(st, a, cA); rockCellsInto(st, b, cB);
    let best = Infinity, bi = 0, bj = 0;
    for (let i = 0; i < cA.n; i++) for (let j = 0; j < cB.n; j++) { const dx = cA.x[i]! - cB.x[j]!, dy = cA.y[i]! - cB.y[j]!, d2 = dx * dx + dy * dy; if (d2 < best) { best = d2; bi = i; bj = j; } }
    const d = Math.sqrt(best), rr = cA.contactR + cB.contactR;
    return { d, depth: rr - d, nx: (cA.x[bi]! - cB.x[bj]!) / d, ny: (cA.y[bi]! - cB.y[bj]!) / d };
  }
  function setup(gap: number) {
    const st = arena(), tm = tmplOf(st, 31); shaped(st, 3, tm, 0, 2000);
    const a = rockAt(st, 3); rockCellsInto(st, 3, cA);
    let far = 0; for (let i = 1; i < cA.n; i++) if (Math.hypot(cA.x[i]! - a.x, cA.y[i]! - a.y) > Math.hypot(cA.x[far]! - a.x, cA.y[far]! - a.y)) far = i;
    const fx = cA.x[far]!, fy = cA.y[far]!, h = Math.hypot(fx - a.x, fy - a.y), ux = (fx - a.x) / h, uy = (fy - a.y) / h, rb = 10, step = cA.contactR + rb + gap;
    mover(st, 4, fx + ux * step, fy + uy * step, 0, 0, rb);
    return st;
  }
  it('touching only the far cell: the contact, normal and depth are the brute-force answer', () => {
    const st = setup(-2), out = makeContact(), want = brute(st, 3, 4);
    expect(want.depth).toBeGreaterThan(0);
    expect(rockPairContact(st, 3, 4, out)).toBe(true);
    expect(out.depth).toBeCloseTo(want.depth, 9); expect(out.d).toBeCloseTo(want.d, 9);
    expect(out.nx).toBeCloseTo(want.nx, 9); expect(out.ny).toBeCloseTo(want.ny, 9);
  });
  it('apart: brute force agrees they are apart and rockPairContact reports no contact (its fields are then not the nearest pair)', () => {
    const st = setup(3), out = makeContact(), want = brute(st, 3, 4);
    expect(want.depth).toBeLessThan(0);
    expect(rockPairContact(st, 3, 4, out)).toBe(false);
  });
});

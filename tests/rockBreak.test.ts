// Asteroids-iv spec §5: a break divides a rock's cells. The cut (laser, gun, ram, collision, blast, tidal), the shatter (a
// torpedo's direct hit), a piece's birth, dust, slot use and eviction, a rock target clearing itself, damage and push;
// with spike i's hash/clone and firstBlocker cases.
import { describe, expect, it } from 'vitest';
import { cloneTactical, createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { hashTactical } from '../src/renderer/src/sim/tactical/hash';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { escapeSpeed } from '../src/renderer/src/sim/tactical/rails';
import { popcount, shapeOf, templateFor } from '../src/renderer/src/sim/tactical/rockCells';
import { firstBlocker, makeCells, rockAlive, rockAt, rockBorn, rockCellsInto, rockHp, RockKind, rockMaskOf, rockMassOf, rockTmpl } from '../src/renderer/src/sim/tactical/rocks';
import { breakRock, dustRock, hitRock, kickFraction, pushRock } from '../src/renderer/src/sim/tactical/rockBreak';
import { CUT_KICK, TIDAL_CUT_KICK } from '../src/renderer/src/sim/tactical/rockTuning';
import { arena, fillPool, mover, rockEvents, seeded, shaped, tmplOf } from './helpers/rockArena';

const ve = escapeSpeed(2000), cells = makeCells();
/** A template x between two columns of cells near the middle: a vertical cut there has no cell on the line. */
const midX = (t: ReturnType<typeof templateFor>): number => { const xs = Array.from(t.x).sort((a, b) => a - b), i = xs.findIndex((x) => x > 0.1 * t.d); return (xs[i - 1]! + xs[i]!) / 2; };
const worldCells = (st: ReturnType<typeof arena>, k: number): string[] => { rockCellsInto(st, k, cells); return Array.from({ length: cells.n }, (_, c) => `${cells.x[c]!.toFixed(6)},${cells.y[c]!.toFixed(6)}`); };

describe('the cut (spec §5.2, §5.4)', () => {
  it('a cut through the middle gives pieces of the original: the same cells in the same places, no cell twice, none invented', () => {
    for (const full of [7, 19, 31] as const) {
      const st = arena(), tm = tmplOf(st, full), t = templateFor(st.map, tm);
      shaped(st, 100, tm, 0, 2000, 3, -2);
      const before = worldCells(st, 100).sort();
      breakRock(st, 100, 0, 2000, 0, 1, 'laser', 0, 'cut');
      const split = rockEvents(st, 'split')[0]!, pieces = split.pieces!;
      expect(pieces.length).toBeGreaterThanOrEqual(2); expect(pieces[0]).toBe(100); expect(split.burst).toBeUndefined();
      let all = 0; const after: string[] = [];
      for (const p of pieces) {
        const m = rockMaskOf(st, p);
        expect(rockTmpl(st, p)).toBe(tm); expect(all & m).toBe(0); all |= m; expect(popcount(m)).toBeGreaterThanOrEqual(2);
        const a = rockAt(st, p), sh = shapeOf(t, m);
        expect([a.kind, a.r, a.hp]).toEqual([RockKind.Free, sh.r, rockHp(sh.r)]); expect(rockBorn(st, p)).toBe(true);
        after.push(...worldCells(st, p));
      }
      expect(all & ~t.full).toBe(0);
      const dustCells = popcount(t.full & ~all);
      expect(after.length + dustCells).toBe(before.length);
      for (const c of after) expect(before).toContain(c);                    // no cell moved at the break
      expect(popcount(rockMaskOf(st, pieces[0]!))).toBe(Math.max(...pieces.map((p) => popcount(rockMaskOf(st, p)))));   // the largest keeps the slot
      expect([st.rockSplits, st.systems[0].rocksBroken]).toEqual([1, 1]);
    }
  });
  it('the sides part along the line\'s normal at v_esc · CUT_KICK, shared by inverse cell count; a tidal cut at TIDAL_CUT_KICK', () => {
    for (const [pattern, kick] of [['cut', CUT_KICK], ['tidal', TIDAL_CUT_KICK]] as const) {
      const st = arena(), tm = tmplOf(st, 31), t = templateFor(st.map, tm);
      shaped(st, 100, tm, 0, 2000, 3, -2);
      const mx = midX(t);
      breakRock(st, 100, mx, 2000, 0, 1, 'collision', -1, pattern);   // u south: left is cross(u, c − P) ≥ 0, here x < mx; the normal is (−1, 0)
      let left = 0; for (let c = 0; c < t.n; c++) if (t.x[c]! < mx) left |= 1 << c;
      const nl = popcount(left), nr = t.n - nl, sp = ve * kick;
      for (const p of rockEvents(st, 'split')[0]!.pieces!) {
        const a = rockAt(st, p), onLeft = (rockMaskOf(st, p) & left) !== 0;
        expect(a.vx).toBeCloseTo(3 + (onLeft ? -1 : 1) * (sp * (onLeft ? nr : nl)) / t.n, 9);
        expect(a.vy).toBeCloseTo(-2, 9);
      }
    }
  });
  it('a zero direction is north; a line that misses is moved through the centre of mass', () => {
    const st = arena(), tm = tmplOf(st, 19);
    shaped(st, 100, tm, 0, 2000);
    breakRock(st, 100, 900, 2000, 0, 0, 'laser', 0, 'cut');
    const pieces = rockEvents(st, 'split')[0]!.pieces!;
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    const vxs = pieces.map((p) => rockAt(st, p).vx);   // u north: the sides part east and west
    expect(Math.min(...vxs)).toBeLessThan(0); expect(Math.max(...vxs)).toBeGreaterThan(0);
    for (const p of pieces) expect(rockAt(st, p).vy).toBeCloseTo(0, 9);
  });
  it('a plain rock, and a rock whose every group is one cell, turn to dust whole; a single cell shaved off is dust with rock −1', () => {
    const st = arena(), tm = tmplOf(st, 31), t = templateFor(st.map, tm);
    mover(st, 100, 0, 2000, 0, 0, 30);
    breakRock(st, 100, 0, 2000, 1, 0, 'laser', 0, 'cut');
    expect(rockEvents(st, 'dust')).toMatchObject([{ rock: 100, by: 'laser', ship: 0, r: 30 }]); expect(rockAlive(st, 100)).toBe(false);
    const b = (() => { for (let c = 1; c < t.n; c++) if ((t.nb[0]! >>> c) & 1) return c; return -1; })();
    const st2 = arena(); shaped(st2, 100, tmplOf(st2, 31), 0, 2000, 0, 0, 1 | (1 << b));
    breakRock(st2, 100, 0, 2000, 1, 0, 'gun', 0, 'cut');
    expect(rockEvents(st2, 'dust')).toMatchObject([{ rock: 100, by: 'gun' }]); expect(rockEvents(st2, 'split')).toEqual([]);
    const st3 = arena(), far = (() => { let f = 0; for (let c = 1; c < t.n; c++) if (t.x[c]! > t.x[f]!) f = c; return f; })();
    shaped(st3, 100, tmplOf(st3, 31), 0, 2000);
    breakRock(st3, 100, t.x[far]! - t.d * 0.25, 2000, 0, 1, 'laser', 0, 'cut');   // a line just west of the easternmost column: its cells are not neighbours, so each is a crumb
    const crumbs = rockEvents(st3, 'dust');
    expect(crumbs.length).toBeGreaterThanOrEqual(1); expect(crumbs.every((e) => e.rock === -1)).toBe(true);
    expect(st3.rockSlotDust).toBe(0); expect(st3.rockDust).toBe(crumbs.length);
  });
});

describe('the shatter (spec §5.3, §5.4)', () => {
  it('the struck cell is the crater, the rest flies as real chunks away from it at v_esc · (0.30 + 0.30 f_j)', () => {
    const st = arena(), tm = tmplOf(st, 31), t = templateFor(st.map, tm);
    shaped(st, 100, tm, 0, 2000, 5, 0);
    const px = t.x[3]!, py = 2000 + t.y[3]!;
    breakRock(st, 100, px, py, -1, 0, 'torpedo', 0, 'shatter');
    const split = rockEvents(st, 'split')[0]!, pieces = split.pieces!;
    expect(split.burst).toBe(true); expect(pieces.length).toBeGreaterThanOrEqual(2);
    let all = 0;
    pieces.forEach((p, j) => {
      const a = rockAt(st, p), m = rockMaskOf(st, p), kick = ve * (0.3 + 0.3 * kickFraction(j));
      expect(all & m).toBe(0); all |= m; expect((m >>> 3) & 1).toBe(0);
      expect(Math.hypot(a.vx - 5, a.vy)).toBeCloseTo(kick, 6);
      expect((a.vx - 5) * (a.x - px) + a.vy * (a.y - py)).toBeGreaterThan(0);   // away from the point
    });
    expect(rockEvents(st, 'dust').every((e) => e.rock === -1)).toBe(true);
  });
});

describe('slot use and eviction (spec §5.4)', () => {
  it('the largest piece keeps the slot; the others take the lowest empty slots, ascending', () => {
    const st = arena();
    for (const k of [0, 1, 3, 4]) mover(st, k, -2000 + 200 * k, -1000, 0, 0, 10);
    shaped(st, 100, tmplOf(st, 31), 0, 2000);
    breakRock(st, 100, 0, 2000, 0, 1, 'laser', 0, 'cut');
    const pieces = rockEvents(st, 'split')[0]!.pieces!;
    expect(pieces[0]).toBe(100); expect(pieces.slice(1)).toEqual([2, 5, 6, 7, 8].slice(0, pieces.length - 1));
  });
  it('with no free slot it evicts the smallest rock smaller than the piece (ties: lowest slot), never a born or excluded one', () => {
    for (const [exclude, evicted] of [[[40], 60], [[], 40]] as const) {
      const st = arena();
      shaped(st, 0, tmplOf(st, 31), 0, 2000);
      fillPool(st, 9);
      mover(st, 60, -2000, 1000, 0, 0, 8.5); mover(st, 40, -1800, 1000, 0, 0, 8.5); mover(st, 20, -1600, 1000, 0, 0, 8.2);
      st.rockBorn[20] = 1;
      breakRock(st, 0, 0, 2000, 0, 1, 'collision', -1, 'cut', exclude);
      expect(rockEvents(st, 'split')[0]!.pieces!.slice(0, 2)).toEqual([0, evicted]);
      expect(rockEvents(st, 'dust').find((e) => e.evicted)).toMatchObject({ rock: evicted, by: 'collision', r: 8.5, evicted: true });
      expect(rockTmpl(st, evicted)).toBe(tmplOf(st, 31));
    }
  });
  it('with nothing smaller a piece is dust with an event (rock −1) and rockSlotDust counts it; the break still counts once', () => {
    const st = arena();
    shaped(st, 0, tmplOf(st, 31), 0, 2000);
    fillPool(st, 60);
    breakRock(st, 0, 0, 2000, 0, 1, 'laser', 0, 'cut');
    expect(rockEvents(st, 'split')[0]!.pieces).toEqual([0]);
    expect(st.rockSlotDust).toBeGreaterThanOrEqual(1);
    expect([st.rockSplits, st.rockEvictions, st.systems[0].rocksBroken]).toEqual([1, 0, 1]);
  });
});

describe('a rock target clears itself (spec §6.1 of spike ii)', () => {
  it('when its rock breaks: laser and torpedo targets to −1, a flying torpedo\'s to −2; an inactive ship\'s record is left alone', () => {
    const st = arena(), s = st.systems[0];
    shaped(st, 0, tmplOf(st, 19), 0, 2000);
    s.laserRock = 0; s.torpRock = 0; s.torpRockFlying = 0; st.systems[1].laserRock = 0;
    breakRock(st, 0, 0, 2000, 1, 0, 'laser', 0, 'cut');
    expect([s.laserRock, s.torpRock, s.torpRockFlying, st.systems[1].laserRock]).toEqual([-1, -1, -2, 0]);
  });
});

describe('damage, push and dust', () => {
  it('hitRock takes hp, emits a hit and counts it; at hp ≤ 0 it cuts along the hit through its point; a born or empty slot takes nothing', () => {
    const st = arena();
    shaped(st, 100, tmplOf(st, 31), 0, 2000);
    const hp = rockAt(st, 100).hp;
    hitRock(st, 100, 1, 0, 2000, 0, 1, 'laser', 0);
    expect(rockAt(st, 100).hp).toBe(hp - 1); expect(rockEvents(st, 'hit')).toMatchObject([{ rock: 100, by: 'laser', ship: 0 }]); expect(st.rockHits).toBe(1);
    hitRock(st, 100, hp, 0, 2000, 0, 1, 'laser', 0);
    expect(rockEvents(st, 'split')).toHaveLength(1);
    const piece = rockEvents(st, 'split')[0]!.pieces![0]!, was = rockAt(st, piece).hp;
    hitRock(st, piece, 1, 0, 2000, 0, 1, 'laser', 0);   // born this tick
    expect(rockAt(st, piece).hp).toBe(was);
    hitRock(st, 150, 1, 0, 0, 0, 1, 'laser', 0);
    expect(st.rockHits).toBe(2);
  });
  it('pushRock frees a rail rock and adds Δv to its rail velocity; dustRock clears the slot and its cells with a dust event', () => {
    const st = arena();
    seeded(st, 7);
    const before = rockAt(st, 7);
    pushRock(st, 7, 2, -1);
    const after = rockAt(st, 7);
    expect(after.kind).toBe(RockKind.Free); expect(after.vx).toBeCloseTo(before.vx + 2, 9); expect(after.vy).toBeCloseTo(before.vy - 1, 9);
    expect(rockTmpl(st, 7)).toBe(7);
    dustRock(st, 7, 'planet');
    expect(rockAlive(st, 7)).toBe(false); expect([st.rockCells[14], st.rockCells[15]]).toEqual([0, 0]);
    expect(rockEvents(st, 'dust')).toMatchObject([{ rock: 7, by: 'planet' }]);
  });
  it('mass is kept by a cut, less the dust', () => {
    const st = arena(), tm = tmplOf(st, 31), t = templateFor(st.map, tm);
    shaped(st, 100, tm, 0, 2000);
    const whole = rockMassOf(st, 100);
    breakRock(st, 100, 0, 2000, 0, 1, 'laser', 0, 'cut');
    const pieces = rockEvents(st, 'split')[0]!.pieces!, kept = pieces.reduce((n, p) => n + popcount(rockMaskOf(st, p)), 0);
    expect(pieces.reduce((m, p) => m + rockMassOf(st, p), 0)).toBeCloseTo((whole * kept) / t.n, 9);
  });
});

describe('spike i cases kept: the hash, the clone and firstBlocker', () => {
  it('a chipped rock changes the hash, and a clone runs on identically', () => {
    const st = createTacticalState(11), h = hashTactical(st);
    st.rocks[6] = st.rocks[6]! - 0.5;
    expect(hashTactical(st)).not.toBe(h);
    const copy = cloneTactical(st);
    for (let i = 0; i < 30; i++) { stepDuel(st, IDLE_INPUT); stepDuel(copy, IDLE_INPUT); }
    expect(hashTactical(copy)).toBe(hashTactical(st));
  });
  it('firstBlocker finds the nearest rock along a segment', () => {
    const st = arena();
    mover(st, 5, 300, 2000, 0, 0, 20); mover(st, 2, 600, 2000, 0, 0, 20);
    expect(firstBlocker(st, 0, 2000, 900, 2000)).toMatchObject({ rock: 5 });
    expect(firstBlocker(st, 0, 2000, 900, 2000)!.t).toBeCloseTo(280 / 900, 12);
  });
});

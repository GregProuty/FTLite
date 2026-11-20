// Spike ii §3.4, §3.5, §6.1: breaking (the fan and the burst), slot use and eviction, dust, damage and push, and a rock
// target clearing itself; with spike i's hash/clone and firstBlocker cases.
import { describe, expect, it } from 'vitest';
import { cloneTactical, createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { hashTactical } from '../src/renderer/src/sim/tactical/hash';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { escapeSpeed } from '../src/renderer/src/sim/tactical/rails';
import { firstBlocker, makeCells, rockAlive, rockAt, rockBorn, rockCellsInto, RockKind, segmentEntry } from '../src/renderer/src/sim/tactical/rocks';
import { breakRock, dustRock, hitRock, kickFraction, pieceCount, pieceKick, pieceOffset, pieceRadius, pushRock } from '../src/renderer/src/sim/tactical/rockBreak';
import { arena, fillPool, mover, rail, rockEvents, seeded } from './helpers/rockArena';

const deg = (a: number): number => (a * Math.PI) / 180;

const ve = escapeSpeed(2000);
describe('the fan (laser, blast-secondary, collision, ram; spec §3.4, §5.2)', () => {
  it('r 42 gives 3 pieces, r 30, r 20 and r 13 give 2, r 12.9 and r 12 dust; each 0.9 r / √n, 0.6 r out, the parent\'s velocity plus v_esc · (0.10 + 0.15 f_j)', () => {
    for (const [r, n] of [[42, 3], [30, 2], [20, 2], [13, 2], [12.9, 0], [12, 0]] as const) {
      const st = arena();
      mover(st, 100, 0, 2000, 10, 0, r);
      breakRock(st, 100, 1, 0, 'laser', 0, 'fan');
      expect(pieceCount(r, 'fan')).toBe(n);
      expect(st.systems[0].rocksBroken, `r ${r}`).toBe(1);
      if (n === 0) { expect(rockEvents(st, 'dust')).toMatchObject([{ rock: 100, by: 'laser', ship: 0, r, x: 0, y: 2000, vx: 10, vy: 0 }]); continue; }
      const split = rockEvents(st, 'split')[0]!, pieces = split.pieces!, rp = (0.9 * r) / Math.sqrt(n), angles = n === 2 ? [-30, 30] : [-40, 0, 40];
      expect(split).not.toHaveProperty('burst');
      expect(pieces[0]).toBe(100);
      pieces.forEach((slot, j) => {
        const p = rockAt(st, slot), a = deg(angles[j]!), k = ve * (0.1 + 0.15 * kickFraction(j));
        expect(p.kind).toBe(RockKind.Free);
        expect(p.r).toBeCloseTo(rp, 12);
        expect(p.hp).toBe(Math.ceil(rp / 10));
        expect(p.x).toBeCloseTo(0.6 * r * Math.cos(a), 9);
        expect(p.y).toBeCloseTo(2000 + 0.6 * r * Math.sin(a), 9);
        expect(p.vx).toBeCloseTo(10 + k * Math.cos(a), 9);
        expect(p.vy).toBeCloseTo(k * Math.sin(a), 9);
        expect(rockBorn(st, slot)).toBe(true);
      });
    }
  });
  it('a zero hit direction is north', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 0, 0, 42);
    breakRock(st, 100, 0, 0, 'ram', 0, 'fan');
    const p = rockAt(st, 100), k = ve * 0.1;   // piece 0 at −40° from north: (−sin 40°, −cos 40°)
    expect(p.vx).toBeCloseTo(-k * Math.sin(deg(40)), 9);
    expect(p.vy).toBeCloseTo(-k * Math.cos(deg(40)), 9);
  });
});

describe('the burst (a torpedo direct hit; spec §5.1, §13.6)', () => {
  it('r 50 and r 40 give 8 pieces, r 35 and r 30 give 6, r 20 gives 4, r 19 dust; a full circle from u, born 0.85/0.80/0.70 r out at v_esc · (0.30 + 0.30 f_j) (D13)', () => {
    for (const [r, n] of [[50, 8], [40, 8], [35, 6], [30, 6], [20, 4], [19, 0]] as const) {
      const st = arena();
      mover(st, 100, 0, 2000, 0, 0, r);
      breakRock(st, 100, 0, -3, 'torpedo', 0, 'burst');   // u north (any length)
      expect(pieceCount(r, 'burst')).toBe(n);
      if (n === 0) { expect(rockEvents(st, 'dust')).toMatchObject([{ rock: 100, by: 'torpedo', ship: 0 }]); continue; }
      const split = rockEvents(st, 'split')[0]!, pieces = split.pieces!, rp = (0.9 * r) / Math.sqrt(n), off = pieceOffset('burst', n) * r;
      expect(split.burst).toBe(true);
      expect(pieces).toHaveLength(n);
      expect(pieceOffset('burst', n)).toBe(n === 8 ? 0.85 : n === 6 ? 0.8 : 0.7);
      pieces.forEach((slot, j) => {
        const p = rockAt(st, slot), a = deg((360 * j) / n), k = ve * (0.3 + 0.3 * kickFraction(j));   // from u = (0, −1): (sin θ, −cos θ)
        expect(p.r).toBeCloseTo(rp, 12);
        expect(p.x).toBeCloseTo(off * Math.sin(a), 9);
        expect(p.y).toBeCloseTo(2000 - off * Math.cos(a), 9);
        expect(p.vx).toBeCloseTo(k * Math.sin(a), 9);
        expect(p.vy).toBeCloseTo(-k * Math.cos(a), 9);
      });
    }
  });
  it('no two siblings overlap at birth, for every burst pattern at its smallest and largest parent', () => {
    for (const [r, n] of [[40, 8], [60, 8], [30, 6], [39.9, 6], [20, 4], [29.9, 4]] as const) {
      const rp = pieceRadius(r, n), off = pieceOffset('burst', n) * r;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const ai = (2 * Math.PI * i) / n, aj = (2 * Math.PI * j) / n;
        expect(Math.hypot(off * (Math.cos(ai) - Math.cos(aj)), off * (Math.sin(ai) - Math.sin(aj))), `r ${r} pieces ${i}, ${j}`).toBeGreaterThan(2 * rp);
      }
    }
  });
  it('every kick is in its band: burst 0.30 to 0.60 (D13), fan 0.10 to 0.25, tidal 0.03 to 0.08 of v_esc', () => {
    for (let j = 0; j < 8; j++) {
      const b = pieceKick(1200, j, 'burst') / escapeSpeed(1200), f = pieceKick(1200, j, 'fan') / escapeSpeed(1200), t = pieceKick(150, j, 'tidal') / escapeSpeed(150);
      expect(b).toBeGreaterThanOrEqual(0.3); expect(b).toBeLessThan(0.6);
      expect(f).toBeGreaterThanOrEqual(0.1); expect(f).toBeLessThan(0.25);
      expect(t).toBeGreaterThanOrEqual(0.03); expect(t).toBeLessThan(0.08);
    }
    expect(kickFraction(0)).toBe(0);
    expect(kickFraction(1)).toBeCloseTo(0.6180339887498949, 15);
  });
});

describe('slot use and eviction (spec §3.4)', () => {
  it('piece 0 keeps the slot; the others take the lowest empty slots, ascending', () => {
    const st = arena();
    for (const k of [0, 1, 3, 4]) mover(st, k, -2000 + 200 * k, -1000, 0, 0, 10);
    mover(st, 100, 0, 2000, 0, 0, 42);
    breakRock(st, 100, 1, 0, 'laser', 0, 'fan');
    expect(rockEvents(st, 'split')[0]!.pieces).toEqual([100, 2, 5]);
  });
  it('with no free slot it evicts the smallest rock (Rail or Free) smaller than the piece (ties: lowest slot), never a born or excluded one', () => {
    for (const [exclude, evicted] of [[[40], 60], [[], 40]] as const) {
      const st = arena();
      mover(st, 0, 0, 2000, 0, 0, 30);
      fillPool(st, 9);
      mover(st, 60, -2000, 1000, 0, 0, 8.5); mover(st, 40, -1800, 1000, 0, 0, 8.5); mover(st, 20, -1600, 1000, 0, 0, 8.2);
      st.rockBorn[20] = 1;
      breakRock(st, 0, 1, 0, 'collision', -1, 'fan', exclude);   // r 30: 2 pieces of 19.09
      expect(rockEvents(st, 'split')[0]!.pieces).toEqual([0, evicted]);
      expect(st.rockEvictions).toBe(1);
      const dust = rockEvents(st, 'dust');
      expect(dust).toMatchObject([{ rock: evicted, by: 'collision', r: 8.5, evicted: true }]);
      expect(dust[0]).not.toHaveProperty('ship');
      expect(rockAt(st, evicted).r).toBeCloseTo((0.9 * 30) / Math.SQRT2, 12);
    }
    const st = arena();
    mover(st, 0, 0, 2000, 0, 0, 30);
    fillPool(st, 9, [50]);
    rail(st, 50, -1500, 1200, 8.2);   // §5.5: a Rail can be evicted too
    breakRock(st, 0, 1, 0, 'collision', -1, 'fan');
    expect(rockEvents(st, 'split')[0]!.pieces).toEqual([0, 50]);
  });
  it('with nothing smaller the piece is dust with an event (rock −1), and the break still counts once', () => {
    const st = arena();
    mover(st, 0, 0, 2000, 0, 0, 30);
    fillPool(st, 30);
    breakRock(st, 0, 1, 0, 'laser', 0, 'fan');
    expect(rockEvents(st, 'split')[0]!.pieces).toEqual([0]);
    expect(rockEvents(st, 'dust')).toMatchObject([{ rock: -1, by: 'laser', ship: 0 }]);
    expect(rockEvents(st, 'dust')[0]!.r).toBeCloseTo((0.9 * 30) / Math.SQRT2, 12);
    expect([st.rockDust, st.rockSplits, st.rockEvictions, st.systems[0].rocksBroken, st.rockSlotDust]).toEqual([1, 1, 0, 1, 1]);
  });
});

describe('a rock target clears itself (spec §6.1)', () => {
  it('when its rock breaks: laser and torpedo targets to −1, a flying torpedo\'s to −2; an inactive ship\'s record is left alone', () => {
    const st = arena(), s = st.systems[0];
    mover(st, 0, 0, 2000, 0, 0, 30);
    s.laserRock = 0; s.torpRock = 0; s.torpRockFlying = 0; st.systems[1].laserRock = 0;
    breakRock(st, 0, 1, 0, 'laser', 0, 'fan');
    expect([s.laserRock, s.torpRock, s.torpRockFlying, st.systems[1].laserRock]).toEqual([-1, -1, -2, 0]);
  });
  it('when its slot is evicted and reused for a piece', () => {
    const st = arena(), s = st.systems[0];
    mover(st, 0, 0, 2000, 0, 0, 30);
    fillPool(st, 9);
    mover(st, 7, -1000, 1000, 0, 0, 8);
    s.laserRock = 7; s.torpRock = 7; s.torpRockFlying = 7;
    breakRock(st, 0, 1, 0, 'laser', 0, 'fan');
    expect(rockEvents(st, 'split')[0]!.pieces).toEqual([0, 7]);
    expect([s.laserRock, s.torpRock, s.torpRockFlying]).toEqual([-1, -1, -2]);
  });
});

describe('damage, push and dust (spec §3.4, §3.5)', () => {
  it('hitRock takes hp, emits a hit and counts it; at hp ≤ 0 it fan-breaks; a born or empty slot takes nothing', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 0, 0, 30, 3);
    hitRock(st, 100, 2, 1, 0, 'laser', 0);
    expect(rockAt(st, 100).hp).toBe(1);
    expect(rockEvents(st, 'hit')).toMatchObject([{ rock: 100, by: 'laser', ship: 0 }]);
    hitRock(st, 100, 1.5, 1, 0, 'laser', 0);   // −0.5: breaks into 2
    const piece = rockEvents(st, 'split')[0]!.pieces![1]!, hp = rockAt(st, piece).hp, vx = rockAt(st, piece).vx;
    hitRock(st, piece, 99, 1, 0, 'laser', 0);
    pushRock(st, piece, 50, 0);
    expect([rockAt(st, piece).hp, rockAt(st, piece).vx]).toEqual([hp, vx]);
    hitRock(st, 150, 5, 1, 0, 'laser', 0);
    expect(st.rockHits).toBe(2);
  });
  it('pushRock frees a rail rock and adds Δv to its rail velocity; dustRock clears the slot with a dust event', () => {
    const st = arena();
    seeded(st, 0);
    const rail0 = rockAt(st, 0);
    pushRock(st, 0, 3, 4);
    const p = rockAt(st, 0);
    expect([p.kind, p.x, p.y]).toEqual([RockKind.Free, rail0.x, rail0.y]);
    expect(p.vx).toBeCloseTo(rail0.vx + 3, 12); expect(p.vy).toBeCloseTo(rail0.vy + 4, 12);
    dustRock(st, 0, 'edge');
    expect(rockAlive(st, 0)).toBe(false);
    const dust = rockEvents(st, 'dust');
    expect(dust).toMatchObject([{ rock: 0, by: 'edge' }]);
    expect(dust[0]!.vx).toBeCloseTo(rail0.vx + 3, 12);
    expect(dust[0]).not.toHaveProperty('ship');
    expect(st.rockDust).toBe(1);
  });
});

describe('spike i cases kept: the hash, the clone and firstBlocker', () => {
  it('a chipped rock changes the hash, and a clone runs on identically', () => {
    const a = createTacticalState(5), b = createTacticalState(5);
    hitRock(b, 0, 1, 1, 0, 'laser');
    expect(hashTactical(a)).not.toBe(hashTactical(b));
    const k = a.map.asteroids.findIndex((r) => r.r >= 40);
    breakRock(a, k, 0, -1, 'laser', 0, 'fan');
    const c = cloneTactical(a);
    expect(c.rocks).not.toBe(a.rocks);
    for (let t = 0; t < 600; t++) { stepDuel(a, IDLE_INPUT); stepDuel(c, IDLE_INPUT); }
    expect(hashTactical(c)).toBe(hashTactical(a));
  });
  it('firstBlocker finds the nearest rock along a segment', () => {
    const st = createTacticalState(5), a = rockAt(st, 0);
    const hit = firstBlocker(st, a.x - 200, a.y, a.x + 200, a.y);
    expect(hit?.rock).toBe(0);
    // Asteroids-iv §6: a seeded rock has cells now, so the entry is the least entry over its cells (hit radius), not the bounding circle's.
    const cells = makeCells(); rockCellsInto(st, 0, cells);
    let want = 2; for (let c = 0; c < cells.n; c++) { const e = segmentEntry(a.x - 200, a.y, a.x + 200, a.y, cells.x[c]!, cells.y[c]!, cells.hitR); if (e >= 0 && e < want) want = e; }
    expect(hit!.t).toBeCloseTo(want, 9);
    expect(hit!.t).toBeGreaterThanOrEqual((200 - a.r) / 400);   // never before the bounding circle
  });
});

// Spike ii §3.2, §3.3, §9.2, §9.3: rock motion (gravity, drag, the speed cap, born rocks hold), the planet and the edge,
// rock-rock pairs (momentum, the crush threshold, the lighter takes more, a static rock that does not wake, a pair once
// per tick, a rock woken later in the pass takes its turn), and the broad phase against brute force while rocks move.
import { describe, expect, it } from 'vitest';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { rockAlive, rockAt, RockKind, rockKind, rockMass, rocksNear, rockSlots, rockT, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';
import { breakRock, crushDamage, pushRock } from '../src/renderer/src/sim/tactical/rockBreak';
import { resolveRockPair, restitution, stepRocks } from '../src/renderer/src/sim/tactical/rockContacts';
import { arena, mover, rail, rockEvents, seeded, shaped, tmplOf, withSwitches } from './helpers/rockArena';

const momentum = (st: ReturnType<typeof arena>, ks: number[]): [number, number] => ks.reduce<[number, number]>((p, k) => { const a = rockAt(st, k), m = a.r * a.r; return [p[0] + m * a.vx, p[1] + m * a.vy]; }, [0, 0]);

describe('rock-rock pairs (spec §3.3)', () => {
  it('conserve momentum along n (and as a vector) within 1e-9 relative', () => withSwitches({ massCube: false }, () => {
    const st = arena();
    mover(st, 100, 0, 2000, 50, 10, 20, 10); mover(st, 101, 35, 2005, -40, 0, 30, 10);
    const dx = 0 - 35, dy = 2000 - 2005, d = Math.hypot(dx, dy), nx = dx / d, ny = dy / d;
    const [px, py] = momentum(st, [100, 101]);
    resolveRockPair(st, 100, 101);
    const [qx, qy] = momentum(st, [100, 101]);
    expect(Math.abs(qx * nx + qy * ny - (px * nx + py * ny))).toBeLessThanOrEqual(1e-9 * Math.abs(px * nx + py * ny));
    expect(Math.abs(qx - px)).toBeLessThanOrEqual(1e-9 * Math.abs(px));
    expect(Math.abs(qy - py)).toBeLessThanOrEqual(1e-9 * Math.abs(py));
    // §13.4: each tick corrects 0.5 · (overlap − 0.5), shared by inverse mass (each share under the 8 u cap here)
    const d1 = Math.hypot(rockAt(st, 100).x - rockAt(st, 101).x, rockAt(st, 100).y - rockAt(st, 101).y);
    expect(d1).toBeCloseTo(d + 0.5 * (50 - d - 0.5), 9);
  }));
  it('do no damage at a closing speed of 30 (but bounce with restitution 0.8)', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 0, 0, 20, 10); mover(st, 101, 39, 2000, -30, 0, 20, 10);
    resolveRockPair(st, 100, 101);
    expect([rockAt(st, 100).hp, rockAt(st, 101).hp, st.rockCollisions]).toEqual([10, 10, 0]);
    expect(rockEvents(st, 'bump')).toEqual([]);
    expect(rockAt(st, 100).vx).toBeCloseTo(-27, 9);
    expect(rockAt(st, 101).vx).toBeCloseTo(-3, 9);
  });
  it('above 30 the lighter rock takes more: base (vc − 30) / 40 shared by 2·m_other / (ma + mb)', () => withSwitches({ massCube: false }, () => {
    const st = arena();
    mover(st, 100, 0, 2000, 0, 0, 20, 10); mover(st, 101, 59, 2000, -110, 0, 40, 10);
    resolveRockPair(st, 100, 101);
    expect(rockAt(st, 100).hp).toBeCloseTo(10 - 3.2, 12);
    expect(rockAt(st, 101).hp).toBeCloseTo(10 - 0.8, 12);
    expect([crushDamage(110, 400, 1600), crushDamage(110, 1600, 400), crushDamage(30, 400, 400)]).toEqual([3.2, 0.8, 0]);
    expect(rockEvents(st, 'bump')).toMatchObject([{ by: 'collision', rock: 100, other: 101 }]);
    expect(rockEvents(st, 'bump')[0]).not.toHaveProperty('ship');
    expect(st.rockCollisions).toBe(1);
  }));
  it('apply both amounts before any break; a breaks first, then b, along n and −n', () => {
    const st = arena();   // plain rocks are one cell: each turns to dust whole, a then b
    mover(st, 100, 0, 2000, 100, 0, 30, 1); mover(st, 101, 59, 2000, -100, 0, 30, 1);
    resolveRockPair(st, 100, 101);
    expect(rockEvents(st).map((e) => `${e.what}:${e.rock}`)).toEqual(['bump:100', 'dust:100', 'dust:101']);
    expect(rockEvents(st, 'dust')[0]!.vx).toBeCloseTo(-80, 9);   // the parent velocity is the post-bounce one
    const cs = arena(), tm = tmplOf(cs, 31);   // asteroids-iv §5.2: cell rocks are cut through the contact point, a along n, b along −n
    shaped(cs, 100, tm, 0, 2000, 100, 0);
    shaped(cs, 101, tm, rockAt(cs, 100).r, 2000, -100, 0);   // one bounding radius apart: deep in each other
    cs.rocks[100 * ROCK_STRIDE + 6] = 1; cs.rocks[101 * ROCK_STRIDE + 6] = 1;
    resolveRockPair(cs, 100, 101);
    expect(rockEvents(cs).filter((e) => e.rock !== -1).map((e) => `${e.what}:${e.rock}`)).toEqual(['bump:100', 'split:100', 'split:101']);
    const [a, b] = rockEvents(cs, 'split');
    for (const p of a!.pieces!) expect(rockAt(cs, p).vx).toBeLessThan(0);   // a's pieces fly away from b (n points from b to a: west)
    for (const p of b!.pieces!) expect(rockAt(cs, p).vx).toBeGreaterThan(0);
    expect(a!.vx).toBeLessThan(0); expect(b!.vx).toBeGreaterThan(0);   // the parent velocity is the post-bounce one
  });
  it('a pair is resolved once per tick', () => {
    const st = arena();
    mover(st, 100, -30, 2000, 60, 0, 20, 10); mover(st, 101, 5, 2000, -60, 0, 20, 10);
    stepRocks(st);
    expect(rockEvents(st, 'bump')).toHaveLength(1);
    expect(st.rockCollisions).toBe(1);
    expect([st.rockDone[100], st.rockDone[101]]).toEqual([1, 1]);
  });
  it('a pair is resolved once per tick, even when a later turn pushes the two back into each other', () => withSwitches({ massCube: false }, () => {
    // a (100) and b (102) bounce on a's turn; heavy c (101, r 60) then shoves b back into a on c's turn. b's own turn
    // must not resolve (b, a) again: a second resolution would separate them once more.
    const st = arena();
    mover(st, 100, -30, 2000, 60, 0, 20, 10); mover(st, 102, 5, 2000, -60, 0, 20, 10); mover(st, 101, 77.5, 2000, 0, 0, 60, 10);
    stepRocks(st);
    const a = rockAt(st, 100), b = rockAt(st, 102);
    expect(rockEvents(st, 'bump').map((e) => [e.rock, e.other])).toEqual([[100, 102], [101, 102]]);
    // Motion puts a at −29 and b at 4 (overlap 7); a's turn corrects 0.5 · (7 − 0.5) = 3.25, 1.625 each, and nothing moves
    // a again; c's turn then corrects (b, c): overlap 8.125, 3.8125 shared 9 : 1 by inverse mass (c moves 0.38125).
    expect(a.x).toBeCloseTo(-30.625, 4);
    expect(rockAt(st, 101).x).toBeCloseTo(77.88125, 4);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(39);   // left overlapping: resolved once, not twice
    expect([st.rockDone[100], st.rockDone[101], st.rockDone[102]]).toEqual([1, 1, 1]);
  }));
  it('a rail rock met by a free rock is freed at its rail position and velocity and, at a higher slot, takes its own turn in the same pass', () => {
    const st = arena();
    seeded(st, 5);
    const a5 = rockAt(st, 5);
    mover(st, 2, a5.x - (a5.r + 10) + 3, a5.y, a5.vx + 100, a5.vy, 10, 10);
    stepRocks(st);
    expect(rockKind(st, 5)).toBe(RockKind.Free);
    expect(st.rockDone[5]).toBe(1);
    expect(rockAt(st, 5).vx).toBeGreaterThan(a5.vx);
  });
  it('rocksNear matches brute force while seeded rocks move and pieces fly', () => {
    const st = createTacticalState(4);
    const brute = (x: number, y: number, h: number): number[] => {
      const out: number[] = [];
      for (let k = 0; k < rockSlots(st); k++) { if (!rockAlive(st, k)) continue; const a = rockAt(st, k); if (Math.abs(a.x - x) <= h + a.r && Math.abs(a.y - y) <= h + a.r) out.push(k); }
      return out;
    };
    let broken = 0, pushed = 0;
    for (let k = 0; k < st.map.asteroids.length; k++) {
      if (st.map.asteroids[k]!.r >= 40 && broken < 6) { const a = rockAt(st, k); breakRock(st, k, a.x, a.y, 1, 1, 'laser', 0, 'cut'); broken++; }
      else if (pushed < 6) { pushRock(st, k, 30, -20); pushed++; }
    }
    for (let t = 0; t < 400; t++) {
      if (t % 50 === 0) for (let q = 0; q < 40; q++) {
        const x = -2600 + ((q * 977) % 5200), y = -2600 + ((q * 571) % 5200), h = 20 + (q % 7) * 60;
        const found: number[] = [], count = rocksNear(st, x, y, h, found), got = found.slice(0, count).filter((k) => { const a = rockAt(st, k); return Math.abs(a.x - x) <= h + a.r && Math.abs(a.y - y) <= h + a.r; });
        expect(got).toEqual(brute(x, y, h));
      }
      stepDuel(st, IDLE_INPUT);
    }
  });
  it('asteroids-iii §13.4: mass is r³ / 30 with massCube on (r 30 weighs the ship\'s 900), r² with it off', () => {
    expect([rockMass(30), rockMass(15), rockMass(45)]).toEqual([900, 112.5, 3037.5]);
    expect([rockMass(30, false), rockMass(15, false)]).toEqual([900, 225]);
    withSwitches({ massCube: false }, () => expect(rockMass(15)).toBe(225));
  });
  it('asteroids-iii §13.4: e = 0.3 + 0.5 · clamp((vc − 4) / 26, 0, 1) above BOUNCE_MIN', () => {
    expect([restitution(4.0001), restitution(17), restitution(30), restitution(200)].map((e) => Number(e.toFixed(6)))).toEqual([0.300002, 0.55, 0.8, 0.8]);
  });
  it('asteroids-iii §13.4: at or under BOUNCE_MIN the contact is an e = 0 impulse: the closing speed goes, momentum is kept, no clock reset', () => {
    for (const cube of [true, false]) withSwitches({ massCube: cube }, () => {
      const st = arena();
      mover(st, 100, 0, 2000, 0, 0, 20, 10, 3); mover(st, 101, 39, 2000, -3, 0, 30, 10, 7);
      const ma = rockMass(20), mb = rockMass(30), p0 = mb * -3;
      resolveRockPair(st, 100, 101);
      const va = rockAt(st, 100).vx, vb = rockAt(st, 101).vx;
      expect(va).toBeCloseTo(vb, 12);                         // no relative normal speed left
      expect(ma * va + mb * vb).toBeCloseTo(p0, 9);           // momentum kept
      expect([rockT(st, 100), rockT(st, 101), st.rockTouches]).toEqual([3, 7, 0]);
      expect([st.rockTouched[100], st.rockTouched[101]]).toEqual([1, 1]);
    });
  });
  it('asteroids-iii §13.4: above BOUNCE_MIN it bounces with the curve\'s e and restarts both clocks', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 0, 0, 20, 10, 3); mover(st, 101, 39, 2000, -6, 0, 20, 10, 7);
    resolveRockPair(st, 100, 101);
    const dv = ((1 + restitution(6)) * 6) / 2;   // equal masses: each changes by (1 + e) · vc / 2
    expect(rockAt(st, 100).vx).toBeCloseTo(-dv, 12);
    expect(rockAt(st, 101).vx).toBeCloseTo(-6 + dv, 12);
    expect([rockT(st, 100), rockT(st, 101)]).toEqual([st.tick, st.tick]);
  });
  it('asteroids-iii §13.4: a deep overlap corrects 0.5 · (overlap − 0.5) a tick, each rock at most ROCK_SEPARATE_MAX; under the slop nothing', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 0, 0, 30, 10); mover(st, 101, 10, 2000, 0, 0, 30, 10);
    resolveRockPair(st, 100, 101);
    expect([rockAt(st, 100).x, rockAt(st, 101).x]).toEqual([-8, 18]);   // 24.75 shared equally is 12.375 each, capped at 8
    const near = arena();
    mover(near, 100, 0, 2000, 0, 0, 20, 10); mover(near, 101, 39.6, 2000, 0, 0, 20, 10);   // overlap 0.4: under the slop
    resolveRockPair(near, 100, 101);
    expect([rockAt(near, 100).x, rockAt(near, 101).x]).toEqual([0, 39.6]);
  });
  it('asteroids-iii §5.4: the touch counter counts closing above TOUCH_MIN between rocks of different clocks; siblings (equal t) do not count', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 0, 0, 20, 10, 3); mover(st, 101, 39, 2000, -10, 0, 20, 10, 7);
    resolveRockPair(st, 100, 101);
    expect(st.rockTouches).toBe(1);
    expect(rockEvents(st, 'touch')).toMatchObject([{ by: 'collision', rock: 100, other: 101, speed: 10 }]);
    const sib = arena();
    mover(sib, 100, 0, 2000, 0, 0, 20, 10, 5); mover(sib, 101, 39, 2000, -10, 0, 20, 10, 5);
    resolveRockPair(sib, 100, 101);
    expect([sib.rockTouches, rockEvents(sib, 'touch')]).toEqual([0, []]);
    const slow = arena();
    mover(slow, 100, 0, 2000, 0, 0, 20, 10, 3); mover(slow, 101, 39, 2000, -8, 0, 20, 10, 7);
    resolveRockPair(slow, 100, 101);
    expect(slow.rockTouches).toBe(0);   // 8 is not above TOUCH_MIN
  });
  it('asteroids-iii §5.4 (review finding 2): a free rock meets a lower-slot rail rock; the rail is freed and the touch counted', () => {
    const st = arena();
    rail(st, 3, 0, 1700, 20);
    const r3 = rockAt(st, 3);
    mover(st, 100, 38, 1700, r3.vx - 12, r3.vy, 20, 10, 5);   // overlapping, closing at 12 relative
    stepDuel(st, IDLE_INPUT);
    expect(rockAt(st, 3).kind).toBe(RockKind.Free);
    expect(st.rockTouches).toBe(1);
    expect(rockEvents(st, 'touch')).toMatchObject([{ rock: 100, other: 3 }]);
  });
});

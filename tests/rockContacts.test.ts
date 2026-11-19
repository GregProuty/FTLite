// Spike ii §3.2, §3.3, §9.2, §9.3: rock motion (gravity, drag, the speed cap, born rocks hold), the planet and the edge,
// rock-rock pairs (momentum, the crush threshold, the lighter takes more, a static rock that does not wake, a pair once
// per tick, a rock woken later in the pass takes its turn), and the broad phase against brute force while rocks move.
import { describe, expect, it } from 'vitest';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { gravityAccel } from '../src/renderer/src/sim/tactical/physics';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { DT } from '../src/renderer/src/sim/tactical/tuning';
import { rockAlive, rockAt, RockKind, rockKind, rocksNear, rockSlots } from '../src/renderer/src/sim/tactical/rocks';
import { breakRock, crushDamage, pushRock } from '../src/renderer/src/sim/tactical/rockBreak';
import { resolveRockPair, stepRocks } from '../src/renderer/src/sim/tactical/rockContacts';
import { arena, mover, rockEvents, seeded } from './helpers/rockArena';

const momentum = (st: ReturnType<typeof arena>, ks: number[]): [number, number] => ks.reduce<[number, number]>((p, k) => { const a = rockAt(st, k), m = a.r * a.r; return [p[0] + m * a.vx, p[1] + m * a.vy]; }, [0, 0]);

describe('motion (spec §3.2)', () => {
  it('gravity, then drag, then the 300 u/s cap, then semi-implicit Euler; a rock born this tick does not move', () => {
    const st = arena();
    mover(st, 100, 2000, 0, 400, 0, 10);
    mover(st, 101, -2000, 0, 100, 0, 10);
    mover(st, 102, 0, 2000, 50, 0, 10); st.rockBorn[102] = 1;
    stepRocks(st);
    expect(rockAt(st, 100).vx).toBeCloseTo(300, 9);
    expect(rockAt(st, 100).vy).toBeCloseTo(0, 12);
    expect(rockAt(st, 100).x).toBeCloseTo(2000 + 300 * DT, 9);
    const [gx] = gravityAccel(-2000, 0);
    expect(rockAt(st, 101).vx).toBeCloseTo((100 + gx * DT) * (1 - 0.1 * DT), 12);
    expect(rockAt(st, 102)).toMatchObject({ x: 0, y: 2000, vx: 50, vy: 0 });
  });
  it('a rock touching the planet, or whose centre leaves the map, turns to dust', () => {
    const st = arena();
    mover(st, 100, 0, -85, 0, 0, 20);
    mover(st, 101, 2810, 0, 0, 0, 10);
    stepRocks(st);
    expect([rockAlive(st, 100), rockAlive(st, 101)]).toEqual([false, false]);
    expect(rockEvents(st, 'dust').map((e) => [e.rock, e.by])).toEqual([[100, 'planet'], [101, 'edge']]);
  });
});

describe('rock-rock pairs (spec §3.3)', () => {
  it('conserve momentum along n (and as a vector) within 1e-9 relative', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 50, 10, 20, 10); mover(st, 101, 35, 2005, -40, 0, 30, 10);
    const dx = 0 - 35, dy = 2000 - 2005, d = Math.hypot(dx, dy), nx = dx / d, ny = dy / d;
    const [px, py] = momentum(st, [100, 101]);
    resolveRockPair(st, 100, 101);
    const [qx, qy] = momentum(st, [100, 101]);
    expect(Math.abs(qx * nx + qy * ny - (px * nx + py * ny))).toBeLessThanOrEqual(1e-9 * Math.abs(px * nx + py * ny));
    expect(Math.abs(qx - px)).toBeLessThanOrEqual(1e-9 * Math.abs(px));
    expect(Math.abs(qy - py)).toBeLessThanOrEqual(1e-9 * Math.abs(py));
    expect(Math.hypot(rockAt(st, 100).x - rockAt(st, 101).x, rockAt(st, 100).y - rockAt(st, 101).y)).toBeCloseTo(50, 9);   // separated
  });
  it('do no damage at a closing speed of 30 (but bounce with restitution 0.8)', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 0, 0, 20, 10); mover(st, 101, 39, 2000, -30, 0, 20, 10);
    resolveRockPair(st, 100, 101);
    expect([rockAt(st, 100).hp, rockAt(st, 101).hp, st.rockCollisions]).toEqual([10, 10, 0]);
    expect(rockEvents(st, 'bump')).toEqual([]);
    expect(rockAt(st, 100).vx).toBeCloseTo(-27, 9);
    expect(rockAt(st, 101).vx).toBeCloseTo(-3, 9);
  });
  it('above 30 the lighter rock takes more: base (vc − 30) / 40 shared by 2·m_other / (ma + mb)', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 0, 0, 20, 10); mover(st, 101, 59, 2000, -110, 0, 40, 10);
    resolveRockPair(st, 100, 101);
    expect(rockAt(st, 100).hp).toBeCloseTo(10 - 3.2, 12);
    expect(rockAt(st, 101).hp).toBeCloseTo(10 - 0.8, 12);
    expect([crushDamage(110, 400, 1600), crushDamage(110, 1600, 400), crushDamage(30, 400, 400)]).toEqual([3.2, 0.8, 0]);
    expect(rockEvents(st, 'bump')).toMatchObject([{ by: 'collision', rock: 100, other: 101 }]);
    expect(rockEvents(st, 'bump')[0]).not.toHaveProperty('ship');
    expect(st.rockCollisions).toBe(1);
  });
  it('apply both amounts before any break; a breaks first, then b, along n and −n', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 100, 0, 30, 1); mover(st, 101, 59, 2000, -100, 0, 30, 1);
    resolveRockPair(st, 100, 101);
    expect(rockEvents(st).map((e) => `${e.what}:${e.rock}`)).toEqual(['bump:100', 'split:100', 'split:101']);
    const [a, b] = rockEvents(st, 'split');
    expect(rockAt(st, a!.pieces![0]!).vx).toBeLessThan(0);   // a's pieces fly away from b (n points from b to a: west)
    expect(rockAt(st, b!.pieces![0]!).vx).toBeGreaterThan(0);
    expect(a!.vx).toBeCloseTo(-80, 9);   // the parent velocity is the post-bounce one
  });
  it('a pair is resolved once per tick', () => {
    const st = arena();
    mover(st, 100, -30, 2000, 60, 0, 20, 10); mover(st, 101, 5, 2000, -60, 0, 20, 10);
    stepRocks(st);
    expect(rockEvents(st, 'bump')).toHaveLength(1);
    expect(st.rockCollisions).toBe(1);
    expect([st.rockDone[100], st.rockDone[101]]).toEqual([1, 1]);
  });
  it('a pair is resolved once per tick, even when a later turn pushes the two back into each other', () => {
    // a (100) and b (102) bounce on a's turn; heavy c (101, r 60) then shoves b back into a on c's turn. b's own turn
    // must not resolve (b, a) again: a second resolution would separate them once more.
    const st = arena();
    mover(st, 100, -30, 2000, 60, 0, 20, 10); mover(st, 102, 5, 2000, -60, 0, 20, 10); mover(st, 101, 77.5, 2000, 0, 0, 60, 10);
    stepRocks(st);
    const a = rockAt(st, 100), b = rockAt(st, 102);
    expect(rockEvents(st, 'bump').map((e) => [e.rock, e.other])).toEqual([[100, 102], [101, 102]]);
    // Motion puts a at −29 and b at 4 (overlap 7); a's turn moves each 3.5 apart, and nothing moves a again. A second
    // (b, a) resolution would push a out to −37 and leave b and c overlapping again.
    expect(a.x).toBeCloseTo(-32.5, 4);
    expect(rockAt(st, 101).x).toBeCloseTo(78.5, 4);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(39);   // left overlapping: resolved once, not twice
    expect([st.rockDone[100], st.rockDone[101], st.rockDone[102]]).toEqual([1, 1, 1]);
  });
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
      if (st.map.asteroids[k]!.r >= 40 && broken < 6) { breakRock(st, k, 1, 1, 'laser', 0, 'fan'); broken++; }
      else if (pushed < 6) { pushRock(st, k, 30, -20); pushed++; }
    }
    for (let t = 0; t < 400; t++) {
      if (t % 50 === 0) for (let q = 0; q < 40; q++) {
        const x = -2600 + ((q * 977) % 5200), y = -2600 + ((q * 571) % 5200), h = 20 + (q % 7) * 60;
        const got = rocksNear(st, x, y, h).filter((k) => { const a = rockAt(st, k); return Math.abs(a.x - x) <= h + a.r && Math.abs(a.y - y) <= h + a.r; });
        expect(got).toEqual(brute(x, y, h));
      }
      stepDuel(st, IDLE_INPUT);
    }
  });
});

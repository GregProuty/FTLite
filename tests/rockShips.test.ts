// Spike ii §5.1, §9.3: the duel's ship-rock contact: a moving rock is a second body (momentum, hull cost by impact),
// a rail rock is freed first and is then a second body, ram damage can break a
// rock, the pair's grace holds both, born slots are skipped, and the single-ship flight keeps today's contact.
import { describe, expect, it } from 'vitest';
import { ramHull, resolveContacts } from '../src/renderer/src/sim/tactical/contacts';
import { stepSoloFlight } from '../src/renderer/src/sim/tactical/physics';
import { rockAlive, rockAt, RockKind, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';
import { ROCK_SEPARATE_MAX, SHIP_MASS } from '../src/renderer/src/sim/tactical/rockTuning';
import { arena, mover, rail, rockEvents, seeded, withSwitches } from './helpers/rockArena';

/** A moving rock of radius r touching the crew ship (at rest at (0, −2500), radius 20) from the east, closing at `speed`. */
function incoming(r: number, speed: number, hp = 99) { const st = arena(); mover(st, 100, 20 + r - 1, -2500, -speed, 0, r, hp); return st; }

describe('a moving rock is a second body (spec §5.1 case 3)', () => {
  it('costs hull min(4, 1 + floor(max(0, impact − 40) / 40)): r 15 at 200 is 1, r 30 at 200 is 2, r 45 at 250 is 4', () => {
    for (const [r, speed, cost] of [[15, 200, 1], [30, 200, 2], [45, 250, 4]] as const) {
      const st = incoming(r, speed), hull = st.systems[0].hull;
      resolveContacts(st, true);
      expect(hull - st.systems[0].hull, `r ${r} at ${speed}`).toBe(cost);
      expect(st.ships[0].asteroidHits).toBe(1);
    }
    expect([ramHull(40), ramHull(100), ramHull(173.08), ramHull(138.46), ramHull(10000)]).toEqual([1, 2, 4, 3, 4]);
  });
  it('conserves momentum along n', () => {
    const st = incoming(30, 200), before = SHIP_MASS * st.ships[0].vx + 900 * rockAt(st, 100).vx;
    resolveContacts(st, true);
    const after = SHIP_MASS * st.ships[0].vx + 900 * rockAt(st, 100).vx;
    expect(Math.abs(after - before)).toBeLessThanOrEqual(1e-9 * Math.abs(before));
    expect(st.ships[0].vx).toBeLessThan(0);   // thrown west, away from the rock
  });
  it('shares the impulse by inverse mass: r 15 (m 225) against the ship (m 900) at 200 u/s', () => withSwitches({ massCube: false }, () => {
    // n from the rock to the ship is west (−x), vc 200; each body's change is (1 + 0.5)·vc·(1/m) / (1/ms + 1/mk).
    const st = incoming(15, 200), ms = SHIP_MASS, mk = 225, vc = 200, share = (m: number): number => (1.5 * vc * (1 / m)) / (1 / ms + 1 / mk);
    resolveContacts(st, true);
    expect(st.ships[0].vx).toBeCloseTo(0 - share(ms), 9);          // −60: thrown west
    expect(rockAt(st, 100).vx).toBeCloseTo(-200 + share(mk), 9);   // +40: the light rock rebounds east
    expect([share(ms), share(mk)]).toEqual([60, 240].map((x) => expect.closeTo(x, 9)));
  }));
  it('ram damage (vc − 30) / 40 · 2·900 / (900 + m) can break a rock: a bump then the break, both named for the ship', () => withSwitches({ massCube: false }, () => {
    const st = incoming(15, 200, 99);
    resolveContacts(st, true);
    expect(rockAt(st, 100).hp).toBeCloseTo(99 - (170 / 40) * 1800 / 1125, 12);
    const small = incoming(15, 200, 2);
    resolveContacts(small, true);
    // r 15 is over the fan's 2-piece threshold (13), so the break splits it: piece 0 keeps slot 100
    expect(rockEvents(small).map((e) => [e.what, e.by, e.ship])).toEqual([['bump', 'ram', 0], ['split', 'ram', 0]]);
    expect([rockAlive(small, 100), rockAt(small, 100).r, small.systems[0].rocksBroken]).toEqual([true, (0.9 * 15) / Math.sqrt(2), 1]);
    const tiny = incoming(12, 200, 1);
    resolveContacts(tiny, true);
    expect(rockEvents(tiny).map((e) => [e.what, e.by, e.ship])).toEqual([['bump', 'ram', 0], ['dust', 'ram', 0]]);
    expect([rockAlive(tiny, 100), tiny.systems[0].rocksBroken]).toEqual([false, 1]);
  }));
  it('inside the pair\'s grace there is no hull cost and no ram damage', () => {
    const st = incoming(30, 200);
    resolveContacts(st, true);
    const hull = st.systems[0].hull, hp = rockAt(st, 100).hp;
    mover(st, 100, st.ships[0].x + 20 + 30 - 1, st.ships[0].y, -200, 0, 30, hp);
    resolveContacts(st, true);
    expect([st.systems[0].hull, rockAt(st, 100).hp]).toEqual([hull, hp]);
  });
  it('skips a rock born this tick', () => {
    const st = incoming(30, 200);
    st.rockBorn[100] = 1;
    resolveContacts(st, true);
    expect([st.ships[0].x, st.ships[0].vx, st.ships[0].asteroidHits]).toEqual([0, 0, 0]);
  });
});

describe('a rail rock (asteroids-iii §6.2): freed first, then two bodies', () => {
  it('rammed at 200 u/s relative: freed at its rail position and velocity, then the two-body contact (r 44.6: impact about 138, hull 3)', () => {
    const st = arena();
    rail(st, 100, 20 + 44.6 - 1, -2500, 44.6);
    const before = rockAt(st, 100), hull = st.systems[0].hull;
    Object.assign(st.ships[0], { vx: before.vx + 200, vy: before.vy });
    resolveContacts(st, true);
    expect(rockAt(st, 100).kind).toBe(RockKind.Free);
    expect(rockAt(st, 100).vx).toBeGreaterThan(before.vx);   // thrown east, ahead of the ship
    expect(hull - st.systems[0].hull).toBe(3);
    expect(st.rockTouched[100]).toBe(1);
  });
  it('the single-ship flight never writes the pool: the rail rock keeps its slot, the ship pays today\'s hull 1', () => {
    const st = arena();
    seeded(st, 5);
    const a = rockAt(st, 5), slot = Array.from(st.rocks.subarray(5 * ROCK_STRIDE, 6 * ROCK_STRIDE)), hull = st.systems[0].hull;
    Object.assign(st.ships[0], { x: a.x - (20 + a.r) - 1, y: a.y, vx: 200, vy: 0, heading: 64 });
    stepSoloFlight(st, { turn: 0, thrust: 0 });
    expect(Array.from(st.rocks.subarray(5 * ROCK_STRIDE, 6 * ROCK_STRIDE))).toEqual(slot);
    expect(hull - st.systems[0].hull).toBe(1);
  });
});

describe('soft ship contacts (asteroids-iii §6.2)', () => {
  it('a ship co-orbiting at under 15 u/s relative pushes a rail rock free and loses no hull, counts no hit and stamps no grace', () => {
    const st = arena();
    rail(st, 100, 20 + 30 - 1, -2500, 30);
    const a = rockAt(st, 100), hull = st.systems[0].hull;
    Object.assign(st.ships[0], { vx: a.vx + 10, vy: a.vy });
    resolveContacts(st, true);
    expect(rockAt(st, 100).kind).toBe(RockKind.Free);
    expect(rockAt(st, 100).vx).toBeGreaterThan(a.vx);   // pushed
    expect([st.systems[0].hull, st.ships[0].asteroidHits, st.ships[0].graceUntil[101]]).toEqual([hull, 0, 0]);
  });
  it('a deep overlap moves the rock at most ROCK_SEPARATE_MAX; the ship takes the rest (plan deviation 7)', () => {
    const st = arena();
    mover(st, 100, 20 + 15 - 25, -2500, 0, 0, 15);   // overlap 25 with a light rock
    resolveContacts(st, true);
    expect(rockAt(st, 100).x).toBeCloseTo(10 + ROCK_SEPARATE_MAX, 9);
    expect(rockAt(st, 100).x - st.ships[0].x).toBeCloseTo(35, 9);   // fully separated
  });
});

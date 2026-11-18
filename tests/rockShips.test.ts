// Spike ii §5.1, §9.3: the duel's ship-rock contact: a moving rock is a second body (momentum, hull cost by impact),
// a static rock that does not wake is today's infinitely heavy contact, a hard ram wakes it, ram damage can break a
// rock, the pair's grace holds both, born slots are skipped, and the single-ship flight keeps today's contact.
import { describe, expect, it } from 'vitest';
import { ramHull, resolveContacts } from '../src/renderer/src/sim/tactical/contacts';
import { stepSoloFlight } from '../src/renderer/src/sim/tactical/physics';
import { rockAlive, rockAt, RockKind } from '../src/renderer/src/sim/tactical/rocks';
import { SHIP_MASS } from '../src/renderer/src/sim/tactical/rockTuning';
import { arena, mover, rockEvents, seeded } from './helpers/rockArena';

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
  it('ram damage (vc − 30) / 40 · 2·900 / (900 + m) can break a rock: a bump then the break, both named for the ship', () => {
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
  });
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

describe('a static rock (spec §5.1 cases 1 and 2)', () => {
  it('rammed at 40 u/s stays static and unmoved: today\'s push-out, restitution 0.5, hull 1', () => {
    const st = arena();
    seeded(st, 5);
    const a = st.map.asteroids[5]!, before = rockAt(st, 5), hull = st.systems[0].hull;
    Object.assign(st.ships[0], { x: a.x - (20 + a.r) + 1, y: a.y, vx: 40, vy: 0, heading: 64 });
    resolveContacts(st, true);
    const after = rockAt(st, 5);
    expect([after.kind, after.x, after.y, after.vx, after.vy]).toEqual([RockKind.Static, before.x, before.y, 0, 0]);
    expect(st.ships[0].x).toBeCloseTo(a.x - (20 + a.r), 9);
    expect(st.ships[0].vx).toBeCloseTo(-20, 9);
    expect(hull - st.systems[0].hull).toBe(1);
  });
  it('rammed at 200 u/s wakes and becomes a two-body contact: r 44.6, impact about 138, hull 3', () => {
    const st = arena();
    seeded(st, 5);
    const a = st.map.asteroids[5]!, hull = st.systems[0].hull;
    Object.assign(st.ships[0], { x: a.x - (20 + a.r) + 1, y: a.y, vx: 200, vy: 0, heading: 64 });
    resolveContacts(st, true);
    expect(rockAt(st, 5).kind).toBe(RockKind.Moving);
    expect(rockAt(st, 5).vx).toBeGreaterThan(0);
    expect(hull - st.systems[0].hull).toBe(3);
  });
  it('the single-ship flight keeps today\'s contact: no wake, hull 1', () => {
    const st = arena();
    seeded(st, 5);
    const a = st.map.asteroids[5]!, hull = st.systems[0].hull;
    Object.assign(st.ships[0], { x: a.x - (20 + a.r) - 1, y: a.y, vx: 200, vy: 0, heading: 64 });
    stepSoloFlight(st, { turn: 0, thrust: 0 });
    expect(rockAt(st, 5)).toMatchObject({ kind: RockKind.Static, vx: 0, vy: 0, x: a.x, y: a.y });
    expect(hull - st.systems[0].hull).toBe(1);
  });
});

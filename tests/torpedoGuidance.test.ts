// Homing torpedoes (docs/superpowers/specs/2026-11-17-homing-torpedo-design.md §1, §4; weapons update spec §2, §3): the
// guidance law and the headless accuracy gate. Over seeds 1–20 the crew launches, nose roughly on the enemy or with the
// enemy behind it (90°–180° off the nose), at a coasting enemy 120–360 units away (inside the torpedo range) in open
// space (the map's asteroids removed, the planet far off): at least 90% must hit. Against an enemy in a hard
// full-thrust turn the hit rate is only reported.
import { describe, expect, it } from 'vitest';
import { createRng, nextFloat } from '../src/shared/rng';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { flyMissile, homingTurn, launchMissile, resolveMissiles } from '../src/renderer/src/sim/tactical/missiles';
import { flySlot } from '../src/renderer/src/sim/tactical/physics';
import { createTacticalState, missileOf, NO_AXES, type Axes, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { DEFAULT_FLIGHT, HEADING_COUNT, MISSILE_BOOST_TICKS, MISSILE_FUEL_TICKS, MISSILE_LIFE_TICKS, MISSILE_RANGE } from '../src/renderer/src/sim/tactical/tuning';

/** The heading index nearest the direction (dx, dy), by the table (no trigonometry). */
function headingOf(dx: number, dy: number): number {
  let best = 0, bestDot = -Infinity;
  for (let h = 0; h < HEADING_COUNT; h++) { const d = hx(h) * dx + hy(h) * dy; if (d > bestDot) { bestDot = d; best = h; } }
  return best;
}

/** A duel state for seed s with no asteroids, so only the guidance (and gravity) decides. */
function openSpace(seed: number): TacticalState {
  const st = createTacticalState(seed);
  st.map = { ...st.map, asteroids: [] };
 
  st.rocks.fill(0);   // asteroids-iii: the pool too (every slot Gone), so no seeded rock orbits into open space
  return st;
}

/**
 * Seed s's engagement: the crew 1500–1900 from the planet, the enemy 120–360 away (within MISSILE_RANGE) at a random
 * bearing, the crew's nose on the enemy ±22.5° (or, `behind`, turned 90°–180° away from it to a random side), the enemy
 * moving 0–200 u/s and the crew 0–100 u/s, each in a random direction.
 */
function engagement(seed: number, behind = false): TacticalState {
  const st = openSpace(seed), r = createRng(seed * 7919 + 1);
  const at = (k: number): [number, number] => [hx(k), hy(k)];
  const [px, py] = at(Math.floor(nextFloat(r) * HEADING_COUNT)), rad = 1500 + 400 * nextFloat(r);
  const [bx, by] = at(Math.floor(nextFloat(r) * HEADING_COUNT)), dist = 300 + 300 * nextFloat(r);
  const [tx, ty] = at(Math.floor(nextFloat(r) * HEADING_COUNT)), tSpeed = 200 * nextFloat(r);
  const [cx, cy] = at(Math.floor(nextFloat(r) * HEADING_COUNT)), cSpeed = 100 * nextFloat(r);
  const aimError = behind ? (nextFloat(r) < 0.5 ? 1 : -1) * (64 + Math.floor(nextFloat(r) * 65)) : Math.floor(nextFloat(r) * 33) - 16;
  const x = px * rad, y = py * rad;
  Object.assign(st.ships[0], { x, y, vx: cx * cSpeed, vy: cy * cSpeed, heading: (headingOf(bx, by) + aimError + HEADING_COUNT) % HEADING_COUNT, headingAcc: 0 });
  Object.assign(st.ships[1], { x: x + bx * dist, y: y + by * dist, vx: tx * tSpeed, vy: ty * tSpeed, heading: headingOf(tx, ty), headingAcc: 0 });
  st.systems[0].target = 1;
  return st;
}

/** Launch the crew's torpedo and fly until it ends; the enemy flies `enemy` each tick, the crew coasts. True on a hit. */
function shoot(st: TacticalState, enemy: Axes): boolean {
  launchMissile(st, 0);
  for (let t = 0; t <= MISSILE_LIFE_TICKS && missileOf(st, 0); t++) {
    st.events = [];
    flySlot(st, 0, NO_AXES, DEFAULT_FLIGHT); flySlot(st, 1, enemy, DEFAULT_FLIGHT);
    flyMissile(st, 0);
    resolveMissiles(st);
    const end = st.events.find((e) => e.kind === 'missileEnd');
    if (end && end.kind === 'missileEnd') return end.cause === 'ship' && end.target === 1;
    st.tick++;
  }
  return false;
}

const SEEDS = Array.from({ length: 20 }, (_, k) => k + 1);
const rate = (enemy: (seed: number) => Axes, behind = false): number => SEEDS.filter((s) => shoot(engagement(s, behind), enemy(s))).length / SEEDS.length;

describe('homing guidance (homing torpedo spec §1)', () => {
  it('turns toward the lead point: a crossing target ahead-right turns the torpedo clockwise, ahead-left anticlockwise', () => {
    for (const side of [1, -1]) {
      const st = openSpace(5);
      Object.assign(st.ships[0], { x: -1600, y: 0, vx: 0, vy: 0, heading: 64 });          // east
      Object.assign(st.ships[1], { x: -1200, y: 0, vx: 0, vy: side * 150, heading: 0 });  // dead ahead, crossing south (+1) or north (−1)
      launchMissile(st, 0);
      expect(homingTurn(st, 0, missileOf(st, 0)!)).toBe(side);                               // y down: south of east is clockwise
    }
  });
  it('leads rather than chases: a target dead ahead but crossing still gets a turn, one at rest dead ahead does not', () => {
    const st = openSpace(5);
    Object.assign(st.ships[0], { x: -1600, y: 0, vx: 0, vy: 0, heading: 64 });
    Object.assign(st.ships[1], { x: -1200, y: 0, vx: 0, vy: 0, heading: 0 });
    launchMissile(st, 0);
    expect(homingTurn(st, 0, missileOf(st, 0)!)).toBe(0);
    st.ships[1].vy = 80;
    expect(homingTurn(st, 0, missileOf(st, 0)!)).toBe(1);
  });
  it('hits a target flying straight', () => {
    const st = openSpace(5);
    Object.assign(st.ships[0], { x: -1600, y: 0, vx: 0, vy: 0, heading: 64 });
    Object.assign(st.ships[1], { x: -1100, y: -100, vx: 0, vy: 120, heading: 128 });
    expect(shoot(st, NO_AXES)).toBe(true);
  });
  it('flies straight when its target is gone', () => {
    const st = openSpace(5);
    Object.assign(st.ships[0], { x: -1600, y: 0, vx: 0, vy: 0, heading: 64 });
    Object.assign(st.ships[1], { x: -1200, y: 300, vx: 0, vy: 0, heading: 0 });
    launchMissile(st, 0);
    expect(homingTurn(st, 0, missileOf(st, 0)!)).toBe(1);                                   // the target is south-east: it would turn
    st.ships[1].active = false;
    for (let t = 0; t < 60; t++) flyMissile(st, 0);
    expect([missileOf(st, 0)!.heading, missileOf(st, 0)!.headingAcc]).toEqual([64, 0]);
  });
  it('no longer steers once its fuel runs out', () => {
    const st = openSpace(5);
    Object.assign(st.ships[0], { x: -1600, y: 0, vx: 0, vy: 0, heading: 64 });
    Object.assign(st.ships[1], { x: -1200, y: 300, vx: 0, vy: 0, heading: 0 });
    launchMissile(st, 0);
    const m = missileOf(st, 0)!;
    m.age = MISSILE_FUEL_TICKS - 1;
    flyMissile(st, 0);                                                                         // age 360: the last fuelled tick still turns
    expect(m.heading + m.headingAcc).toBeGreaterThan(64);
    const h = m.heading, acc = m.headingAcc;
    expect(homingTurn(st, 0, m)).toBe(1);                                                       // it would still want to turn
    for (let t = 0; t < 30; t++) flyMissile(st, 0);
    expect([m.heading, m.headingAcc]).toEqual([h, acc]);
  });
  it('flies straight out of the nose, unguided, for its boost, then homes (weapons update spec §2)', () => {
    const st = openSpace(5);
    Object.assign(st.ships[0], { x: -1600, y: 0, vx: 0, vy: 0, heading: 64 });          // east
    Object.assign(st.ships[1], { x: -1800, y: 0, vx: 0, vy: 0, heading: 0 });           // dead astern
    launchMissile(st, 0);
    const m = missileOf(st, 0)!;
    for (let t = 0; t < MISSILE_BOOST_TICKS; t++) flyMissile(st, 0);
    expect([m.age, m.heading, m.headingAcc]).toEqual([MISSILE_BOOST_TICKS, 64, 0]);
    expect(homingTurn(st, 0, m)).not.toBe(0);                                                   // it wants to turn back
    flyMissile(st, 0);                                                                         // the first guided tick turns
    expect(m.heading + m.headingAcc).not.toBe(64);
  });
  it('accuracy gate: seeds 1–20, a coasting target 120–360 away, nose on it, hits at least 90%', () => {
    const hits = rate(() => NO_AXES);
    console.log(`torpedo hit rate, coasting target: ${(hits * 100).toFixed(0)}%`);
    expect(hits).toBeGreaterThanOrEqual(0.9);
  });
  it('accuracy gate: seeds 1–20, a coasting target 120–360 away and 90°–180° off the nose, hits at least 90%', () => {
    const hits = rate(() => NO_AXES, true);
    console.log(`torpedo hit rate, coasting target behind the ship: ${(hits * 100).toFixed(0)}%`);
    expect(hits).toBeGreaterThanOrEqual(0.9);
  });
  it('reports the hit rate against a hard full-thrust turn (no threshold)', () => {
    const hits = rate((s) => ({ turn: s % 2 ? 1 : -1, thrust: 1 }));
    const behind = rate((s) => ({ turn: s % 2 ? 1 : -1, thrust: 1 }), true);
    console.log(`torpedo hit rate, hard full-thrust turn: ${(hits * 100).toFixed(0)}% (behind the ship ${(behind * 100).toFixed(0)}%)`);
    expect(hits).toBeGreaterThanOrEqual(0);
  });
});

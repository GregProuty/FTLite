import { describe, expect, it } from 'vitest';
import { createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { stepFlight } from '../src/renderer/src/sim/tactical/physics';
import { CONTACT_GRACE_TICKS, PLANET_RADIUS, SHIP_HULL, SHIP_RADIUS, type FlightTuning } from '../src/renderer/src/sim/tactical/tuning';

const STILL: FlightTuning = { gravity: false, edge: false, drag: 0, stabilise: 0 };
const IDLE = [{ turn: 0, thrust: 0 }, { turn: 0, thrust: 0 }];

/** A duel with the enemy parked far away, so only the contact under test happens. */
function duel(): TacticalState {
  const st = createTacticalState(5);
  Object.assign(st.ships[1], { x: 2600, y: 2600, vx: 0, vy: 0 });
  return st;
}

describe('ship contacts (spec §4 collision matrix)', () => {
  it('ship–planet: pushed out, bounces keeping 50% of the normal speed, costs 4 hull, then 1 s of grace', () => {
    const st = duel(), s = st.ships[0];
    Object.assign(s, { x: 0, y: -(PLANET_RADIUS + SHIP_RADIUS + 1), vx: 0, vy: 120 });
    stepFlight(st, IDLE, STILL);
    expect(Math.sqrt(s.x * s.x + s.y * s.y)).toBeCloseTo(PLANET_RADIUS + SHIP_RADIUS, 9);
    expect(s.vy).toBeCloseTo(-60, 9);
    expect(st.systems[0].hull).toBe(SHIP_HULL - 4);
    expect(s.planetHits).toBe(1);
    Object.assign(s, { vy: 120 });                         // hit again inside the grace window
    stepFlight(st, IDLE, STILL);
    expect(st.systems[0].hull).toBe(SHIP_HULL - 4);
    expect(s.vy).toBeCloseTo(-60, 9);                      // still bounces
    st.tick += CONTACT_GRACE_TICKS;
    Object.assign(s, { vy: 120 });
    stepFlight(st, IDLE, STILL);
    expect(st.systems[0].hull).toBe(SHIP_HULL - 8);
    expect(s.planetHits).toBe(2);
  });
  it('ship–asteroid: costs 1 hull and bounces', () => {
    const st = duel(), s = st.ships[0], a = st.map.asteroids[0]!;
    Object.assign(s, { x: a.x, y: a.y - (a.r + SHIP_RADIUS + 1), vx: 0, vy: 120 });
    stepFlight(st, IDLE, STILL);
    expect(st.systems[0].hull).toBe(SHIP_HULL - 1);
    expect(s.asteroidHits).toBe(1);
    expect(s.vy).toBeCloseTo(-60, 9);
  });
  it('ship–ship: pushed apart, normal speeds exchanged then halved, 1 hull each', () => {
    const st = duel(), [a, b] = st.ships;
    Object.assign(a, { x: 500, y: -1800, vx: 100, vy: 0 });
    Object.assign(b, { x: 535, y: -1800, vx: -100, vy: 0 });
    stepFlight(st, IDLE, STILL);
    expect(b.x - a.x).toBeCloseTo(2 * SHIP_RADIUS, 9);
    expect(a.vx).toBeCloseTo(-50, 9);
    expect(b.vx).toBeCloseTo(50, 9);
    expect([st.systems[0].hull, st.systems[1].hull]).toEqual([SHIP_HULL - 1, SHIP_HULL - 1]);
    expect([a.shipHits, b.shipHits]).toEqual([1, 1]);
  });
  it('hull never goes below zero', () => {
    const st = duel(), s = st.ships[0];
    st.systems[0].hull = 2;
    Object.assign(s, { x: 0, y: -(PLANET_RADIUS + SHIP_RADIUS + 1), vx: 0, vy: 120 });
    stepFlight(st, IDLE, STILL);
    expect(st.systems[0].hull).toBe(0);
  });
  it('resolves in spec order: ship 0 statics, the pair, then ship 1 statics, so a pushed ship cannot end inside the planet', () => {
    const st = duel(), [a, b] = st.ships, rim = PLANET_RADIUS + SHIP_RADIUS;
    Object.assign(b, { x: 0, y: -(rim + 1), vx: 0, vy: 0 });              // just clear of the planet
    Object.assign(a, { x: 0, y: -(rim + 1 + 2 * SHIP_RADIUS - 5), vx: 0, vy: 0 });   // overlapping ship 1 by 5
    stepFlight(st, IDLE, STILL);
    expect(Math.sqrt(b.x * b.x + b.y * b.y)).toBeGreaterThanOrEqual(rim - 1e-9);   // the pair push moved ship 1 in; its planet contact pushed it out
    expect(b.planetHits).toBe(1);
  });
});

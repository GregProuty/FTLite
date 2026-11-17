import { describe, expect, it } from 'vitest';
import { createTacticalState, type Ship } from '../src/renderer/src/sim/tactical/state';
import { edgeAccel, flyShip, gravityAccel } from '../src/renderer/src/sim/tactical/physics';
import { circularSpeed } from '../src/renderer/src/sim/tactical/map';
import { DEFAULT_FLIGHT, DT, GM, GRAVITY_EPS, R_MAP, THRUST, TURN_STEPS_PER_TICK, type FlightTuning } from '../src/renderer/src/sim/tactical/tuning';

const GRAVITY_ONLY: FlightTuning = { gravity: true, edge: false, drag: 0, stabilise: 0 };
const FLIGHT_NO_FIELD: FlightTuning = { gravity: false, edge: false, drag: DEFAULT_FLIGHT.drag, stabilise: DEFAULT_FLIGHT.stabilise };

function ship(over: Partial<Ship>): Ship {
  return { ...createTacticalState(1).ships[0], x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, ...over };
}
const energy = (s: Ship): number => (s.vx * s.vx + s.vy * s.vy) / 2 - GM / Math.sqrt(s.x * s.x + s.y * s.y + GRAVITY_EPS * GRAVITY_EPS);

describe('gravity-only configuration (spec §4 tests)', () => {
  it('holds a circular orbit at r = 250 within 2% for 60 s', () => {
    const s = ship({ x: 250, y: 0, vx: 0, vy: circularSpeed(250) });
    for (let t = 0; t < 3600; t++) {
      flyShip(s, { turn: 0, thrust: 0 }, GRAVITY_ONLY);
      const r = Math.sqrt(s.x * s.x + s.y * s.y);
      expect(Math.abs(r - 250) / 250).toBeLessThan(0.02);
    }
  });
  it('keeps total energy within 1% over a 5-minute coast', () => {
    const s = ship({ x: 250, y: 0, vx: 0, vy: circularSpeed(250) }), e0 = energy(s);
    for (let t = 0; t < 18000; t++) {
      flyShip(s, { turn: 0, thrust: 0 }, GRAVITY_ONLY);
      expect(Math.abs((energy(s) - e0) / e0)).toBeLessThan(0.01);
    }
  });
  it('pulls about 2 u/s² at the belt and 0.3 u/s² at the edge', () => {
    const mag = (r: number): number => { const [x, y] = gravityAccel(r, 0); return Math.sqrt(x * x + y * y); };
    expect(mag(1200)).toBeCloseTo(1.74, 2);
    expect(mag(2800)).toBeCloseTo(0.32, 2);
  });
});

describe('flight configuration (spec §4 tests, §6)', () => {
  it('reaches within 5% of 800 u/s after 30 s of full thrust from rest', () => {
    const s = ship({});
    for (let t = 0; t < 1800; t++) flyShip(s, { turn: 0, thrust: 1 }, FLIGHT_NO_FIELD);
    const v = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    expect(Math.abs(v - 800) / 800).toBeLessThan(0.05);
    expect(s.vy).toBeLessThan(0);   // heading 0 is north, y up the screen is negative
  });
  it('stabilise removes a 60 u/s skid within 60 ticks and keeps forward speed', () => {
    const s = ship({ vx: 60, vy: -300 });
    for (let t = 0; t < 60; t++) flyShip(s, { turn: 0, thrust: 0 }, FLIGHT_NO_FIELD);
    expect(Math.abs(s.vx)).toBeLessThan(5);
    expect(s.vy).toBeLessThan(-250);   // drag alone takes 300 to about 258 in 1 s; stabilise must not touch forward speed
  });
  it('does not stabilise while an axis is held', () => {
    const s = ship({ vx: 60, vy: -300 });
    for (let t = 0; t < 60; t++) flyShip(s, { turn: 0, thrust: 1 }, FLIGHT_NO_FIELD);
    expect(s.vx).toBeGreaterThan(45);   // drag alone leaves about 51.6; stabilise would take it to 0
  });
  it('turns 150°/s: 106 whole heading steps in 60 ticks (1.78 × 60), clockwise for +turn', () => {
    const s = ship({});
    for (let t = 0; t < 60; t++) flyShip(s, { turn: 1, thrust: 0 }, FLIGHT_NO_FIELD);
    expect(s.heading).toBe(106);
    const l = ship({});
    for (let t = 0; t < 60; t++) flyShip(l, { turn: -1, thrust: 0 }, FLIGHT_NO_FIELD);
    expect(l.heading).toBe(256 - 106);
  });
  it('reverse thrust is 40% of forward', () => {
    const f = ship({}), r = ship({});
    flyShip(f, { turn: 0, thrust: 1 }, { ...FLIGHT_NO_FIELD, drag: 0 });
    flyShip(r, { turn: 0, thrust: -1 }, { ...FLIGHT_NO_FIELD, drag: 0 });
    expect(f.vy).toBeCloseTo(-THRUST * DT, 12);
    expect(r.vy).toBeCloseTo(0.4 * THRUST * DT, 12);
  });
  it('scales thrust and turn by the Engines factor 1 / 0.6 / 0 (level 2 is off, owner 2026-11-17)', () => {
    for (const [level, factor] of [[0, 1], [1, 0.6], [2, 0]] as const) {
      const s = ship({});                                                 // the Engines level is the systems record's, passed in
      flyShip(s, { turn: 1, thrust: 1 }, { ...FLIGHT_NO_FIELD, drag: 0 }, level);
      expect(Math.sqrt(s.vx * s.vx + s.vy * s.vy)).toBeCloseTo(THRUST * factor * DT, 12);
      for (let t = 1; t < 60; t++) flyShip(s, { turn: 1, thrust: 0 }, FLIGHT_NO_FIELD, level);
      expect(s.heading + s.headingAcc).toBeCloseTo(TURN_STEPS_PER_TICK * 60 * factor, 9);
    }
  });
});

describe('stabilise never cancels gravity (spec §6)', () => {
  it('a released ship at rest still starts to fall on its first tick', () => {
    const s = ship({ x: 1200, y: 0, heading: 0 });
    flyShip(s, { turn: 0, thrust: 0 }, DEFAULT_FLIGHT);
    expect(s.vx).toBeLessThan(0);
    expect(s.x).toBeLessThan(1200);
  });
  it('a released ship flying nose-forward in a circular orbit keeps orbiting', () => {
    const s = ship({ x: 250, y: 0, vx: 0, vy: circularSpeed(250), heading: 128 });   // heading 128 = south = prograde here
    for (let t = 0; t < 3600; t++) {
      flyShip(s, { turn: 0, thrust: 0 }, { ...GRAVITY_ONLY, stabilise: DEFAULT_FLIGHT.stabilise });
      expect(Math.abs(Math.sqrt(s.x * s.x + s.y * s.y) - 250) / 250).toBeLessThan(0.02);
    }
  });
  it('a large skid shrinks to zero under stabilise and drag without ever reversing', () => {
    const s = ship({ vx: 300, vy: 0, heading: 0 });
    for (let t = 0; t < 400; t++) {
      flyShip(s, { turn: 0, thrust: 0 }, FLIGHT_NO_FIELD);
      expect(s.vx).toBeGreaterThanOrEqual(0);
    }
    expect(s.vx).toBe(0);
    expect(s.skidBudget).toBe(0);
  });
  it('removes only the skid captured at release, then stops', () => {
    const s = ship({ vx: 10, vy: -300 });
    flyShip(s, { turn: 0, thrust: 0 }, FLIGHT_NO_FIELD);
    expect(s.skidBudget).toBeCloseTo((10 - DEFAULT_FLIGHT.stabilise * DT) * (1 - DEFAULT_FLIGHT.drag * DT), 12);
    for (let t = 0; t < 30; t++) flyShip(s, { turn: 0, thrust: 0 }, FLIGHT_NO_FIELD);
    expect(s.skidBudget).toBe(0);
    s.vx = 5;                                                   // a later push sideways is not a new skid
    flyShip(s, { turn: 0, thrust: 0 }, FLIGHT_NO_FIELD);
    expect(s.vx).toBeGreaterThan(4.9);
  });
});

describe('map edge (spec §3)', () => {
  it('is zero inside and pulls back with K_EDGE per unit outside', () => {
    expect(edgeAccel(R_MAP - 1, 0)).toEqual([0, 0]);
    const [x, y] = edgeAccel(R_MAP + 200, 0);
    expect(x).toBeCloseTo(-400, 9);
    expect(y + 0).toBe(0);
  });
  it('turns a ship around that coasts out past the edge', () => {
    const s = ship({ x: R_MAP - 10, y: 0, vx: 100, vy: 0, heading: 64 });
    let maxX = s.x;
    for (let t = 0; t < 600; t++) { flyShip(s, { turn: 0, thrust: 0 }, { ...DEFAULT_FLIGHT, gravity: false }); maxX = Math.max(maxX, s.x); }
    expect(maxX).toBeLessThan(R_MAP + 100);
    expect(s.vx).toBeLessThan(0);
  });
});

describe('held axes are quantised: the turn by sign, the thrust to quarters (Helm H-0a final review; Artemis spec §5.3)', () => {
  const turned = (turn: number): Ship => { const s = ship({}); for (let t = 0; t < 60; t++) flyShip(s, { turn, thrust: 0 }, FLIGHT_NO_FIELD); return s; };
  it('an analog turn turns exactly as a full turn does', () => {
    for (const [a, full] of [[0.5, 1], [-0.7, -1]] as const) {
      const x = turned(a), y = turned(full);
      expect(x.heading).toBe(y.heading);
      expect(x.headingAcc).toBe(y.headingAcc);
    }
  });
  it('an analog thrust flies as its nearest quarter, and any reverse as full reverse', () => {
    const fly = (thrust: number): Ship => { const s = ship({}); flyShip(s, { turn: 0, thrust }, FLIGHT_NO_FIELD); return s; };
    for (const [a, q] of [[0.3, 0.25], [0.6, 0.5], [0.9, 1], [-0.3, -1]] as const) {
      const x = fly(a), y = fly(q);
      expect([a, x.vx, x.vy]).toEqual([a, y.vx, y.vy]);
    }
  });
  it('a NaN axis is idle and poisons nothing', () => {
    const s = ship({ released: false });
    flyShip(s, { turn: NaN, thrust: NaN }, FLIGHT_NO_FIELD);
    expect(s.heading).toBe(0); expect(s.headingAcc).toBe(0);
    for (const v of [s.x, s.y, s.vx, s.vy]) expect(Number.isNaN(v)).toBe(false);
    expect(s.released).toBe(true);
  });
});

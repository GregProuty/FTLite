// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §1, §2, §3, §4, §4a): the newtonianHelm flag, flightFor's
// per-slot tuning, the drag-0 speed cap, unquantised thrust with proportional reverse, the ship-relative thruster push,
// the turn boost, and the bit-identical flight of every ship that flies with drag.
import { describe, expect, it } from 'vitest';
import { CUTTER_CLASS, HUNTER_CLASS, SHIP_CLASSES, ShipClass, VALKYRN_CLASS, VALKYRN_LASER_CLASS, type ShipClassDef } from '../src/renderer/src/sim/tactical/defs';
import { hx, hy, wrapHeading } from '../src/renderer/src/sim/tactical/direction';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { edgeAccel, engineFactor, flightFor, flyShip, gravityAccel } from '../src/renderer/src/sim/tactical/physics';
import { predictFlight, predictPath } from '../src/renderer/src/sim/tactical/predict';
import { createTacticalState, type Axes, type Ship } from '../src/renderer/src/sim/tactical/state';
import { BOOST_FAR, CREW_FLIGHT, DEFAULT_FLIGHT, DT, MAX_SPEED, RCS_THRUST, RCS_TURN_BOOST, THRUST, TURN_STEPS_PER_TICK, type FlightTuning } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { throttleThrust } from '../src/renderer/src/sim/duel/throttle';

/** flyShip as it stood at master a2a02fc4 (thrust quantised to quarters, any reverse full reverse): every ship that flies
 *  with drag must fly exactly this (spec §3, §8 "Whole thrust axes … fly bit-identically to today"). */
function flyShipToday(s: Ship, axes: Axes, tuning: FlightTuning, engines = 0, cls: ShipClassDef = CUTTER_CLASS): void {
  const turn = Math.sign(axes.turn) || 0, q = (Math.max(-4, Math.min(4, Math.round(axes.thrust * 4))) || 0) / 4;
  const f = engineFactor(cls, engines);
  s.headingAcc += turn * cls.turnStepsPerTick * f;
  while (s.headingAcc >= 1) { s.heading = wrapHeading(s.heading + 1); s.headingAcc -= 1; }
  while (s.headingAcc <= -1) { s.heading = wrapHeading(s.heading - 1); s.headingAcc += 1; }
  const h0 = hx(s.heading), h1 = hy(s.heading);
  const idle = turn === 0 && q === 0, px = -h1, py = h0;
  if (idle && !s.released) { const side = s.vx * px + s.vy * py; s.skidBudget = Math.abs(side); s.skidSign = Math.sign(side); }
  if (!idle) { s.skidBudget = 0; s.skidSign = 0; }
  s.released = idle;
  if (idle && s.skidBudget > 0 && tuning.stabilise > 0) {
    const cut = Math.min(s.skidBudget, tuning.stabilise * DT);
    s.vx -= s.skidSign * cut * px; s.vy -= s.skidSign * cut * py; s.skidBudget -= cut;
  }
  let ax = 0, ay = 0;
  if (tuning.gravity) { const [gx, gy] = gravityAccel(s.x, s.y); ax += gx; ay += gy; }
  if (tuning.edge) { const [ex, ey] = edgeAccel(s.x, s.y); ax += ex; ay += ey; }
  if (q > 0) { const push = q * cls.thrust; ax += h0 * push * f; ay += h1 * push * f; }
  else if (q < 0) { ax -= h0 * cls.thrust * cls.reverseFraction * f; ay -= h1 * cls.thrust * cls.reverseFraction * f; }
  s.vx += ax * DT; s.vy += ay * DT;
  const keep = 1 - tuning.drag * DT;
  s.vx *= keep; s.vy *= keep;
  s.skidBudget *= keep;
  s.x += s.vx * DT; s.y += s.vy * DT;
}
const ship = (over: Partial<Ship>): Ship => ({ ...createTacticalState(1).ships[0], x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, ...over });
const speed = (s: Ship): number => Math.sqrt(s.vx * s.vx + s.vy * s.vy);
const NO_GRAVITY: FlightTuning = { ...CREW_FLIGHT, gravity: false };

describe('which ships (spec §1, §2)', () => {
  it('only the Cutter is newtonianHelm; flightFor gives slot 0 CREW_FLIGHT on it and DEFAULT_FLIGHT otherwise', () => {
    expect(SHIP_CLASSES.map((c) => c.newtonianHelm)).toEqual([true, false, false, false]);
    expect(CREW_FLIGHT).toEqual({ gravity: true, edge: true, drag: 0, stabilise: 0 });
    expect(MAX_SPEED).toBe(400);
    const st = createTacticalState(5);
    expect([flightFor(st, 0), flightFor(st, 1)]).toEqual([CREW_FLIGHT, DEFAULT_FLIGHT]);
    for (const cls of [ShipClass.Valkyrn, ShipClass.ValkyrnLaser]) expect(flightFor(createTacticalState(5, 2, cls), 0)).toBe(DEFAULT_FLIGHT);
  });
  it('every newtonianHelm class turns a boosted tick in fewer whole steps than the far band (defs.ts asserts it)', () => {
    for (const c of SHIP_CLASSES.filter((k) => k.newtonianHelm)) expect(RCS_TURN_BOOST * c.turnStepsPerTick).toBeLessThan(BOOST_FAR);
  });
});

describe('a ship that flies with drag flies exactly as today (spec §3)', () => {
  const start = (): Ship => ({ ...createTacticalState(3).ships[0], x: 900, y: -400, vx: 30, vy: 60, heading: 40, headingAcc: 0.25 });
  it('whole axes and every Valkyrn level, for every class and Engines level, bit for bit over 120 ticks', () => {
    const thrusts = [-1, 0, 1, ...[-1, 0, 1, 2, 3, 4].map(throttleThrust)];
    for (const cls of [CUTTER_CLASS, HUNTER_CLASS, VALKYRN_CLASS, VALKYRN_LASER_CLASS]) for (const engines of [0, 1, 2]) for (const turn of [-1, 0, 1]) for (const thrust of thrusts) {
      const a = start(), b = start();
      for (let t = 0; t < 120; t++) { flyShip(a, { turn, thrust }, DEFAULT_FLIGHT, engines, cls); flyShipToday(b, { turn, thrust }, DEFAULT_FLIGHT, engines, cls); }
      expect(a, `${cls.id} engines ${engines} turn ${turn} thrust ${thrust}`).toEqual(b);
    }
  });
});

describe('Newtonian flight (spec §2)', () => {
  it('with no input and gravity off the velocity is identical after 600 ticks', () => {
    const s = ship({ x: 500, y: 500, vx: 30, vy: -40, heading: 10 });
    for (let t = 0; t < 600; t++) flyShip(s, { turn: 0, thrust: 0 }, NO_GRAVITY);
    expect([s.vx, s.vy, s.heading, s.headingAcc]).toEqual([30, -40, 10, 0]);
    expect(s.x).toBeCloseTo(500 + 30 * DT * 600, 6); expect(s.y).toBeCloseTo(500 - 40 * DT * 600, 6);
  });
  it('with gravity the path bends toward the planet', () => {
    const s = ship({ x: 1500, y: 0, vx: 0, vy: 100 });
    for (let t = 0; t < 60; t++) flyShip(s, { turn: 0, thrust: 0 }, CREW_FLIGHT);
    expect(s.vx).toBeLessThan(0);
  });
  it('a thrust-only tick never raises the speed past max(400, the speed before thrust)', () => {
    for (const [v0, heading] of [[390, 0], [399.9, 0], [400, 0], [450, 0], [450, 30], [200, 0]] as const) {
      const s = ship({ vx: 0, vy: -v0, heading });
      for (let t = 0; t < 120; t++) {
        const before = speed(s);
        flyShip(s, { turn: 0, thrust: 1, rcsX: 1, rcsY: 1 }, NO_GRAVITY);
        expect(speed(s), `v0 ${v0} heading ${heading} tick ${t}`).toBeLessThanOrEqual(Math.max(MAX_SPEED, before) + 1e-9);
      }
    }
  });
  it('a perpendicular push at 400 still turns the velocity', () => {
    const s = ship({ vx: 0, vy: -400, heading: 64 });   // nose east, flying north at the cap
    flyShip(s, { turn: 0, thrust: 1 }, NO_GRAVITY);
    expect(s.vx).toBeGreaterThan(0); expect(s.vy).toBeGreaterThan(-400);
    expect(speed(s)).toBeLessThanOrEqual(MAX_SPEED + 1e-9); expect(speed(s)).toBeCloseTo(MAX_SPEED, 9);
  });
  it('gravity can still push the speed past 400, and thrust then cannot add to it', () => {
    const s = ship({ x: 150, y: 0, vx: 0, vy: -420 });
    expect(speed(s)).toBe(420);
    flyShip(s, { turn: 0, thrust: 0 }, CREW_FLIGHT);
    expect(speed(s)).toBeGreaterThan(420);   // gravity pushed it past the cap and past where it was, uncapped
    const t = ship({ vx: 0, vy: -420 });
    flyShip(t, { turn: 0, thrust: 1 }, NO_GRAVITY);
    expect(speed(t)).toBeCloseTo(420, 9);
  });
});

describe('the thrust axis (spec §3)', () => {
  const push = (thrust: number): number => { const s = ship({}); flyShip(s, { turn: 0, thrust }, NO_GRAVITY); return s.vy; };
  it('is no longer quantised to quarters, and reverse is proportional', () => {
    expect(push(0.3)).toBeCloseTo(-0.3 * THRUST * DT, 12);
    expect(push(0.007)).toBeCloseTo(-0.007 * THRUST * DT, 12);
    expect(push(-0.5)).toBeCloseTo(0.5 * 0.5 * THRUST * DT, 12);
    expect(push(-1)).toBeCloseTo(0.5 * THRUST * DT, 12);   // helm round 2 §2.2
    expect(push(2)).toBe(push(1)); expect(push(-3)).toBe(push(-1));
    expect(push(Number.NaN)).toBe(0); expect(Object.is(push(-0), 0) || push(-0) === 0).toBe(true);
  });
  it('is rounded to thousandths', () => {
    expect(push(0.3004)).toBe(push(0.3)); expect(push(0.2996)).toBe(push(0.3));
  });
});

describe('the cold gas thrusters in flight (spec §4)', () => {
  const dv = (heading: number, a: Partial<Axes>, engines = 0): [number, number] => {
    const s = ship({ heading }); flyShip(s, { turn: 0, thrust: 0, ...a }, NO_GRAVITY, engines); return [s.vx, s.vy];
  };
  it('push RCS_THRUST along the nose (rcsY) or its right (rcsX), relative to the ship, at two headings', () => {
    const k = RCS_THRUST * DT;
    for (const [heading, fx, fy] of [[0, 0, -1], [64, 1, 0]] as const) {
      const [ax, ay] = dv(heading, { rcsY: 1 }), [bx, by] = dv(heading, { rcsY: -1 }), [cx, cy] = dv(heading, { rcsX: 1 }), [ex, ey] = dv(heading, { rcsX: -1 });
      expect(ax).toBeCloseTo(fx * k, 12); expect(ay).toBeCloseTo(fy * k, 12);
      expect(bx).toBeCloseTo(-fx * k, 12); expect(by).toBeCloseTo(-fy * k, 12);
      expect(cx).toBeCloseTo(-fy * k, 12); expect(cy).toBeCloseTo(fx * k, 12);   // right of (hx, hy) is (−hy, hx)
      expect(ex).toBeCloseTo(fy * k, 12); expect(ey).toBeCloseTo(-fx * k, 12);
    }
  });
  it('are not scaled by Engines damage: at level 2 the main engine is off and the thrusters still push', () => {
    const [ax, ay] = dv(0, { thrust: 1, rcsY: 1 }, 2);
    expect(ax).toBeCloseTo(0, 12); expect(ay).toBeCloseTo(-RCS_THRUST * DT, 12);
  });
});

describe('the turn boost in flight (spec §4a)', () => {
  it('turnBoost 2 steps twice the class turn; absent or 1 is today\'s', () => {
    const a = ship({}), b = ship({}), c = ship({});
    flyShip(a, { turn: 1, thrust: 0, turnBoost: 2 }, NO_GRAVITY); flyShip(b, { turn: 1, thrust: 0 }, NO_GRAVITY); flyShip(c, { turn: 1, thrust: 0, turnBoost: 1 }, NO_GRAVITY);
    expect(a.heading + a.headingAcc).toBeCloseTo(2 * TURN_STEPS_PER_TICK, 12);
    expect(b).toEqual(c); expect(b.heading + b.headingAcc).toBeCloseTo(TURN_STEPS_PER_TICK, 12);
  });
});

describe('the prediction follows the crew flight (spec §2, §8)', () => {
  it('predictFlight for slot 0 defaults to CREW_FLIGHT and matches the stepped duel tick for tick', () => {
    const st = createTacticalState(5), axes: Axes = { turn: 0, thrust: 0.5 };
    expect(predictPath(st, 0, axes, 30, 1)).toEqual(predictPath(st, 0, axes, 30, 1, CREW_FLIGHT));
    const path = predictFlight(st, 0, axes, 30, 1);
    expect(path.contact).toBeNull();
    for (let k = 0; k < 30; k++) {
      stepDuel(st, { ...IDLE_INPUT, axes });
      expect([k, st.ships[0].x, st.ships[0].y]).toEqual([k, path.points[k]!.x, path.points[k]!.y]);
    }
    expect([st.ships[0].planetHits, st.ships[0].asteroidHits, st.ships[0].shipHits]).toEqual([0, 0, 0]);
  });
  it('the Hunter and the Valkyrn keep drag: their prediction defaults to DEFAULT_FLIGHT', () => {
    const st = createTacticalState(5), v = createTacticalState(5, 2, ShipClass.Valkyrn), axes: Axes = { turn: 1, thrust: 1 };
    expect(predictPath(st, 1, axes, 30, 1)).toEqual(predictPath(st, 1, axes, 30, 1, DEFAULT_FLIGHT));
    expect(predictPath(v, 0, axes, 30, 1)).toEqual(predictPath(v, 0, axes, 30, 1, DEFAULT_FLIGHT));
  });
});

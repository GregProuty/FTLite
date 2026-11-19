// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3, §5): the MANUAL flight and hit. It leaves the tube as
// today (straight for its boost). It thrusts at full thrust every tick while its fuel lasts, then coasts. It never
// homes. A and D turn it at the torpedo's turn rate, and a held heading turns it by the Helm's hold law until the nose is
// on it. It flies only with its ship's Weapons input. On a ship it strikes the room under its impact point for its hull,
// whatever the lock. Every collision rule is unchanged. The mode is the one it launched with.
import { describe, expect, it } from 'vitest';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { headingTurn, holdTurn } from '../src/renderer/src/sim/tactical/hunter';
import { manualTorpedoFlying, manualTorpTurn } from '../src/renderer/src/sim/tactical/manualTorpedo';
import { flyMissile, launchMissile, resolveMissiles, shootDown } from '../src/renderer/src/sim/tactical/missiles';
import { gravityAccel } from '../src/renderer/src/sim/tactical/physics';
import { beginRockTick } from '../src/renderer/src/sim/tactical/rocks';
import { classOf, cloneTactical, createTacticalState, missileOf, placeMissile, Room, type DuelEvent, type Missile, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { DT } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';

/** The crew at (0, 1500) nose north and still, no rocks, the Hunter far off and still, a fresh tick's rock masks, no events. */
function open(): TacticalState {
  const st = createTacticalState(5);
  st.rocks.fill(0);   // every seeded rock gone (the seeded grid ignores empty slots)
  beginRockTick(st);
  Object.assign(st.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(st.ships[1], { x: 2000, y: 2000, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.events = [];
  return st;
}
/** The crew's torpedo at (0, 1000), still, nose `heading`, `age` ticks old (past the boost by default), MANUAL by default. */
const flying = (st: TacticalState, heading = 0, age = 30, manual = true): Missile => placeMissile(st, 0, { x: 0, y: 1000, vx: 0, vy: 0, heading, headingAcc: 0, age }, manual);
/** The unsigned angle (heading steps, 0..128) between two heading indices. */
const apart = (a: number, b: number): number => { const k = (((a - b) % 256) + 256) % 256; return Math.min(k, 256 - k); };
type EndEvent = Extract<DuelEvent, { kind: 'missileEnd' }>;
const ends = (st: TacticalState): EndEvent[] => st.events.filter((e): e is EndEvent => e.kind === 'missileEnd');

describe('A and D (spec §3)', () => {
  it('turn it at the torpedo\'s turn rate after the boost, either way; it flies straight out of the tube first', () => {
    const st = open(), def = classOf(st, 0).slots.missile, m = flying(st, 0, 0);
    for (let k = 0; k < def.boostTicks; k++) flyMissile(st, 0, 1);
    expect(m.heading).toBe(0);
    for (let k = 0; k < 10; k++) flyMissile(st, 0, 1);
    expect(m.heading).toBe(Math.floor(10 * def.turnStepsPerTick));
    const left = open(), l = flying(left, 0, 30);
    for (let k = 0; k < 10; k++) flyMissile(left, 0, -1);
    expect(l.heading).toBe(256 - Math.floor(10 * def.turnStepsPerTick));
  });
  it('it never homes: with no steer a MANUAL torpedo keeps its nose; an AUTO one turns onto its target', () => {
    const manual = open(), m = flying(manual, 0, 30, true);
    const auto = open(), a = flying(auto, 0, 30, false);
    for (let k = 0; k < 60; k++) { flyMissile(manual, 0, 0); flyMissile(auto, 0, 1); }   // an AUTO torpedo ignores steer
    expect(m.heading).toBe(0);
    expect(a.heading).not.toBe(0);
  });
});

describe('thrust (spec §3, §5)', () => {
  it('is full along the nose every fuelled tick, then it coasts unsteered on gravity alone', () => {
    const st = open(), def = classOf(st, 0).slots.missile, m = flying(st, 64, 30);
    const [gx, gy] = gravityAccel(m.x, m.y), vx = m.vx + (gx + hx(64) * def.thrust) * DT, vy = m.vy + (gy + hy(64) * def.thrust) * DT;
    flyMissile(st, 0, 0);
    expect(m.vx).toBeCloseTo(vx, 9); expect(m.vy).toBeCloseTo(vy, 9);
    m.age = def.fuelTicks;   // its last fuelled tick is behind it
    const [cx, cy] = gravityAccel(m.x, m.y), cvx = m.vx + cx * DT, cvy = m.vy + cy * DT;
    flyMissile(st, 0, 1);
    expect(m.vx).toBeCloseTo(cvx, 9); expect(m.vy).toBeCloseTo(cvy, 9);
    expect([m.heading, m.headingAcc]).toEqual([64, 0]);   // coasting: A/D no longer turns it
  });
});

describe('the held heading (spec §3, §5)', () => {
  it('converges on the heading and holds it, by the Helm\'s hold law', () => {
    const st = open(), m = flying(st, 0, 30);
    for (let k = 0; k < 120; k++) flyMissile(st, 0, manualTorpTurn(m, 0, 64));
    expect(apart(m.heading, 64)).toBeLessThanOrEqual(2);
    for (let k = 0; k < 30; k++) { flyMissile(st, 0, manualTorpTurn(m, 0, 64)); expect(apart(m.heading, 64)).toBeLessThanOrEqual(2); }
  });
  it('manualTorpTurn: A/D wins over the held heading; a bad heading is none; holdTurn is the Helm\'s law', () => {
    const st = open(), m = flying(st, 0, 30);
    expect([manualTorpTurn(m, -1, 64), manualTorpTurn(m, 1, 192), manualTorpTurn(m, 0.4, 192)]).toEqual([-1, 1, 1]);
    expect([manualTorpTurn(m, 0, 64), manualTorpTurn(m, 0, 192), manualTorpTurn(m, 0, 0)]).toEqual([1, -1, 0]);
    expect([manualTorpTurn(m, 0, -1), manualTorpTurn(m, 0, 256), manualTorpTurn(m, 0, 1.5), manualTorpTurn(m, Number.NaN, -1)]).toEqual([0, 0, 0, 0]);
    for (const [heading, h] of [[0, 64], [10, 200], [128, 130], [250, 3]] as const) {
      st.ships[0].heading = heading;
      expect(holdTurn(heading, h), `${heading} → ${h}`).toBe(headingTurn(st, 0, h));
    }
  });
});

describe('the duel tick (spec §3)', () => {
  it('flies a MANUAL torpedo by its ship\'s Weapons input only', () => {
    const st = open(), m = flying(st, 0, 30);
    for (let k = 0; k < 10; k++) stepDuel(st, { ...IDLE_INPUT, torpTurn: 1 });
    expect(m.heading).toBe(Math.floor(10 * classOf(st, 0).slots.missile.turnStepsPerTick));
    const away = open(), a = flying(away, 0, 30);
    for (let k = 0; k < 10; k++) stepDuel(away, { ...IDLE_INPUT, weapons: false, torpTurn: 1, torpHeading: 64 });
    expect(a.heading).toBe(0);
    expect(manualTorpedoFlying(st)).toBe(true);
    expect(manualTorpedoFlying(st, 1)).toBe(false);
  });
  it('keeps the mode it launched with: a toggle mid-flight changes neither a MANUAL nor an AUTO torpedo', () => {
    const st = open();
    st.systems[0].torpManual = true;
    launchMissile(st, 0);
    st.systems[0].torpManual = false;   // V during the flight
    const m = missileOf(st, 0)!, def = classOf(st, 0).slots.missile;
    for (let k = 0; k < def.boostTicks + 10; k++) stepDuel(st, { ...IDLE_INPUT, torpTurn: 1 });
    expect(missileOf(st, 0)).toBe(m);
    expect([m.manual, m.heading]).toEqual([true, Math.floor(10 * def.turnStepsPerTick)]);
    const auto = open();
    Object.assign(auto.ships[1], { x: 300, y: 1200 });   // a target in range for the homing
    launchMissile(auto, 0);
    const twin = cloneTactical(auto);
    auto.systems[0].torpManual = true;   // V during the flight
    for (let k = 0; k < 40; k++) { stepDuel(auto, { ...IDLE_INPUT, torpTurn: 1 }); stepDuel(twin, IDLE_INPUT); }
    expect(missileOf(auto, 0)?.manual).toBe(false);
    expect(missileOf(auto, 0)?.heading).toBe(missileOf(twin, 0)?.heading);   // it homed exactly as the untoggled twin
  });
});

describe('the hit (spec §3, §5)', () => {
  it('a MANUAL torpedo strikes the room under its impact point for its hull, whatever the lock; an AUTO one its target room', () => {
    for (const manual of [true, false]) {
      const st = open(), def = classOf(st, 0).slots.missile;
      Object.assign(st.ships[1], { x: 0, y: 1300, heading: 0 });   // nose north: its stern faces the crew
      Object.assign(st.systems[0], { torpRoom: Room.Weapons, lock: Room.Shields });
      placeMissile(st, 0, { x: 0, y: 1300 + classOf(st, 1).radius + def.radius - 1, vx: 0, vy: -100, heading: 0, headingAcc: 0, age: 100 }, manual);
      const hull = st.systems[1].hull, room = manual ? Room.Engines : Room.Weapons;
      resolveMissiles(st);
      expect(st.systems[1].rooms[room], `manual ${manual}`).toBe(1);
      expect(st.systems[1].rooms.reduce((a, b) => a + b, 0)).toBe(1);
      expect(st.systems[1].hull).toBe(hull - def.hull);
      expect(ends(st)).toEqual([expect.objectContaining({ ship: 0, cause: 'ship', target: 1, room })]);
      expect(st.systems[0].missileHits).toBe(1);
    }
  });
  it('every collision rule stands: the planet ends it, and a pew round shoots it down', () => {
    const st = open();
    placeMissile(st, 0, { x: 0, y: st.map.planet.r + 1, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 }, true);
    resolveMissiles(st);
    expect(ends(st)).toEqual([expect.objectContaining({ cause: 'planet' })]);
    expect(missileOf(st, 0)).toBeNull();
    const shot = open();
    flying(shot);
    shootDown(shot, 0);
    expect(ends(shot)).toEqual([expect.objectContaining({ cause: 'shot' })]);
    expect(shot.missiles.every((e) => !e.active && !e.manual)).toBe(true);   // the freed entry holds zeros
  });
});

// Disabled systems (owner 2026-11-17, FTL-style): a tactical Room at damage level 2 is OFF. Weapons 2: the laser cannot
// charge, hold or fire, and a stored charge drops to 0; missiles cannot launch (one in flight carries on). Engines 2: no
// thrust and no turning, the ship drifts. Shields 2 already stops the recharge. Level 1 and repair are unchanged.
import { describe, expect, it } from 'vitest';
import { cloneShip, createTacticalState, missileOf, Room, type Ship, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { applyWeaponsInput, canLaunch, IDLE_INPUT, laserOffline, tickWeapons, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { engineFactor, flyShip } from '../src/renderer/src/sim/tactical/physics';
import { CUTTER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { DEFAULT_FLIGHT, DT, LASER_CHARGE_UNITS, THRUST, TURN_STEPS_PER_TICK, type FlightTuning } from '../src/renderer/src/sim/tactical/tuning';
import { makeHostile } from './helpers/hostile';
import { todaysCrewWeapons } from './helpers/crewWeapons';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';

function duel(): TacticalState {
  const st = todaysCrewWeapons(makeHostile(createTacticalState(5, 2, ShipClass.ValkyrnLaser)));   // Engineering spike spec §10.3: the beam and torpedo stand on bars (the round starts the beam dark)   // W-4 spec §14.1: the beam's rule, on the laser fit
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: -300, y: -300, vx: 0, vy: 0, heading: 192 });
  return st;
}
const input = (over: Partial<ShipInput> = {}): ShipInput => ({ ...IDLE_INPUT, ...over });
function tick(st: TacticalState, crew: ShipInput, enemy: ShipInput = IDLE_INPUT): void {
  applyWeaponsInput(st, 0, crew); applyWeaponsInput(st, 1, enemy);
  tickWeapons(st, 0, crew); tickWeapons(st, 1, enemy);
  st.tick++;
}
const laserEvents = (st: TacticalState, ship: number): number => st.events.filter((e) => e.kind === 'laser' && e.ship === ship).length;

describe('Weapons at level 2: the laser is off', () => {
  it('held fire never charges and never fires', () => {
    const st = duel(), a = st.systems[0];
    a.rooms[Room.Weapons] = 2;
    expect(laserOffline(st, 0)).toBe(true);
    tick(st, input({ laserCharge: true }));
    for (let t = 0; t < 900; t++) { tick(st, input()); expect(a.laserCharge).toBe(0); }
    tick(st, input({ laserCharge: false }));
    expect(a.laserCharge).toBe(0);
    expect(a.shots).toBe(0);
    expect(laserEvents(st, 0)).toBe(0);
  });
  it('a full charge drops to 0 on the tick Weapons reaches 2, and a press then fires nothing', () => {
    const st = duel(), a = st.systems[0];
    expect(a.laserCharge).toBe(LASER_CHARGE_UNITS);   // the crew laser starts full (FTL targeting spec §2)
    a.rooms[Room.Weapons] = 2;
    tick(st, input());
    expect([a.laserCharge, a.laserHold]).toEqual([0, 0]);
    tick(st, input({ laserCharge: true }));
    expect(a.shots).toBe(0);
  });
  it('a full charge knocked to level 2 mid-tick (after its clock ran) cannot fire on the next press, nor auto-fire with a target', () => {
    const st = duel(), a = st.systems[0];
    expect(a.laserCharge).toBe(LASER_CHARGE_UNITS);
    a.rooms[Room.Weapons] = 2;                            // the hit lands after this ship's tickWeapons
    st.events = [];
    applyWeaponsInput(st, 0, input({ laserCharge: true, laserLock: Room.Engines }));
    expect(a.shots).toBe(0);
    expect(laserEvents(st, 0)).toBe(0);
    expect(a.laserCharge).toBe(0);
  });
  it('missile launch is refused at level 2; a missile already in flight carries on', () => {
    const st = duel(), a = st.systems[0];
    a.rooms[Room.Weapons] = 2;
    expect(canLaunch(st, 0)).toBe(false);
    applyWeaponsInput(st, 0, input({ missileLaunch: true }));
    expect(missileOf(st, 0)).toBeNull();
    a.rooms[Room.Weapons] = 0;
    applyWeaponsInput(st, 0, input({ missileLaunch: true }));
    expect(missileOf(st, 0)).not.toBeNull();
    a.rooms[Room.Weapons] = 2;
    tickWeapons(st, 0, input());
    expect(missileOf(st, 0)).not.toBeNull();
  });
  it('repair back to level 1 brings the laser back, at its bars\' rate (Engineering spike spec §10.3: level 1 leaves Weapons 5 bars, so the beam keeps 2)', () => {
    const st = duel(), a = st.systems[0];
    a.rooms[Room.Weapons] = 2;
    tick(st, input({ laserCharge: true }));
    for (let t = 0; t < 60; t++) tick(st, input());
    expect(a.laserCharge).toBe(0);
    a.rooms[Room.Weapons] = 1;                            // it charges by itself again (FTL targeting spec §2)
    for (let t = 0; t < 240; t++) tick(st, input());   // Engineering spike spec §10.3: the beam's 2 bars charge 40 a tick at level 1 (was 384 ticks at the level-1 rate)
    expect(a.laserCharge).toBe(LASER_CHARGE_UNITS);
    tick(st, input({ laserCharge: true }));
    expect(a.shots).toBe(1);
  });
});

const ship = (over: Partial<Ship> = {}): Ship => ({ ...createTacticalState(1).ships[0], x: 1200, y: 300, vx: 5, vy: -3, heading: 40, headingAcc: 0, ...over });

describe('Engines at level 2: no thrust, no turning', () => {
  it('the engine factor is 1 / 0.6 / 0', () => {
    expect([0, 1, 2].map((n) => engineFactor(CUTTER_CLASS, n))).toEqual([1, 0.6, 0]);
  });
  it('held axes change neither heading nor velocity: only gravity (and drag) move the ship', () => {
    const tuning: FlightTuning = { ...DEFAULT_FLIGHT, stabilise: 0 };
    for (const axes of [{ turn: 1, thrust: 1 }, { turn: -1, thrust: -1 }]) {
      const dead = ship(), drift = cloneShip(dead);
      for (let t = 0; t < 120; t++) { flyShip(dead, axes, DEFAULT_FLIGHT, 2); flyShip(drift, { turn: 0, thrust: 0 }, tuning, 0); }
      expect([dead.heading, dead.headingAcc]).toEqual([40, 0]);
      expect([dead.x, dead.y, dead.vx, dead.vy]).toEqual([drift.x, drift.y, drift.vx, drift.vy]);
    }
  });
  it('idle stabilise still applies at level 2', () => {
    const a = ship({ x: 0, y: 0 }), b = cloneShip(a), noField: FlightTuning = { ...DEFAULT_FLIGHT, gravity: false, edge: false };
    flyShip(a, { turn: 0, thrust: 0 }, noField, 2); flyShip(b, { turn: 0, thrust: 0 }, noField, 0);
    expect([a.vx, a.vy]).toEqual([b.vx, b.vy]);
  });
  it('level 1 is still 0.6, and repair from 2 to 1 restores thrust and turn', () => {
    const noField: FlightTuning = { gravity: false, edge: false, drag: 0, stabilise: 0 };
    const s = ship({ x: 0, y: 0, vx: 0, vy: 0, heading: 0 });
    flyShip(s, { turn: 1, thrust: 1 }, noField, 2);
    expect([s.vx, s.vy, s.headingAcc]).toEqual([0, 0, 0]);
    flyShip(s, { turn: 1, thrust: 1 }, noField, 1);
    expect(Math.sqrt(s.vx * s.vx + s.vy * s.vy)).toBeCloseTo(THRUST * 0.6 * DT, 12);
    expect(s.heading + s.headingAcc).toBeCloseTo(TURN_STEPS_PER_TICK * 0.6, 12);
  });
});

describe('the hunter with dead systems', () => {
  it('a hunter with Weapons and Engines at 2 keeps stepping, never fires its laser while off, and repairs', () => {
    const st = duel(), h = st.systems[1];
    h.rooms = [2, 0, 2];
    let fired = 0;
    for (let t = 0; t < 1200; t++) {
      const off = h.rooms[Room.Weapons] >= 2;
      stepDuel(st, input());
      if (off && h.rooms[Room.Weapons] >= 2) fired += laserEvents(st, 1);
    }
    expect(fired).toBe(0);
    expect(h.rooms[Room.Weapons] + h.rooms[Room.Engines]).toBeLessThan(4);
  });
});

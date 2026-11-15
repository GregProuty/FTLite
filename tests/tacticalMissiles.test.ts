import { describe, expect, it } from 'vitest';
import { flyMissile, resolveMissiles } from '../src/renderer/src/sim/tactical/missiles';
import { createTacticalState, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { applyWeaponsInput, IDLE_INPUT, tickWeapons, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { DT, LASER_CHARGE_UNITS, LASER_HOLD_TICKS, MAGAZINE, MISSILE_LIFE_TICKS, MISSILE_THRUST, MISSILE_TURN_STEPS_PER_TICK, R_MAP, SHIP_HULL } from '../src/renderer/src/sim/tactical/tuning';

/** Crew at (−600, −300) heading east, enemy far off at (−600, 600): inside the belt and clear of the planet. */
function duel(): TacticalState {
  const st = createTacticalState(5);
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: -600, y: 600, vx: 0, vy: 0, heading: 0 });
  return st;
}
const input = (over: Partial<ShipInput> = {}): ShipInput => ({ ...IDLE_INPUT, ...over });
/** One tick of commands, missile flight, missile contacts and weapon clocks; ships do not move. */
function tick(st: TacticalState, crew: ShipInput, steer = 0): void {
  applyWeaponsInput(st, 0, crew); applyWeaponsInput(st, 1, IDLE_INPUT);
  flyMissile(st, 0, crew.weapons ? steer : 0); flyMissile(st, 1, 0);
  resolveMissiles(st);
  tickWeapons(st, 0, crew); tickWeapons(st, 1, IDLE_INPUT);
  st.tick++;
}

describe('launch (spec §7b)', () => {
  it('spawns 25 units ahead with the ship velocity plus 60 u/s, and takes one from the magazine', () => {
    const st = duel(), s = st.ships[0];
    s.vx = 10;
    applyWeaponsInput(st, 0, input({ missileLaunch: true }));
    const m = st.missiles[0]!;
    expect([m.x, m.y, m.vx, m.vy, m.heading, m.age]).toEqual([-575, -300, 70, 0, 64, 0]);
    expect([s.magazine, s.missilesLaunched]).toEqual([MAGAZINE - 1, 1]);
  });
  it('is refused with an empty magazine, Weapons at level 2, a missile already flying, or nobody at Weapons', () => {
    for (const setup of [
      (st: TacticalState) => { st.ships[0].magazine = 0; },
      (st: TacticalState) => { st.ships[0].rooms[Room.Weapons] = 2; },
      (st: TacticalState) => { applyWeaponsInput(st, 0, input({ missileLaunch: true })); }
    ]) {
      const st = duel();
      setup(st);
      const before = st.ships[0].missilesLaunched;
      applyWeaponsInput(st, 0, input({ missileLaunch: true }));
      expect(st.ships[0].missilesLaunched).toBe(Math.min(before, 1));
    }
    const st = duel();
    applyWeaponsInput(st, 0, input({ weapons: false, missileLaunch: true }));
    expect(st.missiles[0]).toBeNull();
  });
  it('freezes the laser while it flies and ignores laserCharge commands', () => {
    const st = duel(), s = st.ships[0];
    tick(st, input({ laserCharge: true }));
    for (let t = 0; t < 59; t++) tick(st, input());
    const charge = s.laserCharge;
    tick(st, input({ missileLaunch: true }));
    expect(s.fireHeld).toBe(false);
    for (let t = 0; t < 60; t++) tick(st, input({ laserCharge: true }));
    expect(s.laserCharge).toBe(charge);
    expect(s.fireHeld).toBe(false);
  });
});

describe('flight (spec §7b)', () => {
  it('turns at 120°/s under the gunner', () => {
    const st = duel();
    Object.assign(st.ships[0], { x: -600, y: -300, heading: 0 });       // aim north, away from everything
    tick(st, input({ missileLaunch: true }));
    for (let t = 1; t < 60; t++) tick(st, input(), 1);
    expect(st.missiles[0]!.heading).toBe(Math.floor(MISSILE_TURN_STEPS_PER_TICK * 59));
  });
  it('thrusts on its first 360 ticks and coasts after', () => {
    const st = duel();
    applyWeaponsInput(st, 0, input({ missileLaunch: true }));
    const m = st.missiles[0]!;
    Object.assign(m, { x: -600, y: -300, vx: 0, vy: 0, heading: 64, age: 359 });
    flyMissile(st, 0, 0);
    expect(m.age).toBe(360);
    expect(m.vx).toBeGreaterThan(MISSILE_THRUST * DT);                  // thrust east plus a little gravity
    const vx = m.vx;
    flyMissile(st, 0, 0);
    expect(m.vx - vx).toBeLessThan(0.2);                                 // tick 361: gravity only
  });
  it('self-destructs at the end of its 480th tick, after that tick\'s move and contacts, unfreezing the laser that tick', () => {
    const st = duel(), s = st.ships[0];
    tick(st, input({ missileLaunch: true }));
    const m = st.missiles[0]!;
    Object.assign(m, { x: -300, y: 600, vx: 60, vy: 0, age: MISSILE_LIFE_TICKS - 2 });   // open space, coasting east
    s.laserCharge = LASER_CHARGE_UNITS; s.laserHold = 50;                 // a full charge, frozen while the missile flies
    tick(st, input());
    expect(m.age).toBe(MISSILE_LIFE_TICKS - 1);
    expect(st.missiles[0]).not.toBeNull();
    expect(s.laserHold).toBe(50);                                          // tick 479: still frozen
    const x479 = m.x;
    tick(st, input());
    expect(m.age).toBe(MISSILE_LIFE_TICKS);
    expect(st.missiles[0]).toBeNull();
    const ended = st.events.at(-1)!;
    expect(ended).toMatchObject({ kind: 'missileEnd', ship: 0, cause: 'expired' });
    expect(ended.kind === 'missileEnd' && ended.x).toBeGreaterThan(x479 + 0.9);   // tick 480 still moved it (about 1 unit east)
    expect(s.missilesLost).toBe(1);
    expect(s.laserHold).toBe(51);                                          // unfrozen on tick 480 itself
  });
  it('flies on unsteered when nobody is at Weapons, and keeps its thrust', () => {
    const st = duel();
    tick(st, input({ missileLaunch: true }));
    const v0 = st.missiles[0]!.vx;
    for (let t = 0; t < 30; t++) tick(st, input({ weapons: false }), 1);
    expect(st.missiles[0]!.heading).toBe(64);
    expect(st.missiles[0]!.vx).toBeGreaterThan(v0 + 70);
  });
});

describe('missile contacts (spec §4 collision matrix)', () => {
  it('bypasses shields: lands on the room at the impact point, +1 damage and 3 hull', () => {
    const st = duel(), b = st.ships[1];
    Object.assign(b, { x: -400, y: -300, heading: 192 });             // facing the crew: its nose faces the missile
    tick(st, input({ missileLaunch: true }));
    for (let t = 0; t < 120 && st.missiles[0]; t++) tick(st, input());
    expect(st.missiles[0]).toBeNull();
    expect(b.shields).toBe(2);
    expect(b.rooms).toEqual([1, 0, 0]);
    expect(b.hull).toBe(SHIP_HULL - 3);
    expect(st.ships[0].missileHits).toBe(1);
    expect(st.events).toContainEqual(expect.objectContaining({ kind: 'missileEnd', ship: 0, cause: 'ship', target: 1, room: Room.Weapons }));
  });
  it('ignores its own ship for the first second, then can hit it', () => {
    const st = duel(), s = st.ships[0];
    tick(st, input({ missileLaunch: true }));
    const m = st.missiles[0]!;
    Object.assign(m, { x: s.x, y: s.y, vx: 0, vy: 0 });                 // sitting on its own ship at age 1
    resolveMissiles(st);
    expect(st.missiles[0]).not.toBeNull();
    m.age = 61;
    resolveMissiles(st);
    expect(st.missiles[0]).toBeNull();
    expect(s.hull).toBe(SHIP_HULL - 3);
    expect(s.missileHits).toBe(0);                                      // a self-hit is not a hit
    expect(st.events.at(-1)).toMatchObject({ kind: 'missileEnd', cause: 'ship', target: 0 });
  });
  it('is destroyed by the planet, an asteroid or the map edge, and two missiles destroy each other', () => {
    const cases: [string, (st: TacticalState) => void][] = [
      ['planet', (st) => Object.assign(st.missiles[0]!, { x: 0, y: -60 })],
      ['asteroid', (st) => { const a = st.map.asteroids[0]!; Object.assign(st.missiles[0]!, { x: a.x, y: a.y }); }],
      ['edge', (st) => Object.assign(st.missiles[0]!, { x: R_MAP + 1, y: 0 })]
    ];
    for (const [cause, place] of cases) {
      const st = duel();
      applyWeaponsInput(st, 0, input({ missileLaunch: true }));
      place(st);
      resolveMissiles(st);
      expect(st.missiles[0], cause).toBeNull();
      expect(st.events.at(-1), cause).toMatchObject({ kind: 'missileEnd', cause });
    }
    const st = duel();
    applyWeaponsInput(st, 0, input({ missileLaunch: true }));
    applyWeaponsInput(st, 1, input({ missileLaunch: true }));
    Object.assign(st.missiles[1]!, { x: st.missiles[0]!.x + 5, y: st.missiles[0]!.y });
    resolveMissiles(st);
    expect(st.missiles).toEqual([null, null]);
    expect(st.ships[1].hull).toBe(SHIP_HULL);
  });
  it('a frozen full charge keeps its hold timer, then vents after the rest of the 3 s with no press, and does not recharge', () => {
    const st = duel(), s = st.ships[0];
    tick(st, input({ laserCharge: true }));
    for (let t = 1; t < 240 + 100; t++) tick(st, input());
    expect([s.laserCharge, s.laserHold]).toEqual([LASER_CHARGE_UNITS, 100]);
    tick(st, input({ missileLaunch: true }));                          // the launch freezes before the clocks run
    for (let t = 0; t < 50; t++) tick(st, input());
    expect([s.laserCharge, s.laserHold, s.fireHeld]).toEqual([LASER_CHARGE_UNITS, 100, false]);
    Object.assign(st.missiles[0]!, { x: 0, y: -60 });                  // into the planet
    tick(st, input());                                                  // ends; the hold timer resumes this tick
    expect(st.missiles[0]).toBeNull();
    expect(s.laserHold).toBe(101);
    for (let t = 0; t < LASER_HOLD_TICKS - 102; t++) tick(st, input());
    expect([s.laserCharge, s.laserHold]).toEqual([LASER_CHARGE_UNITS, LASER_HOLD_TICKS - 1]);
    tick(st, input());
    expect([s.laserCharge, s.laserHold]).toEqual([0, 0]);              // vented
    for (let t = 0; t < 60; t++) tick(st, input());
    expect(s.laserCharge).toBe(0);                                      // Fire is not held: no recharge
  });
  it('unfreezes the laser when the missile ends; a held full charge needs a fresh press and release', () => {
    const st = duel(), s = st.ships[0];
    tick(st, input({ laserCharge: true }));
    for (let t = 1; t < 240; t++) tick(st, input());
    tick(st, input({ missileLaunch: true }));
    Object.assign(st.missiles[0]!, { x: 0, y: -60 });                  // into the planet
    tick(st, input());
    expect(st.missiles[0]).toBeNull();
    tick(st, input({ laserCharge: false }));                            // a release without a press: nothing
    expect(s.shots).toBe(0);
    tick(st, input({ laserCharge: true }));
    tick(st, input({ laserCharge: false }));
    expect(s.shots).toBe(1);
  });
});

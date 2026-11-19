import { describe, expect, it } from 'vitest';
import { flyMissile, resolveMissiles } from '../src/renderer/src/sim/tactical/missiles';
import { createTacticalState, missileOf, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { applyWeaponsInput, IDLE_INPUT, tickWeapons, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { HUNTER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { DT, LASER_CHARGE_UNITS, LASER_HOLD_TICKS, MAGAZINE, MISSILE_LIFE_TICKS, MISSILE_THRUST, MISSILE_BOOST_TICKS, MISSILE_TURN_STEPS_PER_TICK, R_MAP } from '../src/renderer/src/sim/tactical/tuning';
import { makeHostile } from './helpers/hostile';
import { todaysCrewWeapons } from './helpers/crewWeapons';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';

/** Crew at (−600, −300) heading east, enemy 350 to the south at (−600, 50), inside the torpedo range (weapons update
 *  spec §2; it was 900 away before the range): inside the belt and clear of the planet. */
function duel(): TacticalState {
  const st = todaysCrewWeapons(makeHostile(createTacticalState(5, 2, ShipClass.ValkyrnLaser)));   // Engineering spike spec §10.3: the beam and torpedo stand on bars (the round starts the beam dark)   // W-4 spec §14.1: the beam's rule, on the laser fit
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: -600, y: 50, vx: 0, vy: 0, heading: 0 });
  return st;
}
const input = (over: Partial<ShipInput> = {}): ShipInput => ({ ...IDLE_INPUT, ...over });
/** One tick of commands, missile flight, missile contacts and weapon clocks; ships do not move. */
function tick(st: TacticalState, crew: ShipInput): void {
  applyWeaponsInput(st, 0, crew); applyWeaponsInput(st, 1, IDLE_INPUT);
  flyMissile(st, 0); flyMissile(st, 1);
  resolveMissiles(st);
  tickWeapons(st, 0, crew); tickWeapons(st, 1, IDLE_INPUT);
  st.tick++;
}

describe('launch (spec §7b)', () => {
  it('spawns 25 units ahead with the ship velocity plus 60 u/s, and takes one from the magazine', () => {
    const st = duel(), s = st.ships[0];
    s.vx = 10;
    applyWeaponsInput(st, 0, input({ missileLaunch: true }));
    const m = missileOf(st, 0)!;
    expect([m.x, m.y, m.vx, m.vy, m.heading, m.age]).toEqual([-575, -300, 70, 0, 64, 0]);
    expect([st.systems[0].magazine, st.systems[0].missilesLaunched]).toEqual([MAGAZINE - 1, 1]);
  });
  it('is refused with an empty magazine, Weapons at level 2, a missile already flying, the target beyond 360, or nobody at Weapons', () => {
    for (const setup of [
      (st: TacticalState) => { st.ships[1].y = 61; },                 // 361 away (weapons update spec §2)
      (st: TacticalState) => { st.systems[0].magazine = 0; },
      (st: TacticalState) => { st.systems[0].rooms[Room.Weapons] = 2; },
      (st: TacticalState) => { applyWeaponsInput(st, 0, input({ missileLaunch: true })); }
    ]) {
      const st = duel();
      setup(st);
      const before = st.systems[0].missilesLaunched;
      applyWeaponsInput(st, 0, input({ missileLaunch: true }));
      expect(st.systems[0].missilesLaunched).toBe(Math.min(before, 1));
    }
    const st = duel();
    applyWeaponsInput(st, 0, input({ weapons: false, missileLaunch: true }));
    expect(missileOf(st, 0)).toBeNull();
  });
  it('freezes the laser while it flies and ignores laserCharge commands', () => {
    const st = duel(), s = st.systems[0];
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
  it('homes at 120°/s by itself (homing torpedo spec §1)', () => {
    const st = duel();
    Object.assign(st.ships[0], { x: -600, y: -300, heading: 0 });       // aim north, the enemy dead astern
    tick(st, input({ missileLaunch: true }));
    for (let t = 1; t < MISSILE_BOOST_TICKS; t++) tick(st, input());
    expect(missileOf(st, 0)!.heading).toBe(0);                           // weapons update spec §2: straight out of the nose
    for (let t = MISSILE_BOOST_TICKS; t < 60; t++) tick(st, input());
    // Then it homes at full rate. The boost's gravity drift (east, toward the planet) puts the enemy south-west of it, so
    // it turns anticlockwise (it turned clockwise when it homed from launch).
    expect(256 - missileOf(st, 0)!.heading).toBe(Math.floor(MISSILE_TURN_STEPS_PER_TICK * (60 - MISSILE_BOOST_TICKS)));
  });
  it('thrusts on its first 360 ticks and coasts after', () => {
    const st = duel();
    applyWeaponsInput(st, 0, input({ missileLaunch: true }));
    const m = missileOf(st, 0)!;
    st.ships[1].active = false;                                          // no target: it flies straight
    Object.assign(m, { x: -600, y: -300, vx: 0, vy: 0, heading: 64, age: 359 });
    flyMissile(st, 0);
    expect(m.age).toBe(360);
    expect(m.vx).toBeGreaterThan(MISSILE_THRUST * DT);                  // thrust east plus a little gravity
    const vx = m.vx;
    flyMissile(st, 0);
    expect(m.vx - vx).toBeLessThan(0.2);                                 // tick 361: gravity only
  });
  it('self-destructs at the end of its 480th tick, after that tick\'s move and contacts, unfreezing the laser that tick', () => {
    const st = duel(), s = st.systems[0];
    tick(st, input({ missileLaunch: true }));
    const m = missileOf(st, 0)!;
    Object.assign(m, { x: -300, y: 600, vx: 60, vy: 0, age: MISSILE_LIFE_TICKS - 2 });   // open space, coasting east
    s.laserCharge = 100;                                                  // a part charge, frozen while the missile flies
    tick(st, input());
    expect(m.age).toBe(MISSILE_LIFE_TICKS - 1);
    expect(missileOf(st, 0)).not.toBeNull();
    expect(s.laserCharge).toBe(100);                                       // tick 479: still frozen
    const x479 = m.x;
    tick(st, input());
    expect(missileOf(st, 0)).toBeNull();
    expect(m.active).toBe(false);                                         // its pool entry is free again (and zeroed)
    const ended = st.events.at(-1)!;
    expect(ended).toMatchObject({ kind: 'missileEnd', ship: 0, cause: 'expired' });
    expect(ended.kind === 'missileEnd' && ended.x).toBeGreaterThan(x479 + 0.9);   // tick 480 still moved it (about 1 unit east)
    expect(s.missilesLost).toBe(1);
    expect(s.laserCharge).toBeGreaterThan(100);                            // unfrozen on tick 480 itself (it charges by itself, FTL targeting spec §2)
  });
  it('homes the same when nobody is at Weapons, and keeps its thrust', () => {
    const attended = duel(), alone = duel();
    tick(attended, input({ missileLaunch: true })); tick(alone, input({ missileLaunch: true }));
    const v0 = Math.hypot(missileOf(alone, 0)!.vx, missileOf(alone, 0)!.vy);
    for (let t = 0; t < 30; t++) { tick(attended, input()); tick(alone, input({ weapons: false })); }
    const m = missileOf(alone, 0)!;
    expect(m.heading).toBeGreaterThan(64);                               // launched east, it turned toward the enemy to the south
    expect(Math.hypot(m.vx, m.vy)).toBeGreaterThan(v0 + 70);
    expect({ ...m }).toEqual({ ...missileOf(attended, 0)! });
  });
});

describe('missile contacts (spec §4 collision matrix)', () => {
  it('bypasses shields: strikes the lock room of its owner, not the room at the impact point, +1 damage and 3 hull', () => {
    const st = duel(), b = st.ships[1];
    Object.assign(b, { x: -400, y: -300, heading: 192 });             // facing the crew: its nose (Weapons) faces the missile
    st.systems[0].lock = Room.Engines;                                 // the stern, away from the impact point
    st.systems[0].laserTargeted = false;                               // Feel-i's opener would auto-fire the laser at the shields
    tick(st, input({ missileLaunch: true }));
    for (let t = 0; t < 120 && missileOf(st, 0); t++) tick(st, input());
    expect(missileOf(st, 0)).toBeNull();
    expect(st.systems[1].shields).toBe(2);
    expect(st.systems[1].rooms).toEqual([0, 0, 1]);
    expect(st.systems[1].hull).toBe(HUNTER_CLASS.hull - 3);
    expect(st.systems[0].missileHits).toBe(1);
    expect(st.events).toContainEqual(expect.objectContaining({ kind: 'missileEnd', ship: 0, cause: 'ship', target: 1, room: Room.Engines }));
  });
  it('the lock room is read at impact: a lock changed in flight is the room struck', () => {
    const st = duel(), b = st.ships[1];
    Object.assign(b, { x: -400, y: -300, heading: 192 });
    st.systems[0].lock = Room.Engines;
    tick(st, input({ missileLaunch: true }));
    tick(st, input({ laserLock: Room.Shields }));
    for (let t = 0; t < 120 && missileOf(st, 0); t++) tick(st, input());
    expect(st.systems[1].rooms).toEqual([0, 1, 0]);
  });
  it('ignores its own ship for the first second, then can hit it', () => {
    const st = duel(), s = st.ships[0];
    tick(st, input({ missileLaunch: true }));
    const m = missileOf(st, 0)!;
    st.systems[0].lock = Room.Engines;                                  // a lock names a room on the target, never its own ship
    Object.assign(m, { x: s.x + 5, y: s.y, vx: 0, vy: 0 });             // sitting on its own ship's nose (heading east) at age 1
    resolveMissiles(st);
    expect(missileOf(st, 0)).not.toBeNull();
    m.age = 61;
    resolveMissiles(st);
    expect(missileOf(st, 0)).toBeNull();
    expect(st.systems[0].hull).toBe(50);   // W-4 spec §14.1 (laser fit): was SHIP_HULL - 3 (67); the laser fit has VALKYRN_HULL 53
    expect(st.systems[0].missileHits).toBe(0);                                      // a self-hit is not a hit
    expect(st.events.at(-1)).toMatchObject({ kind: 'missileEnd', cause: 'ship', target: 0, room: Room.Weapons });   // the impact room
    expect(st.systems[0].rooms).toEqual([1, 0, 0]);
  });
  it('is destroyed by the planet, an asteroid or the map edge, and two missiles destroy each other', () => {
    const cases: [string, (st: TacticalState) => void][] = [
      ['planet', (st) => Object.assign(missileOf(st, 0)!, { x: 0, y: -60 })],
      ['asteroid', (st) => { const a = st.map.asteroids[0]!; Object.assign(missileOf(st, 0)!, { x: a.x, y: a.y }); }],
      ['edge', (st) => Object.assign(missileOf(st, 0)!, { x: R_MAP + 1, y: 0 })]
    ];
    for (const [cause, place] of cases) {
      const st = duel();
      applyWeaponsInput(st, 0, input({ missileLaunch: true }));
      place(st);
      resolveMissiles(st);
      expect(missileOf(st, 0), cause).toBeNull();
      expect(st.events.at(-1), cause).toMatchObject({ kind: 'missileEnd', cause });
    }
    const st = duel();
    applyWeaponsInput(st, 0, input({ missileLaunch: true }));
    applyWeaponsInput(st, 1, input({ missileLaunch: true }));
    Object.assign(missileOf(st, 1)!, { x: missileOf(st, 0)!.x + 5, y: missileOf(st, 0)!.y });
    resolveMissiles(st);
    expect(st.missiles.every((m) => !m.active)).toBe(true);
    expect(st.systems[1].hull).toBe(HUNTER_CLASS.hull);
  });
  it('a frozen part charge holds while the missile flies and charges again the tick it ends; a full crew charge never vents (FTL targeting spec §2)', () => {
    const st = duel(), s = st.systems[0];
    s.laserCharge = 1000;
    tick(st, input({ missileLaunch: true }));                          // the launch freezes before the clocks run
    for (let t = 0; t < 50; t++) tick(st, input());
    expect([s.laserCharge, s.laserHold, s.fireHeld]).toEqual([1000, 0, false]);
    Object.assign(missileOf(st, 0)!, { x: 0, y: -60 });                  // into the planet
    tick(st, input());                                                  // ends; the charge resumes this tick
    expect(missileOf(st, 0)).toBeNull();
    expect(s.laserCharge).toBeGreaterThan(1000);
    for (let t = 0; t < 240 + 2 * LASER_HOLD_TICKS; t++) tick(st, input());
    expect([s.laserCharge, s.laserHold]).toEqual([LASER_CHARGE_UNITS, 0]);   // full, held, never vented
  });
  it('unfreezes the laser when the missile ends; a single press then fires the full charge', () => {
    const st = duel(), s = st.systems[0];
    expect(s.laserCharge).toBe(LASER_CHARGE_UNITS);                      // the round starts full
    tick(st, input({ missileLaunch: true }));
    Object.assign(missileOf(st, 0)!, { x: 0, y: -60 });                  // into the planet
    tick(st, input());
    expect(missileOf(st, 0)).toBeNull();
    tick(st, input({ laserCharge: false }));                            // a release does nothing
    expect(s.shots).toBe(0);
    tick(st, input({ laserCharge: true }));
    expect(s.shots).toBe(1);
  });
});

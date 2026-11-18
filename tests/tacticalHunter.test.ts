import { describe, expect, it } from 'vitest';
import { nextInt } from '../src/shared/rng';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { hashTactical } from '../src/renderer/src/sim/tactical/hash';
import { hunterThink, pursuitTurn } from '../src/renderer/src/sim/tactical/hunter';
import { flyMissile, homingTurn } from '../src/renderer/src/sim/tactical/missiles';
import { createTacticalState, HunterMode, missileOf, Outcome, placeMissile, removeMissile, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { HUNTER_JITTER_TICKS, HUNTER_MISSILE_COOLDOWN_TICKS, HUNTER_WALK_TICKS, LASER_CHARGE_UNITS, REPAIR_WORK_TICKS, SHIP_HULL } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { makeHostile } from './helpers/hostile';

/** Enemy at (−300, −300) facing west at the crew 300 units away: in arc, in range, clear of the planet. */
function facing(): TacticalState {
  const st = makeHostile(createTacticalState(5));
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: -300, y: -300, vx: 0, vy: 0, heading: 192 });
  return st;
}

describe('hunter: flying (spec §9 Hunt)', () => {
  it('steers toward the lead point and thrusts only when roughly aligned', () => {
    const st = facing();
    st.ships[1].x = -100;                                                // 500 away: outside the standoff, so it pursues
    expect(hunterThink(st).axes).toEqual({ turn: 0, thrust: 1 });      // crew dead ahead
    st.ships[1].heading = 0;                                             // facing north: the crew is anticlockwise (west)
    expect(hunterThink(st).axes).toEqual({ turn: -1, thrust: 0 });
  });
  it('turns clockwise toward a target dead astern instead of not turning, for the ship and for its missile', () => {
    const st = facing();
    Object.assign(st.ships[1], { heading: 192 });
    Object.assign(st.ships[0], { x: 0, y: -300 });                       // dead astern of an enemy facing west, 300 away
    expect(hunterThink(st).axes).toEqual({ turn: 1, thrust: 0 });
    expect(pursuitTurn(0, 0, -10)).toBe(0);                               // dead ahead: no turn
    // Its missile now homes by itself (homing torpedo spec §1), with the same dead-astern rule.
    placeMissile(st, 1, { x: -300, y: -300, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 100 });   // pointing north
    Object.assign(st.ships[0], { x: -300, y: 0 });                       // the crew due south
    expect(homingTurn(st, 1, missileOf(st, 1)!)).toBe(1);
  });
  it('leads a moving crew by 0.5 s: a target straight ahead but moving south pulls the turn anticlockwise', () => {
    const st = facing();
    st.ships[1].x = -100;                                                // outside the standoff
    st.ships[0].vy = 600;                                                // lead point (−600, 0): south-west of the enemy facing west
    expect(hunterThink(st).axes.turn).toBe(-1);
    st.ships[0].vy = -600;                                               // lead point north-west: clockwise
    expect(hunterThink(st).axes.turn).toBe(1);
  });
  it('no longer steers its missile (homing torpedo spec §1): with one in flight it neither charges nor launches, and the missile homes on the crew', () => {
    const st = facing();
    placeMissile(st, 1, { x: -300, y: -300, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 100 });   // pointing north, the crew west
    const input = hunterThink(st);
    expect([input.laserCharge, input.missileLaunch]).toEqual([null, false]);
    expect('steer' in input).toBe(false);
    flyMissile(st, 1);
    const m = missileOf(st, 1)!;
    expect(m.heading + m.headingAcc).toBeGreaterThan(200);               // turned anticlockwise from north (wrapped below 256), toward the crew
  });
  it('draws exactly one jitter per scheduled release, none while it waits, and redraws after a cancel', () => {
    const st = facing(), me = st.systems[1];
    me.fireHeld = true; me.laserCharge = LASER_CHARGE_UNITS;
    let seed = 1;
    while (nextInt({ s: seed }, HUNTER_JITTER_TICKS + 1) < 3) seed++;   // a seed whose first jitter is at least 3 ticks
    st.rng.s = seed;
    const expected = { s: seed }, j = nextInt(expected, HUNTER_JITTER_TICKS + 1);
    expect(hunterThink(st).laserCharge).toBe(null);                      // scheduled, not yet released
    expect(st.rng.s).toBe(expected.s);                                    // exactly one draw
    expect(st.hunter.fireAt).toBe(st.tick + j);
    st.tick++;
    expect(hunterThink(st).laserCharge).toBe(null);
    expect(st.rng.s).toBe(expected.s);                                    // waiting draws nothing
    st.ships[0].x = 0;                                                    // the crew leaves the arc (behind the enemy): cancel
    hunterThink(st);
    expect(st.hunter.fireAt).toBe(-1);
    expect(st.rng.s).toBe(expected.s);
    st.ships[0].x = -600;                                                 // back in arc: a fresh draw
    hunterThink(st);
    nextInt(expected, HUNTER_JITTER_TICKS + 1);
    expect(st.rng.s).toBe(expected.s);
    for (let t = 0; t <= HUNTER_JITTER_TICKS && st.hunter.fireAt >= 0; t++) {
      if (st.tick >= st.hunter.fireAt) { expect(hunterThink(st).laserCharge).toBe(false); break; }
      expect(hunterThink(st).laserCharge).toBe(null);
      st.tick++;
    }
    expect(st.rng.s).toBe(expected.s);
  });
  it('inside the standoff: noses on the crew\'s current position, never thrusts forward, and brakes when closing fast', () => {
    const st = facing(), me = st.ships[1];                               // 300 apart, inside 320
    expect(hunterThink(st).axes).toEqual({ turn: 0, thrust: 0 });
    st.ships[0].vy = 600;                                                // a moving crew: no lead inside the standoff
    expect(hunterThink(st).axes.turn).toBe(0);
    me.vx = -50;                                                         // closing at 50 u/s toward the crew (west)
    expect(hunterThink(st).axes).toEqual({ turn: 0, thrust: -1 });
    me.vx = -30;                                                         // closing slower than 40: coast
    expect(hunterThink(st).axes.thrust).toBe(0);
  });
  it('rams far less against a crew that sits still than pure pursuit did', () => {
    let rams = 0;
    for (const seed of [1, 2, 3, 4]) {
      const st = makeHostile(createTacticalState(seed));
      for (let t = 0; t < 60 * 120 && st.outcome === Outcome.Running; t++) stepDuel(st, IDLE_INPUT);
      rams += st.ships[0].shipHits;
    }
    expect(rams).toBeLessThan(8);                                        // pure pursuit: 10 to 20 per duel
  });
  it('turns away and thrusts when its straight path will pass near the planet', () => {
    const st = facing();
    Object.assign(st.ships[1], { x: 0, y: -300, vx: 0, vy: 300, heading: 128 });   // diving at the planet
    const { axes } = hunterThink(st);
    expect(axes.thrust).toBe(1);
    expect(axes.turn).not.toBe(0);
  });
  it('closes on a crew that sits still', () => {
    const st = makeHostile(createTacticalState(5)), d0 = Math.hypot(st.ships[1].x - st.ships[0].x, st.ships[1].y - st.ships[0].y);
    for (let t = 0; t < 1800; t++) stepDuel(st, IDLE_INPUT);
    expect(Math.hypot(st.ships[1].x - st.ships[0].x, st.ships[1].y - st.ships[0].y)).toBeLessThan(d0);
  });
});

describe('hunter: firing (spec §9 Firing)', () => {
  it('presses Fire first, then releases within 0 to 12 ticks of being full and in arc, drawing one jitter', () => {
    const st = facing(), me = st.systems[1];
    expect(hunterThink(st).laserCharge).toBe(true);
    me.fireHeld = true; me.laserCharge = LASER_CHARGE_UNITS;
    const rng = st.rng.s;
    let ticks = 0;
    for (; ticks <= HUNTER_JITTER_TICKS; ticks++) {
      if (hunterThink(st).laserCharge === false) break;
      st.tick++;
    }
    expect(ticks).toBeLessThanOrEqual(HUNTER_JITTER_TICKS);
    expect(st.rng.s).not.toBe(rng);
  });
  it('locks Shields until the crew Shields room is at level 2, then Weapons', () => {
    const st = facing();
    expect(hunterThink(st).laserLock).toBe(Room.Shields);
    st.systems[0].rooms[Room.Shields] = 2;
    expect(hunterThink(st).laserLock).toBe(Room.Weapons);
  });
  it('launches a missile within 400 units, then not again for 30 s after a launch', () => {
    const st = facing();
    stepDuel(st, IDLE_INPUT);
    expect(missileOf(st, 1)).not.toBeNull();
    expect(st.hunter.lastLaunch).toBe(0);
    removeMissile(st, 1);
    st.tick = HUNTER_MISSILE_COOLDOWN_TICKS - 1;
    expect(hunterThink(st).missileLaunch).toBe(false);
    st.tick = HUNTER_MISSILE_COOLDOWN_TICKS;
    expect(hunterThink(st).missileLaunch).toBe(true);
  });
  it('a launch refused on the tick (the crew knocks its Weapons room to level 2 first) costs no cooldown', () => {
    const st = facing(), [crew, me] = st.systems;
    me.rooms[Room.Weapons] = 1; me.shields = 0;
    crew.lock = Room.Weapons; crew.fireHeld = true; crew.laserCharge = LASER_CHARGE_UNITS;
    const before = st.hunter.lastLaunch;
    stepDuel(st, { ...IDLE_INPUT, laserCharge: true });
    expect(me.rooms[Room.Weapons]).toBe(2);
    expect(missileOf(st, 1)).toBeNull();
    expect(st.hunter.lastLaunch).toBe(before);
  });
  it('its missile homes on where the crew is now, not where it was 18 ticks ago', () => {
    const st = facing();
    placeMissile(st, 1, { x: -300, y: -300, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 100 });   // pointing north
    st.hunter.trail.fill(-600);                                          // the crew was at (−600, −600): north-west
    st.ships[0].x = -100;                                                // and is now east
    hunterThink(st);
    expect(homingTurn(st, 1, missileOf(st, 1)!)).toBe(1);
  });
});

describe('hunter: repair (spec §9 Repair)', () => {
  it('walks 6 s and works 4 s on a level-2 room with that console empty, then lowers it one level', () => {
    const st = facing(), me = st.systems[1];
    me.rooms[Room.Engines] = 2;
    let input = hunterThink(st);
    expect(st.hunter.mode).toBe(HunterMode.Repair);
    expect([input.helm, input.weapons]).toEqual([false, true]);
    for (let t = 1; t < HUNTER_WALK_TICKS + REPAIR_WORK_TICKS; t++) { input = hunterThink(st); st.tick++; }
    expect(me.rooms[Room.Engines]).toBe(2);
    input = hunterThink(st);
    expect(me.rooms[Room.Engines]).toBe(1);
    expect(st.hunter.mode).toBe(HunterMode.Hunt);
  });
  it('repairs a level-1 room only while the crew is out of laser range; Weapons repair empties the Weapons console', () => {
    const st = facing(), me = st.systems[1];
    me.rooms[Room.Weapons] = 1;
    hunterThink(st);
    expect(st.hunter.mode).toBe(HunterMode.Hunt);
    st.ships[0].x = -900;
    const input = hunterThink(st);
    expect(st.hunter.mode).toBe(HunterMode.Repair);
    expect([input.helm, input.weapons, input.laserCharge, input.missileLaunch]).toEqual([true, false, null, false]);
  });
  it('picks the highest level first, ties Engines, then Weapons, then Shields', () => {
    const st = facing(), me = st.systems[1];
    st.ships[0].x = -900;
    me.rooms = [1, 1, 1];
    hunterThink(st);
    expect(st.hunter.room).toBe(Room.Engines);
    const st2 = facing();
    st2.systems[1].rooms = [1, 2, 1];
    hunterThink(st2);
    expect(st2.hunter.room).toBe(Room.Shields);
  });
});

describe('duel step (spec §4 to §9)', () => {
  it('is deterministic: the same seed and crew inputs give the same hash', () => {
    const run = (): string => { const st = makeHostile(createTacticalState(9)); for (let t = 0; t < 3600; t++) stepDuel(st, IDLE_INPUT); return hashTactical(st); };
    expect(run()).toBe(run());
  });
  it('the hunter wears down a crew that only sits there, and the duel ends', () => {
    const st = makeHostile(createTacticalState(9));
    for (let t = 0; t < 60 * 600 && st.outcome === Outcome.Running; t++) stepDuel(st, IDLE_INPUT);
    expect(st.systems[0].hull).toBeLessThan(SHIP_HULL);
    expect(st.systems[1].shots + st.systems[1].missilesLaunched).toBeGreaterThan(0);
  });
  it('stops advancing once the duel has ended', () => {
    const st = facing();
    st.systems[0].hull = 0;
    stepDuel(st, IDLE_INPUT);
    expect(st.outcome).toBe(Outcome.EnemyWins);
    const tick = st.tick;
    stepDuel(st, IDLE_INPUT);
    expect(st.tick).toBe(tick);
  });
});

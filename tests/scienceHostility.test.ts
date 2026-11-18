// Sci-1 (spec 2026-11-17-science-scans §4.1, §4.2, §4.6): Patrol and the turn to hostility, through stepDuel, on states
// put in Patrol by hand (the Patrol start itself is the plan's Task 6).
import { describe, expect, it } from 'vitest';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { hunterThink } from '../src/renderer/src/sim/tactical/hunter';
import { hostilityStep, roundTick } from '../src/renderer/src/sim/tactical/science';
import { classOf, createTacticalState, type DuelEvent, HunterMode, placeMissile, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { HOSTILE_AFTER_TICKS, LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT, tickWeapons, UNCREWED_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { makeHostile, patrol } from './helpers/hostile';

/** In Patrol: the crew at (−600, −300) facing east at the enemy 300 units east of it (in arc and range), both at rest. */
function facing(): TacticalState {
  const st = patrol(createTacticalState(5));
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: -300, y: -300, vx: 0, vy: 0, heading: 192 });
  return st;
}
const hostile = (st: TacticalState) => st.events.filter((e) => e.kind === 'hostile');
const crewLaserHit: DuelEvent = { kind: 'laser', ship: 0, hit: true, stripped: true, room: -1, x1: 0, y1: 0, x2: 0, y2: 0 };
const crewMissileOnHunter: DuelEvent = { kind: 'missileEnd', ship: 0, cause: 'ship', target: 1, room: 0, x: 0, y: 0 };

describe('the hostility clock (spec §4.1)', () => {
  it('turns hostile in the step of rt 1199 (cause clock); in Patrol every earlier step, firing nothing and regaining no layer', () => {
    const st = patrol(createTacticalState(5)), layers = classOf(st, 1).shields.layers;   // both on their spawn orbits
    for (let k = 0; k < HOSTILE_AFTER_TICKS - 1; k++) {
      stepDuel(st, UNCREWED_INPUT);
      expect([st.hostileAt, st.hunter.mode, hostile(st).length], `step ${k}`).toEqual([-1, HunterMode.Patrol, 0]);
    }
    const h = st.systems[1];
    expect([h.shots, h.missilesLaunched, h.laserCharge, h.fireHeld, h.shields, h.shieldClock]).toEqual([0, 0, 0, false, layers - 1, 0]);
    expect(roundTick(st)).toBe(HOSTILE_AFTER_TICKS - 1);
    stepDuel(st, UNCREWED_INPUT);
    expect([st.hostileAt, st.hunter.mode]).toEqual([HOSTILE_AFTER_TICKS - 1, HunterMode.Hunt]);
    expect(hostile(st)).toEqual([{ kind: 'hostile', cause: 'clock' }]);
    for (let k = 0; k < 300; k++) stepDuel(st, UNCREWED_INPUT);   // hostile now: Shields at level 0 regain a layer in 300 ticks
    expect(h.shields).toBe(layers);
  });
  it('reads rt from startTick, and a state at the step-1 neutral values never turns', () => {
    const st = patrol(createTacticalState(5));
    st.tick = 5000; st.startTick = 5000 - (HOSTILE_AFTER_TICKS - 1);
    stepDuel(st, UNCREWED_INPUT);
    expect(st.hostileAt).toBe(HOSTILE_AFTER_TICKS - 1);
    const neutral = makeHostile(createTacticalState(5));
    for (let k = 0; k < HOSTILE_AFTER_TICKS + 60; k++) { stepDuel(neutral, UNCREWED_INPUT); expect(hostile(neutral)).toEqual([]); }
    expect(neutral.hostileAt).toBe(0);
  });
});

describe('an ambush turns it hostile at once (spec §2.2, §4.1)', () => {
  it('a crew laser release that hits turns it that tick (cause laser), shields one below; a miss does not', () => {
    const st = facing(); st.tick = 300;
    st.systems[0].fireHeld = true; st.systems[0].laserCharge = LASER_CHARGE_UNITS;
    stepDuel(st, { ...IDLE_INPUT, laserCharge: false });
    expect([st.hostileAt, st.hunter.mode]).toEqual([300, HunterMode.Hunt]);
    expect(hostile(st)).toEqual([{ kind: 'hostile', cause: 'laser' }]);
    expect(st.systems[1].shields).toBe(classOf(st, 1).shields.layers - 2);   // it started one below and lost one
    const miss = facing(); miss.ships[0].heading = 192;   // facing away from it
    miss.systems[0].fireHeld = true; miss.systems[0].laserCharge = LASER_CHARGE_UNITS;
    stepDuel(miss, { ...IDLE_INPUT, laserCharge: false });
    expect(miss.events.some((e) => e.kind === 'laser' && e.ship === 0 && !e.hit)).toBe(true);
    expect(miss.hostileAt).toBe(-1);
  });
  it('a crew missile landing on it turns it hostile (cause missile)', () => {
    const st = facing();
    placeMissile(st, 0, { x: -322, y: -300, vx: 0, vy: 0, heading: 64, headingAcc: 0, age: 100 });
    stepDuel(st, UNCREWED_INPUT);
    expect(st.events.some((e) => e.kind === 'missileEnd' && e.ship === 0 && e.target === 1)).toBe(true);
    expect(hostile(st)).toEqual([{ kind: 'hostile', cause: 'missile' }]);
  });
  it('the cause precedence is laser, missile, clock; only the crew\'s hits count; once hostile it stays', () => {
    const both = facing(); both.events = [crewMissileOnHunter, crewLaserHit]; hostilityStep(both, 1);
    expect(hostile(both)).toEqual([{ kind: 'hostile', cause: 'laser' }]);
    const late = facing(); late.tick = HOSTILE_AFTER_TICKS - 1; late.events = [crewMissileOnHunter]; hostilityStep(late, 1);
    expect(hostile(late)).toEqual([{ kind: 'hostile', cause: 'missile' }]);
    const theirs = facing();
    theirs.events = [{ ...crewLaserHit, ship: 1 } as DuelEvent, { ...crewMissileOnHunter, ship: 1, target: 0 } as DuelEvent, { ...crewMissileOnHunter, cause: 'planet', target: -1 } as DuelEvent];
    hostilityStep(theirs, 1);
    expect([theirs.hostileAt, hostile(theirs)]).toEqual([-1, []]);
    const done = facing(); done.hostileAt = 50; done.hunter.mode = HunterMode.Hunt; done.events = [crewLaserHit]; hostilityStep(done, 1);
    expect([done.hostileAt, hostile(done)]).toEqual([50, []]);
    const none = facing(); none.events = [crewLaserHit]; hostilityStep(none, -1);
    expect(none.hostileAt).toBe(-1);   // no hunter slot: nothing to turn
  });
});

describe('Patrol behaviour (spec §4.2)', () => {
  it('hunterThink: weapons off, no lock, charge or launch, no repair; it coasts, and turns and thrusts away from a threat', () => {
    const st = facing(); st.systems[1].rooms[Room.Engines] = 2;
    const head = st.hunter.trailHead;
    expect(hunterThink(st, 1)).toEqual({ helm: true, weapons: false, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false, scanner: true });
    expect(st.hunter.mode).toBe(HunterMode.Patrol);   // a level-2 room starts no repair in Patrol
    expect(st.hunter.trailHead).toBe((head + 1) % (st.hunter.trail.length / 2));   // the trail ring still advances
    Object.assign(st.ships[1], { x: 0, y: -300, vx: 0, vy: 300, heading: 128 });   // diving at the planet
    const away = hunterThink(st, 1).axes;
    expect(away.thrust).toBe(1); expect(away.turn).not.toBe(0);
  });
  it('tickWeapons holds the hunter\'s shield clock at 0 in Patrol and leaves the crew\'s alone', () => {
    const st = facing(), layers = classOf(st, 1).shields.layers;
    st.systems[0].shields = 0;
    for (let k = 0; k < 400; k++) { tickWeapons(st, 0, IDLE_INPUT); tickWeapons(st, 1, UNCREWED_INPUT); }
    expect([st.systems[0].shields, st.systems[1].shields, st.systems[1].shieldClock]).toEqual([1, layers - 1, 0]);
  });
});

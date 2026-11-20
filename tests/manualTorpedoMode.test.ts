// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3, §4, §5): the torpedo's mode and the per-torpedo flag.
// Every round starts AUTO, and the Hunter always. In MANUAL a launch needs no lock and no range, a torpedo lock never
// auto-launches, and the launch copies the mode onto the torpedo, leaving the locks alone. The mode and the flag are
// hashed, cloned and bounded: only the crew is ever MANUAL, and only the crew flies a MANUAL torpedo.
import { describe, expect, it } from 'vitest';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { flattenTactical, hashTactical, TACTICAL_MODULES, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { launchMissile } from '../src/renderer/src/sim/tactical/missiles';
import { beginRockTick, rockAlive } from '../src/renderer/src/sim/tactical/rocks';
import { cloneTactical, createTacticalState, missileOf, placeMissile, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { applyWeaponsInput, canLaunch, IDLE_INPUT, tickWeapons, UNCREWED_INPUT, torpedoInRange } from '../src/renderer/src/sim/tactical/weapons';
import { arena, mover } from './helpers/rockArena';

/** The crew at (0, 1500) nose north and still, no rocks, the Hunter at `enemyAt` (default far off, out of torpedo range),
 *  still, a fresh tick's rock masks, no events. */
function open(enemyAt = { x: 2000, y: 2000 }): TacticalState {
  const st = createTacticalState(5);
  st.rocks.fill(0);   // every seeded rock gone (the seeded grid ignores empty slots)
  beginRockTick(st);
  Object.assign(st.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(st.ships[1], { x: enemyAt.x, y: enemyAt.y, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.events = [];
  return st;
}
/** One weapons tick of the crew: its commands, then its clocks (stepDuel's two weapon calls, nothing else). */
function weaponsTick(st: TacticalState, input = IDLE_INPUT): void { applyWeaponsInput(st, 0, input); tickWeapons(st, 0, input); }
/** The offset of a tactical field in flattenTactical's values. */
const offsetOf = (s: TacticalState, name: string): number => {
  let at = 0;
  for (const m of TACTICAL_MODULES) for (const f of m.fields(s)) { if (f.name === name) return at; at += f.count; }
  throw new Error(`no tactical field ${name}`);
};
const flight = { x: 500, y: 500, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 };

describe('the torpedo mode (spec §3)', () => {
  it('every slot starts AUTO; a free pool entry is not manual; the ship inputs steer nothing', () => {
    const st = createTacticalState(5);
    expect([st.systems[0].torpManual, st.systems[1].torpManual, st.missiles[0].manual, st.missiles[1].manual]).toEqual([false, false, false, false]);
    for (const input of [IDLE_INPUT, UNCREWED_INPUT]) expect(['torpTurn' in input, input.torpHeading]).toEqual([false, -1]);   // W-4 spec §7
    expect(placeMissile(st, 0, flight).manual).toBe(false);   // the default: an AUTO torpedo
  });
  it('the launch copies the mode onto the torpedo; a later toggle does not change it', () => {
    const st = open();
    st.systems[0].torpManual = true;
    launchMissile(st, 0);
    const m = missileOf(st, 0)!;
    expect(m.manual).toBe(true);
    st.systems[0].torpManual = false;
    expect(missileOf(st, 0)!.manual).toBe(true);
    const auto = open({ x: 0, y: 1300 });
    launchMissile(auto, 0);
    auto.systems[0].torpManual = true;
    expect(missileOf(auto, 0)!.manual).toBe(false);
  });
});

describe('the MANUAL launch (spec §3, §5)', () => {
  it('needs no target and no range; still none in flight, a torpedo in the magazine and Weapons below level 2', () => {
    const st = open();
    expect(torpedoInRange(st, 0)).toBe(false);
    expect(canLaunch(st, 0)).toBe(false);   // AUTO: out of range
    st.systems[0].torpManual = true;
    expect(canLaunch(st, 0)).toBe(true);
    expect(canLaunch(st, 0, -1, false)).toBe(false);   // the mode can be given (the runtime judges a queued toggle)
    st.systems[0].magazine = 0;
    expect(canLaunch(st, 0)).toBe(false);
    st.systems[0].magazine = 2; st.systems[0].rooms[Room.Weapons] = 2;
    expect(canLaunch(st, 0)).toBe(false);
    st.systems[0].rooms[Room.Weapons] = 1;
    placeMissile(st, 0, flight, true);
    expect(canLaunch(st, 0)).toBe(false);
  });
  it('a missileLaunch launches it out of range; the locks stay, the impact room is the target room', () => {
    const st = open();
    Object.assign(st.systems[0], { torpManual: true, torpLock: Room.Engines });
    const magazine = st.systems[0].magazine;
    weaponsTick(st, { ...IDLE_INPUT, missileLaunch: true });
    expect(missileOf(st, 0)?.manual).toBe(true);
    expect([st.systems[0].magazine, st.systems[0].missilesLaunched, st.systems[0].torpLock, st.systems[0].torpRoom, st.systems[0].torpRockFlying]).toEqual([magazine - 1, 1, Room.Engines, -1, -1]);
  });
  it('a torpedo lock never auto-launches in MANUAL; in AUTO it does, as today', () => {
    const manual = open({ x: 0, y: 1300 });
    Object.assign(manual.systems[0], { torpManual: true, torpLock: Room.Shields });
    for (let k = 0; k < 10; k++) weaponsTick(manual);
    expect(missileOf(manual, 0)).toBeNull();
    const auto = open({ x: 0, y: 1300 });
    auto.systems[0].torpLock = Room.Shields;
    weaponsTick(auto);
    expect(missileOf(auto, 0)?.manual).toBe(false);
    expect([auto.systems[0].torpLock, auto.systems[0].torpRoom]).toEqual([-1, Room.Shields]);   // the AUTO launch consumes the lock
  });
  it('a MANUAL launch on the tick its stored rock target breaks still launches; the AUTO launch is skipped, as today', () => {
    for (const manual of [true, false]) {
      const st = arena(5, ShipClass.ValkyrnLaser), s = st.systems[0];   // W-4 spec §14.1: the beam's shot, on the laser fit. As rockBlast.test.ts's R1-F3 case: a laser shot in this call breaks the rock
      st.ships[0].heading = 64;   // east, at (0, −2500): the laser is full and targeted
      st.ships[1].active = true; Object.assign(st.ships[1], { x: 0, y: -2200 });
      mover(st, 100, 200, -2500, 0, 0, 12, 2);   // r 12, hp 2: the laser's 2 damage turns it to dust
      s.laserRock = 100; s.torpRock = 100; s.torpManual = manual;
      applyWeaponsInput(st, 0, { ...IDLE_INPUT, missileLaunch: true });
      expect(rockAlive(st, 100), `manual ${manual}`).toBe(false);
      expect([s.torpRock, s.missilesLaunched, missileOf(st, 0)?.manual ?? null], `manual ${manual}`).toEqual(manual ? [-1, 1, true] : [-1, 0, null]);
    }
  });
});

describe('the mode and the flag in the modules (spec §4)', () => {
  it('move the hash, are copied by the clone, and are bounded by the validator', () => {
    const st = createTacticalState(5), shape = createTacticalState(5), base = hashTactical(st);
    st.systems[0].torpManual = true;
    expect(hashTactical(st)).not.toBe(base);
    st.systems[0].torpManual = false;
    expect(hashTactical(st)).toBe(base);
    placeMissile(st, 0, flight, true);
    const withAuto = cloneTactical(st); withAuto.missiles[0].manual = false;
    expect(hashTactical(st)).not.toBe(hashTactical(withAuto));
    const copy = cloneTactical(st);
    expect(copy.missiles[0].manual).toBe(true);
    expect(flattenTactical(copy)).toEqual(flattenTactical(st));
    const values = Array.from(flattenTactical(st));
    expect(validateTacticalValues(shape, values)).toBe(values.length);
    const bad = (name: string, v: number, why: RegExp): void => {
      const x = [...values]; x[offsetOf(st, name)] = v;
      expect(() => validateTacticalValues(shape, x), `${name} = ${v}`).toThrow(why);
    };
    bad('systems.0.torpManual', 2, /out of range/);
    bad('systems.1.torpManual', 1, /only the crew torpedo has a manual mode/);   // the Hunter is always AUTO
    bad('missiles.0.manual', 2, /manual is not 0 or 1/);
    bad('missiles.1.manual', 1, /a free entry holds values/);
    const hunter = createTacticalState(5);
    placeMissile(hunter, 1, flight, true);   // the Hunter never flies a MANUAL torpedo
    expect(() => validateTacticalValues(shape, Array.from(flattenTactical(hunter)))).toThrow(/only the crew flies a manual torpedo/);
  });
});

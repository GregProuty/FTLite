import { describe, expect, it } from 'vitest';
import { createTacticalState, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { applyWeaponsInput, canCharge, canLaunch, IDLE_INPUT, laserEligible, tickWeapons, validLock, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { inArc, lineOfSight } from '../src/renderer/src/sim/tactical/geometry';
import { LASER_ARC_COS, LASER_CHARGE_UNITS, LASER_HOLD_TICKS, LASER_RANGE, MAGAZINE, MAGAZINE_REGEN_TICKS, SHIELD_RATE, SHIELD_RECHARGE_UNITS, SHIP_HULL, LASER_BURST_GAP_TICKS } from '../src/renderer/src/sim/tactical/tuning';
import { HUNTER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { makeHostile } from './helpers/hostile';

/** Crew at (−600, −300) heading east, enemy 300 units east of it: inside the belt, clear of the planet, in arc and range. */
function duel(): TacticalState {
  const st = makeHostile(createTacticalState(5));
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: -300, y: -300, vx: 0, vy: 0, heading: 192 });
  return st;
}
const input = (over: Partial<ShipInput> = {}): ShipInput => ({ ...IDLE_INPUT, ...over });
/** One weapons tick for both ships (no flight): commands, then clocks. */
function tick(st: TacticalState, crew: ShipInput, enemy: ShipInput = IDLE_INPUT): void {
  applyWeaponsInput(st, 0, crew); applyWeaponsInput(st, 1, enemy);
  tickWeapons(st, 0, crew); tickWeapons(st, 1, enemy);
  st.tick++;
}
/** FTL targeting spec §2: the crew's laser charges by itself. Empty it, then run `ticks` ticks of no command. */
function charge(st: TacticalState, ticks: number, over: Partial<ShipInput> = {}): void {
  st.systems[0].laserCharge = 0;
  for (let t = 0; t < ticks; t++) tick(st, input(over));
}
/** Space: one press, which fires a full crew laser. */
const press = (over: Partial<ShipInput> = {}): ShipInput => input({ laserCharge: true, ...over });

describe('laser charge and release (spec §7a, §7 table; FTL targeting spec §2 for the crew)', () => {
  it('the crew laser starts the round full, and charges to full by itself in exactly 240 ticks (4 s) with no press', () => {
    const st = duel(), s = st.systems[0];
    expect(s.laserCharge).toBe(LASER_CHARGE_UNITS);
    expect(st.systems[1].laserCharge).toBe(0);   // the hunter's is unchanged: it charges by holding Fire
    charge(st, 239);
    expect(s.laserCharge).toBeLessThan(LASER_CHARGE_UNITS);
    tick(st, input());
    expect(s.laserCharge).toBe(LASER_CHARGE_UNITS);
    expect(s.fireHeld).toBe(false);
  });
  it('a press at full in arc strips a shield layer', () => {
    const st = duel(), [a, b] = st.systems;
    tick(st, press());
    expect([a.shots, a.laserHits, a.layersStripped]).toEqual([1, 1, 1]);
    expect(b.shields).toBe(1);
    expect(b.hull).toBe(HUNTER_CLASS.hull);
    expect(a.laserCharge).toBe(0);
    expect(st.events).toContainEqual({ kind: 'laser', ship: 0, hit: true, stripped: true, room: -1, x1: -600, y1: -300, x2: -300, y2: -300 });
  });
  it('a press or a release below full does nothing: the charge carries on', () => {
    const st = duel(), a = st.systems[0];
    charge(st, 100);
    const part = a.laserCharge;
    tick(st, press());
    tick(st, input({ laserCharge: false }));
    expect(a.shots).toBe(0);
    expect(a.laserCharge).toBeGreaterThan(part);
  });
  it('with shields down, damages the locked room and costs 2 hull; a room at level 2 takes no more room damage', () => {
    const st = duel(), b = st.systems[1];
    b.shields = 0;
    tick(st, input({ laserLock: Room.Engines, torpLock: null }));
    tick(st, input({ laserLock: -1 }));   // no auto-fire: the presses below fire
    for (let shot = 0; shot < 3; shot++) {
      b.shields = 0; b.shieldClock = 0;
      charge(st, 240);
      tick(st, press());
      for (let t = 0; t < LASER_BURST_GAP_TICKS; t++) tick(st, input());   // the burst's second shot (weapons update spec §1)
    }
    expect(st.systems[0].shots).toBe(6);
    expect(b.rooms[Room.Engines]).toBe(2);
    expect(b.hull).toBe(HUNTER_CLASS.hull - 12);
    expect(st.events.at(-1)).toMatchObject({ kind: 'laser', hit: true, stripped: false, room: Room.Engines });
  });
  it('misses outside the arc, out of range or without line of sight', () => {
    const st = duel(), a = st.systems[0];
    st.ships[1].x = -900;                                   // behind the crew
    expect(laserEligible(st, 0, 1)).toBe(false);
    tick(st, press());
    expect([a.shots, a.laserHits]).toEqual([1, 0]);
    expect(st.systems[1].shields).toBe(2);
    Object.assign(st.ships[1], { x: -600 + 460, y: -300 });  // in arc, out of range
    expect(laserEligible(st, 0, 1)).toBe(false);
  });
  it('a press in range and arc misses when the planet or an asteroid blocks the line of sight (SPIKE: the asteroid takes the shot)', () => {
    const blockers: [string, (st: TacticalState) => [number, number]][] = [
      ['planet', () => [0, 0]],
      ['asteroid', (st) => { const a = st.map.asteroids[0]!; return [a.x, a.y]; }]
    ];
    for (const [name, centre] of blockers) {
      const st = duel(), [a, b] = st.ships, [cx, cy] = centre(st);
      Object.assign(a, { x: cx - 200, y: cy, heading: 64 });           // 400 apart along the x axis, blocker in the middle
      Object.assign(b, { x: cx + 200, y: cy });
      expect(lineOfSight(st, a.x, a.y, b.x, b.y), name).toBe(false);
      expect(inArc(a.heading, b.x - a.x, b.y - a.y, LASER_ARC_COS), name).toBe(true);
      expect(Math.hypot(b.x - a.x, b.y - a.y), name).toBeLessThanOrEqual(LASER_RANGE);
      tick(st, press());
      expect([st.systems[0].shots, st.systems[0].laserHits], name).toEqual([1, 0]);
      expect([st.systems[1].shields, st.systems[1].hull], name).toEqual([2, HUNTER_CLASS.hull]);
      const shot = st.events.find((e) => e.kind === 'laser');
      expect(shot, name).toMatchObject({ kind: 'laser', ship: 0, hit: false });
      if (name === 'planet') expect((shot as { rock?: number }).rock, name).toBeUndefined();
      else { expect((shot as { rock?: number }).rock, name).toBe(0); expect(st.rocks[6], name).toBe(Math.ceil(st.map.asteroids[0]!.r / 10) - 2); expect(st.rocks[0], name).toBe(2); }
    }
  });
  it('a full crew charge never vents (LASER_HOLD_TICKS is the hunter laser only)', () => {
    const st = duel(), a = st.systems[0];
    a.laserTargeted = false;   // Feel-i's SHIELDS opener would auto-fire it: untargeted, a full laser just waits
    for (let t = 0; t < 3 * LASER_HOLD_TICKS; t++) tick(st, input());
    expect([a.laserCharge, a.laserHold, a.shots]).toEqual([LASER_CHARGE_UNITS, 0, 0]);
  });
  it('the hunter laser full charge held 3 s still vents and starts charging again', () => {
    const st = duel(), b = st.systems[1];
    tick(st, input(), input({ laserCharge: true }));
    for (let t = 1; t < 240 + LASER_HOLD_TICKS - 1; t++) tick(st, input());
    expect(b.laserCharge).toBe(LASER_CHARGE_UNITS);
    tick(st, input());
    expect(b.laserCharge).toBe(0);
    tick(st, input());
    expect(b.laserCharge).toBeGreaterThan(0);
  });
  it('Weapons damage stretches the charge time: 6.4 s at level 1; level 2 is off and never charges (owner 2026-11-17)', () => {
    const st = duel(), a = st.systems[0];
    a.rooms[Room.Weapons] = 1;
    charge(st, 383);
    expect(a.laserCharge).toBeLessThan(LASER_CHARGE_UNITS);
    tick(st, input());
    expect(a.laserCharge).toBe(LASER_CHARGE_UNITS);
    const off = duel(), b = off.systems[0];
    b.rooms[Room.Weapons] = 2;
    charge(off, 900);
    expect(b.laserCharge).toBe(0);
  });
  it('an empty Weapons console freezes the charge, and the laser charges again once attended', () => {
    const st = duel(), a = st.systems[0];
    charge(st, 120);
    const part = a.laserCharge;
    tick(st, input({ weapons: false, laserCharge: true }));
    expect(a.shots).toBe(0);
    for (let t = 0; t < 60; t++) tick(st, input({ weapons: false }));
    expect(a.laserCharge).toBe(part);
    tick(st, input());                                      // attended again: it charges by itself
    expect(a.laserCharge).toBeGreaterThan(part);
  });
});

describe('weapon admission (used by the duel step for reject reasons)', () => {
  it('canCharge, canLaunch and validLock agree with what applyWeaponsInput accepts', () => {
    const st = duel(), s = st.systems[0];
    expect([canCharge(st, 0), canLaunch(st, 0)]).toEqual([true, true]);
    s.rooms[Room.Weapons] = 2;
    expect(canLaunch(st, 0)).toBe(false);
    s.rooms[Room.Weapons] = 0; s.magazine = 0;
    expect(canLaunch(st, 0)).toBe(false);
    s.magazine = 1;
    applyWeaponsInput(st, 0, input({ missileLaunch: true }));
    expect([canCharge(st, 0), canLaunch(st, 0)]).toEqual([false, false]);
    expect([validLock(0), validLock(2), validLock(1.5), validLock(-1), validLock(3)]).toEqual([true, true, false, false, false]);
    applyWeaponsInput(st, 0, input({ laserLock: 1.5 }));
    expect(s.lock).toBe(Room.Shields);                                  // a non-integer lock is ignored
  });
});

describe('shields (spec §5)', () => {
  it('recharge one layer per 5 s, and 7.5 s at Shields level 1', () => {
    const st = duel(), b = st.systems[1];
    st.systems[0].laserTargeted = false;   // Feel-i's SHIELDS opener would strip the layers this test times
    b.shields = 0;
    for (let t = 0; t < 300; t++) tick(st, input());
    expect(b.shields).toBe(1);
    b.rooms[Room.Shields] = 1;
    for (let t = 0; t < 449; t++) tick(st, input());
    expect(b.shields).toBe(1);
    tick(st, input());
    expect(b.shields).toBe(2);
  });
  it('Shields level 2 holds a part-charged clock exactly, and repair to level 1 resumes it to the exact tick', () => {
    const st = duel(), b = st.systems[1];
    st.systems[0].laserTargeted = false;   // Feel-i's SHIELDS opener would strip the layer this test times
    b.shields = 1; b.shieldClock = 0;
    for (let t = 0; t < 150; t++) tick(st, input());
    expect(b.shieldClock).toBe(150 * SHIELD_RATE[0]!);                  // 450 of 900
    b.rooms[Room.Shields] = 2;
    for (let t = 0; t < 600; t++) {
      tick(st, input());
      expect(b.shieldClock).toBe(450);
    }
    expect(b.shields).toBe(1);
    b.rooms[Room.Shields] = 1;                                           // repaired one level: resumes at 2 units per tick
    const ticksLeft = (SHIELD_RECHARGE_UNITS - 450) / SHIELD_RATE[1]!;   // 225
    for (let t = 0; t < ticksLeft - 1; t++) tick(st, input());
    expect([b.shields, b.shieldClock]).toEqual([1, SHIELD_RECHARGE_UNITS - SHIELD_RATE[1]!]);
    tick(st, input());
    expect([b.shields, b.shieldClock]).toEqual([2, 0]);
  });
  it('a stripping hit resets the recharge clock', () => {
    const st = duel(), b = st.systems[1];
    b.shields = 1; b.shieldClock = 0;
    charge(st, 240);
    expect(b.shieldClock).toBe(240 * SHIELD_RATE[0]!);
    tick(st, press());
    expect(b.shields).toBe(0);
    expect(b.shieldClock).toBe(SHIELD_RATE[0]);           // reset by the hit, then one tick of recharge
  });
});

describe('magazine (spec §7b)', () => {
  it('regains one missile every 45 s up to the full magazine', () => {
    const st = duel(), a = st.systems[0];
    a.magazine = MAGAZINE - 2;
    for (let t = 0; t < MAGAZINE_REGEN_TICKS; t++) tick(st, input());
    expect(a.magazine).toBe(MAGAZINE - 1);
    for (let t = 0; t < 2 * MAGAZINE_REGEN_TICKS; t++) tick(st, input());
    expect(a.magazine).toBe(MAGAZINE);
    expect(a.magazineClock).toBe(0);
  });
});

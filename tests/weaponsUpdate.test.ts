// The weapons update (docs/superpowers/specs/2026-11-17-weapons-update-design.md §1, §2, §3): the crew's double laser
// (a burst of two shots, LASER_BURST_GAP_TICKS apart, each a full shot of its own), the Hunter's single shot, the
// torpedo's launch range from any bearing, and the online view deriving two beams from two shots in one gap.
import { describe, expect, it } from 'vitest';
import { duelCounters, gapEvents } from '../src/renderer/src/app/duel/onlineSource';
import { CUTTER_CLASS, HUNTER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { hunterThink } from '../src/renderer/src/sim/tactical/hunter';
import { createTacticalState, missileOf, Room, type DuelEvent, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { HUNTER_MISSILE_COOLDOWN_TICKS, LASER_BURST_GAP_TICKS, LASER_CHARGE_UNITS, LASER_HULL, MISSILE_RANGE } from '../src/renderer/src/sim/tactical/tuning';
import { applyWeaponsInput, canLaunch, IDLE_INPUT, tickWeapons, torpedoInRange, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { makeHostile } from './helpers/hostile';
import { todaysCrewWeapons } from './helpers/crewWeapons';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';

/** The crew at (−600, −300) facing east at the enemy 300 units away (the enemy facing west at it): in arc and range. */
function facing(): TacticalState {
  const st = todaysCrewWeapons(makeHostile(createTacticalState(5, 2, ShipClass.ValkyrnLaser)));   // Engineering spike spec §10.3: the beam and torpedo stand on bars (the round starts the beam dark)   // W-4 spec §14.1: the beam's rule, on the laser fit
  st.map = { ...st.map, asteroids: [] };
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: -300, y: -300, vx: 0, vy: 0, heading: 192 });
  return st;
}
const press: ShipInput = { ...IDLE_INPUT, laserCharge: true }, release: ShipInput = { ...IDLE_INPUT, laserCharge: false };
/** One weapons tick of ship i (commands, then the clocks); returns its laser events. */
function tick(st: TacticalState, i: number, input: ShipInput = IDLE_INPUT): Extract<DuelEvent, { kind: 'laser' }>[] {
  st.events = [];
  applyWeaponsInput(st, i, input); tickWeapons(st, i, input);
  st.tick++;
  return st.events.filter((e): e is Extract<DuelEvent, { kind: 'laser' }> => e.kind === 'laser' && e.ship === i);
}
/** Ship i full, then fired: the burst's first shot (the crew by one press, FTL targeting spec §2; the Hunter held and released). */
function fire(st: TacticalState, i: number): Extract<DuelEvent, { kind: 'laser' }>[] {
  st.systems[i]!.laserCharge = LASER_CHARGE_UNITS;
  if (i === 0) return tick(st, i, press);
  st.systems[i]!.fireHeld = true;
  return tick(st, i, release);
}
/** The ticks after the first shot on which ship i fired, over `n` ticks. */
function shotTicks(st: TacticalState, i: number, n: number, input: ShipInput = IDLE_INPUT): number[] {
  const out: number[] = [];
  for (let k = 1; k <= n; k++) if (tick(st, i, input).length > 0) out.push(k);
  return out;
}

describe('the double laser (weapons update spec §1)', () => {
  it('the classes: the Cutter fires 2 shots, the Hunter 1', () => {
    expect([CUTTER_CLASS.slots.laser!.shots, HUNTER_CLASS.slots.laser!.shots]).toEqual([2, 1]);
    expect(CUTTER_CLASS.slots.laser!.burstGapTicks).toBe(12);
  });
  it('a crew release fires two laser events, LASER_BURST_GAP_TICKS apart, both hits, both counted', () => {
    const st = facing(), s = st.systems[0];
    st.systems[1].shields = 0;
    const first = fire(st, 0);
    expect(first.map((e) => [e.hit, e.room])).toEqual([[true, Room.Shields]]);
    expect([s.laserBurst, s.laserBurstClock]).toEqual([1, LASER_BURST_GAP_TICKS]);
    expect(shotTicks(st, 0, 40)).toEqual([LASER_BURST_GAP_TICKS]);
    expect([s.shots, s.laserHits, s.laserBurst, s.laserBurstClock]).toEqual([2, 2, 0, 0]);
    expect(st.systems[1].hull).toBe(HUNTER_CLASS.hull - 2 * LASER_HULL);
  });
  it('the second shot re-checks eligibility: a target that leaves the arc in the gap dodges it', () => {
    const st = facing();
    expect(fire(st, 0)[0]!.hit).toBe(true);
    st.ships[1].y = 100;                                              // now south of the crew, 90° off its nose
    st.events = [];
    for (let k = 1; k < LASER_BURST_GAP_TICKS; k++) expect(tick(st, 0)).toEqual([]);
    const second = tick(st, 0);
    expect(second.map((e) => e.hit)).toEqual([false]);
    expect([st.systems[0].shots, st.systems[0].laserHits]).toEqual([2, 1]);
  });
  it('two shots strip a 2-layer shield; on one layer the second strikes the lock room it reads at its own tick', () => {
    const st = facing(), e = st.systems[1];
    expect(e.shields).toBe(2);
    fire(st, 0); shotTicks(st, 0, LASER_BURST_GAP_TICKS);
    expect([e.shields, e.hull, st.systems[0].layersStripped]).toEqual([0, HUNTER_CLASS.hull, 2]);
    const st2 = facing(), e2 = st2.systems[1];
    e2.shields = 1;
    fire(st2, 0);
    st2.systems[0].lock = Room.Engines;                                 // relocked in the gap
    shotTicks(st2, 0, LASER_BURST_GAP_TICKS);
    expect([e2.shields, e2.rooms[Room.Engines], e2.rooms[Room.Shields], e2.hull]).toEqual([0, 1, 0, HUNTER_CLASS.hull - LASER_HULL]);
  });
  it('Weapons reaching level 2 in the gap drops the pending shot', () => {
    const st = facing();
    fire(st, 0);
    st.systems[0].rooms[Room.Weapons] = 2;
    expect(shotTicks(st, 0, 40)).toEqual([]);
    expect([st.systems[0].shots, st.systems[0].laserBurst]).toEqual([1, 0]);
  });
  it('nothing else cancels it: a torpedo launched in the gap, or the Weapons console left, still lets the second shot go', () => {
    const st = facing();
    fire(st, 0);
    expect(tick(st, 0, { ...IDLE_INPUT, missileLaunch: true })).toEqual([]);
    expect(missileOf(st, 0)).not.toBeNull();
    expect(shotTicks(st, 0, 40, { ...IDLE_INPUT, weapons: false })).toEqual([LASER_BURST_GAP_TICKS - 1]);
  });
  it('the laser does not charge while a shot is pending, then charges again', () => {
    const st = facing();
    fire(st, 0);
    tick(st, 0, press);
    for (let k = 2; k < LASER_BURST_GAP_TICKS; k++) { tick(st, 0); expect(st.systems[0].laserCharge, `tick ${k}`).toBe(0); }
    expect(tick(st, 0)).toHaveLength(1);                                // the second shot, then that tick's clock charges
    expect(st.systems[0].laserCharge).toBe(CUTTER_CLASS.slots.laser!.chargeRate[0]);
  });
  it('the Hunter fires one shot a release', () => {
    const st = facing();
    expect(fire(st, 1)).toHaveLength(1);
    expect([st.systems[1].laserBurst, st.systems[1].laserBurstClock]).toEqual([0, 0]);
    expect(shotTicks(st, 1, 40)).toEqual([]);
  });
  it('online: two shots between two snapshots derive two beams', () => {
    const st = facing(), before = [duelCounters(st, 0), duelCounters(st, 1)];
    fire(st, 0); shotTicks(st, 0, LASER_BURST_GAP_TICKS);
    const beams = gapEvents(before, [null, null], st).filter((e) => e.kind === 'laser' && e.ship === 0);
    expect(beams.map((e) => e.kind === 'laser' && [e.hit, e.stripped])).toEqual([[true, true], [true, true]]);
  });
  it("online: a weak-frequency burst strips both layers with shot 1 and shot 2 strikes the lock room", () => {
    const st = facing();
    st.weakFreq = st.systems[0]!.freq; st.systems[0]!.lock = Room.Engines;
    const before = [duelCounters(st, 0), duelCounters(st, 1)];
    fire(st, 0); shotTicks(st, 0, LASER_BURST_GAP_TICKS);
    expect(st.systems[1]!.rooms[Room.Engines]).toBe(1);
    const beams = gapEvents(before, [null, null], st).filter((e) => e.kind === 'laser' && e.ship === 0);
    expect(beams.map((e) => e.kind === 'laser' && [e.hit, e.stripped, e.room])).toEqual([[true, true, -1], [true, false, Room.Engines]]);
  });
  it("shot 2 strikes the lock commanded on its own tick", () => {
    const st = facing();
    st.systems[0]!.lock = Room.Shields;
    fire(st, 0);
    st.systems[1]!.shields = 0;
    for (let k = 1; k < LASER_BURST_GAP_TICKS; k++) tick(st, 0);
    const shot = tick(st, 0, { ...IDLE_INPUT, laserLock: Room.Engines });
    expect(shot.map((e) => e.room)).toEqual([Room.Engines]);
  });
});

describe('the torpedo range (weapons update spec §2)', () => {
  it('canLaunch is false beyond 360 and true within, from any bearing', () => {
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const a = (bearing * Math.PI) / 180;
      for (const [dist, want] of [[60, true], [MISSILE_RANGE - 1, true], [MISSILE_RANGE + 1, false], [600, false]] as const) {
        const st = facing();
        Object.assign(st.ships[1], { x: -600 + Math.sin(a) * dist, y: -300 - Math.cos(a) * dist });
        expect([bearing, dist, torpedoInRange(st, 0), canLaunch(st, 0)]).toEqual([bearing, dist, want, want]);
      }
    }
  });
  it('the edge: exactly 360 is in range', () => {
    const st = facing();
    st.ships[1].x = -600 + MISSILE_RANGE;
    expect(canLaunch(st, 0)).toBe(true);
  });
  it('an inactive target is never in range', () => {
    const st = facing();
    st.ships[1].active = false;
    expect(canLaunch(st, 0)).toBe(false);
  });
  it('the Hunter launches within 360 and not beyond, whatever its heading', () => {
    const st = facing();
    st.tick = HUNTER_MISSILE_COOLDOWN_TICKS;
    st.ships[1].heading = 0;                                            // the crew 90° off its nose
    expect(hunterThink(st).missileLaunch).toBe(true);
    st.ships[1].x = -600 + MISSILE_RANGE + 1;
    expect(hunterThink(st).missileLaunch).toBe(false);
  });
});

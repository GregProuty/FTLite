// Sci-1 (spec 2026-11-17-science-scans §4.1, §4.2, §4.6) with the owner decision of 2026-11-17 (merge with the Hunter
// grace): one hostility rule. Each round the enemy holds still for 30 s (HOSTILE_AFTER_TICKS from startTick) unless the
// crew fires first, a laser release (hit or miss) or a missile launch; the battle music follows the same hostileAt.
// Merges the Hunter grace's suite (tests/hunterGrace.test.ts) into this one.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuelAudio } from '../src/renderer/src/app/duel/duelAudio';
import type { AudioStatus } from '../src/renderer/src/audio/musicState';
import type { DuelCommand } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { hunterThink } from '../src/renderer/src/sim/tactical/hunter';
import { enemyHostile, hostilityStep, roundTick } from '../src/renderer/src/sim/tactical/science';
import { classOf, createTacticalState, HunterMode, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { HOSTILE_AFTER_TICKS, LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT, tickWeapons, UNCREWED_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { seatDuelCrew } from './helpers/duelSeat';
import { holding, makeHostile } from './helpers/hostile';
import { todaysCrewWeapons } from './helpers/crewWeapons';
import { inTorpedoRange } from './helpers/torpedoRange';
import { missileOf } from '../src/renderer/src/sim/tactical/state';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';

/** Holding: the crew at (−600, −300) facing east at the enemy 300 units east of it (in arc and range), both at rest. */
function facing(): TacticalState {
  const st = todaysCrewWeapons(holding(createTacticalState(5, 2, ShipClass.ValkyrnLaser)));   // W-4 spec §14.1: the beam's rule, on the laser fit. Engineering spike spec §10.3: the beam and torpedo stand on bars (the round starts the beam dark)
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: -300, y: -300, vx: 0, vy: 0, heading: 192 });
  return st;
}
const hostile = (st: TacticalState) => st.events.filter((e) => e.kind === 'hostile');
const speed = (st: TacticalState) => Math.hypot(st.ships[1]!.vx, st.ships[1]!.vy);
const layout = parseShip(hound);
let seq = 0;
const step = (d: DuelState, commands: { player: number; command: DuelCommand }[] = []) =>
  stepDuelTick(d, { held: [], commands: commands.map((c) => ({ runId: 'duel', id: { player: c.player, sequence: ++seq }, requestedTick: d.interior.tick, command: c.command })) });

describe('the 30 s hold (spec §4.1, §4.2; the Hunter grace)', () => {
  it('holds still and fires nothing for 1799 steps, shields full; in the step of rt 1799 it turns (cause clock), then charges', () => {
    const st = holding(createTacticalState(5)), layers = classOf(st, 1).shields.layers, h0 = st.ships[1]!.heading;   // both on their spawn orbits
    expect(HOSTILE_AFTER_TICKS).toBe(1800);
    for (let k = 0; k < HOSTILE_AFTER_TICKS - 1; k++) {
      stepDuel(st, UNCREWED_INPUT);
      expect([st.hostileAt, enemyHostile(st), hostile(st).length], `step ${k}`).toEqual([-1, false, 0]);
    }
    const h = st.systems[1];
    expect([h.shots, h.missilesLaunched, h.laserCharge, h.fireHeld, h.shields, st.ships[1]!.heading]).toEqual([0, 0, 0, false, layers, h0]);
    expect(roundTick(st)).toBe(HOSTILE_AFTER_TICKS - 1);
    stepDuel(st, UNCREWED_INPUT);
    expect([st.hostileAt, enemyHostile(st), st.hunter.mode]).toEqual([HOSTILE_AFTER_TICKS - 1, true, HunterMode.Hunt]);
    expect(hostile(st)).toEqual([{ kind: 'hostile', cause: 'clock' }]);
    stepDuel(st, UNCREWED_INPUT);
    expect(h.fireHeld).toBe(true);   // its first hostile step presses its laser charge
  });
  it('reads rt from startTick, and a state made hostile by hand never pushes the event again', () => {
    const st = holding(createTacticalState(5));
    st.tick = 5000; st.startTick = 5000 - (HOSTILE_AFTER_TICKS - 1);
    stepDuel(st, UNCREWED_INPUT);
    expect(st.hostileAt).toBe(HOSTILE_AFTER_TICKS - 1);
    const done = makeHostile(createTacticalState(5));
    for (let k = 0; k < HOSTILE_AFTER_TICKS + 60; k++) { stepDuel(done, UNCREWED_INPUT); expect(hostile(done)).toEqual([]); }
    expect(done.hostileAt).toBe(0);
  });
  it('hunterThink while holding: no thrust or turn, no lock, charge or launch, the release unscheduled; the trail still advances', () => {
    const st = facing(); st.hunter.fireAt = 99;
    const head = st.hunter.trailHead, input = hunterThink(st, 1);
    expect([input.axes, input.laserLock, input.laserCharge, input.missileLaunch, st.hunter.fireAt]).toEqual([{ turn: 0, thrust: 0 }, null, null, false, -1]);
    expect(st.hunter.trailHead).toBe((head + 1) % (st.hunter.trail.length / 2));
    Object.assign(st.ships[1], { x: 0, y: -300, vx: 0, vy: 300, heading: 128 });   // diving at the planet: it still holds
    expect(hunterThink(st, 1).axes).toEqual({ turn: 0, thrust: 0 });
  });
  it('the hold regains shield layers as usual (no shield hold)', () => {
    const st = facing(), layers = classOf(st, 1).shields.layers;
    st.systems[1].shields = layers - 1; st.systems[1].rooms[Room.Shields] = 0;
    for (let k = 0; k < 400; k++) tickWeapons(st, 1, UNCREWED_INPUT);
    expect(st.systems[1].shields).toBe(layers);
  });
});

describe('the crew firing first ends the hold at once (spec §2.2, §4.1)', () => {
  it('a crew laser release that hits turns it that step (cause laser), one layer stripped', () => {
    const st = facing(); st.tick = 300; st.systems[0].freq = (st.weakFreq + 1) % 3;   // off the weak frequency: one layer
    st.systems[0].fireHeld = true; st.systems[0].laserCharge = LASER_CHARGE_UNITS;
    stepDuel(st, { ...IDLE_INPUT, laserCharge: true });
    expect(st.hostileAt).toBe(300);
    expect(hostile(st)).toEqual([{ kind: 'hostile', cause: 'laser' }]);
    expect(st.systems[1].shields).toBe(classOf(st, 1).shields.layers - 1);
  });
  it('a crew laser release that misses provokes it too (cause laser)', () => {
    const miss = facing(); miss.ships[0].heading = 192;   // facing away from it
    miss.systems[0].fireHeld = true; miss.systems[0].laserCharge = LASER_CHARGE_UNITS;
    stepDuel(miss, { ...IDLE_INPUT, laserCharge: true });
    expect(miss.events.some((e) => e.kind === 'laser' && e.ship === 0 && !e.hit)).toBe(true);
    expect(miss.hostileAt).toBe(0);
    expect(hostile(miss)).toEqual([{ kind: 'hostile', cause: 'laser' }]);
  });
  it('a crew missile launch provokes it at launch (cause missile), before the missile lands', () => {
    const st = facing(); st.tick = 120;
    st.systems[0].laserTargeted = false;   // Feel-i's SHIELDS opener would fire the laser first (cause laser)
    stepDuel(st, { ...IDLE_INPUT, missileLaunch: true });
    expect(st.systems[0].missilesLaunched).toBe(1);
    expect(st.events.some((e) => e.kind === 'missileEnd')).toBe(false);
    expect(st.hostileAt).toBe(120);
    expect(hostile(st)).toEqual([{ kind: 'hostile', cause: 'missile' }]);
  });
  it('laser before missile in one step; only the crew\'s shots count; once hostile it stays; no hunter slot, nothing turns', () => {
    const both = facing(); both.systems[0].shots = 1; both.systems[0].missilesLaunched = 1; hostilityStep(both, 1);
    expect(hostile(both)).toEqual([{ kind: 'hostile', cause: 'laser' }]);
    const theirs = facing(); theirs.systems[1].shots = 3; theirs.systems[1].missilesLaunched = 1; hostilityStep(theirs, 1);
    expect([theirs.hostileAt, hostile(theirs)]).toEqual([-1, []]);
    const done = facing(); done.hostileAt = 50; done.systems[0].shots = 1; hostilityStep(done, 1);
    expect([done.hostileAt, hostile(done)]).toEqual([50, []]);
    const none = facing(); none.systems[0].shots = 1; hostilityStep(none, -1);
    expect(none.hostileAt).toBe(-1);
  });
});

describe('in the duel (the Hunter grace suite, merged)', () => {
  it('a round opens holding: 1800 steps without thrust, turn or fire, hostile from the step of rt 1799, then it charges', () => {
    const d = createDuel(layout, 1);
    try {
      const v0 = speed(d.tactical), h0 = d.tactical.ships[1]!.heading;
      for (let k = 0; k < HOSTILE_AFTER_TICKS - 1; k++) {
        expect(enemyHostile(d.tactical)).toBe(false);
        step(d);
        expect(speed(d.tactical)).toBeLessThanOrEqual(v0);   // no thrust: its spawn drift only slows (gravity aside)
        expect(d.tactical.systems[1]!.fireHeld).toBe(false);
      }
      step(d);
      expect([d.tactical.hostileAt, d.tactical.ships[1]!.heading, d.tactical.systems[1]!.missilesLaunched, d.tactical.systems[1]!.fireHeld]).toEqual([HOSTILE_AFTER_TICKS - 1, h0, 0, false]);
      step(d);
      expect(d.tactical.systems[1]!.fireHeld).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('the crew launching first provokes it at once', () => {
    const d = createDuel(layout, 1);
    try {
      seatDuelCrew(d);
      for (let k = 0; k < 60; k++) step(d);
      expect(enemyHostile(d.tactical)).toBe(false);
      inTorpedoRange(d.tactical);                                       // weapons update spec §2: a launch needs the target within 360
      step(d, [{ player: 1 - d.helmPlayer, command: { kind: 'missileLaunch' } }]);
      expect([d.tactical.systems[0]!.missilesLaunched, enemyHostile(d.tactical)]).toEqual([1, true]);
      expect(d.tactical.events).toContainEqual({ kind: 'hostile', cause: 'missile' });
      step(d);
      // It acts at once: with the crew inside its torpedo range (weapons update spec §2) it launches first, which keeps its
      // laser from charging while that torpedo flies.
      expect(missileOf(d.tactical, 1)).not.toBeNull();
    } finally { disposeDuel(d); }
  });
  it('the combat music follows hostileAt: none through the hold, combat once hostile', () => {
    const d = createDuel(layout, 1), status: AudioStatus[] = [];
    const a = createDuelAudio({ play: () => {}, sounds: () => {}, status: (s) => { status.push(s); } });
    const frame = () => a.frame({ duel: d, events: [], axes: { turn: 0, thrust: 0 }, paused: false, pan: () => 0, me: 0, crew: { health: [100, 100], downed: [false, false] }, dt: 1 / 60, hostile: enemyHostile(d.tactical) });
    try {
      for (let k = 0; k < HOSTILE_AFTER_TICKS - 1; k++) step(d);
      frame();
      expect(status.at(-1)!.mood).not.toBe('combat');
      step(d);
      frame();
      expect(status.at(-1)!.mood).toBe('combat');
    } finally { disposeDuel(d); }
  });
});

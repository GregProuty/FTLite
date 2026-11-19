// Engineering spike spec §10.3, §11 (Amendments 2 and 3): the beam (today's laser: 1/2/2 shots, charge 40/40/60, 75 on
// the overdrive bar) and the torpedo (reload 4/6/8, 10 on the overdrive bar; 3 bars hit 2 Room levels) by the bars the
// officer gave them; 0 bars is off; pew pew's bars do not touch the beam or the torpedo (its own recharge by bars is
// tests/engPewBars.test.ts, the W-1 plug-in); the Hunter unchanged; the scripted gunner
// moves pew pew's bar to the beam.
import { describe, expect, it } from 'vitest';
import { beamShots, canLaunch, IDLE_INPUT, laserOffline, tickWeapons } from '../src/renderer/src/sim/tactical/weapons';
import { MAGAZINE_REGEN_UNITS, WeaponSlot } from '../src/renderer/src/sim/tactical/bars';
import { createTacticalState, placeMissile, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { resolveMissiles } from '../src/renderer/src/sim/tactical/missiles';
import { CUTTER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { requireApplied, CUTTER } from './helpers/scriptedDuel';
import { RockKind, ROCK_STRIDE, rockSlots } from '../src/renderer/src/sim/tactical/rocks';
import { touchesSolid } from '../src/renderer/src/sim/tactical/predict';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';

/** A tactical state whose crew Weapons holds 10 bars (all spendable) split as `power`. */
function powered(power: number[]): TacticalState {
  const st = createTacticalState(1, 2, ShipClass.ValkyrnLaser), sys = st.systems[0];   // W-4 spec §14.1: the beam's rule, on the laser fit
  sys.bars[1] = 10; sys.weaponPower = power;
  return st;
}

describe('engineering spike: the beam and the torpedo by bars (spec §10.3, §11)', () => {
  it('the beam: 0/1/2/2/2 shots; 0 bars is offline; pew pew\'s bars do not change the beam', () => {
    expect([0, 1, 2, 3, 4].map((b) => beamShots(powered([0, b, 0]), 0))).toEqual([0, 1, 2, 2, 2]);
    expect(laserOffline(powered([1, 0, 1]), 0)).toBe(true);              // the round start: the beam is dark
    expect(laserOffline(powered([3, 1, 0]), 0)).toBe(false);
    expect(beamShots(powered([3, 1, 0]), 0)).toBe(beamShots(powered([0, 1, 0]), 0));
  });
  it('the beam charges 40/40/60/75 a tick by its bars', () => {
    for (const [b, rate] of [[1, 40], [2, 40], [3, 60], [4, 75]] as const) {
      const st = powered([0, b, 0]), sys = st.systems[0];
      sys.laserCharge = 0; sys.laserTargeted = false;
      tickWeapons(st, 0, IDLE_INPUT);
      expect(sys.laserCharge, `${b} bars`).toBe(rate);
    }
  });
  it('the torpedo reloads 4/6/8/10 a tick on the 10800 clock; at 0 bars it neither launches nor reloads', () => {
    for (const [b, rate] of [[1, 4], [2, 6], [3, 8], [4, 10]] as const) {
      const st = powered([0, 0, b]), sys = st.systems[0];
      sys.magazine -= 1; sys.magazineClock = 0;
      tickWeapons(st, 0, IDLE_INPUT);
      expect(sys.magazineClock, `${b} bars`).toBe(rate);
    }
    const st = powered([1, 1, 0]), sys = st.systems[0];
    sys.magazine -= 1; sys.magazineClock = 0;
    for (let k = 0; k < 3000; k++) tickWeapons(st, 0, IDLE_INPUT);
    expect(sys.magazineClock).toBe(0); expect(canLaunch(st, 0)).toBe(false);
    expect(MAGAZINE_REGEN_UNITS).toBe(10800);
  });
  it('one torpedo bar regains a missile in exactly 2700 ticks: none after 2699, one on the next (spec §8)', () => {
    const st = powered([0, 0, 1]), sys = st.systems[0];
    sys.magazine -= 1; sys.magazineClock = 0; const before = sys.magazine;
    for (let k = 0; k < 2699; k++) tickWeapons(st, 0, IDLE_INPUT);
    expect(sys.magazine).toBe(before);
    tickWeapons(st, 0, IDLE_INPUT);
    expect(sys.magazine).toBe(before + 1);
  });
  it('a crew torpedo on 3 bars raises the struck Room 2 levels', () => {
    const st = powered([0, 0, 3]), hs = st.systems[0];
    for (let k = 0; k < rockSlots(st); k++) st.rocks[k * ROCK_STRIDE] = RockKind.Gone;   // no rock can take the torpedo first
    st.ships[0].x = -600; st.ships[0].y = -300; st.ships[1].x = -300; st.ships[1].y = -300;
    expect(touchesSolid(st, st.ships[1].x, st.ships[1].y, 30), 'the placement must be clear of the planet and rocks').toBe(false);
    hs.torpRoom = Room.Engines;
    placeMissile(st, 0, { x: st.ships[1].x, y: st.ships[1].y, vx: 0, vy: 0, heading: 64, headingAcc: 0, age: 30 });
    resolveMissiles(st);
    expect(st.systems[1].rooms[Room.Engines]).toBe(2);
  });
  it('the Hunter keeps today\'s laser', () => {
    const st = createTacticalState(1);
    expect(beamShots(st, 1)).toBe(1);
    st.systems[1].rooms[Room.Weapons] = 2; expect(laserOffline(st, 1)).toBe(true);
    expect(CUTTER_CLASS.slots.laser!.shots).toBe(2);                     // the class keeps 2; the crew's bars decide
  });
  it('the scripted gunner moves pew pew\'s bar to the beam on its first seated tick, and every command applies', () => {
    const d = createDuel(CUTTER, 1, 0, 2, ShipClass.ValkyrnLaser), pair = createScriptedPair(1);   // W-4 spec §14.1: the beam's rule, on the laser fit
    try {
      for (let k = 0; k < 1500 && d.tactical.systems[0].weaponPower[WeaponSlot.Beam] === 0; k++) {
        const input = scriptedInput(pair, d);
        requireApplied(1, d, input, stepDuelTick(d, input));
      }
      expect(d.tactical.systems[0].weaponPower).toEqual([0, 1, 1]);
    } finally { disposeDuel(d); }
  });
});

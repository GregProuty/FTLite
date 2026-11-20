// Engineering spike spec §11, merge decision 1a (the W-1 plug-in): the crew pew pew's recharge follows its trimmed bars,
// PEW_TICKS_BY_BARS = [0, 60, 45, 30] ticks a third, 24 on the overdrive 4th bar; at 0 bars it neither refills nor fires
// (the duel step answers `unavailable`, the console PEW UNPOWERED); the Hunter keeps its fixed HUNTER_PEW_RECHARGE_TICKS.
import { describe, expect, it } from 'vitest';
import { PEW_TICKS_BY_BARS, WeaponSlot } from '../src/renderer/src/sim/tactical/bars';
import { pewThird, PEW } from '../src/renderer/src/sim/tactical/defs';
import { firePew, pewFull, pewGain, pewPowered, pewReady } from '../src/renderer/src/sim/tactical/pew';
import { createTacticalState, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { HUNTER_PEW_RECHARGE_TICKS, PEW_CHARGE_SCALE, PEW_SHOTS } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT, tickWeapons } from '../src/renderer/src/sim/tactical/weapons';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { sitDown } from '../src/renderer/src/sim/stations';
import { refusal, weaponsOffline } from '../src/renderer/src/render/duel/situationModel';
import { CUTTER } from './helpers/scriptedDuel';

/** A tactical state whose crew Weapons holds 10 bars (all spendable, the overdrive bar too) and pew pew `bars`. */
function pewAt(bars: number): TacticalState {
  const st = createTacticalState(1), sys = st.systems[0];
  sys.bars[1] = 10; sys.weaponPower = [bars, 0, 0]; sys.pewCharge = 0;
  return st;
}
/** Ticks of the crew's weapon clocks until its pew holds `thirds` thirds (−1 if not within 1000). */
function ticksTo(st: TacticalState, thirds: number): number {
  for (let k = 1; k <= 1000; k++) {
    tickWeapons(st, 0, IDLE_INPUT);
    if (st.systems[0].pewCharge >= thirds * pewThird(PEW)) return k;
  }
  return -1;
}

describe('the pew pew bars set its recharge (spec §11)', () => {
  it('the table, and every crew rate is a whole number of charge units a tick', () => {
    expect(PEW_TICKS_BY_BARS).toEqual([0, 60, 45, 30, 24]);
    expect(pewThird(PEW)).toBe(60 * PEW_CHARGE_SCALE);
    expect([0, 1, 2, 3, 4].map((b) => pewGain(pewAt(b), 0))).toEqual([0, 6, 8, 12, 15]);
  });
  it('one third after 60 / 45 / 30 ticks at 1 / 2 / 3 bars, 24 on the overdrive bar; a full charge in three times that', () => {
    expect([1, 2, 3, 4].map((b) => ticksTo(pewAt(b), 1))).toEqual([60, 45, 30, 24]);
    expect([1, 2, 3, 4].map((b) => ticksTo(pewAt(b), PEW_SHOTS))).toEqual([180, 135, 90, 72]);
    const st = pewAt(4);
    for (let k = 0; k < 200; k++) tickWeapons(st, 0, IDLE_INPUT);
    expect(st.systems[0].pewCharge).toBe(pewFull(PEW));   // capped at full
  });
  it('0 bars: no recharge, and a stored third cannot fire', () => {
    const st = pewAt(0);
    expect(ticksTo(st, 1)).toBe(-1);
    expect(st.systems[0].pewCharge).toBe(0);
    st.systems[0].pewCharge = pewFull(PEW);
    expect([pewPowered(st, 0), pewReady(st, 0), firePew(st, 0, st.ships[0].heading * 256)]).toEqual([false, false, false]);
    expect(st.pew.every((r) => !r.active)).toBe(true);
  });
  it('the trimmed bars: a level-2 Weapons Room gates the pew at once; without the overdrive bar a 4th bar is trimmed to 3', () => {
    const st = pewAt(3);
    st.systems[0].rooms[Room.Weapons] = 2;
    expect([pewGain(st, 0), pewPowered(st, 0)]).toEqual([0, false]);
    const nine = pewAt(4);
    nine.systems[0].bars[1] = 9;
    expect(pewGain(nine, 0)).toBe(12);   // 3 bars' rate
  });
  it('the Hunter keeps its fixed HUNTER_PEW_RECHARGE_TICKS, whatever the crew bars', () => {
    for (const b of [0, 4]) {
      const st = pewAt(b);
      st.systems[1].pewCharge = 0;
      let at = -1;
      for (let k = 1; k <= 300 && at < 0; k++) { tickWeapons(st, 1, IDLE_INPUT); if (pewReady(st, 1)) at = k; }
      expect(at).toBe(HUNTER_PEW_RECHARGE_TICKS);
    }
  });
});

describe('0 pew pew bars through the duel step and the console', () => {
  let seq = 0;
  const cmd = (d: DuelState, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player: 1, sequence: ++seq }, requestedTick: d.interior.tick, command });
  it('a full pew with 0 bars is refused as unavailable and reads PEW UNPOWERED; WEAPONS OFFLINE only with all three dark', () => {
    const d = createDuel(CUTTER, 5);
    try {
      sitDown(d.interior, 1, d.weapons);
      const sys = d.tactical.systems[0];
      sys.weaponPower = [0, 1, 1];
      expect(refusal(d, 'pew')).toBe('PEW UNPOWERED');
      expect(weaponsOffline(d.tactical)).toBe(false);
      const r = stepDuelTick(d, { held: [{ moveX: 0, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: false }], commands: [cmd(d, { kind: 'pewFire' })] });
      expect(r.map((x) => x.reason ?? x.status)).toEqual(['unavailable']);
      expect(sys.pewShots).toBe(0);
      sys.weaponPower = [0, 0, 0];
      expect([weaponsOffline(d.tactical), refusal(d, 'pew')]).toEqual([true, 'WEAPONS OFFLINE']);
      sys.weaponPower = [1, 0, 0];   // pew pew alone powered: the Weapons are not offline
      expect([weaponsOffline(d.tactical), refusal(d, 'pew')]).toEqual([false, null]);
      expect(sys.weaponPower[WeaponSlot.Pew]).toBe(1);
    } finally { disposeDuel(d); }
  });
});

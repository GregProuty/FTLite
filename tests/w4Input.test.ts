// W-4 spec §9: the Hound's Weapons keys: 1/2/3 and Num 1-3 select (selectTo), A/D press edges select with wrap, 4/5/6
// tune the guns (gunFreqKeyTo), 3/4/5 stay the laser fit's (freqKeyTo), the console's buttons write freqTo; 1/2 are not
// picked up at the Hound's seat; W/S at a range end refuse; the autocannon's dead trigger says why.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuelKeyboard, GUN_FREQ_CODES, PRESS_CODES, WEAPON_SELECT_CODES } from '../src/renderer/src/app/duel/input';
import { createContactController } from '../src/renderer/src/app/duel/contactController';
import { GUARDED_CODES } from '../src/renderer/src/app/web/pageGuards';
import { houndWeaponsSeat } from '../src/renderer/src/app/duel/controls';
import { createMapRequests } from '../src/renderer/src/app/duel/mapRequests';
import { autocannonRateText, gunFreqRequest, laserFreqKey, nextWeaponSel, powerDelta, weaponsSeatHeld } from '../src/renderer/src/app/duel/weaponsSeat';
import { weaponPowerRefusal } from '../src/renderer/src/sim/duel/weaponSlots';
import { refusal } from '../src/renderer/src/render/duel/situationModel';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { emptyPresses } from '../src/renderer/src/app/duel/input';
import { createSeatedDuel } from './helpers/duelSeat';

const CUTTER = parseShip(cutter);
function target() {
  const fns: Record<string, ((e: unknown) => void)[]> = {};
  return {
    addEventListener(type: string, fn: (e: never) => void) { (fns[type] ??= []).push(fn as (e: unknown) => void); },
    removeEventListener() {},
    fire(type: string, e: unknown) { for (const f of fns[type] ?? []) f(e); }
  };
}
const key = (code: string, repeat = false) => ({ code, repeat, preventDefault() {} });

describe('the digit keys split by class (W-4 spec §9)', () => {
  it('the tables', () => {
    expect(GUN_FREQ_CODES).toEqual({ Digit4: 0, Digit5: 1, Digit6: 2 });
    expect(WEAPON_SELECT_CODES).toEqual({ Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 });
    expect([PRESS_CODES.KeyA, PRESS_CODES.KeyD]).toEqual(['selectPrev', 'selectNext']);
    for (const c of ['Digit6', 'Numpad1', 'Numpad2', 'Numpad3']) expect(GUARDED_CODES.has(c)).toBe(true);
  });
  it('3 sets selectTo 2 and freqKeyTo 0, never freqTo; 4 sets gunFreqKeyTo 0 and freqKeyTo 1; 6 gunFreqKeyTo 2; repeats count for nothing', () => {
    const t = target(), kb = createDuelKeyboard(t);
    t.fire('keydown', key('Digit3'));
    expect(kb.sample()).toMatchObject({ selectTo: 2, freqKeyTo: 0, gunFreqKeyTo: null, freqTo: null });
    t.fire('keydown', key('Digit4'));
    expect(kb.sample()).toMatchObject({ selectTo: null, freqKeyTo: 1, gunFreqKeyTo: 0 });
    t.fire('keydown', key('Digit6')); t.fire('keydown', key('Numpad2'));
    expect(kb.sample()).toMatchObject({ gunFreqKeyTo: 2, selectTo: 1 });
    t.fire('keydown', key('Digit1', true));
    expect(kb.sample().selectTo).toBeNull();
    kb.ui.frequency(1); kb.ui.select?.(2);
    expect(kb.sample()).toMatchObject({ freqTo: 1, selectTo: 2 });
    t.fire('keydown', key('Digit2')); kb.clearUi(); expect(kb.sample().selectTo).toBeNull();
    t.fire('keydown', key('Digit5')); kb.clear(); expect(kb.sample()).toMatchObject({ freqKeyTo: null, gunFreqKeyTo: null });
  });
  it('A and D are press edges (and still held for walking)', () => {
    const t = target(), kb = createDuelKeyboard(t);
    t.fire('keydown', key('KeyA'));
    const s = kb.sample();
    expect([s.presses.selectPrev, s.presses.selectNext, s.moveX]).toEqual([1, 0, -1]);
  });
  it('the frequency each class reads', () => {
    expect(gunFreqRequest(0, { gunFreqKeyTo: 2, freqTo: null })).toBe(2);
    expect(gunFreqRequest(0, { gunFreqKeyTo: null, freqTo: 1 })).toBe(1);
    expect(gunFreqRequest(1, { gunFreqKeyTo: 1 })).toBeNull();
    expect(laserFreqKey({ freqKeyTo: 2, freqTo: 0 })).toBe(2);
    expect(laserFreqKey({ freqTo: 0 })).toBe(0);
  });
});

describe('selection, power and the trigger (W-4 spec §9)', () => {
  it('selectTo wins; A/D step with wrap; while a MANUAL torpedo flies A/D do not select (W-4a, spec §19.1)', () => {
    const k = (over: Partial<{ selectTo: number | null; selectPrev: number; selectNext: number }>) => ({ selectTo: over.selectTo ?? null, presses: { ...emptyPresses(), selectPrev: over.selectPrev ?? 0, selectNext: over.selectNext ?? 0 } });
    expect(nextWeaponSel(0, k({ selectPrev: 1 }), false)).toBe(2);
    expect(nextWeaponSel(2, k({ selectNext: 1 }), false)).toBe(0);
    expect(nextWeaponSel(0, k({ selectNext: 2 }), false)).toBe(2);
    expect(nextWeaponSel(1, k({ selectTo: 0, selectNext: 1 }), false)).toBe(0);
    expect(nextWeaponSel(1, k({ selectNext: 1 }), true)).toBe(1);
    expect(nextWeaponSel(1, k({ selectTo: 2 }), true)).toBe(2);
  });
  it('W/S give a delta; the held fields send gunHeld only with the autocannon selected', () => {
    expect(powerDelta({ ...emptyPresses(), throttleUp: 1 })).toBe(1);
    expect(powerDelta({ ...emptyPresses(), throttleDown: 2 })).toBe(-2);
    expect(weaponsSeatHeld(1, true)).toEqual({ weaponSel: 1, gunHeld: true });
    expect(weaponsSeatHeld(0, true)).toEqual({ weaponSel: 0 });
    expect(weaponsSeatHeld(1, false)).toEqual({ weaponSel: 1 });
  });
  it('the trigger request holds until changed', () => {
    const r = createMapRequests();
    expect(r.triggerHeld()).toBe(false);
    r.trigger(true); expect(r.triggerHeld()).toBe(true); expect(r.triggerHeld()).toBe(true);
    r.trigger(false); expect(r.triggerHeld()).toBe(false);
  });
  it('the rate text: rounds a second at an interval, OFF at 0', () => {
    expect([10, 8, 6, 5, 4, 0].map(autocannonRateText)).toEqual(['6/S', '7.5/S', '10/S', '12/S', '15/S', 'OFF']);
  });
});

describe("the Hound's Weapons seat and its refusals (W-4 spec §9)", () => {
  it('houndWeaponsSeat: the Hound\'s Weapons attendant only (not the Helm, not the laser fit)', () => {
    const d = createSeatedDuel(CUTTER, 5), fit = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.ValkyrnLaser);
    try {
      expect([houndWeaponsSeat(d, 1 - d.helmPlayer), houndWeaponsSeat(d, d.helmPlayer), houndWeaponsSeat(fit, 1 - fit.helmPlayer)]).toEqual([true, false, false]);
    } finally { disposeDuel(d); disposeDuel(fit); }
  });
  it('W/S at a range end: NO BAR at 0, NO FREE BAR with none spare, MAX at 3; else null', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const s = d.tactical.systems[0];
      expect([weaponPowerRefusal(d, 1, -1), weaponPowerRefusal(d, 1, 1)]).toEqual(['NO BAR', 'NO FREE BAR']);   // 1 / 0 / 1 on 2 bars
      s.bars[1] = 6; s.weaponPower = [1, 3, 1];
      expect([weaponPowerRefusal(d, 1, 1), weaponPowerRefusal(d, 0, 1), weaponPowerRefusal(d, 1, -1)]).toEqual(['MAX', null, null]);
    } finally { disposeDuel(d); }
  });
  it('the autocannon\'s dead trigger: NO POWER at 0 bars, OVERHEAT while locked, WEAPONS OFFLINE at level 2', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const s = d.tactical.systems[0];
      expect(refusal(d, 'autocannon')).toBe('NO POWER');
      s.bars[1] = 3; s.weaponPower = [1, 1, 1];
      expect(refusal(d, 'autocannon')).toBeNull();
      s.gunLocked = true; expect(refusal(d, 'autocannon')).toBe('OVERHEAT');
      s.rooms[0] = 2; expect(refusal(d, 'autocannon')).toBe('WEAPONS OFFLINE');
    } finally { disposeDuel(d); }
  });
  it('1 and 2 are not picked up at the Hound\'s Weapons seat; the laser fit\'s still are', () => {
    const c = createContactController();
    c.sync({ shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0, laser: false });
    expect([c.intercept('Digit1'), c.intercept('Digit2')]).toEqual([false, false]);
    const fit = createContactController();
    fit.sync({ shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0, laser: true });
    expect(fit.intercept('Digit2')).toBe(true);
  });
});

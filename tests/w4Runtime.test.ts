// W-4 spec §9 (W-4a): Single player at the Hound's Weapons seat: 1/2/3 and A/D select (wrapping), W/S send weaponPower on
// the selection (and refuse at a range end), 4/5/6 send laserFrequency and 3 sends none, LMB by selection (pewFire, nothing
// on the autocannon's click, missileLaunch on the torpedo), the held trigger sends gunHeld only with the autocannon
// selected, Space queues nothing, E/Q step the torpedo's room; the laser fit's Weapons seat keeps Z, Space and 3/4/5.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { emptyPresses, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { createContactController } from '../src/renderer/src/app/duel/contactController';
import { sitDown, standUp } from '../src/renderer/src/sim/stations';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { holdInSight } from './helpers/sensorSight';

const layout = parseShip(cutter), vp = { w: 1280, h: 720 };
const ONE_FRAME = { presses: emptyPresses(), freqTo: null, freqKeyTo: null, gunFreqKeyTo: null, selectTo: null } as const;

function rig(cls?: number) {
  let now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() }, pew: number | null = null, trigger = false;
  const tasks: { at: number; cb: () => void }[] = [], contact = createContactController();
  const rt = createDuelRuntime({
    now: () => now, seed: 5, viewport: vp, layout, ...(cls !== undefined ? { cls } : {}),
    scheduler: { schedule(delay, cb) { const t = { at: now + delay, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    sampleKeys: () => { const k = keys; keys = { ...k, ...ONE_FRAME }; return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
    takeContactRequests: () => contact.takeRequests(),
    takePew: () => { const p = pew; pew = null; return p; },
    triggerHeld: () => trigger
  });
  /** A frame, one tick of wall time, a frame: what the first frame queued is applied on exactly that tick. */
  const tick = (): void => { holdInSight(rt.duel.tactical); rt.frame(1 / 60); now += 1000 / 60; tasks.sort((a, b) => a.at - b.at); while (tasks[0] && tasks[0].at <= now) tasks.shift()!.cb(); rt.frame(1 / 60); };
  const press = (action: KeyAction, n = 1): void => { keys = { ...keys, presses: { ...keys.presses, [action]: keys.presses[action] + n } }; };
  const set = (over: Partial<KeySample>): void => { keys = { ...keys, ...over }; };
  const click = (): void => { pew = 0; };   // a left click on the open map (its bearing is ignored on the Hound)
  const hold = (on: boolean): void => { trigger = on; };
  const statuses = (): string[] => rt.lastResults().map((r) => `${r.status}${'reason' in r && r.reason ? `:${r.reason}` : ''}`);
  tick();   // the solo start: player 1 goes away on tick 0
  const d = rt.duel;
  sitDown(d.interior, 0, d.weapons); tick();
  return { rt, d, tick, press, set, click, hold, statuses };
}

describe("Single player at the Hound's Weapons seat (W-4 spec §9)", () => {
  it('1/2/3 select; A/D step with wrap; the held frame carries weaponSel', () => {
    const r = rig();
    try {
      expect(r.rt.held()[0]!.weaponSel).toBe(0);   // a sit starts on pew pew
      r.set({ selectTo: 1 }); r.tick();
      expect(r.rt.held()[0]!.weaponSel).toBe(1);
      r.press('selectNext'); r.tick(); expect(r.rt.held()[0]!.weaponSel).toBe(2);
      r.press('selectNext'); r.tick(); expect(r.rt.held()[0]!.weaponSel).toBe(0);   // wraps
      r.press('selectPrev'); r.tick(); expect(r.rt.held()[0]!.weaponSel).toBe(2);
    } finally { r.rt.dispose(); }
  });
  it('W/S send weaponPower on the selection; at a range end the command still goes and power is refused NO FREE BAR', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.set({ selectTo: 1 }); r.press('throttleUp'); r.tick();   // the start's 2 Weapons bars are spent (1 / 0 / 1)
      expect(r.statuses()).toEqual(['rejected:unavailable']);
      expect(r.rt.takeRefusals()).toContainEqual({ control: 'power', reason: 'NO FREE BAR' });
      r.set({ selectTo: 0 }); r.press('throttleDown'); r.tick();
      r.set({ selectTo: 1 }); r.press('throttleUp'); r.tick();
      expect([...sys.weaponPower]).toEqual([0, 1, 1]);
    } finally { r.rt.dispose(); }
  });
  it('4 / 5 / 6 send laserFrequency 0 / 1 / 2; 3 sends none (it selects the torpedo)', () => {
    const r = rig(), t = r.d.tactical;
    try {
      r.set({ gunFreqKeyTo: 2 }); r.tick(); expect(t.systems[0].freq).toBe(2);
      r.set({ gunFreqKeyTo: 1 }); r.tick(); expect(t.systems[0].freq).toBe(1);
      r.set({ freqKeyTo: 0, selectTo: 2 }); r.tick();   // Digit3 sets both fields (the keyboard does not know the class)
      expect([t.systems[0].freq, r.statuses(), r.rt.held()[0]!.weaponSel]).toEqual([1, [], 2]);
    } finally { r.rt.dispose(); }
  });
  it("LMB: pewFire with pew pew selected, nothing on the autocannon's click, missileLaunch with the torpedo; Space queues nothing", () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.press('fireDown'); r.tick(); expect(r.statuses()).toEqual([]);   // Space at the Hound's Weapons seat
      r.click(); r.tick(); expect([sys.pewShots, r.statuses()]).toEqual([1, ['applied']]);
      r.set({ selectTo: 1 }); r.tick(); r.click(); r.tick(); expect(r.statuses()).toEqual([]);   // the autocannon fires on the held trigger, not a click
      r.set({ selectTo: 2 }); r.press('torpMode'); r.tick();   // MANUAL: no lock or range needed
      r.click(); r.tick(); expect(sys.missilesLaunched).toBe(1);
    } finally { r.rt.dispose(); }
  });
  it('the held trigger sends gunHeld only with the autocannon selected, and a dead trigger refuses NO POWER on its press edge', () => {
    const r = rig();
    try {
      r.hold(true); r.tick();
      expect(r.rt.held()[0]!.gunHeld).toBeUndefined();   // pew pew selected
      r.hold(false); r.set({ selectTo: 1 }); r.tick(); r.rt.takeRefusals();
      r.hold(true); r.tick();
      expect(r.rt.held()[0]!.gunHeld).toBe(true);
      expect(r.rt.takeRefusals()).toContainEqual({ control: 'autocannon', reason: 'NO POWER' });   // 0 autocannon bars at the start
      r.tick(); expect(r.rt.takeRefusals()).toEqual([]);   // only on the press edge
    } finally { r.rt.dispose(); }
  });
  it("E / Q step the torpedo's target room (no laserLock)", () => {
    const r = rig();
    try {
      r.press('interact'); r.tick();
      expect(r.statuses()).toEqual(['applied']);   // a torpLock (a laserLock would be rejected unavailable on the Hound)
      r.press('prevLock'); r.tick();
      expect(r.statuses()).toEqual(['applied']);
    } finally { r.rt.dispose(); }
  });
  it("A/D's select presses do nothing off the Hound's Weapons seat (on foot, or the laser fit's Weapons seat)", () => {
    const r = rig(), fit = rig(ShipClass.ValkyrnLaser);
    try {
      r.set({ selectTo: 1 }); r.tick(); expect(r.rt.weaponSel()).toBe(1);
      standUp(r.d.interior, 0);   // on foot: the selection resets (a sit starts on pew pew, Decision 11)
      r.press('selectNext'); r.press('selectPrev', 2); r.tick();
      expect([r.statuses(), r.rt.weaponSel(), r.rt.held()[0]!.weaponSel]).toEqual([[], 0, undefined]);
      fit.press('selectNext'); fit.tick();
      expect([fit.statuses(), fit.rt.weaponSel(), fit.rt.held()[0]!.weaponSel]).toEqual([[], 0, undefined]);
    } finally { r.rt.dispose(); fit.rt.dispose(); }
  });
  it("the laser fit at the Weapons seat keeps today's keys: Space laserCharge, 3/4/5 laserFrequency, Z laserMode", () => {
    const r = rig(ShipClass.ValkyrnLaser), sys = r.d.tactical.systems[0];
    try {
      r.set({ freqKeyTo: 2, gunFreqKeyTo: 1 }); r.tick(); expect(sys.freq).toBe(2);   // the laser class reads freqKeyTo
      r.press('laserMode'); r.tick(); expect(sys.laserManual).toBe(true);
      r.press('laserMode'); r.tick(); r.press('fireDown'); r.tick();
      expect(r.statuses()).toHaveLength(1);   // laserCharge (its status depends on the charge)
    } finally { r.rt.dispose(); }
  });
});

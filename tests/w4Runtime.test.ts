// W-4 spec §9 (W-4a): Single player at the Hound's Weapons seat: 1/2/3 and A/D select (wrapping), W/S send weaponPower on
// the selection (and refuse at a range end), 4/5/6 send laserFrequency and 3 sends none, LMB by selection (pewFire, nothing
// on the autocannon's click, missileLaunch on the torpedo), the held trigger sends gunHeld only with the autocannon
// selected, Space queues nothing, E/Q step the target room (W-4 amendment §3.6); the laser fit's Weapons seat keeps Z, Space and 3/4/5.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuelKeyboard, emptyPresses, type DuelKeyboard, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { createContactController } from '../src/renderer/src/app/duel/contactController';
import { sitDown, standUp } from '../src/renderer/src/sim/stations';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { removeMissile } from '../src/renderer/src/sim/tactical/state';
import { DuelSystem } from '../src/renderer/src/sim/tactical/bars';
import { holdInSight } from './helpers/sensorSight';

const layout = parseShip(cutter), vp = { w: 1280, h: 720 };
const ONE_FRAME = { presses: emptyPresses(), freqTo: null, freqKeyTo: null, gunFreqKeyTo: null, selectTo: null, modeTaps: [0, 0, 0], lockTo: null, torpTo: null } as const;

function rig(cls?: number, kb?: DuelKeyboard) {   // kb: sample a real keyboard instead of the stub keys
  let now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() }, pew: number | null = null, trigger = false, left = false, reticle: number | null = null, torpAt: number | null = null;
  const tasks: { at: number; cb: () => void }[] = [], contact = createContactController();
  const rt = createDuelRuntime({
    now: () => now, seed: 5, viewport: vp, layout, ...(cls !== undefined ? { cls } : {}),
    scheduler: { schedule(delay, cb) { const t = { at: now + delay, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    sampleKeys: () => { if (kb) return kb.sample(); const k = keys; keys = { ...k, ...ONE_FRAME }; return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
    takeContactRequests: () => contact.takeRequests(),
    takePew: () => { const p = pew; pew = null; return p; },
    triggerHeld: () => trigger,
    gunHeld: () => left,   // W-4 spec §7: the raw left button (duelMode's pointer.leftHeld()); at this seat only flightFrame reads it
    takeTorpHeading: () => { const v = torpAt; torpAt = null; return v; },   // the map's LMB torpedo steer, one frame's bearing
    reticleAim: () => reticle
  });
  /** A frame, one tick of wall time, a frame: what the first frame queued is applied on exactly that tick. */
  const tick = (): void => { holdInSight(rt.duel.tactical); rt.frame(1 / 60); now += 1000 / 60; tasks.sort((a, b) => a.at - b.at); while (tasks[0] && tasks[0].at <= now) tasks.shift()!.cb(); rt.frame(1 / 60); };
  const press = (action: KeyAction, n = 1): void => { keys = { ...keys, presses: { ...keys.presses, [action]: keys.presses[action] + n } }; };
  const set = (over: Partial<KeySample>): void => { keys = { ...keys, ...over }; };
  const click = (): void => { pew = 0; };   // a left click on the open map (its bearing is ignored on the Hound)
  const hold = (on: boolean): void => { trigger = on; left = on; };   // the button down on the open map
  const holdOff = (on: boolean): void => { left = on; trigger = false; };   // W-4 spec §7: the button down over a console block
  const steerTo = (h: number): void => { torpAt = h; };   // W-4 spec §7: one frame's LMB steer bearing
  const aim = (v: number | null): void => { reticle = v; };
  const tap = (slot: 0 | 1 | 2): void => { const m = [...(keys.modeTaps ?? [0, 0, 0])]; m[slot] = (m[slot] ?? 0) + 1; keys = { ...keys, modeTaps: m }; };
  const statuses = (): string[] => rt.lastResults().map((r) => `${r.status}${'reason' in r && r.reason ? `:${r.reason}` : ''}`);
  tick();   // the solo start: player 1 goes away on tick 0
  const d = rt.duel;
  sitDown(d.interior, 0, d.weapons); tick();
  return { rt, d, tick, press, set, click, hold, holdOff, steerTo, aim, tap, statuses, contact };
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
      r.press('weaponMode'); r.tick();   // R: pew pew, the selected weapon, to MAN (W-4 spec §4.3, amendment §2.4: kind (a))
      r.click(); r.tick(); expect([sys.pewShots, r.statuses()]).toEqual([1, ['applied']]);
      r.set({ selectTo: 1 }); r.tick(); r.click(); r.tick(); expect(r.statuses()).toEqual([]);   // the autocannon fires on the held trigger, not a click
      r.set({ selectTo: 2 }); r.press('weaponMode'); r.tick();   // the torpedo selected: R is its torpMode (MANUAL: no lock or range needed)
      r.click(); r.tick(); expect(sys.missilesLaunched).toBe(1);
    } finally { r.rt.dispose(); }
  });
  it('the held trigger sends gunHeld only with the autocannon selected, and a dead trigger refuses NO POWER on its press edge', () => {
    const r = rig();
    try {
      r.hold(true); r.tick();
      expect(r.rt.held()[0]!.gunHeld).toBeUndefined();   // pew pew selected
      r.hold(false); r.set({ selectTo: 1 }); r.press('weaponMode'); r.tick(); r.rt.takeRefusals();   // R: the selected autocannon to MAN (W-4 spec §4.3: kind (a))
      r.hold(true); r.tick();
      expect(r.rt.held()[0]!.gunHeld).toBe(true);
      expect(r.rt.takeRefusals()).toContainEqual({ control: 'autocannon', reason: 'NO POWER' });   // 0 autocannon bars at the start
      r.tick(); expect(r.rt.takeRefusals()).toEqual([]);   // only on the press edge
    } finally { r.rt.dispose(); }
  });
  it('E / Q step the target room (laserLock, no torpLock)', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      expect([sys.lock, sys.torpLock]).toEqual([1, -1]);   // Shields at a round's start; no torpedo target
      r.press('interact'); r.tick();
      expect([r.statuses(), sys.lock, sys.torpLock]).toEqual([['applied'], 2, -1]);   // E: Shields → Engines
      r.press('interact'); r.tick(); expect(sys.lock).toBe(0);   // wraps to Weapons
      r.press('prevLock'); r.tick(); expect([sys.lock, sys.torpLock]).toEqual([2, -1]);   // Q: back, wrapping
      r.press('interact', 2); r.tick(); expect([r.statuses(), sys.lock]).toEqual([['applied'], 1]);   // two presses in one frame: one command, two steps
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

describe("the Hound's Weapons seat in W-4b (W-4 spec §4.1, §4.3, §9; amendment §2.4)", () => {
  it('R flips the selected gun, and the torpedo when it is selected; two R presses on separate frames before a tick flip twice', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.press('weaponMode'); r.tick(); expect([sys.pewManual, sys.gunManual, sys.torpManual, r.statuses()]).toEqual([true, false, false, ['applied']]);
      r.set({ selectTo: 1 }); r.press('weaponMode'); r.tick(); expect([sys.pewManual, sys.gunManual, sys.torpManual]).toEqual([true, true, false]);
      r.set({ selectTo: 2 }); r.press('weaponMode'); r.tick(); expect([sys.pewManual, sys.gunManual, sys.torpManual]).toEqual([true, true, true]);
      r.press('weaponMode'); r.rt.frame(1 / 60); r.press('weaponMode'); r.tick();   // the second is judged from the first's queued torpMode
      expect([sys.torpManual, r.statuses()]).toEqual([true, ['applied', 'applied']]);
    } finally { r.rt.dispose(); }
  });
  it('Shift+R sets both guns together in all four gun states, sends gunMode only for a gun that changes and never torpMode', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.press('weaponModeAll'); r.tick(); expect([sys.pewManual, sys.gunManual, sys.torpManual, r.statuses()]).toEqual([true, true, false, ['applied', 'applied']]);   // AUTO / AUTO: both to MAN
      r.press('weaponModeAll'); r.tick(); expect([sys.pewManual, sys.gunManual, r.statuses()]).toEqual([false, false, ['applied', 'applied']]);   // MAN / MAN: both to AUTO
      r.press('weaponMode'); r.tick();   // MAN / AUTO
      r.press('weaponModeAll'); r.tick(); expect([sys.pewManual, sys.gunManual, r.statuses()]).toEqual([false, false, ['applied']]);   // either on MAN: both to AUTO, one command
      r.set({ selectTo: 1 }); r.press('weaponMode'); r.tick();   // AUTO / MAN
      r.press('weaponModeAll'); r.tick(); expect([sys.pewManual, sys.gunManual, sys.torpManual, r.statuses()]).toEqual([false, false, false, ['applied']]);
    } finally { r.rt.dispose(); }
  });
  it("Z and V queue nothing at the Hound's Weapons seat, and still work on the laser fit's, where R does nothing", () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.press('laserMode'); r.press('torpMode'); r.tick();
      expect([r.statuses(), sys.pewManual, sys.gunManual, sys.torpManual]).toEqual([[], false, false, false]);
    } finally { r.rt.dispose(); }
    const f = rig(ShipClass.ValkyrnLaser), fs = f.d.tactical.systems[0];
    try {
      f.press('laserMode'); f.press('torpMode'); f.tick(); expect([fs.laserManual, fs.torpManual]).toEqual([true, true]);
      f.press('weaponMode'); f.press('weaponModeAll'); f.tap(2); f.tick(); expect([f.statuses(), fs.laserManual, fs.torpManual]).toEqual([[], true, true]);
    } finally { f.rt.dispose(); }
  });
  it('a tag click (a mode tap) flips its own weapon, whatever is selected', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.tap(1); r.tick(); expect([sys.pewManual, sys.gunManual, sys.torpManual]).toEqual([false, true, false]);   // pew pew is selected; the autocannon's tag is its own switch
      r.tap(2); r.tap(0); r.tick(); expect([sys.pewManual, sys.gunManual, sys.torpManual]).toEqual([true, true, true]);
    } finally { r.rt.dispose(); }
  });
  it("a gun tag's click through the keyboard's console input (ConsoleInput.mode) reaches the sim as that gun's gunMode (Task 11 review)", () => {
    const noop = (): void => {};
    const kb = createDuelKeyboard({ addEventListener: noop, removeEventListener: noop } as never), r = rig(undefined, kb), sys = r.d.tactical.systems[0];
    try {
      kb.ui.mode?.(1); r.tick();
      expect([r.statuses(), sys.pewManual, sys.gunManual]).toEqual([['applied'], false, true]);
      kb.ui.mode?.(0); kb.ui.mode?.(1); r.tick();
      expect([r.statuses(), sys.pewManual, sys.gunManual]).toEqual([['applied', 'applied'], true, false]);
    } finally { r.rt.dispose(); kb.destroy(); }
  });
  it("a left click fires pew pew only while its own switch is MAN, whatever the autocannon's is; on AUTO it queues nothing and refuses nothing", () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.set({ selectTo: 1 }); r.press('weaponMode'); r.tick();   // the autocannon on MAN; pew pew still on AUTO
      r.set({ selectTo: 0 }); r.tick(); r.rt.takeRefusals();
      r.click(); r.tick(); expect([sys.pewShots, r.statuses(), r.rt.takeRefusals()]).toEqual([0, [], []]);
      r.press('weaponMode'); r.tick();
      r.click(); r.tick(); expect([sys.pewShots, r.statuses()]).toEqual([1, ['applied']]);
    } finally { r.rt.dispose(); }
  });
  it("the held trigger puts gunHeld only while the autocannon's own switch is MAN; on AUTO it refuses nothing; a dead trigger on MAN refuses NO POWER", () => {
    const r = rig();
    try {
      r.press('weaponMode'); r.tick();   // pew pew on MAN: not the autocannon's switch
      r.set({ selectTo: 1 }); r.tick(); r.rt.takeRefusals();
      r.hold(true); r.tick();
      expect([r.rt.held()[0]!.gunHeld, r.rt.takeRefusals()]).toEqual([undefined, []]);
      r.hold(false); r.press('weaponMode'); r.tick(); r.rt.takeRefusals();
      r.hold(true); r.tick();
      expect(r.rt.held()[0]!.gunHeld).toBe(true);
      expect(r.rt.takeRefusals()).toContainEqual({ control: 'autocannon', reason: 'NO POWER' });
    } finally { r.rt.dispose(); }
  });
  it('the held frame carries turretAim from deps.reticleAim, and none while it returns null', () => {
    const r = rig();
    try {
      r.aim(12000); r.tick(); expect(r.rt.held()[0]!.turretAim).toBe(12000);
      r.aim(null); r.tick(); expect(r.rt.held()[0]!.turretAim).toBeUndefined();
    } finally { r.rt.dispose(); }
  });
});

describe("the target room at the Hound's Weapons seat (W-4 amendment §3.6)", () => {
  it('two E presses on separate frames before a tick step twice (from the latest queued laserLock)', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      holdInSight(r.d.tactical);
      r.press('interact'); r.rt.frame(1 / 60); r.press('interact'); r.tick();
      expect([r.statuses(), sys.lock]).toEqual([['applied', 'applied'], 0]);   // Shields → Engines → Weapons
    } finally { r.rt.dispose(); }
  });
  it("a plain room click (the console's lock request) sets the target room; the torpedo's own target is only its pick-up click; a clear is never sent", () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.set({ lockTo: 0 }); r.tick();
      expect([r.statuses(), sys.lock, sys.torpLock]).toEqual([['applied'], 0, -1]);
      r.set({ torpTo: 2 }); r.tick();   // the pick-up's room click (contact.pick → the console's torpLock)
      expect([r.statuses(), sys.lock, sys.torpLock]).toEqual([['applied'], 0, 2]);   // the enemy is 700 u off, out of torpedo range: the lock stands
      r.set({ lockTo: -1 }); r.tick();
      expect([r.statuses(), sys.lock]).toEqual([[], 0]);   // the target room has no "none"
    } finally { r.rt.dispose(); }
  });
  it('with the enemy unseen E raises NO CONTACT and the room keeps its value', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      sys.bars[3] = 0;   // Sensors 0: sensor range 300, and the rig holds the enemy 700 u off
      r.tick(); r.rt.takeRefusals();
      r.press('interact'); r.tick();
      expect([r.statuses(), sys.lock]).toEqual([['rejected:unavailable'], 1]);
      expect(r.rt.takeRefusals()).toContainEqual({ control: 'laser', reason: 'NO CONTACT' });
    } finally { r.rt.dispose(); }
  });
  it('with the torpedo picked up, E still steps the target room: laserLock goes, no torpLock, and the pick-up stays', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.contact.sync({ shown: true, station: 'weapons', target: 1, active: () => true, epoch: r.rt.epoch(), laser: false, turret: true });
      r.contact.pickUp('torpedo');
      expect([r.contact.intercept('KeyE'), r.contact.intercept('KeyQ')]).toEqual([false, false]);   // the keys fall through to the seat
      r.press('interact'); r.tick();
      expect([r.statuses(), sys.lock, sys.torpLock, r.contact.aimWeapon()]).toEqual([['applied'], 2, -1, 'torpedo']);
    } finally { r.rt.dispose(); }
  });
});

describe('Single player around a MANUAL flight (W-4 spec §7)', () => {
  it('during a flight: A/D select, the held trigger and clicks send nothing, R and Shift+R still work (amendment §2.6)', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      sys.bars[DuelSystem.Weapons] = 3; sys.weaponPower = [1, 1, 1];
      r.press('weaponModeAll'); r.tick();   // Shift+R: both guns to MAN
      r.set({ selectTo: 2 }); r.press('weaponMode'); r.tick();   // the torpedo selected: R sets it MANUAL (V does nothing at this seat)
      r.press('launch'); r.tick();
      expect([sys.pewManual, sys.gunManual, sys.torpManual, sys.missilesLaunched]).toEqual([true, true, true, 1]);
      r.press('selectPrev'); r.tick();   // A: from the torpedo to the autocannon
      expect(r.rt.held()[0]!.weaponSel).toBe(1);
      expect('torpTurn' in r.rt.held()[0]!).toBe(false);
      r.hold(true); r.tick(); r.tick();
      expect(r.rt.held()[0]!.gunHeld).toBeUndefined();   // no trigger goes out (the sim drops it too, Task 3)
      r.hold(false); r.set({ selectTo: 0 }); r.tick(); r.rt.takeRefusals();
      r.click(); r.tick();
      expect([r.statuses(), sys.missilesLaunched, r.rt.takeRefusals()]).toEqual([[], 1, []]);   // the click queued nothing: no pewFire, no second launch, no refusal
      r.press('weaponMode'); r.tick();
      expect([sys.pewManual, sys.gunManual]).toEqual([false, true]);   // R still flips the selected gun (pew pew) during the flight
      r.press('weaponModeAll'); r.tick();
      expect([sys.pewManual, sys.gunManual, sys.torpManual]).toEqual([false, false, true]);   // Shift+R too: the autocannon was on MAN, so both go to AUTO; the torpedo keeps its mode
    } finally { r.rt.dispose(); }
  });
  it('a flight that ends with the button held off the map, then dragged onto it, sends no trigger until a fresh press (review finding 8)', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      sys.bars[DuelSystem.Weapons] = 3; sys.weaponPower = [1, 1, 1];
      r.press('weaponModeAll'); r.tick();   // Shift+R: both guns to MAN
      r.set({ selectTo: 2 }); r.press('weaponMode'); r.tick();   // the torpedo selected: R sets it MANUAL
      r.set({ selectTo: 1 }); r.tick();   // back on the autocannon
      r.press('launch'); r.tick();
      expect(sys.missilesLaunched).toBe(1);
      r.holdOff(true); r.tick();   // the button down over a console block: no trigger
      removeMissile(r.d.tactical, 0); r.tick();   // the flight ends with it still down
      r.hold(true);   // the pointer drags onto the open map; the button was never let go
      for (let n = 0; n < 10; n++) { r.tick(); expect(r.rt.held()[0]!.gunHeld, `frame ${n}`).toBeUndefined(); }
      r.hold(false); r.tick(); r.hold(true); r.tick();
      expect(r.rt.held()[0]!.gunHeld).toBe(true);   // a fresh press fires
    } finally { r.rt.dispose(); }
  });
  it('a click-launch whose press stays down steers at once: the next frames carry the held bearing, kept after the release; a quick click sends none (W-4c Decision 6)', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      r.set({ selectTo: 2 }); r.press('weaponMode'); r.tick();   // the torpedo selected: R sets it MANUAL
      r.click(); r.tick();
      expect(sys.missilesLaunched).toBe(1);
      expect('torpHeading' in r.rt.held()[0]!).toBe(false);   // the launch frame: no bearing yet
      r.steerTo(40); r.tick();   // the scene's LMB steer: the launch press still down over the map
      expect(r.rt.held()[0]).toMatchObject({ torpHeading: 40 });
      r.tick();   // let go: no new bearing, the last one holds
      expect(r.rt.held()[0]).toMatchObject({ torpHeading: 40 });
      expect(sys.missilesLaunched).toBe(1);   // the press never launches a second
    } finally { r.rt.dispose(); }
    const q = rig(), qs = q.d.tactical.systems[0];
    try {
      q.set({ selectTo: 2 }); q.press('weaponMode'); q.tick();
      q.click(); q.tick(); q.tick(); q.tick();   // released in the launch frame: the scene asks nothing
      expect([qs.missilesLaunched, 'torpHeading' in q.rt.held()[0]!]).toEqual([1, false]);   // it flies on its launch heading
    } finally { q.rt.dispose(); }
  });
  it('the flight ends: a torpedo selection returns to the last gun; a trigger held across it is stale until a fresh press; no second launch', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      sys.bars[DuelSystem.Weapons] = 3; sys.weaponPower = [1, 1, 1];
      r.press('weaponModeAll'); r.tick();   // Shift+R: both guns to MAN
      r.set({ selectTo: 1 }); r.tick(); r.set({ selectTo: 2 }); r.tick();
      r.press('weaponMode'); r.tick();   // the torpedo selected: R sets it MANUAL
      r.click(); r.tick();
      expect(sys.missilesLaunched).toBe(1);
      r.hold(true); r.tick();
      removeMissile(r.d.tactical, 0); r.tick();
      expect(r.rt.held()[0]!.weaponSel).toBe(1);   // back to the autocannon, the last gun selected
      expect(r.rt.held()[0]!.gunHeld).toBeUndefined();   // the held trigger is stale
      expect(sys.missilesLaunched).toBe(1);
      r.hold(false); r.tick(); r.hold(true);
      for (let n = 0; n < 20; n++) r.tick();
      expect(r.rt.held()[0]!.gunHeld).toBe(true);
      expect(sys.gunShots).toBeGreaterThan(0);
    } finally { r.rt.dispose(); }
  });
});

// Valkyrn spec §4.4, §5, §5.1: the local runtime at a crew of one (one character, no presence for a second, no Tab swap,
// held n long), the Flight seat's bindings (the pointer bearing as aim, the left button as gunHeld, the right button as a
// torpedo, Space auto-face, W/S throttle, Q/E the torpedo's room), Tab between the console and the ship view, the out-of-seat
// rule's axes, and the console's FLIGHT tab and sit card.
import { describe, expect, it } from 'vitest';
import valkyrnJson from '../src/renderer/src/sim/ship/valkyrn.json';
import houndJson from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { emptyPresses, NO_HELD_FLAGS, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { flightSeat, seatOf } from '../src/renderer/src/app/duel/controls';
import { createContactController, type ContactRequests } from '../src/renderer/src/app/duel/contactController';
import { sitDown } from '../src/renderer/src/sim/stations';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { throttleThrust } from '../src/renderer/src/sim/duel/throttle';
import { classIndexById, VALKYRN_CLASS, VALKYRN_LASER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { missileOf, Outcome } from '../src/renderer/src/sim/tactical/state';
import { consoleModel, consoleTabs } from '../src/renderer/src/render/duel/consoleModel';
import { SIT_CARDS } from '../src/renderer/src/render/duel/sitModel';
import type { DuelRoundRecord } from '../src/renderer/src/sim/duel/summary';
import { soloDuelRecord, validateDuelRecord } from '../src/renderer/src/net/duelRecord';
import { inTorpedoRange } from './helpers/torpedoRange';
import { holdInSight } from './helpers/sensorSight';

const layout = parseShip(valkyrnJson);
const TICK_MS = 1000 / 60;
function fakeTime() {
  let now = 0, seq = 0;
  const tasks: { at: number; seq: number; cb: () => void }[] = [];
  return {
    now: () => now,
    scheduler: { schedule(delay: number, cb: () => void) { const t = { at: now + delay, seq: seq++, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    advance(ms: number) {
      const end = now + ms;
      for (;;) { tasks.sort((a, b) => a.at - b.at || a.seq - b.seq); const t = tasks[0]; if (!t || t.at > end) break; tasks.shift(); now = Math.max(now, t.at); t.cb(); }
      now = end;
    }
  };
}
const idle = (): KeySample => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() });
function rig(o: { cls?: number; onRound?: (r: DuelRoundRecord) => void; takeContactRequests?: () => ContactRequests } = {}) {
  const time = fakeTime();
  let keys = idle(), steer: number | null = null, launches = 0, gun = false;
  const rt = createDuelRuntime({
    now: time.now, scheduler: time.scheduler, seed: 5, viewport: { w: 1280, h: 720 }, layout, cls: o.cls, onRound: o.onRound,
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses() }; return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
    takeSteer: () => { const s = steer; steer = null; return s; }, takeLaunches: () => { const n = launches; launches = 0; return n; }, gunHeld: () => gun,
    clearKeys: () => { keys = idle(); }, takeContactRequests: o.takeContactRequests
  });
  const press = (...actions: KeyAction[]): void => { const p = { ...keys.presses }; for (const a of actions) p[a]++; keys = { ...keys, presses: p }; };
  const hold = (h: Partial<Omit<KeySample, 'presses'>>): void => { keys = { ...keys, ...h }; };
  const tick = (): void => { rt.frame(1 / 60); time.advance(TICK_MS); rt.frame(1 / 60); };
  const ticks = (n: number): void => { for (let k = 0; k < n; k++) tick(); };
  const sit = (): void => sitDown(rt.duel.interior, 0, rt.duel.nav);
  return { rt, time, press, hold, tick, ticks, sit, steerTo: (h: number) => { steer = h; }, launch: () => { launches++; }, holdGun: (on: boolean) => { gun = on; } };
}

describe('the runtime at a crew of one (Valkyrn spec §4.4)', () => {
  it('one character: no presence for a second, held one long, the Valkyrn class', () => {
    const { rt, tick } = rig();
    tick();
    expect(rt.duel.present).toEqual([true]);
    expect(rt.held().length).toBe(1);
    expect(rt.lastResults().filter((r) => r.id.player !== 0)).toEqual([]);
    expect(rt.duel.tactical.systems[0].cls).toBe(classIndexById(VALKYRN_CLASS.id));
    expect([rt.active(), rt.view()]).toEqual([0, 'interior']);
    rt.dispose();
  });
  it('the laser fit: the cls argument is the crew class, kept in the duel', () => {
    const { rt, tick } = rig({ cls: classIndexById(VALKYRN_LASER_CLASS.id) });
    tick();
    expect([rt.duel.crewClass, rt.duel.tactical.systems[0].cls]).toEqual([classIndexById(VALKYRN_LASER_CLASS.id), classIndexById(VALKYRN_LASER_CLASS.id)]);
    rt.dispose();
  });
  it('Tab: no swap on foot; seated, it toggles the Flight console and the ship view and keeps the seat', () => {
    const { rt, press, tick, sit } = rig();
    press('switch'); tick();
    expect([rt.active(), rt.view()]).toEqual([0, 'interior']);
    sit(); tick();
    expect([seatOf(rt.duel, 0), rt.view()]).toEqual(['flight', 'flight']);
    press('switch'); tick();
    expect([seatOf(rt.duel, 0), rt.view()]).toEqual(['flight', 'interior']);
    press('switch'); tick();
    expect(rt.view()).toBe('flight');
    rt.dispose();
  });
  it('a decided round at crew 1 is a valid solo record', () => {
    const rounds: DuelRoundRecord[] = [], { rt, tick } = rig({ onRound: (r) => rounds.push(r) });
    tick();
    rt.duel.tactical.systems[rt.duel.tactical.systems[0].target]!.hull = 0; tick();
    expect(rt.duel.tactical.outcome).toBe(Outcome.CrewWins);
    expect(rounds).toHaveLength(1);
    expect(validateDuelRecord(soloDuelRecord(rounds[0]!, { seat: 0, helmPlayer: 0, startedAtIso: '2026-11-18T12:00:00.000Z', pauses: 0 }))).toMatchObject({ session: 'solo' });
    rt.dispose();
  });
});

describe('the Flight seat (Valkyrn spec §5, §5.1)', () => {
  it('Navigation and Weapons share one group on the Valkyrn only', () => {
    const v = createDuel(layout, 3, 0, 1), h = createDuel(parseShip(houndJson), 3);
    try { expect([flightSeat(v), flightSeat(h)]).toEqual([true, false]); } finally { disposeDuel(v); disposeDuel(h); }
  });
  it('sends aim from the pointer bearing, gunHeld from the left button, face from Space; the bearing stays after a release', () => {
    const { rt, tick, ticks, sit, steerTo, holdGun, hold, press } = rig();
    sit(); tick();
    steerTo(64); holdGun(true); hold({ fireHeld: true }); tick();
    expect(rt.held()[0]).toMatchObject({ aim: 64, gunHeld: true, face: true });
    holdGun(false); hold({ fireHeld: false }); tick();
    expect(rt.held()[0]!.gunHeld).toBeUndefined();
    expect(rt.held()[0]!.aim).toBe(64);
    press('stand'); ticks(2);
    expect(seatOf(rt.duel, 0)).toBe('standing');
    expect(rt.held()[0]!.aim).toBeUndefined();
    rt.dispose();
  });
  it('the ship view sends no gun, no new bearing and no turn keys (Decision 11)', () => {
    const { rt, tick, sit, steerTo, holdGun, press, hold } = rig();
    sit(); tick(); steerTo(32); tick();
    press('switch'); tick();
    steerTo(96); holdGun(true); hold({ moveX: -1, fireHeld: true }); tick();
    expect(rt.held()[0]).toMatchObject({ aim: 32, moveX: 0 });
    expect(rt.held()[0]!.gunHeld).toBeUndefined();
    expect(rt.held()[0]!.face).toBeUndefined();
    rt.dispose();
  });
  it('1 and 3/4/5 on the gun fit flash NO LASER; the laser fit takes them (spec §6.1, review R1-F2)', () => {
    let noLaser = false;
    const { rt, tick, sit, hold } = rig({ takeContactRequests: () => { const out: ContactRequests = { designate: null, scan: null, ...(noLaser ? { noLaser: true as const } : {}) }; noLaser = false; return out; } });
    sit(); tick(); rt.takeRefusals();
    noLaser = true; tick();
    expect(rt.takeRefusals()).toEqual([{ control: 'laser', reason: 'NO LASER' }]);
    hold({ freqKeyTo: 1 }); tick(); hold({ freqKeyTo: null });   // W-4 spec §9: 3/4/5 is the key field
    expect(rt.takeRefusals()).toContainEqual({ control: 'laser', reason: 'NO LASER' });
    tick();
    expect(rt.takeRefusals()).toEqual([]);
    rt.dispose();
    const fit = rig({ cls: classIndexById(VALKYRN_LASER_CLASS.id) });
    fit.sit(); fit.tick(); fit.rt.takeRefusals();
    fit.hold({ freqKeyTo: 1 }); fit.tick(); fit.hold({ freqKeyTo: null }); fit.tick();
    expect(fit.rt.takeRefusals().some((r) => r.reason === 'NO LASER')).toBe(false);
    expect(fit.rt.duel.tactical.systems[0].freq).toBe(1);
    fit.rt.dispose();
  });
  it('the right button launches a torpedo in range', () => {
    const { rt, tick, sit, launch } = rig();
    sit(); tick();
    inTorpedoRange(rt.duel.tactical);
    launch(); tick();
    expect(missileOf(rt.duel.tactical, 0)).not.toBeNull();
    rt.dispose();
  });
  it('W/S throttle; E and Q step the torpedo room from none', () => {
    const { rt, tick, sit, press } = rig();
    holdInSight(rt.duel.tactical);   // Engineering spike spec §10.4: a torpLock needs the target seen
    sit(); tick();
    press('throttleUp'); tick();
    expect(rt.duel.throttle).toBe(1);
    press('interact'); tick();
    expect(rt.duel.tactical.systems[0].torpLock).toBe(0);
    press('prevLock'); tick();
    expect(rt.duel.tactical.systems[0].torpLock).toBe(2);
    rt.dispose();
  });
  it('out of the seat the Valkyrn flies its throttle and last bearing (helmHoldsUnattended)', () => {
    const { rt, tick, ticks, sit, press, steerTo } = rig();
    sit(); tick(); steerTo(64); press('throttleUp', 'throttleUp'); ticks(3);
    press('stand'); ticks(3);
    expect(seatOf(rt.duel, 0)).toBe('standing');
    expect(rt.duel.holdHeading).toBe(64);
    expect(rt.axes().thrust).toBe(throttleThrust(rt.duel.throttle));
    expect(rt.axes().thrust).not.toBe(0);
    rt.dispose();
  });
});

describe('the Flight console tabs, the sit card and the contact keys (Valkyrn spec §5, §9)', () => {
  it('FLIGHT current while seated; open to sit on foot; in the ship view SHIP current with FLIGHT on Tab; the Hound keeps four tabs', () => {
    expect(consoleTabs({ seat: 'flight', reach: null, repairNear: false, otherSeat: 'standing', mode: 'single', flight: true }))
      .toMatchObject({ tabs: { flight: 'current', ship: 'open', helm: 'locked', weapons: 'locked' }, tabActions: { ship: 'stand' } });
    expect(consoleTabs({ seat: 'standing', reach: 'flight', repairNear: false, otherSeat: 'standing', mode: 'single', flight: true }))
      .toMatchObject({ tabs: { flight: 'open', ship: 'current' }, tabActions: { flight: 'interact' } });
    expect(consoleTabs({ seat: 'flight', reach: null, repairNear: false, otherSeat: 'standing', mode: 'single', flight: true, shipView: true }))
      .toMatchObject({ tabs: { flight: 'open', ship: 'current' }, tabActions: { flight: 'switch' } });
    expect(Object.keys(consoleTabs({ seat: 'helm', reach: null, repairNear: false, otherSeat: 'standing', mode: 'single' }).tabs).sort()).toEqual(['helm', 'science', 'ship', 'weapons']);
  });
  it('the Flight console shows the Helm block with the flight flag', () => {
    const d = createDuel(layout, 3, 0, 1);
    try {
      sitDown(d.interior, 0, d.nav);
      const v = consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null })!;
      expect([v.station, v.helm?.flight, v.weapons]).toEqual(['flight', true, null]);
      const ship = consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null, shipView: true })!;
      expect([ship.station, ship.helm]).toEqual(['ship', null]);
    } finally { disposeDuel(d); }
  });
  it('the Flight sit card reads the spec line', () => {
    const c = SIT_CARDS.flight;
    expect([c.title, ...c.keys].join(' · ')).toBe('FLIGHT: MOUSE TO STEER · W/S THROTTLE · L-CLICK GUN · R-CLICK TORPEDO');
  });
  it('on the Flight seat 2 picks the torpedo up; 1 only with a laser; T opens the window', () => {
    const sync = (c: ReturnType<typeof createContactController>, laser: boolean) => c.sync({ shown: true, station: 'flight', target: 1, active: () => true, epoch: 0, enemyKnown: 2, laser });
    const gun = createContactController(); sync(gun, false);
    expect(gun.intercept('Digit1')).toBe(true);   // taken for the NO LASER flash (spec §6.1), no pick-up
    expect(gun.aimWeapon()).toBeNull();
    expect(gun.takeRequests().noLaser).toBe(true);
    expect(gun.takeRequests().noLaser).toBeUndefined();
    expect(gun.intercept('Digit2')).toBe(true);
    expect(gun.aimWeapon()).toBe('torpedo');
    const fit = createContactController(); sync(fit, true);
    expect(fit.intercept('Digit1')).toBe(true);
    expect(fit.aimWeapon()).toBe('laser');
    expect(fit.takeRequests().noLaser).toBeUndefined();
    const t = createContactController(); sync(t, false);
    expect(t.intercept('KeyT')).toBe(true);
    expect(t.state()).toMatchObject({ contact: 0 });
  });
});

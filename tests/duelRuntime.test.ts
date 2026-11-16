import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Position } from '../src/renderer/src/sim/components';
import { missileOf, Outcome, removeMissile, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { REPAIR_RATE_SOLO } from '../src/renderer/src/sim/duel/tuning';
import { emptyPresses, type KeyAction, type KeySample, type PointerSample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { ZOOM_DEFAULT, ZOOM_STEP } from '../src/renderer/src/render/tactical/camera';
import { interpolatedMissile } from '../src/renderer/src/render/tactical/fxModel';

const layout = parseShip(cutter);
const TICK_MS = 1000 / 60;

/** A fake wall clock and setTimeout scheduler: advance(ms) runs every callback that falls due, in time order. */
function fakeTime() {
  let now = 0, seq = 0;
  const tasks: { at: number; seq: number; cb: () => void }[] = [];
  return {
    now: () => now,
    scheduler: { schedule(delay: number, cb: () => void) { const t = { at: now + delay, seq: seq++, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        tasks.sort((a, b) => a.at - b.at || a.seq - b.seq);
        const t = tasks[0];
        if (!t || t.at > end) break;
        tasks.shift(); now = Math.max(now, t.at); t.cb();
      }
      now = end;
    }
  };
}
const idle = (): KeySample => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() });
/** Scripted keys: the test sets held keys and presses, `frame()` samples them once and runs due ticks. */
function rig(seed = 5) {
  const time = fakeTime();
  let keys = idle(), cleared = 0;
  const pointer: PointerSample = { x: null, y: null, wheel: 0, dragX: 0, dragY: 0 };
  const rt = createDuelRuntime({
    now: time.now, scheduler: time.scheduler, seed, viewport: { w: 1280, h: 720 }, layout,
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses() }; return k; },
    samplePointer: () => ({ ...pointer }),
    clearKeys: () => { keys = idle(); cleared++; }
  });
  const hold = (h: Partial<Omit<KeySample, 'presses'>>): void => { keys = { ...keys, ...h }; };
  const press = (...actions: KeyAction[]): void => { const p = { ...keys.presses }; for (const a of actions) p[a]++; keys = { ...keys, presses: p }; };
  /** One frame, then one tick's worth of wall time with a frame after it (so the press is sent on exactly one tick). */
  const tick = (): void => { rt.frame(1 / 60); time.advance(TICK_MS); rt.frame(1 / 60); };
  const ticks = (n: number): void => { for (let k = 0; k < n; k++) tick(); };
  return { time, rt, hold, press, tick, ticks, pointer, cleared: () => cleared };
}
const put = (rt: ReturnType<typeof rig>['rt'], pid: number, tx: number, ty: number): void => {
  const eid = rt.duel.interior.crew[pid]!; Position.x[eid] = tx + 0.5; Position.y[eid] = ty + 0.5;
};

describe('the duel runtime (H-1 spec §4, §5)', () => {
  it('solo start: player 0 at the Helm; player 1 goes away on tick 0, ahead of any other command', () => {
    const { rt, press, tick } = rig();
    expect([rt.active(), rt.view()]).toEqual([0, 'helm']);
    press('stand'); tick();
    expect(rt.duel.interior.tick).toBe(1);
    expect(rt.lastResults().map((r) => [r.id.player, r.id.sequence, r.tick, r.status])).toEqual([[0, 0, 0, 'applied'], [1, 0, 0, 'applied']]);
    expect(rt.duel.present).toEqual([true, false]);
    rt.dispose();
  });
  it('steps at 60 Hz from the wall clock; commands carry the duel tick', () => {
    const { time, rt } = rig();
    time.advance(1010);
    expect(rt.duel.interior.tick).toBe(60);
    expect(rt.duel.tactical.tick).toBe(60);
    rt.dispose();
  });
  it('Tab switches presence on one tick, clears the keyboard and leaves the old character neutral', () => {
    const { rt, hold, press, tick, cleared } = rig();
    hold({ moveY: -1 }); tick();
    expect(rt.held()[0]).toEqual({ moveX: 0, moveY: -1, interactHeld: false });
    expect(rt.axes()).toEqual({ turn: 0, thrust: 1 });
    press('switch'); tick();
    const presence = rt.lastResults().filter((r) => r.status === 'applied').map((r) => [r.id.player, r.tick]);
    expect(presence).toEqual([[0, 1], [1, 1]]);   // the character left, then the one taken, on the same tick
    expect(rt.duel.present).toEqual([false, true]);
    expect([rt.active(), rt.view(), rt.otherStatus()]).toEqual([1, 'weapons', 'AT HELM']);
    expect(cleared()).toBe(1);
    expect(rt.held()).toEqual([{ moveX: 0, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: false }]);
    expect(rt.axes()).toEqual({ turn: 0, thrust: 0 });   // the Helm is empty: the ship coasts
    press('switch'); tick();
    expect([rt.active(), rt.duel.present]).toEqual([0, [true, false]]);
    rt.dispose();
  });
  it('X stands into the interior; E sits again at the role console in reach', () => {
    const { rt, press, tick } = rig();
    press('stand'); tick();
    expect(rt.view()).toBe('interior');
    press('interact'); tick();
    expect(rt.view()).toBe('helm');
    rt.dispose();
  });
  it('walking by scripted keys from the Weapons console to the Engines repair point and holding E repairs it', () => {
    const { rt, hold, press, tick, ticks } = rig();
    press('switch'); tick(); press('stand'); tick();   // the gunner stands up at the Weapons console (8, 6)
    rt.duel.tactical.systems[0].rooms[Room.Engines] = 1;
    const eid = rt.duel.interior.crew[1]!;
    expect([Position.x[eid], Position.y[eid]]).toEqual([8.5, 6.5]);
    hold({ moveX: -1 }); ticks(100);                   // west along row 6: the door at 6, the Aft Passage, the door at 4, into Engines
    hold({ moveX: 0 }); tick();
    expect(Position.y[eid]).toBe(6.5);
    expect(Position.x[eid]!).toBeLessThan(4); expect(Position.x[eid]!).toBeGreaterThan(1);
    expect(rt.duel.repair[Room.Engines]).toBe(0);
    hold({ interactHeld: true }); ticks(10);
    expect(rt.duel.repair[Room.Engines]).toBe(10 * REPAIR_RATE_SOLO);
    expect(rt.view()).toBe('interior');
    rt.dispose();
  });
  it('Tab then X sampled in separate frames before one tick: the stand still applies, on the following tick', () => {
    const { rt, press, tick } = rig();
    tick();
    press('switch'); rt.frame(1 / 60); press('stand'); tick();   // both edges before the Tab's presence tick runs
    expect([rt.active(), rt.duel.present]).toEqual([1, [false, true]]);
    tick();
    expect(rt.lastResults().map((r) => [r.id.player, r.status])).toEqual([[1, 'applied']]);
    expect(rt.view()).toBe('interior');
    rt.dispose();
  });
  it('Tab then E at a free console sampled in separate frames before one tick: the sit still applies', () => {
    const { rt, press, tick } = rig();
    press('stand'); tick();                                       // player 0 stands at the Navigation console
    press('switch'); tick();
    press('switch'); rt.frame(1 / 60); press('interact'); tick(); // back to player 0, then E before the presence tick
    tick();
    expect([rt.active(), rt.view()]).toEqual([0, 'helm']);
    rt.dispose();
  });
  it('holding E at a damaged room repairs it; the press does not sit while a repair is in reach', () => {
    const { rt, hold, press, tick, ticks } = rig();
    press('switch'); tick(); press('stand'); tick();   // the gunner stands up at Weapons
    expect(rt.view()).toBe('interior');
    rt.duel.tactical.systems[0].rooms[Room.Weapons] = 1;
    put(rt, 1, 8, 6);                                  // beside the Weapons console and in reach of the Weapons repair point (8, 7)
    hold({ interactHeld: true }); press('interact'); tick();
    expect(rt.view()).toBe('interior');                // no sit: holding E repairs
    expect(rt.duel.repair[Room.Weapons]).toBe(REPAIR_RATE_SOLO);
    expect(rt.otherStatus()).toBe('AT HELM');
    ticks(9);
    expect(rt.duel.repair[Room.Weapons]).toBe(10 * REPAIR_RATE_SOLO);
    hold({ interactHeld: false }); rt.duel.tactical.systems[0].rooms[Room.Weapons] = 0;
    press('interact'); tick();
    expect(rt.view()).toBe('weapons');                 // nothing to repair now: the same press sits
    rt.dispose();
  });
  it('W/A/S/D walk while standing; the inactive character never moves', () => {
    const { rt, hold, press, tick, ticks } = rig();
    press('stand'); tick();
    const eid = rt.duel.interior.crew[0]!, x0 = Position.x[eid]!, other = rt.duel.interior.crew[1]!, o = [Position.x[other], Position.y[other]];
    hold({ moveX: -1 }); ticks(20);
    expect(Position.x[eid]!).toBeLessThan(x0 - 0.5);
    expect([Position.x[other], Position.y[other]]).toEqual(o);
    rt.dispose();
  });
  it('Space charges and its release fires at full charge; E and Q cycle the lock', () => {
    const { rt, hold, press, tick, ticks } = rig();
    press('switch'); tick();
    const ship = rt.duel.tactical.systems[0];
    expect(ship.lock).toBe(Room.Shields);
    press('interact'); tick(); expect(ship.lock).toBe(Room.Engines);
    press('interact'); tick(); expect(ship.lock).toBe(Room.Weapons);
    press('prevLock', 'prevLock'); tick(); expect(ship.lock).toBe(Room.Shields);
    hold({ fireHeld: true }); press('fireDown'); tick();
    expect(ship.fireHeld).toBe(true); expect(ship.laserCharge).toBeGreaterThan(0);
    ticks(240);
    expect(ship.laserCharge).toBe(LASER_CHARGE_UNITS);
    rt.drainEvents();
    hold({ fireHeld: false }); press('fireUp'); tick();
    expect(ship.shots).toBe(1);
    expect(rt.drainEvents().some((e) => e.kind === 'laser' && e.ship === 0)).toBe(true);
    rt.dispose();
  });
  it('a partial charge released early is discarded', () => {
    const { rt, hold, press, tick, ticks } = rig();
    press('switch'); tick();
    hold({ fireHeld: true }); press('fireDown'); ticks(30);
    hold({ fireHeld: false }); press('fireUp'); tick();
    expect([rt.duel.tactical.systems[0].shots, rt.duel.tactical.systems[0].laserCharge]).toEqual([0, 0]);
    rt.dispose();
  });
  it('a blur that swallows the Space release still lets go of the charge (H-1a review carry-over)', () => {
    const { rt, hold, press, tick } = rig();
    press('switch'); tick();
    hold({ fireHeld: true }); press('fireDown'); tick();
    expect(rt.duel.tactical.systems[0].fireHeld).toBe(true);
    rt.pause('blur'); hold({ fireHeld: false }); tick();   // the keyboard was cleared: no keyup, no fireUp edge
    expect(rt.duel.tactical.systems[0].fireHeld).toBe(true);   // paused: nothing sent yet
    rt.resume('blur'); tick();
    expect(rt.lastResults().map((r) => r.status)).toEqual(['applied']);
    expect(rt.duel.tactical.systems[0].fireHeld).toBe(false);
    rt.dispose();
  });
  it('F launches a missile, A/D steer it, C toggles the Weapons camera to the missile and back', () => {
    const { rt, hold, press, tick, ticks } = rig();
    press('switch'); tick();
    press('launch'); tick();
    expect(missileOf(rt.duel.tactical, 0)).not.toBeNull();
    const h0 = missileOf(rt.duel.tactical, 0)!.heading;
    hold({ moveX: 1 }); ticks(10);
    expect(rt.steer()).toBe(1);
    expect(missileOf(rt.duel.tactical, 0)!.heading).not.toBe(h0);
    press('camera'); tick();
    expect(rt.cameras.weapons.follow).toBe('missile');
    expect(rt.cameras.helm.follow).toBe('ship');   // each console keeps its own camera
    press('camera'); tick();
    expect(rt.cameras.weapons.follow).toBe('ship');
    press('camera'); tick();
    removeMissile(rt.duel.tactical, 0); tick();      // the followed missile ended: back to the ship
    expect(rt.cameras.weapons.follow).toBe('ship');
    rt.dispose();
  });
  it('F then a Space release before one tick: the sim fires the full charge, then launches (charge before launch)', () => {
    const { rt, time, hold, press, tick, ticks } = rig();
    press('switch'); tick();
    hold({ fireHeld: true }); press('fireDown'); tick(); ticks(240);
    const ship = rt.duel.tactical.systems[0];
    expect(ship.laserCharge).toBe(LASER_CHARGE_UNITS);
    press('launch'); rt.frame(1 / 60);                          // F first...
    hold({ fireHeld: false }); press('fireUp'); rt.frame(1 / 60);   // ...then the release, both before the tick
    time.advance(TICK_MS); rt.frame(1 / 60);
    expect([ship.shots, ship.missilesLaunched]).toEqual([1, 1]);
    rt.dispose();
  });
  it('the Weapons camera follows the missile at its interpolated (drawn) position', () => {
    const { rt, time, press, tick, ticks } = rig();
    press('switch'); tick();
    press('launch'); tick();
    press('camera'); ticks(30);                       // past the 0.2 s snap
    expect(rt.cameras.weapons.follow).toBe('missile');
    time.advance(TICK_MS * 0.4); rt.frame(1 / 60);   // part-way to the next tick
    const a = rt.alpha();
    expect(a).toBeGreaterThan(0.05); expect(a).toBeLessThan(0.95);
    const m = interpolatedMissile(rt.duel.tactical, rt.missilePrev, a, 0)!, raw = missileOf(rt.duel.tactical, 0)!;
    expect(Math.hypot(m.x - raw.x, m.y - raw.y)).toBeGreaterThan(1);   // the drawn position differs from the tick position
    expect(rt.cameras.weapons.centreX).toBeCloseTo(m.x, 6); expect(rt.cameras.weapons.centreY).toBeCloseTo(m.y, 6);
    rt.dispose();
  });
  it('X stands from Weapons too; the zoom keys move only the active console camera', () => {
    const { rt, press, tick } = rig();
    press('zoomIn'); tick();
    expect(rt.cameras.helm.targetZoom).toBeCloseTo(ZOOM_DEFAULT * ZOOM_STEP, 12);
    press('switch'); tick(); press('zoomOut'); tick();
    expect(rt.cameras.weapons.targetZoom).toBeCloseTo(ZOOM_DEFAULT / ZOOM_STEP, 12);
    expect(rt.cameras.helm.targetZoom).toBeCloseTo(ZOOM_DEFAULT * ZOOM_STEP, 12);
    press('stand'); tick();
    expect(rt.view()).toBe('interior');
    rt.dispose();
  });
  it('contact sparks come from hit-counter increases', () => {
    const { rt, tick } = rig();
    tick(); rt.drainEvents();
    rt.duel.tactical.ships[0].planetHits++; rt.duel.tactical.ships[1].asteroidHits++;
    tick();
    const contacts = rt.drainEvents().filter((e) => e.kind === 'contact');
    expect(contacts.map((e) => e.kind === 'contact' && [e.ship, e.body])).toEqual([[0, 'planet'], [1, 'asteroid']]);
    tick();
    expect(rt.drainEvents().filter((e) => e.kind === 'contact')).toEqual([]);
    rt.dispose();
  });
  it('keeps the pause reasons: focus never undoes Escape; gameplay presses are dropped while paused', () => {
    const { time, rt, press, tick } = rig();
    tick(); const t0 = rt.duel.interior.tick;
    press('pause'); rt.frame(1 / 60);
    expect([...rt.reasons()]).toEqual(['user']);
    rt.pause('blur'); rt.resume('blur');
    press('stand'); tick(); time.advance(500); rt.frame(1 / 60);
    expect(rt.duel.interior.tick).toBe(t0);
    press('pause'); rt.frame(1 / 60);
    rt.pause('hidden'); rt.pause('suspend'); time.advance(500); expect(rt.duel.interior.tick).toBe(t0);
    rt.resume('hidden'); rt.resume('suspend'); time.advance(500);
    expect(rt.duel.interior.tick).toBe(t0 + 30);
    expect(rt.view()).toBe('helm');   // the X pressed while paused was dropped
    rt.dispose();
  });
  it('the duel ends, stepping stops, and Enter restarts with seed + 1, a fresh tick epoch and the solo start again', () => {
    const { time, rt, press, tick, cleared } = rig(7);
    press('switch'); tick(); press('zoomIn'); tick();
    rt.duel.tactical.systems[1].hull = 0; tick();
    expect(rt.duel.tactical.outcome).toBe(Outcome.CrewWins);
    expect(rt.ended()).toBe(true);
    const stopped = rt.duel.interior.tick;
    time.advance(1000); rt.frame(1 / 60);
    expect(rt.duel.interior.tick).toBe(stopped);
    const old = rt.duel, before = cleared();
    press('confirm'); rt.frame(1 / 60);
    expect(rt.duel).not.toBe(old);
    expect([rt.seed, rt.epoch(), rt.active(), rt.view(), rt.ended()]).toEqual([8, 1, 0, 'helm', false]);
    expect(rt.duel.interior.tick).toBe(0);
    expect(cleared()).toBe(before + 1);
    expect([rt.cameras.helm.targetZoom, rt.cameras.weapons.targetZoom]).toEqual([ZOOM_DEFAULT, ZOOM_DEFAULT]);
    expect(rt.drainEvents()).toEqual([]);
    time.advance(TICK_MS + 0.01); rt.frame(1 / 60);
    expect(rt.duel.interior.tick).toBe(1);   // a fresh epoch: no burst for the time spent on the end screen
    expect(rt.lastResults().map((r) => [r.id.player, r.id.sequence, r.tick])).toEqual([[1, 0, 0]]);
    expect(rt.duel.present).toEqual([true, false]);
    rt.dispose();
  });
});

describe('weapons commands match the sim (H-1b impl review)', () => {
  const rejected = (rt: ReturnType<typeof rig>['rt']): string[] => rt.lastResults().filter((r) => r.status === 'rejected').map((r) => String(r.reason));
  it('Space while the missile flies sends nothing the sim would reject', () => {
    const { rt, hold, press, tick, ticks } = rig();
    press('switch'); tick(); press('launch'); tick(); ticks(2);
    expect(missileOf(rt.duel.tactical, 0)).not.toBeNull();
    hold({ fireHeld: true }); press('fireDown'); tick();
    expect(rejected(rt)).toEqual([]); expect(rt.lastResults()).toEqual([]);
    expect(rt.duel.tactical.systems[0].fireHeld).toBe(false);
    hold({ fireHeld: false }); press('fireUp'); tick();
    expect(rt.lastResults()).toEqual([]);
    rt.dispose();
  });
  it('F with an empty magazine or Weapons damage 2 sends nothing', () => {
    const { rt, press, tick } = rig();
    press('switch'); tick();
    rt.duel.tactical.systems[0].magazine = 0;
    press('launch'); tick();
    expect(rt.lastResults()).toEqual([]); expect(missileOf(rt.duel.tactical, 0)).toBeNull();
    rt.duel.tactical.systems[0].magazine = 2; rt.duel.tactical.systems[0].rooms[Room.Weapons] = 2;
    press('launch'); tick();
    expect(rt.lastResults()).toEqual([]); expect(missileOf(rt.duel.tactical, 0)).toBeNull();
    rt.dispose();
  });
  it('a release goes out only after a press did', () => {
    const { rt, hold, press, tick } = rig();
    press('switch'); tick();
    press('fireUp'); tick();   // no press was ever sent
    expect(rt.lastResults()).toEqual([]);
    hold({ fireHeld: true }); press('fireDown'); tick();
    hold({ fireHeld: false }); press('fireUp'); tick();
    expect(rt.lastResults().map((r) => r.status)).toEqual(['applied']);
    rt.dispose();
  });
  it('F then Tab in two frames before one tick: no not-at-weapons rejection, nothing stuck', () => {
    const { time, rt, hold, press, tick } = rig();
    press('switch'); tick();
    hold({ fireHeld: true }); press('fireDown'); tick();
    expect(rt.duel.tactical.systems[0].fireHeld).toBe(true);
    press('launch'); rt.frame(1 / 60);
    press('switch'); rt.frame(1 / 60);
    time.advance(TICK_MS); rt.frame(1 / 60);
    expect(rejected(rt)).toEqual([]);
    expect(rt.active()).toBe(0);   // Tab back to the pilot
    expect(rt.duel.tactical.systems[0].fireHeld).toBe(false);   // the empty seat let go of Fire
    expect(missileOf(rt.duel.tactical, 0)).toBeNull();
    tick(); expect(rejected(rt)).toEqual([]);
    rt.dispose();
  });
});

describe('pointer input never survives a Tab or a restart (H-1b impl review)', () => {
  it('Tab: the drag and wheel sampled that frame do not touch the camera now active', () => {
    const { rt, press, pointer, tick } = rig();
    press('switch'); tick(); press('switch'); tick();   // settle; Helm active again
    const cam = rt.cameras.weapons, before = { cx: cam.centreX, cy: cam.centreY, tz: cam.targetZoom, follow: cam.follow };
    Object.assign(pointer, { x: 300, y: 200, wheel: 3, dragX: 80, dragY: 40 });
    press('switch'); rt.frame(1 / 60);
    expect(rt.active()).toBe(1);
    expect({ cx: cam.centreX, cy: cam.centreY, tz: cam.targetZoom, follow: cam.follow }).toEqual(before);
    rt.dispose();
  });
  it('restart: the drag and wheel sampled with Enter do not touch the reset camera', () => {
    const { rt, press, pointer, ticks } = rig();
    rt.duel.tactical.outcome = Outcome.CrewWins; ticks(1);
    expect(rt.ended()).toBe(true);
    Object.assign(pointer, { x: 300, y: 200, wheel: 3, dragX: 80, dragY: 40 });
    press('confirm'); rt.frame(1 / 60);
    expect(rt.epoch()).toBe(1);
    const cam = rt.cameras.helm;
    expect(cam.follow).toBe('ship'); expect(cam.targetZoom).toBeCloseTo(ZOOM_DEFAULT, 12);
    rt.dispose();
  });
});

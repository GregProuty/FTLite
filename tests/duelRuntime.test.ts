import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Position } from '../src/renderer/src/sim/components';
import { missileOf, Outcome, removeMissile, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { REPAIR_RATE_SOLO } from '../src/renderer/src/sim/duel/tuning';
import { emptyPresses, NO_HELD_FLAGS, type KeyAction, type KeySample, type PointerSample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { followingSeed } from '../src/renderer/src/sim/duel/seeds';
import { ZOOM_DEFAULT, ZOOM_STEP } from '../src/renderer/src/render/tactical/camera';
import { interpolatedMissile } from '../src/renderer/src/render/tactical/fxModel';
import type { DuelRoundRecord } from '../src/renderer/src/sim/duel/summary';
import { soloDuelRecord, validateDuelRecord } from '../src/renderer/src/net/duelRecord';
import { soloRecorder } from '../src/renderer/src/app/duel/soloRecorder';

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
function rig(seed = 5, onRound?: (record: DuelRoundRecord) => void) {
  const time = fakeTime();
  let keys = idle(), cleared = 0;
  const pointer: PointerSample = { x: null, y: null, wheel: 0, dragX: 0, dragY: 0 };
  const rt = createDuelRuntime({
    now: time.now, scheduler: time.scheduler, seed, viewport: { w: 1280, h: 720 }, layout,
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses() }; return k; },
    samplePointer: () => ({ ...pointer }),
    clearKeys: () => { keys = idle(); cleared++; }, onRound
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
    hold({ moveY: -1 }); press('throttleUp', 'throttleUp', 'throttleUp', 'throttleUp'); tick();   // Artemis-ii: full throttle; held W no longer thrusts
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
  it('M asks for the main menu only while user-paused or on the end screen (main menu spec)', () => {
    const { rt, press, tick } = rig(7);
    press('menu'); tick(); expect(rt.menuRequested()).toBe(false);   // while playing, M does nothing
    rt.pause('blur'); press('menu'); rt.frame(1 / 60); expect(rt.menuRequested()).toBe(false); rt.resume('blur');
    press('pause'); rt.frame(1 / 60); press('menu'); rt.frame(1 / 60); expect(rt.menuRequested()).toBe(true);
    rt.dispose();
    const end = rig(7);
    end.rt.duel.tactical.systems[1].hull = 0; end.tick(); expect(end.rt.ended()).toBe(true);
    end.press('menu'); end.rt.frame(1 / 60); expect(end.rt.menuRequested()).toBe(true);
    end.rt.dispose();
  });
  it('the round ends, the end card keeps ticking, and Enter sends a rematch: the next round in place with the following seed (H-2 spec §7)', () => {
    const { time, rt, press, tick, cleared } = rig(7);
    press('switch'); tick(); press('zoomIn'); tick();
    rt.duel.tactical.systems[1].hull = 0; tick();
    expect(rt.duel.tactical.outcome).toBe(Outcome.CrewWins);
    expect(rt.ended()).toBe(true);
    const decided = rt.duel.interior.tick;
    time.advance(1000); rt.frame(1 / 60);
    expect(rt.duel.interior.tick).toBe(decided + 60);   // the end card's ticks advance; nothing moves
    const duel = rt.duel, before = cleared();
    press('confirm'); tick(); tick();
    expect(rt.duel).toBe(duel);   // the same duel: the next round began in place
    expect([rt.seed, rt.epoch(), rt.active(), rt.view(), rt.ended()]).toEqual([followingSeed(7), 1, 1, 'weapons', false]);   // presence carried: player 1 is still the one at the keyboard
    expect(rt.duel.baseTick).toBeGreaterThan(decided + 60);
    expect(cleared()).toBe(before + 1);
    expect([rt.cameras.helm.targetZoom, rt.cameras.weapons.targetZoom]).toEqual([ZOOM_DEFAULT, ZOOM_DEFAULT]);
    expect(rt.drainEvents()).toEqual([]);
    expect(rt.duel.present).toEqual([false, true]);
    rt.dispose();
  });
  it('hands each decided round to onRound once, from a fresh accumulator per round, as a valid solo record (H-2b)', () => {
    const rounds: DuelRoundRecord[] = [], { time, rt, press, tick, ticks } = rig(7, (r) => rounds.push(r));
    ticks(330);   // player 1 is away from Weapons all round (the solo start)
    rt.duel.tactical.systems[1].hull = 0; tick();
    const decided = rt.duel.decidedTick;
    time.advance(1000); rt.frame(1 / 60);   // the end card's ticks add nothing
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({ round: 0, seed: 7, baseTick: 0, outcome: Outcome.CrewWins, ticks: decided });
    press('confirm'); tick(); tick();
    ticks(120); rt.duel.tactical.systems[1].hull = 0; tick();
    expect(rounds).toHaveLength(2);
    expect(rounds[1]).toMatchObject({ round: 1, seed: followingSeed(7), baseTick: rt.duel.baseTick, ticks: rt.duel.decidedTick - rt.duel.baseTick });
    expect([rounds[0]!.weaponsEmptyTicks, rounds[1]!.weaponsEmptyTicks]).toEqual([rounds[0]!.ticks, rounds[1]!.ticks]);   // counted per round, not carried over
    const record = soloDuelRecord(rounds[1]!, { seat: 0, helmPlayer: 0, startedAtIso: '2026-11-16T12:00:00.000Z', pauses: 2 });
    expect(validateDuelRecord(record)).toMatchObject({ session: 'solo', role: 'host', transport: null, round: 1, latency: { held: { count: 0 }, rttMs: null }, disconnects: 0, pauses: 2 });
    rt.dispose();
  });
  it("Single player's recorder counts the user's pause edges per round, resets on each record, and ignores a blur pause (H-2b)", () => {
    let clock = 0, active: 0 | 1 = 0;
    const iso = (): string => new Date(Date.UTC(2026, 10, 16, 12, 0, clock++)).toISOString();
    const solo = soloRecorder({ now: iso, active: () => active, helmPlayer: () => 1 });
    const { rt } = rig(7);
    // The caller reads the user's own pause after each frame, as duelMode does: blur, hidden and suspend are not counted.
    const frame = (): void => { rt.frame(1 / 60); solo.framePaused(rt.reasons().has('user')); };
    frame(); rt.pause('user'); frame(); frame(); rt.resume('user'); frame();
    rt.pause('blur'); frame(); rt.resume('blur'); frame();
    rt.pause('user'); frame(); rt.resume('user'); frame();
    active = 1;
    const first = solo.record({ round: 0, seed: 7 } as DuelRoundRecord);
    expect([first.pauses, first.seat, first.helmPlayer, first.session, first.startedAtIso]).toEqual([2, 1, 1, 'solo', '2026-11-16T12:00:00.000Z']);
    frame();
    const second = solo.record({ round: 1, seed: 8 } as DuelRoundRecord);
    expect([second.pauses, second.startedAtIso]).toEqual([0, '2026-11-16T12:00:01.000Z']);   // from the time of the first record
    // A pause still on across a record is not a new edge for the next round.
    rt.pause('user'); frame(); solo.record({ round: 2, seed: 9 } as DuelRoundRecord); frame();
    expect(solo.record({ round: 3, seed: 10 } as DuelRoundRecord).pauses).toBe(0);
    rt.dispose();
  });
  it('the end card sends neutral held input, as online does (H-2 spec §3, §7)', () => {
    const { rt, hold, tick } = rig(7);
    hold({ moveX: 1, moveY: -1, interactHeld: true }); tick();
    expect(rt.held()[0]).toEqual({ moveX: 1, moveY: -1, interactHeld: true });
    rt.duel.tactical.systems[1].hull = 0; tick();
    expect(rt.ended()).toBe(true);
    tick(); tick();
    expect(rt.held()[0]).toEqual({ moveX: 0, moveY: 0, interactHeld: false });
    expect([rt.axes(), rt.steer()]).toEqual([{ turn: 0, thrust: 0 }, 0]);
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

describe('pointer input never survives a Tab or a rematch (H-1b impl review)', () => {
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
  it('rematch: the drag and wheel sampled with Enter do not touch the new round camera', () => {
    const { rt, press, pointer, ticks } = rig();
    rt.duel.tactical.systems[1].hull = 0; ticks(3);   // decided, then two end-card ticks: nothing moves, the follow has settled
    expect([rt.ended(), rt.view()]).toEqual([true, 'helm']);
    const active = rt.cameras.helm, before = { cx: active.centreX, cy: active.centreY, tz: active.targetZoom, follow: active.follow };
    Object.assign(pointer, { x: 300, y: 200, wheel: 3, dragX: 80, dragY: 40 });
    press('confirm'); rt.frame(1 / 60);
    // The press frame, before any tick: the sampled drag and wheel are dropped, so the active camera is untouched
    // (freshCameras on the next round would hide a regression here).
    expect({ cx: active.centreX, cy: active.centreY, tz: active.targetZoom, follow: active.follow }).toEqual(before);
    Object.assign(pointer, { wheel: 0, dragX: 0, dragY: 0 }); ticks(2);
    expect(rt.epoch()).toBe(1);
    const cam = rt.cameras.helm;
    expect(cam.follow).toBe('ship'); expect(cam.targetZoom).toBeCloseTo(ZOOM_DEFAULT, 12);
    rt.dispose();
  });
});

describe('the interior zoom camera input (interior zoom spec rules 1-4)', () => {
  const standing = () => { const r = rig(); r.press('stand'); r.ticks(2); expect(r.rt.view()).toBe('interior'); return r; };
  it('the wheel, the zoom keys, a drag and C feed the interior camera only while standing', () => {
    const { rt, press, pointer, tick, ticks } = rig();
    Object.assign(pointer, { x: 300, y: 200, wheel: -100 }); rt.frame(1 / 60);
    expect(rt.interiorCamera.notches).toBe(0);   // at the Helm the wheel is the Helm camera's
    Object.assign(pointer, { wheel: 0 }); press('stand'); ticks(2);
    expect(rt.view()).toBe('interior');
    Object.assign(pointer, { wheel: -100 }); rt.frame(1 / 60);
    expect([rt.interiorCamera.notches, rt.interiorCamera.anchor]).toEqual([1, { x: 300, y: 200 }]);
    Object.assign(pointer, { wheel: 0, dragX: 12, dragY: -4 }); press('zoomIn'); rt.frame(1 / 60);
    expect([rt.interiorCamera.notches, rt.interiorCamera.dragX, rt.interiorCamera.dragY]).toEqual([2, 12, -4]);
    Object.assign(pointer, { dragX: 0, dragY: 0 });
    rt.interiorCamera.follow = false; press('camera'); tick();
    expect(rt.interiorCamera.follow).toBe(true);
    expect(rt.view()).toBe('interior');   // C does nothing else while standing
    rt.dispose();
  });
  it('the wheel and a drag while standing leave both console cameras untouched', () => {
    const { rt, pointer } = standing();
    const snap = () => [rt.cameras.helm, rt.cameras.weapons].map((c) => ({ cx: c.centreX, cy: c.centreY, tz: c.targetZoom, follow: c.follow }));
    const before = snap();
    Object.assign(pointer, { x: 300, y: 200, wheel: -300, dragX: 80, dragY: 40 }); rt.frame(1 / 60);
    Object.assign(pointer, { wheel: 0, dragX: 0, dragY: 0 });
    expect(rt.interiorCamera.notches).toBe(3);
    expect(snap().map((c) => ({ tz: c.tz, follow: c.follow }))).toEqual(before.map((c) => ({ tz: c.tz, follow: c.follow })));
    expect(snap().map((c) => c.follow)).toEqual(['ship', 'ship']);
    rt.dispose();
  });
  it('pause keeps the zoom and the camera still moves; Tab keeps the level and follows again; a rematch resets it', () => {
    const { rt, press, pointer, tick, ticks } = standing();
    press('pause'); tick();
    expect(rt.paused()).toBe(true);
    Object.assign(pointer, { x: 10, y: 10, wheel: -100 }); rt.frame(1 / 60); Object.assign(pointer, { wheel: 0 });
    expect(rt.interiorCamera.notches).toBe(1);
    press('pause'); tick();
    rt.interiorCamera.level = 3; rt.interiorCamera.follow = false; rt.interiorCamera.notches = 0;
    press('switch'); tick();
    expect([rt.active(), rt.interiorCamera.level, rt.interiorCamera.follow]).toEqual([1, 3, true]);
    rt.duel.tactical.systems[1].hull = 0; ticks(2);
    expect(rt.ended()).toBe(true);
    press('confirm'); ticks(2);
    expect(rt.epoch()).toBe(1);
    expect([rt.interiorCamera.level, rt.interiorCamera.follow, rt.interiorCamera.last]).toEqual([0, true, null]);
    rt.dispose();
  });
});

describe('the Artemis console clicks (Artemis spec §4.1, §6.1)', () => {
  it('a lock click at Weapons queues laserLock to that room; the same click at the Helm changes nothing', () => {
    const { rt, hold, press, tick } = rig();
    const ship = rt.duel.tactical.systems[0], before = ship.lock;
    hold({ lockTo: 2 }); tick(); hold({ lockTo: null });   // player 0 sits at the Helm
    expect(ship.lock).toBe(before);
    press('switch'); tick();
    expect(rt.view()).toBe('weapons');
    expect(ship.lock).not.toBe(2);
    hold({ lockTo: 2 }); tick(); hold({ lockTo: null });
    expect(ship.lock).toBe(2);
    rt.dispose();
  });
  it("uiHeld() is the last frame's held flags (none when the sample has none); mode is single", () => {
    const { rt, hold } = rig();
    expect(rt.mode).toBe('single');
    expect(rt.uiHeld()).toEqual(NO_HELD_FLAGS);
    const held = { ...NO_HELD_FLAGS, fire: true, left: true };
    hold({ held }); rt.frame(1 / 60);
    expect(rt.uiHeld()).toEqual(held);
    hold({ held: undefined }); rt.frame(1 / 60);
    expect(rt.uiHeld()).toEqual(NO_HELD_FLAGS);
    rt.dispose();
  });
});

describe('the Helm throttle (Artemis spec §5.4)', () => {
  it('W and S step it a notch a press, clamped to −1..4, and it holds with no key down', () => {
    const { rt, press, tick, ticks } = rig();
    press('throttleUp'); tick();
    expect([rt.duel.throttle, rt.throttle(), rt.axes()]).toEqual([1, 1, { turn: 0, thrust: 0.25 }]);
    press('throttleUp', 'throttleUp', 'throttleUp', 'throttleUp'); tick();
    expect([rt.duel.throttle, rt.axes()]).toEqual([4, { turn: 0, thrust: 1 }]);
    ticks(10);
    expect(rt.duel.throttle).toBe(4);
    press('throttleDown'); tick();
    expect([rt.duel.throttle, rt.axes().thrust]).toEqual([3, 0.75]);
    for (let n = 0; n < 6; n++) { press('throttleDown'); tick(); }
    expect([rt.duel.throttle, rt.axes().thrust]).toEqual([-1, -1]);
    expect(rt.lastResults().some((r) => r.status === 'rejected')).toBe(false);
    rt.dispose();
  });
  it('two presses in two frames before one tick build on the queued level, not the confirmed one', () => {
    const { rt, press, tick } = rig();
    tick();
    press('throttleUp'); rt.frame(1 / 60); press('throttleUp'); rt.frame(1 / 60);
    expect([rt.duel.throttle, rt.throttle()]).toEqual([0, 2]);
    tick();
    expect([rt.duel.throttle, rt.throttle()]).toEqual([2, 2]);
    rt.dispose();
  });
  it('a notch click asks for its level at the Helm only; stand and sit keep the level, and the empty Helm coasts', () => {
    const { rt, hold, press, tick } = rig();
    hold({ throttleTo: 3 }); tick(); hold({ throttleTo: null });
    expect(rt.duel.throttle).toBe(3);
    press('stand'); tick();
    expect([rt.view(), rt.duel.throttle, rt.axes()]).toEqual(['interior', 3, { turn: 0, thrust: 0 }]);
    hold({ throttleTo: 1 }); tick(); hold({ throttleTo: null });   // standing: the click does nothing
    expect(rt.duel.throttle).toBe(3);
    press('interact'); tick();
    expect([rt.view(), rt.duel.throttle, rt.axes()]).toEqual(['helm', 3, { turn: 0, thrust: 0.75 }]);
    rt.dispose();
  });
  it('Tab drops a throttle the left Helm had queued, so nothing is rejected', () => {
    const { rt, press, tick } = rig();
    tick();
    press('throttleUp'); rt.frame(1 / 60); press('switch'); tick();
    expect(rt.lastResults().some((r) => r.status === 'rejected')).toBe(false);
    expect(rt.duel.throttle).toBe(0);
    rt.dispose();
  });
});

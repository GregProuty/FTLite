// Helm round 2 (spec 2026-11-19-helm-round2-design §2.3, §3.3, §4, §8) in Single player: a tap of S from a forward throttle
// (or of W from a reverse one) sends throttleCut, judged against the throttle when the key went down; a queued cut is a
// console command a stand drops; a thruster press on an empty charge says NO GAS once; at the crew Helm Space sends no face,
// the right button's heading is not sent and the right drag pans. The Valkyrn class's Helm keeps all three.
import { describe, expect, it, vi } from 'vitest';
import * as duelStep from '../src/renderer/src/sim/duel/step';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuelKeyboard, emptyPresses, NO_HELD_FLAGS, type EventSource, type KeySample, type PointerSample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { GAS_MAX } from '../src/renderer/src/sim/duel/tuning';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { seatDuelCrew } from './helpers/duelSeat';

const layout = parseShip(cutter), VP = { w: 1280, h: 720 };
const NO_POINTER = (): PointerSample => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 });
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
/** Single player, both seated (player 0 at the Helm, active), on the Hound's class or `cls`; the one-shot key fields and the
 *  pointer clear after each sample. */
function rig(cls?: number) {
  const time = fakeTime();
  let keys = idle(), heading: number | null = null, pointer = NO_POINTER();
  const rt = createDuelRuntime({
    now: time.now, scheduler: time.scheduler, seed: 5, viewport: VP, layout, cls,
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses(), throttleDown: 0, throttleTap: 0 }; return k; },
    samplePointer: () => { const p = pointer; pointer = NO_POINTER(); return p; },
    takeHeading: () => { const h = heading; heading = null; return h; }
  });
  seatDuelCrew(rt.duel);
  const r = {
    rt,
    set(k: Partial<KeySample>) { keys = { ...keys, ...k }; },
    heading(h: number) { heading = h; },
    drag(p: Partial<PointerSample>) { pointer = { ...pointer, ...p }; },
    tick() { time.advance(1000 / 60); rt.frame(1 / 60); },
    /** A frame with no tick due (the time does not move). */
    frameOnly() { rt.frame(1 / 60); },
    /** A tap of S (−1) or W (1): the keydown frame, one more held frame (a tick lands after a frame's held is built, so a
     *  one-frame hold can reach no tick), then the keyup frame. */
    tap(dir: 1 | -1) { r.set({ throttleDown: dir, throttleHeld: dir }); r.tick(); r.tick(); r.set({ throttleTap: dir, throttleHeld: 0 }); r.tick(); r.tick(); },
    refusals: (control: string) => rt.takeRefusals().filter((x) => x.control === control)
  };
  r.tick();   // the first frame: the seat becomes the crew Helm (its stale sample)
  return r;
}

describe('the tap in Single player (spec §2.3)', () => {
  it('a tap of S with the throttle above 0 at keydown cuts it to 0', () => {
    const r = rig();
    try { r.rt.duel.thrMille = 400; r.tap(-1); expect(r.rt.duel.thrMille).toBe(0); } finally { r.rt.dispose(); }
  });
  it('a tap of S at 0 or below sends no cut: it is a short press (a nudge into reverse)', () => {
    const a = rig(), b = rig();
    try {
      a.tap(-1); expect(a.rt.duel.thrMille).toBeLessThan(0);
      b.rt.duel.thrMille = -300; b.tap(-1); expect(b.rt.duel.thrMille).toBeLessThan(-300);
    } finally { a.rt.dispose(); b.rt.dispose(); }
  });
  it('a tap of W below 0 cuts it; a tap of W above 0 sends none', () => {
    const a = rig(), b = rig();
    try {
      a.rt.duel.thrMille = -300; a.tap(1); expect(a.rt.duel.thrMille).toBe(0);
      b.rt.duel.thrMille = 400; b.tap(1); expect(b.rt.duel.thrMille).toBeGreaterThan(400);
    } finally { a.rt.dispose(); b.rt.dispose(); }
  });
  it('a press shorter than one frame (keydown and keyup in one sample) cuts a throttle above 0; at 0 it sends no cut (recorded first, then judged)', () => {
    for (const [start, cuts] of [[400, 1], [0, 0]] as const) {
      const r = rig(), step = vi.spyOn(duelStep, 'stepDuelTick');
      try {
        r.rt.duel.thrMille = start;
        r.set({ throttleDown: -1, throttleTap: -1 }); r.tick(); r.tick();   // one sample carries both; throttleHeld stays 0
        const sent = step.mock.calls.flatMap(([, input]) => input.commands.filter((e) => e.command.kind === 'throttleCut'));
        expect(sent, `from ${start}`).toHaveLength(cuts);
        expect(r.rt.duel.thrMille, `from ${start}`).toBe(0);
      } finally { step.mockRestore(); r.rt.dispose(); }
    }
  });
  it('a queued cut is a console command: a stand before its tick drops it, and the throttle stays set', () => {
    const r = rig();
    try {
      r.rt.duel.thrMille = 400;
      r.set({ throttleDown: -1 }); r.frameOnly();
      r.set({ throttleTap: -1 }); r.frameOnly();   // the cut is queued; no tick has run
      r.set({ presses: { ...emptyPresses(), stand: 1 } }); r.frameOnly();
      r.tick(); r.tick();
      expect(r.rt.view()).toBe('interior');
      expect(r.rt.duel.thrMille).toBe(400);   // helm round 2 §2.1: an unattended Helm keeps its throttle
    } finally { r.rt.dispose(); }
  });
});

describe('NO GAS in Single player (spec §3.3)', () => {
  it('a thruster key pressed on an empty charge says NO GAS once a press; with a charge, nothing', () => {
    const r = rig();
    try {
      r.rt.duel.gas = 0;
      r.set({ rcsX: 1 }); r.tick(); r.tick(); r.tick();
      expect(r.refusals('gas')).toEqual([{ control: 'gas', reason: 'NO GAS' }]);
      r.set({ rcsX: 0 }); r.tick(); r.set({ rcsY: -1 }); r.tick();
      expect(r.refusals('gas')).toHaveLength(1);   // a new press
      r.set({ rcsY: 0 }); r.tick(); r.rt.duel.gas = GAS_MAX; r.set({ rcsX: -1 }); r.tick();
      expect(r.refusals('gas')).toEqual([]);
    } finally { r.rt.dispose(); }
  });
  it('a PORT / STBD button press on an empty charge says NO GAS too', () => {
    const time = fakeTime(), fns = new Map<string, ((e: never) => void)[]>();
    const target: EventSource = { addEventListener(type: string, fn: (e: never) => void) { fns.set(type, [...(fns.get(type) ?? []), fn]); }, removeEventListener() {} };
    const kb = createDuelKeyboard(target);
    const rt = createDuelRuntime({ now: time.now, scheduler: time.scheduler, seed: 5, viewport: VP, layout, sampleKeys: () => kb.sample(), samplePointer: NO_POINTER, clearKeys: () => kb.clear(), staleKeys: () => kb.staleHeld() });
    seatDuelCrew(rt.duel);
    const tick = (): void => { time.advance(1000 / 60); rt.frame(1 / 60); };
    try {
      tick(); rt.duel.gas = 0; rt.takeRefusals();
      kb.ui.hold('ArrowLeft', true); tick(); tick();
      expect(rt.takeRefusals().filter((x) => x.control === 'gas')).toEqual([{ control: 'gas', reason: 'NO GAS' }]);
    } finally { rt.dispose(); }
  });
});

describe('what leaves the crew Helm in Single player (spec §4)', () => {
  it('Space sends no face and raises no auto-face refusal; the Valkyrn class\'s Helm still sends face', () => {
    for (const [cls, face] of [[undefined, false], [ShipClass.Valkyrn, true]] as const) {
      const r = rig(cls);
      try {
        r.rt.duel.tactical.systems[0].rooms[Room.Engines] = 2;   // Engines failed: the old auto-face refusal's condition
        r.set({ fireHeld: true, held: { ...NO_HELD_FLAGS, fire: true } }); r.tick(); r.tick();
        expect(r.rt.held()[0]!.face === true, String(cls)).toBe(face);
        if (!face) expect(r.refusals('auto-face')).toEqual([]);
      } finally { r.rt.dispose(); }
    }
  });
  it('the map\'s right-button heading is not sent at the crew Helm; the Valkyrn class\'s Helm still holds it', () => {
    for (const [cls, held] of [[undefined, -1], [ShipClass.Valkyrn, 77]] as const) {
      const r = rig(cls);
      try { r.heading(77); r.tick(); r.tick(); expect(r.rt.duel.holdHeading, String(cls)).toBe(held); } finally { r.rt.dispose(); }
    }
  });
  it('the right drag pans the crew Helm\'s map; on the Valkyrn class\'s Helm it aims, so the camera stays on the ship', () => {
    for (const [cls, follow] of [[undefined, 'free'], [ShipClass.Valkyrn, 'ship']] as const) {
      const r = rig(cls);
      try { r.drag({ dragX: 40, rightX: 40 }); r.tick(); expect(r.rt.cameras.helm.follow, String(cls)).toBe(follow); } finally { r.rt.dispose(); }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { emptyPresses, type KeyAction, type KeySample, type PointerSample } from '../src/renderer/src/app/duel/input';
import { DEFAULT_SEED, readMode, readSeed } from '../src/renderer/src/app/duel/mode';
import { createFlightRuntime } from '../src/renderer/src/app/duel/runtime';
import { ZOOM_DEFAULT, ZOOM_STEP } from '../src/renderer/src/render/tactical/camera';

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
/** Scripted input: the test sets `keys` and `pointer` before each frame. */
function rig(seed = 5) {
  const time = fakeTime();
  const input = {
    keys: { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() } as KeySample,
    pointer: { x: null, y: null, wheel: 0, dragX: 0, dragY: 0 } as PointerSample
  };
  const rt = createFlightRuntime({
    now: time.now, scheduler: time.scheduler, seed, viewport: { w: 1280, h: 720 },
    sampleKeys: () => { const k = input.keys; input.keys = { ...k, presses: emptyPresses() }; return k; },
    samplePointer: () => { const p = input.pointer; input.pointer = { ...p, wheel: 0, dragX: 0, dragY: 0 }; return p; }
  });
  const press = (action: KeyAction): void => { input.keys = { ...input.keys, presses: { ...input.keys.presses, [action]: input.keys.presses[action] + 1 } }; };
  return { time, input, rt, press };
}

describe('the flight runtime (H-1 spec §4, §9)', () => {
  it('steps the single-ship flight at 60 Hz from the wall clock; ship 1 never moves', () => {
    const { time, rt } = rig();
    const s1 = { ...rt.state.ships[1] };
    time.advance(1010);   // the driver polls every 1000/120 ms, so the tick due at 1000 ms runs on the next poll
    expect(rt.state.tick).toBe(60);
    expect(rt.state.ships[1].x).toBe(s1.x); expect(rt.state.ships[1].y).toBe(s1.y);
    rt.dispose();
  });
  it('W held thrusts forward; the axes the last tick sent are exposed', () => {
    const { time, input, rt } = rig();
    expect(rt.axes()).toEqual({ turn: 0, thrust: 0 });
    input.keys = { ...input.keys, moveY: -1 };
    rt.frame(1 / 60);
    const v0 = Math.hypot(rt.state.ships[0].vx, rt.state.ships[0].vy);
    time.advance(500);
    expect(rt.axes()).toEqual({ turn: 0, thrust: 1 });
    expect(Math.hypot(rt.state.ships[0].vx, rt.state.ships[0].vy)).toBeGreaterThan(v0 + 30);
    rt.dispose();
  });
  it('records the previous tick positions and interpolates by wall time', () => {
    const { time, rt } = rig();
    expect(rt.alpha()).toBe(1);
    time.advance(1000 / 60 + 0.01);
    expect(rt.state.tick).toBe(1);
    const s = rt.state.ships[0];
    expect(rt.prev[0]!.x).not.toBe(s.x);   // the spawn orbits, so the ship moved on tick 0
    time.advance(1000 / 60 / 2); rt.frame(1 / 60);
    expect(rt.alpha()).toBeGreaterThan(0.45); expect(rt.alpha()).toBeLessThanOrEqual(0.55);
    rt.pause('user');
    time.advance(1000); rt.frame(1 / 60);
    expect(rt.alpha()).toBe(1);
    rt.dispose();
  });
  it('keeps a set of pause reasons: focus never undoes an Escape pause', () => {
    const { time, rt, press } = rig();
    time.advance(100); const t0 = rt.state.tick;
    press('pause'); rt.frame(1 / 60);
    expect([...rt.reasons()]).toEqual(['user']);
    rt.pause('blur'); rt.resume('blur');
    time.advance(500);
    expect(rt.state.tick).toBe(t0);
    expect(rt.paused()).toBe(true);
    press('pause'); rt.frame(1 / 60);
    expect(rt.paused()).toBe(false);
    rt.pause('hidden'); rt.pause('suspend'); time.advance(500); expect(rt.state.tick).toBe(t0);
    rt.resume('hidden'); time.advance(500); expect(rt.state.tick).toBe(t0);
    rt.resume('suspend'); time.advance(500); expect(rt.state.tick).toBe(t0 + 30);
    rt.dispose();
  });
  it('drives the camera: follows the ship, zoom keys and wheel, drag pans, C snaps back', () => {
    const { time, input, rt, press } = rig();
    time.advance(200); rt.frame(1 / 60);
    const ship = rt.state.ships[0];
    expect(Math.hypot(rt.camera.centreX - ship.x, rt.camera.centreY - ship.y)).toBeLessThan(20);
    press('zoomIn'); press('zoomIn'); press('zoomOut'); rt.frame(1 / 60);
    expect(rt.camera.targetZoom).toBeCloseTo(ZOOM_DEFAULT * ZOOM_STEP, 12);
    input.pointer = { ...input.pointer, x: 900, y: 200, wheel: 100 }; rt.frame(1 / 60);
    expect(rt.camera.targetZoom).toBeCloseTo(ZOOM_DEFAULT, 12);
    input.pointer = { ...input.pointer, dragX: 300, dragY: 0 }; rt.frame(1 / 60);
    expect(rt.camera.follow).toBe('free');
    press('camera'); rt.frame(1 / 60);
    expect(rt.camera.follow).toBe('ship');
    for (let k = 0; k < 20; k++) rt.frame(1 / 60);
    time.advance(0);
    expect(Math.hypot(rt.camera.centreX - ship.x, rt.camera.centreY - ship.y)).toBeLessThan(20);
    rt.dispose();
  });
  it('a drag and a wheel in the same frame: the camera goes free and zooms about the cursor', () => {
    const { input, rt } = rig();
    rt.frame(1 / 60);
    input.pointer = { x: 900, y: 200, wheel: -100, dragX: 50, dragY: 0 };
    rt.frame(0);
    expect(rt.camera.follow).toBe('free');
    expect(rt.camera.targetZoom).toBeCloseTo(ZOOM_DEFAULT * ZOOM_STEP, 12);
    expect(rt.camera.anchor).toMatchObject({ sx: 900, sy: 200 });
    rt.dispose();
  });
  it('stops stepping once disposed', () => {
    const { time, rt } = rig();
    time.advance(100); const t0 = rt.state.tick; rt.dispose(); time.advance(1000);
    expect(rt.state.tick).toBe(t0);
  });
});

describe('the launch mode (H-1 spec §3)', () => {
  it('flight for ?mode=flight, the duel for ?mode=duel; anything else is the sector game', () => {
    expect(readMode('?mode=flight')).toBe('flight'); expect(readMode('?mode=duel&seed=3')).toBe('duel');
    expect(readMode('')).toBe('sector'); expect(readMode('?mode=DUEL')).toBe('sector'); expect(readMode('?mode=FLIGHT')).toBe('sector'); expect(readMode('?mode=solo')).toBe('sector');
  });
  it('?seed overrides the default with a whole number', () => {
    expect(readSeed('')).toBe(DEFAULT_SEED); expect(readSeed('?mode=flight&seed=42')).toBe(42);
    expect(readSeed('?seed=-3')).toBe(DEFAULT_SEED); expect(readSeed('?seed=1.5')).toBe(DEFAULT_SEED); expect(readSeed('?seed=99999999999')).toBe(DEFAULT_SEED);
  });
  it('wheel: small trackpad deltas accumulate to one notch; the remainder resets after 200 ms idle', () => {
    const { time, input, rt } = rig();
    time.advance(50);
    for (let i = 0; i < 30; i++) { input.pointer = { ...input.pointer, x: 100, y: 100, wheel: -4 }; rt.frame(1 / 60); time.advance(16); }
    expect(rt.camera.targetZoom).toBeCloseTo(ZOOM_DEFAULT * ZOOM_STEP, 12);   // 120 px: exactly one notch in
    input.pointer = { ...input.pointer, wheel: 120 }; rt.frame(1 / 60);   // acc -20 -> 100 -> one notch out
    expect(rt.camera.targetZoom).toBeCloseTo(ZOOM_DEFAULT, 12);
    input.pointer = { ...input.pointer, wheel: 60 }; rt.frame(1 / 60);
    time.advance(300); rt.frame(1 / 60);   // idle: acc dropped
    input.pointer = { ...input.pointer, wheel: 60 }; rt.frame(1 / 60);
    expect(rt.camera.targetZoom).toBeCloseTo(ZOOM_DEFAULT, 12);   // 60 + 60 would have been a notch
    rt.dispose();
  });
  it('an Escape in a late frame pauses before the due ticks run', () => {
    const now = { t: 0 };
    let presses = emptyPresses();
    const rt = createFlightRuntime({
      now: () => now.t, scheduler: { schedule: () => () => {} }, seed: 5, viewport: { w: 1280, h: 720 },
      sampleKeys: () => { const k = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses }; presses = emptyPresses(); return k; },
      samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 })
    });
    now.t = 500;   // 30 ticks due; the scheduler never fires
    presses = { ...emptyPresses(), pause: 1 };
    rt.frame(1 / 60);
    expect(rt.paused()).toBe(true);
    expect(rt.state.tick).toBe(0);
    now.t = 2000;   // a long pause
    presses = { ...emptyPresses(), pause: 1 };
    rt.frame(1 / 60);   // resume: the 30 ticks due before the pause are discarded, not run in a burst
    expect(rt.paused()).toBe(false);
    expect(rt.state.tick).toBe(0);
    now.t = 2000 + 1000 / 60 + 1;
    rt.frame(1 / 60);
    expect(rt.state.tick).toBe(1);   // stepping resumes from the resume time
    rt.dispose();
  });
  it('wheel: a remainder older than 200 ms is dropped even when the next frame carries wheel input', () => {
    const { time, input, rt } = rig();
    time.advance(50);
    input.pointer = { ...input.pointer, x: 100, y: 100, wheel: 60 }; rt.frame(1 / 60);
    time.advance(300);   // no frames in between
    input.pointer = { ...input.pointer, wheel: 60 }; rt.frame(1 / 60);
    expect(rt.camera.targetZoom).toBeCloseTo(ZOOM_DEFAULT, 12);   // 60 + 60 would have been a notch out
    rt.dispose();
  });
  it('frame() pumps due ticks before drawing; one alpha per frame feeds the camera and the draw', () => {
    const calls: number[] = [];
    const now = { t: 0 };
    const rt = createFlightRuntime({
      now: () => now.t, scheduler: { schedule: () => () => {} }, seed: 5, viewport: { w: 1280, h: 720 },
      sampleKeys: () => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() }),
      samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 })
    });
    void calls;
    now.t = 1000 / 60 + 5;   // past the first deadline; the scheduler never fires
    expect(rt.state.tick).toBe(0);
    rt.frame(1 / 60);
    expect(rt.state.tick).toBeGreaterThan(0);
    expect(rt.alpha()).toBeLessThan(1);
    const a = rt.alpha(); now.t += 1; expect(rt.alpha()).toBe(a);   // fixed for the frame
    const s = rt.state.ships[0], p = rt.prev[0]!;
    const ix = p.x + (s.x - p.x) * a, iy = p.y + (s.y - p.y) * a;
    expect(Math.hypot(rt.camera.centreX - ix, rt.camera.centreY - iy)).toBeLessThan(25);
    rt.dispose();
  });
});

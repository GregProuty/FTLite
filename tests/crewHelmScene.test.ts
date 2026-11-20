// Playtest2feedback final review (M1 and the scene's steer gating): the real runtime and scene in node, as
// ownShipScene.test.ts does. The crew Helm's map steers only while the left button is held at the crew Helm; the steering
// marker shows only on a frame a steer goes out (never over a console block); and the Helm goal is used by the steer, A/D
// or auto-face (owner 2026-11-19: A/D turn the crew Helm again).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { emptyPresses, NO_HELD_FLAGS, type KeySample } from '../src/renderer/src/app/duel/input';
import type { AimSample } from '../src/renderer/src/app/duel/input';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { createDuelScene } from '../src/renderer/src/app/duel/scene';
import { createMapRequests } from '../src/renderer/src/app/duel/mapRequests';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';
import { sitDown, standUp } from '../src/renderer/src/sim/stations';
import { OWN_SHIP } from '../src/renderer/src/render/duel/consoleLayout';
import { tacticalModel } from '../src/renderer/src/render/tactical/tacticalModel';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { combatModel } from '../src/renderer/src/render/tactical/weaponsModel';

vi.mock('../src/renderer/src/render/tactical/tacticalModel', async (orig) => {
  const real = await orig<typeof import('../src/renderer/src/render/tactical/tacticalModel')>();
  return { ...real, tacticalModel: vi.fn(real.tacticalModel) };
});
vi.mock('../src/renderer/src/render/tactical/weaponsModel', async (orig) => {
  const real = await orig<typeof import('../src/renderer/src/render/tactical/weaponsModel')>();
  return { ...real, combatModel: vi.fn(real.combatModel) };
});
afterEach(() => { vi.restoreAllMocks(); });

const layout = parseShip(cutter);
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};
const LIVE = { banner: null, layerPaused: false, end: null };
const OPEN = { x: 900, y: 360 }, ON_BLOCK = { x: OWN_SHIP.x + OWN_SHIP.w / 2, y: OWN_SHIP.y + OWN_SHIP.h / 2 };

function rig(cls?: number) {
  let now = 0, left = false, pointer: { x: number; y: number } | null = null, aim: AimSample | null = null;
  const keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses(), held: NO_HELD_FLAGS };
  const rt = createDuelRuntime({
    now: () => now, seed: 5, viewport: { w: 1280, h: 720 }, layout, cls,
    scheduler: { schedule() { return () => {}; } },
    sampleKeys: () => keys, samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }), clearKeys: () => {}
  });
  const requests = createMapRequests(), stage = new Container(), store = createUiStore({ onlineAvailable: false } as never);
  const renderer = { app: { stage }, assets, stageScale: () => 1, feel: () => DEFAULT_FEEL, crt: () => 'off' as const };
  const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store), requests, pointer: () => pointer, leftHeld: () => left, takeAim: () => { const a = aim; aim = null; return a; } });
  rt.frame(1 / 60); now += 1000 / 60; rt.frame(1 / 60);
  return {
    rt, keys,
    set(o: { left?: boolean; pointer?: { x: number; y: number } | null }) { if (o.left !== undefined) left = o.left; if (o.pointer !== undefined) pointer = o.pointer; },
    frame() { now += 1000 / 60; rt.frame(1 / 60); },
    /** One draw: the steer it asked for (or null) and the steering marker it drew (or null). */
    draw(): { steer: number | null; marker: { x: number; y: number } | null } {
      vi.mocked(tacticalModel).mockClear();
      scene.draw(rt, 1 / 60, LIVE);
      const calls = vi.mocked(tacticalModel).mock.calls;
      return { steer: requests.takeSteer(), marker: calls.length ? calls.at(-1)![0].steerTo ?? null : null };
    },
    goal: (): boolean => vi.mocked(combatModel).mock.calls.at(-1)![0].goal === true,
    /** One draw with the right button pressed at p: the heading it asked for (or null) and whether the held heading drew as a preview. */
    right(p: { x: number; y: number }): { heading: number | null; preview: boolean } {
      aim = { x: p.x, y: p.y, press: true, release: false, held: true };
      vi.mocked(tacticalModel).mockClear();
      scene.draw(rt, 1 / 60, LIVE);
      return { heading: requests.takeHeading(), preview: vi.mocked(tacticalModel).mock.calls.at(-1)![0].holdPreview === true };
    },
    dispose() { scene.dispose(); rt.dispose(); }
  };
}

describe('the crew Helm map\'s steer (spec §4a, §6; final review M1)', () => {
  it('steers and draws the marker only at the crew Helm, only while the left button is held, and never over a block', () => {
    const r = rig();
    try {
      r.set({ left: true, pointer: OPEN });
      expect(r.draw()).toEqual({ steer: null, marker: null });   // standing: the interior, no map
      sitDown(r.rt.duel.interior, r.rt.active(), r.rt.duel.weapons);
      expect(r.rt.view()).toBe('weapons');
      expect(r.draw()).toEqual({ steer: null, marker: null });   // Weapons: the left button is the contact window's, not a steer
      standUp(r.rt.duel.interior, r.rt.active());
      sitDown(r.rt.duel.interior, r.rt.active(), r.rt.duel.nav);
      expect(r.rt.view()).toBe('helm');
      r.set({ left: false });
      expect(r.draw()).toEqual({ steer: null, marker: null });   // the button up: nothing
      r.set({ left: true });
      const on = r.draw();
      expect(on.steer).not.toBeNull();
      expect(on.marker).toEqual(OPEN);
      r.set({ pointer: ON_BLOCK });
      expect(r.draw()).toEqual({ steer: null, marker: null });   // over the own ship window: no steer, so no marker either
    } finally { r.dispose(); }
  });
  it('the Helm goal is used by the steer', () => {
    const r = rig();
    try {
      r.draw();
      sitDown(r.rt.duel.interior, r.rt.active(), r.rt.duel.nav);
      r.draw();
      expect(r.goal()).toBe(true);   // a new sit lights it
      r.set({ left: true, pointer: OPEN });
      r.draw();
      expect(r.goal()).toBe(false);   // the steer used it
    } finally { r.dispose(); }
  });
  it('A/D use the Helm goal at the crew Helm (owner 2026-11-19: they turn again)', () => {
    const r = rig();
    try {
      r.draw();
      sitDown(r.rt.duel.interior, r.rt.active(), r.rt.duel.nav);
      r.draw();
      expect(r.goal()).toBe(true);
      r.keys.held = { ...NO_HELD_FLAGS, left: true }; r.frame();
      r.draw();
      expect(r.goal()).toBe(false);   // A turned the nose
    } finally { r.dispose(); }
  });
});

describe('the turn refusal is the first steer of a hold, not any left press (final review M1)', () => {
  it('a press over a block refuses nothing; the hold\'s first steer says ENGINES OFFLINE once', () => {
    let now = 0, steer: number | null = null, left = false;
    const keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
    const rt = createDuelRuntime({
      now: () => now, seed: 5, viewport: { w: 1280, h: 720 }, layout,
      scheduler: { schedule() { return () => {}; } },
      sampleKeys: () => keys, samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }), clearKeys: () => {},
      takeSteer: () => { const s = steer; steer = null; return s; }, steerHeld: () => left
    });
    const frame = (): void => { now += 1000 / 60; rt.frame(1 / 60); };
    const turns = (): number => rt.takeRefusals().filter((x) => x.control === 'turn').length;
    try {
      frame();
      sitDown(rt.duel.interior, rt.active(), rt.duel.nav);
      rt.duel.tactical.systems[0].rooms[Room.Engines] = 2;   // the Engines failed
      frame(); rt.takeRefusals();
      left = true; frame(); frame();
      expect(turns()).toBe(0);   // held over a block: no bearing, no steer, no refusal
      steer = 64; frame();
      expect(turns()).toBe(1);
      steer = 70; frame();
      expect(turns()).toBe(0);   // the same hold
      left = false; frame(); left = true; steer = 80; frame();
      expect(turns()).toBe(1);   // a new hold's first steer
    } finally { rt.dispose(); }
  });
});

describe('helm round 2 §4: the right button and Space leave the crew Helm', () => {
  it('a right press on the crew Helm map asks for no heading and draws no preview; on the Valkyrn class\'s Helm it still does', () => {
    for (const [cls, asks] of [[undefined, false], [ShipClass.Valkyrn, true]] as const) {
      const r = rig(cls);
      try {
        r.draw();
        sitDown(r.rt.duel.interior, r.rt.active(), r.rt.duel.nav);
        r.draw();
        expect(r.right(OPEN), String(cls)).toEqual(asks ? { heading: expect.any(Number), preview: true } : { heading: null, preview: false });
      } finally { r.dispose(); }
    }
  });
  it('Space no longer uses the crew Helm goal; on the Valkyrn class\'s Helm it does', () => {
    for (const [cls, used] of [[undefined, false], [ShipClass.Valkyrn, true]] as const) {
      const r = rig(cls);
      try {
        r.draw();
        sitDown(r.rt.duel.interior, r.rt.active(), r.rt.duel.nav);
        r.draw();
        expect(r.goal()).toBe(true);
        r.keys.held = { ...NO_HELD_FLAGS, fire: true }; r.frame();
        r.draw();
        expect(r.goal(), String(cls)).toBe(!used);
      } finally { r.dispose(); }
    }
  });
});

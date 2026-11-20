// Owner 2026-11-19: at the crew Helm (the Cutter's newtonianHelm) the left button steers, but a left press on a ship
// contact opens its window, as on every other Helm, so the Helm can scan it; that press steers nothing until it is let
// go. A press on the open map still only steers. The real runtime, scene and tactical layer in node, as contactScene does.
import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { worldToScreen } from '../src/renderer/src/render/tactical/camera';
import { interpolatedShip } from '../src/renderer/src/render/tactical/tacticalModel';
import { emptyPresses, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { seatDuelCrew } from './helpers/duelSeat';
import { createDuelScene } from '../src/renderer/src/app/duel/scene';
import { createContactController } from '../src/renderer/src/app/duel/contactController';
import { createMapRequests } from '../src/renderer/src/app/duel/mapRequests';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';

const layout = parseShip(cutter);
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};
const vp = { w: 1280, h: 720 }, LIVE = { banner: null, layerPaused: false, end: null };

function rig() {
  let now = 0, left = false, pointer: { x: number; y: number } | null = null;
  const keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
  const rt = createDuelRuntime({
    now: () => now, seed: 5, viewport: vp, layout, scheduler: { schedule() { return () => {}; } },
    sampleKeys: () => keys, samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }), clearKeys: () => {}
  });
  const stage = new Container(), renderer = { app: { stage }, assets, stageScale: () => 1, feel: () => DEFAULT_FEEL, crt: () => 'off' as const };
  const store = createUiStore({ onlineAvailable: false } as never), contact = createContactController(), clicks: { x: number; y: number }[] = [], requests = createMapRequests();
  const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store), contact, requests,
    takeClick: () => clicks.shift() ?? null, pointer: () => pointer, leftHeld: () => left });
  seatDuelCrew(rt.duel);   // player 0 at the Helm
  const sh = rt.duel.tactical.ships; sh[1]!.x = sh[0]!.x + 300; sh[1]!.y = sh[0]!.y;
  rt.frame(1 / 60); now += 1000 / 60; rt.frame(1 / 60);
  const enemy = () => { const b = interpolatedShip(rt.duel.tactical, rt.prev, rt.alpha(), 1); return worldToScreen(rt.cameras.helm, vp, b.x, b.y); };
  /** A left press at `p`: the click and the held button on the same frame, as the canvas delivers them. */
  const press = (p: { x: number; y: number }) => { clicks.push(p); pointer = p; left = true; };
  const draw = () => { scene.draw(rt, 1 / 60, LIVE); return requests.takeSteer(); };
  return { rt, contact, press, draw, enemy, release: () => { left = false; }, dispose: () => { scene.dispose(); rt.dispose(); } };
}

describe('the crew Helm\'s left press on a contact (owner 2026-11-19)', () => {
  it('opens the enemy\'s window and steers nothing until let go; a press on the open map steers', () => {
    const r = rig();
    try {
      expect(r.rt.view()).toBe('helm');
      expect(r.draw()).toBeNull();
      const e = r.enemy();
      r.press(e);
      expect(r.draw()).toBeNull();   // the press picked the contact: no steer
      expect(r.contact.state()).toEqual({ contact: 0, aim: false });
      expect(r.draw()).toBeNull();   // still held: still no steer
      r.release(); r.draw();
      r.press({ x: e.x, y: e.y - 150 });   // the open map, off every contact
      expect(r.draw()).not.toBeNull();
      expect(r.contact.state()).toEqual({ contact: 0, aim: false });   // a steer press never closes the window
      r.release(); r.draw();
      r.press(e); r.draw();
      expect(r.contact.state()).toBeNull();   // the shown contact again closes it, as on the other Helm
    } finally { r.dispose(); }
  });
});

// Duel polish i spec §E (the scene): the frame carries the ship HUD on the SHIP view only (standing, console.station
// 'ship'), and none on the Helm console or while the console is hidden. The real runtime and scene in node, as
// contactScene.test.ts does.
import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { emptyPresses, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { createDuelScene } from '../src/renderer/src/app/duel/scene';
import { shipHud } from '../src/renderer/src/render/duel/shipHudModel';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';
import { seatDuelCrew } from './helpers/duelSeat';

const layout = parseShip(cutter);
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};
const LIVE = { banner: null, layerPaused: false, end: null };
const PAUSED = { banner: 'PAUSED', layerPaused: true, end: null };

describe('the scene and the ship HUD (spec §E)', () => {
  it('standing: the SHIP view frame carries shipHud(d); seated at the Helm or paused: none', () => {
    let now = 0;
    const keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
    const rt = createDuelRuntime({
      now: () => now, seed: 5, viewport: { w: 1280, h: 720 }, layout,
      scheduler: { schedule() { return () => {}; } },
      sampleKeys: () => keys, samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }), clearKeys: () => {}
    });
    const stage = new Container(), store = createUiStore({ onlineAvailable: false } as never);
    const renderer = { app: { stage }, assets, stageScale: () => 1, feel: () => DEFAULT_FEEL, crt: () => 'off' as const };
    const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store) });
    try {
      rt.frame(1 / 60); now += 1000 / 60; rt.frame(1 / 60);
      expect(rt.view()).toBe('interior');
      scene.draw(rt, 1 / 60, LIVE);
      const duel = () => store.getState().duel!;
      expect(duel().console?.station).toBe('ship');
      expect(duel().hud).toEqual(shipHud(rt.duel));
      scene.draw(rt, 1 / 60, PAUSED);
      expect(duel().console).toBeNull(); expect(duel().hud).toBeNull();
      seatDuelCrew(rt.duel);
      scene.draw(rt, 1 / 60, LIVE);
      expect(duel().console?.station).toBe('helm'); expect(duel().hud).toBeNull();
    } finally { scene.dispose(); rt.dispose(); }
  });
});

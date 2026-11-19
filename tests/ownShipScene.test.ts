// Own ship window spec §4, §6: the frame carries ownShip exactly on a console map view (onMap): not standing, not seated
// and Tabbed to SHIP. The real runtime and scene in node, as shipHudScene.test.ts does.
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
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';
import { sitDown } from '../src/renderer/src/sim/stations';

const layout = { ...parseShip(cutter), crew: 1 as const };   // one character: Tab toggles the console and the ship view while seated (Valkyrn spec §4.4)
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};
const LIVE = { banner: null, layerPaused: false, end: null };

describe('the scene and the own ship window (spec §4)', () => {
  it('standing: none; seated at the Helm on the map: set; seated and Tabbed to SHIP: none', () => {
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
    const duel = () => store.getState().duel!;
    try {
      rt.frame(1 / 60); now += 1000 / 60; rt.frame(1 / 60);
      expect(rt.view()).toBe('interior');
      scene.draw(rt, 1 / 60, LIVE);
      expect(duel().ownShip ?? null).toBeNull();
      sitDown(rt.duel.interior, rt.duel.helmPlayer, rt.duel.nav);
      scene.draw(rt, 1 / 60, LIVE);
      expect(duel().console?.station).toBe('helm');
      expect(duel().ownShip).toBeTruthy();
      expect(duel().ownShip!.tiles.length).toBeGreaterThan(0);
      keys.presses = { ...emptyPresses(), switch: 1 };   // Tab: the seated player's SHIP view
      now += 1000 / 60; rt.frame(1 / 60); keys.presses = emptyPresses();
      expect(rt.view()).toBe('interior');
      scene.draw(rt, 1 / 60, LIVE);
      expect(duel().ownShip ?? null).toBeNull();
    } finally { scene.dispose(); rt.dispose(); }
  });
});

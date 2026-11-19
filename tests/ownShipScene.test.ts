// Own ship window spec §4, §6: the frame carries ownShip exactly on a console map view (onMap): not standing, not seated
// and Tabbed to SHIP. The real runtime and scene in node, as shipHudScene.test.ts does.
import { afterEach, describe, expect, it, vi } from 'vitest';
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
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { OWN_SHIP } from '../src/renderer/src/render/duel/consoleLayout';
import { tacticalModel } from '../src/renderer/src/render/tactical/tacticalModel';

vi.mock('../src/renderer/src/render/tactical/tacticalModel', async (orig) => {
  const real = await orig<typeof import('../src/renderer/src/render/tactical/tacticalModel')>();
  return { ...real, tacticalModel: vi.fn(real.tacticalModel) };
});
afterEach(() => { vi.restoreAllMocks(); });

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
      expect(vi.mocked(tacticalModel)).not.toHaveBeenCalled();   // the interior view builds no map model
      sitDown(rt.duel.interior, rt.duel.helmPlayer, rt.duel.nav);
      scene.draw(rt, 1 / 60, LIVE);
      expect(duel().console?.station).toBe('helm');
      expect(duel().ownShip).toBeTruthy();
      expect(duel().ownShip!.tiles.length).toBeGreaterThan(0);
      expect(vi.mocked(tacticalModel).mock.calls.at(-1)![0].avoid).toEqual(OWN_SHIP);   // spec §6: the map keeps clear of the window
      keys.presses = { ...emptyPresses(), switch: 1 };   // Tab: the seated player's SHIP view
      now += 1000 / 60; rt.frame(1 / 60); keys.presses = emptyPresses();
      expect(rt.view()).toBe('interior');
      vi.mocked(tacticalModel).mockClear();
      scene.draw(rt, 1 / 60, LIVE);
      expect(duel().ownShip ?? null).toBeNull();
      expect(vi.mocked(tacticalModel)).not.toHaveBeenCalled();   // SHIP view: no map model, so no avoid
    } finally { scene.dispose(); rt.dispose(); }
  });

  // Spec §6 flash watch: a new epoch re-baselines with no flash; without one, a fresh fire flashes.
  function seated(epochOf: () => number) {
    const keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
    const rt = createDuelRuntime({
      now: () => 0, seed: 5, viewport: { w: 1280, h: 720 }, layout,
      scheduler: { schedule() { return () => {}; } },
      sampleKeys: () => keys, samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }), clearKeys: () => {}
    });
    const source = Object.create(rt, { epoch: { value: epochOf } });
    const stage = new Container(), store = createUiStore({ onlineAvailable: false } as never);
    const renderer = { app: { stage }, assets, stageScale: () => 1, feel: () => DEFAULT_FEEL, crt: () => 'off' as const };
    const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store) });
    rt.frame(1 / 60);
    sitDown(rt.duel.interior, rt.duel.helmPlayer, rt.duel.nav);
    return { rt, source, scene, ownShip: () => store.getState().duel!.ownShip!, dispose: () => { scene.dispose(); rt.dispose(); } };
  }

  it('a fire that starts with no epoch change flashes at a lit phase', () => {
    const h = seated(() => 0);
    try {
      vi.spyOn(performance, 'now').mockReturnValue(250);   // blink(0.25 s, 2 Hz) is lit
      h.scene.draw(h.source, 1 / 60, LIVE);
      expect(h.ownShip().flash).toBe(false);
      expect(igniteRoom(h.rt.duel.interior, h.rt.duel.points[0]!.room)).toBe(true);
      h.scene.draw(h.source, 1 / 60, LIVE);
      expect(h.ownShip().flash).toBe(true);
    } finally { h.dispose(); }
  });

  it('a new epoch re-baselines with no flash', () => {
    let ep = 0;
    const h = seated(() => ep);
    try {
      vi.spyOn(performance, 'now').mockReturnValue(250);
      h.scene.draw(h.source, 1 / 60, LIVE);
      expect(igniteRoom(h.rt.duel.interior, h.rt.duel.points[0]!.room)).toBe(true);
      ep = 1;   // the round restarted while a fire stood that the last round's watch did not hold
      h.scene.draw(h.source, 1 / 60, LIVE);
      expect(h.ownShip().flash).toBe(false);
      h.scene.draw(h.source, 1 / 60, LIVE);   // and the baseline holds: the standing fire is not new
      expect(h.ownShip().flash).toBe(false);
    } finally { h.dispose(); }
  });
});

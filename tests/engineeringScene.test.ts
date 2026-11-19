// Engineering spike §5: on the ship view a left click on a door or an airlock sends its command through the scene's
// shipCommand; a click elsewhere, or on a console map, sends nothing. The real runtime and scene in node, as
// shipHudScene.test.ts does.
import { describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { TILE_PX } from '../src/shared/resolution';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { emptyPresses, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { createDuelScene } from '../src/renderer/src/app/duel/scene';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';
import { seatDuelCrew } from './helpers/duelSeat';

const HOUND = parseShip(hound);
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};
const LIVE = { banner: null, layerPaused: false, end: null };

describe('interior clicks (spec §5)', () => {
  it('a click on the Ops–Quarters door sends door, on the Hold airlock sends airlock, on the floor nothing; on the Helm map nothing', () => {
    const now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
    const rt = createDuelRuntime({ now: () => now, seed: 5, viewport: { w: 1280, h: 720 }, layout: HOUND, scheduler: { schedule() { return () => {}; } },
      sampleKeys: () => keys, samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }), clearKeys: () => {} });
    const stage = new Container(), store = createUiStore({ onlineAvailable: false } as never);
    const renderer = { app: { stage }, assets, stageScale: () => 1, feel: () => DEFAULT_FEEL, crt: () => 'off' as const };
    let click: { x: number; y: number } | null = null;
    const shipCommand = vi.fn();
    const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store), takeClick: () => { const c = click; click = null; return c; }, shipCommand });
    try {
      rt.frame(1 / 60);
      expect(rt.view()).toBe('interior');
      expect(scene.interiorPlacement()).toBeNull();
      scene.draw(rt, 1 / 60, LIVE);
      const p = scene.interiorPlacement()!, der = rt.duel.interior.derived;
      const at = (tx: number, ty: number) => ({ x: p.x + (tx + 0.5) * TILE_PX * p.scale, y: p.y + (ty + 0.5) * TILE_PX * p.scale });
      click = at(12, 7); scene.draw(rt, 1 / 60, LIVE);
      click = at(0, 7); scene.draw(rt, 1 / 60, LIVE);
      click = at(14, 7); scene.draw(rt, 1 / 60, LIVE);
      expect(shipCommand.mock.calls.map((c) => c[0])).toEqual([
        { kind: 'shipDoor', edge: der.doorTileToEdge[7 * der.width + 12] }, { kind: 'shipAirlock', index: der.airlockOfTile[7 * der.width] }
      ]);
      seatDuelCrew(rt.duel); rt.frame(1 / 60);
      expect(rt.view()).not.toBe('interior');
      click = at(12, 7); scene.draw(rt, 1 / 60, LIVE);
      expect(shipCommand).toHaveBeenCalledTimes(2);
    } finally { scene.dispose(); rt.dispose(); }
  });
});

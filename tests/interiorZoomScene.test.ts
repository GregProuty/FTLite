// Interior zoom spec (2026-11-17), at the scene and view level: the scene hands the interior the source's active character,
// so after a Tab the zoomed view centres on the newly active character; a zoomed draw at stage scale 1.5 lands on whole
// screen pixels and inside the clamp; a zoomed ship is clipped to the band and level 0 is not.
import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Position } from '../src/renderer/src/sim/components';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { INTERIOR_BAND } from '../src/renderer/src/render/duel/interiorModel';
import { createInteriorView } from '../src/renderer/src/render/duel/interiorView';
import { createInteriorCamera, interiorInput } from '../src/renderer/src/render/duel/interiorCamera';
import { emptyPresses, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { createDuelScene } from '../src/renderer/src/app/duel/scene';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { TILE_PX } from '../src/shared/resolution';

const layout = parseShip(cutter);
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};
const crewAt = (d: ReturnType<typeof createDuel>) => d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! }));
const ZOOM_IN = { notches: 1, anchor: null, dragX: 0, dragY: 0, follow: false };

describe('the scene follows the source\'s active character (interior zoom spec rules 2, 4)', () => {
  it('both standing at +1: after a Tab the world centres on character 1', () => {
    let now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
    const tasks: { at: number; cb: () => void }[] = [];
    const rt = createDuelRuntime({
      now: () => now, seed: 5, viewport: { w: 1280, h: 720 }, layout,
      scheduler: { schedule(delay, cb) { const t = { at: now + delay, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
      sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses() }; return k; },
      samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
      clearKeys: () => { keys = { ...keys, presses: emptyPresses() }; }
    });
    const press = (a: KeyAction): void => { keys = { ...keys, presses: { ...keys.presses, [a]: 1 } }; };
    const tick = (): void => { rt.frame(1 / 60); now += 1000 / 60; tasks.sort((a, b) => a.at - b.at); while (tasks[0] && tasks[0].at <= now) tasks.shift()!.cb(); rt.frame(1 / 60); };
    const stage = new Container();
    const renderer = { app: { stage }, assets, stageScale: () => 1, feel: () => DEFAULT_FEEL };
    const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(createUiStore({ onlineAvailable: false } as never)) });
    try {
      press('stand'); tick(); tick();
      press('switch'); tick(); tick();
      press('stand'); tick(); tick();
      expect([rt.active(), rt.view()]).toEqual([1, 'interior']);
      // Two characters apart, both where the follow at 1.5 is not clamped.
      const [e0, e1] = rt.duel.interior.crew as [number, number];
      Position.x[e0] = 9.5; Position.x[e1] = 14.5;
      const prev = rt.crewPrev as { x: number; y: number }[]; prev[0]!.x = 9.5; prev[1]!.x = 14.5;   // no motion to interpolate
      interiorInput(rt.interiorCamera, ZOOM_IN);
      scene.draw(rt, 1 / 60, { banner: null, layerPaused: false, end: null });
      const world = ((stage.children[stage.children.length - 1] as Container).children[0] as Container).children[1] as Container;
      const interior = world.children[1] as Container;
      expect(interior.scale.x).toBe(1.5);
      expect(interior.x).toBe(Math.round(INTERIOR_BAND.w / 2 - 14.5 * TILE_PX * 1.5));   // character 1, not character 0 at 9.5
    } finally { scene.dispose(); rt.dispose(); }
  });
});

describe('a zoomed interior view (interior zoom spec rules 1, 2)', () => {
  it('at stage 1.5 and +2: whole screen pixels, the clamp, and the band clip only while zoomed', () => {
    const d = createDuel(layout, 5), view = createInteriorView(assets, () => 1.5), camera = createInteriorCamera();
    try {
      view.draw(d, crewAt(d), 1, 1 / 60, [], 1 / 60, { camera, active: 0 });
      expect(view.world.mask ?? null).toBeNull();
      // UI round §2.2: the band is the full width, so +1 (1237 px) no longer overflows it; +2 (1547 px) does, as +1 did in 1060.
      interiorInput(camera, ZOOM_IN); interiorInput(camera, ZOOM_IN);
      const eid = d.interior.crew[0]!;
      for (const x of [0.5, 9.3, 28.5]) {
        Position.x[eid] = x;
        view.draw(d, crewAt(d), 1, 1 / 60, [], 1 / 60, { camera, active: 0 });
        const s = view.world.scale.x, w = view.world;
        expect(2 * s * 1.5).toBe(5);   // the fit at 1.5 is 3 screen px per art px; +2 is 5
        expect(Number.isInteger(w.x * 1.5) && Number.isInteger(w.y * 1.5), `${w.x} ${w.y}`).toBe(true);
        expect(w.x).toBeLessThanOrEqual(0);                                          // the ship's left edge never inside the band's
        expect(w.x + 29 * TILE_PX * s).toBeGreaterThanOrEqual(INTERIOR_BAND.w - 1e-9);   // nor its right edge
        expect(view.world.mask).not.toBeNull();
      }
    } finally { view.destroy(); disposeDuel(d); }
  });
});

// UI round 2b, Task 3: the map and the ship view follow the live stage size. The interior band comes from the stage, a
// runtime holding the mode's viewport object sees a new width, the tactical layer and the backdrop resize, the ship-view
// hit-test takes the band, and the callouts clamp to the stage width.
import { describe, expect, it } from 'vitest';
import { Sprite, Texture, TextureSource } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { emptyPresses, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { createLiveViewport, syncViewport } from '../src/renderer/src/app/duel/liveViewport';
import { worldToScreen, type Viewport } from '../src/renderer/src/render/tactical/camera';
import { createTacticalLayer } from '../src/renderer/src/render/tactical/tacticalLayer';
import { duelFit, INTERIOR_BAND, interiorBand } from '../src/renderer/src/render/duel/interiorModel';
import { shipControlAt } from '../src/renderer/src/render/duel/shipControls';
import { createBackdropLayer } from '../src/renderer/src/render/twinkleLayer';
import { fitInBand } from '../src/renderer/src/render/worldFit';
import { CREW_SLOT } from '../src/renderer/src/sim/tactical/state';
import { seatDuelCrew } from './helpers/duelSeat';

const layout = parseShip(cutter);
const WIDE = { w: 1707, h: 720 };

describe('the interior band follows the stage (UI round 2b)', () => {
  it('interiorBand is the stage under the 42 px tab strip; the default and INTERIOR_BAND are the 1280 band', () => {
    expect(interiorBand(WIDE)).toEqual({ x: 0, y: 42, w: 1707, h: 678 });
    expect(interiorBand()).toEqual({ x: 0, y: 42, w: 1280, h: 678 });
    expect(INTERIOR_BAND).toEqual(interiorBand());
  });
  it('duelFit takes the band: the default is the reference, a wide band centres wider', () => {
    expect(duelFit(29, 13, 1)).toEqual(fitInBand(INTERIOR_BAND, 29, 13, 1));
    expect(duelFit(29, 13, 1, undefined, interiorBand(WIDE))).toEqual(fitInBand(interiorBand(WIDE), 29, 13, 1));
  });
});

describe('the live viewport', () => {
  it('createLiveViewport and syncViewport copy the stage in place; a renderer with no stage gives the reference', () => {
    let size = { w: 1280, h: 720 };
    const renderer = { stage: () => size }, vp = createLiveViewport(renderer);
    expect(vp).toEqual({ w: 1280, h: 720 });
    expect(syncViewport(vp, renderer)).toBe(false);
    size = WIDE;
    const same = vp;
    expect(syncViewport(vp, renderer)).toBe(true);
    expect(vp).toBe(same); expect(vp).toEqual(WIDE);
    expect(createLiveViewport({})).toEqual({ w: 1280, h: 720 });
  });
  it('a duel runtime holding the viewport object centres its follow camera on the new width after one frame', () => {
    const vp: Viewport = { w: 1280, h: 720 };
    const idle = (): KeySample => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() });
    const rt = createDuelRuntime({
      now: () => 0, scheduler: { schedule: () => () => {} }, seed: 5, viewport: vp, layout,
      sampleKeys: idle, takeContactRequests: () => ({ designate: null, scan: null }),
      samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }), clearKeys: () => {}
    });
    seatDuelCrew(rt.duel);
    vp.w = 1707;
    rt.frame(1 / 60);
    const ship = rt.duel.tactical.ships[CREW_SLOT]!, cam = rt.cameras.helm;
    expect(worldToScreen(cam, vp, ship.x, ship.y).x).toBeCloseTo(853.5, 6);
    rt.dispose();
  });
});

describe('the tactical layer resizes (UI round 2b)', () => {
  it('resize redraws for the new size; the same size is a no-op', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: { w: 1280, h: 720 } });
    expect(layer.debugSize()).toEqual({ w: 1280, h: 720 });
    const area = layer.bloom.filterArea;
    layer.resize({ w: 1280, h: 720 });
    expect(layer.bloom.filterArea).toBe(area);   // unchanged: nothing rebuilt
    layer.resize(WIDE);
    expect(layer.debugSize()).toEqual(WIDE);
    expect([layer.bloom.filterArea?.width, layer.bloom.filterArea?.height]).toEqual([1707, 720]);
    const bg = layer.bloom.children[0]!;
    expect(bg.getLocalBounds().width).toBeCloseTo(1707, 6);
  });
});

describe('the backdrop re-covers a new stage (UI round 2b)', () => {
  it('resize re-runs the cover fit; the same size is a no-op', () => {
    const tex = new Texture({ source: new TextureSource({ width: 2304, height: 1584 }) });
    const layer = createBackdropLayer({ texture: tex, stars: null }), back = layer.container.children[0] as Sprite;
    expect(back.width).toBeCloseTo(1280, 6);
    layer.resize({ w: 1280, h: 720 });
    expect(back.width).toBeCloseTo(1280, 6);
    layer.resize(WIDE);
    expect(back.width).toBeCloseTo(1707, 6);   // the wider stage is covered edge to edge
    expect(back.height).toBeGreaterThanOrEqual(720);
  });
});

describe('the ship-view hit-test takes the band (UI round 2b)', () => {
  it('a point beyond 1280 is off the reference band but on a wide one', () => {
    const rt = createDuelRuntime({
      now: () => 0, scheduler: { schedule: () => () => {} }, seed: 5, viewport: { w: 1280, h: 720 }, layout,
      sampleKeys: () => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() }), takeContactRequests: () => ({ designate: null, scan: null }),
      samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }), clearKeys: () => {}
    });
    const d = rt.duel, der = d.interior.derived, tile = der.doorTileToEdge.findIndex((e) => e >= 0);
    expect(tile).toBeGreaterThanOrEqual(0);
    const tx = tile % der.width, ty = Math.floor(tile / der.width);
    // Place the ship so that door tile's centre lands at x = 1400, y = 300 (one tile = 32 px at scale 1).
    const at = { scale: 1, x: 1400 - (tx + 0.5) * 32, y: 300 - (ty + 0.5) * 32 };
    expect(shipControlAt(d, at, 1400, 300)).toBeNull();
    expect(shipControlAt(d, at, 1400, 300, interiorBand(WIDE))).toMatchObject({ kind: 'door', tile });
    rt.dispose();
  });
});

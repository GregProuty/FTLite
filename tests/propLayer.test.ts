import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Container, Sprite, Texture, TextureSource } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip, type ShipLayout } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import type { SimState } from '../src/renderer/src/sim/state';
import type { PropName } from '../src/renderer/src/render/assetNames';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { consolePlacement, SIDE_ROTATION, WALL_GAP } from '../src/renderer/src/render/consoleModel';
import { propSlots, PROP_SIZE } from '../src/renderer/src/render/propModel';
import { createPropLayer } from '../src/renderer/src/render/propLayer';
import { createInteriorView } from '../src/renderer/src/render/duel/interiorView';
import { TILE_PX } from '../src/shared/resolution';
import { createSimState } from './helpers/simLifetime';
import { RECRUITS } from './helpers/sim';

const T = TILE_PX;
const CUTTER = parseShip(cutter), SKIFF = parseShip(skiff), HOUND = parseShip(hound);
const stateOf = (layout: ShipLayout): SimState => createSimState(layout, 2, 1, RECRUITS);
const xy = (s: SimState, t: number): [number, number] => [t % s.derived.width, Math.floor(t / s.derived.width)];

/** Fake assets: the prop textures sized as the spec's rectangles, every other optional feature missing. */
function fakeAssets(withProps: boolean, withBattlemap = false): GameAssets {
  const missing = Object.values(FEATURE_NAMES).flat().filter((n) => !(withProps && n.startsWith('prop.')) && !(withBattlemap && n === 'ship.hound.map'));
  const tex = new Map<string, Texture>();
  const named = (n: string): Texture => {
    let t = tex.get(n);
    if (!t) { const [w, h] = PROP_SIZE[n as PropName]; t = new Texture({ source: new TextureSource({ width: w, height: h }) }); t.label = n; tex.set(n, t); }
    return t;
  };
  return {
    has: (n) => !missing.includes(n), missing, fontFamily: 'm5x7',
    texture: (n) => { if (missing.includes(n)) throw new Error(`missing ${n}`); return named(n); },
    animation: (n) => { throw new Error(`no animation ${n}`); }, nineSlice: (n) => { throw new Error(`no nine-slice ${n}`); }
  };
}

describe('the prop layer (Art-iii spec section 4)', () => {
  it('one sprite per slot, flush to its wall through consolePlacement, turned by SIDE_ROTATION, 2x, no tint', () => {
    const s = stateOf(CUTTER), layer = createPropLayer(fakeAssets(true));
    layer.draw(s);
    const slots = propSlots(s);
    expect(layer.container.children).toHaveLength(slots.length);
    slots.forEach((p, i) => {
      const sp = layer.container.children[i] as Sprite, [w, h] = PROP_SIZE[p.name], c = consolePlacement(p.side, true, w, h), [tx, ty] = xy(s, p.tile);
      expect(sp.texture.label).toBe(p.name);
      expect([sp.x, sp.y, sp.rotation, sp.anchor.x, sp.anchor.y, sp.scale.x, sp.tint]).toEqual([tx * T + c.cx, ty * T + c.cy, SIDE_ROTATION[p.side], 0.5, 0.5, 2, 0xffffff]);
    });
  });
  it('the placement per side: the back edge on the wall face, centred on the tile, top-left even', () => {
    expect(consolePlacement('n', true, 12, 16)).toMatchObject({ left: 4, top: -WALL_GAP, width: 24, height: 32 });
    expect(consolePlacement('e', true, 14, 23)).toMatchObject({ left: T + WALL_GAP - 46, top: 2, width: 46, height: 28 });
    expect(consolePlacement('s', true, 14, 22)).toMatchObject({ left: 2, top: T + WALL_GAP - 44, width: 28, height: 44 });
    expect(consolePlacement('w', true, 25, 15)).toMatchObject({ left: -WALL_GAP, top: -10, width: 30, height: 50 });
  });
  it('rebuilds only when the cache key changes', () => {
    const layer = createPropLayer(fakeAssets(true)), a = stateOf(CUTTER);
    layer.draw(a); const first = layer.container.children[0];
    layer.draw(stateOf(CUTTER)); expect(layer.container.children[0]).toBe(first);
    layer.draw(stateOf({ ...CUTTER })); expect(layer.container.children[0]).toBe(first); expect(first!.destroyed).toBe(false);   // a new layout object with the same key: no rebuild (impl review R1-F1)
    layer.draw(stateOf(SKIFF));
    expect(layer.container.children).toHaveLength(1); expect(first!.destroyed).toBe(true);
  });
  it('draws nothing without propArt', () => {
    const layer = createPropLayer(fakeAssets(false));
    layer.draw(stateOf(CUTTER));
    expect(layer.container.children).toHaveLength(0);
  });
  it('draws no props on a painted ship (Art-iv), and the Art-iii props when its painting is missing', () => {
    const painted = createPropLayer(fakeAssets(true, true));
    painted.draw(stateOf(HOUND));
    expect(painted.container.children).toHaveLength(0);
    painted.draw(stateOf(CUTTER));
    expect(painted.container.children).toHaveLength(propSlots(stateOf(CUTTER)).length);   // an unpainted ship keeps its props
    const unpainted = createPropLayer(fakeAssets(true));
    unpainted.draw(stateOf(HOUND));
    expect(unpainted.container.children).toHaveLength(propSlots(stateOf(HOUND)).length);
  });
  it('sits directly over the tiles in both views (after the Art-iv battlemap layer)', () => {
    const d = createDuel(CUTTER, 5), view = createInteriorView(fakeAssets(true));
    view.draw(d, d.interior.crew.map(() => ({ x: 0, y: 0 })), 1, 1 / 60);
    const props = view.world.children[2] as Container;
    expect(props.children.length).toBe(propSlots(d.interior).length);
    expect(props.children.every((k) => k instanceof Sprite && k.texture.label!.startsWith('prop.'))).toBe(true);
    expect((view.world.children[3] as Container).blendMode).toBe('multiply');   // the grade next
    view.destroy(); disposeDuel(d);
    const src = readFileSync('src/renderer/src/render/renderer.ts', 'utf8');
    expect(src).toContain('world.addChild(battlemap.container, tiles.container, props.container, feel.grade,');
    expect(src).toMatch(/tiles\.update\(state, dt\);\s*props\.draw\(state\);/);
  });
});

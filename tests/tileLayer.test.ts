import { describe, it, expect } from 'vitest';
import { Container, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { createRenderMemory } from '../src/renderer/src/render/memory';
import { createTileLayer } from '../src/renderer/src/render/tiles';
import { cutterState } from './helpers/sim';

/** The floor art hook (Art-i spec section 4): procedural plating unless house.floor.0 to 3 are all loaded. */
const source = new TextureSource({ width: 64, height: 16 });
const floorTex = (n: number): Texture => new Texture({ source, frame: new Rectangle(16 * n, 0, 16, 16) });
const assets = (houseFloor: boolean): GameAssets => ({
  has: (n) => houseFloor && n.startsWith('house.floor.'),
  texture: (n) => { const m = /^house\.floor\.(\d)$/.exec(n); if (!m || !houseFloor) throw new Error(`no texture ${n}`); return floorTex(Number(m[1])); },
  animation: (n) => { throw new Error(`no animation ${n}`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n}`); },
  missing: Object.values(FEATURE_NAMES).flat().filter((n) => !(houseFloor && n.startsWith('house.floor.'))), fontFamily: 'm5x7'
});
const floorArt = (layer: { container: Container }): Container => layer.container.children[0] as Container;

describe('the tile layer floor art hook', () => {
  it('without the houseFloor feature the floors stay procedural: no floor sprites', () => {
    const s = cutterState(), layer = createTileLayer(assets(false), createRenderMemory());
    layer.update(s, 0);
    expect(floorArt(layer).children).toHaveLength(0);
  });
  it('with house.floor.0 to 3 loaded every floor tile and wall-tile floor part gets a 2x sprite on the art-pixel grid', () => {
    const s = cutterState(), layer = createTileLayer(assets(true), createRenderMemory());
    layer.update(s, 0);
    const sprites = [...floorArt(layer).children] as Sprite[];
    const n = sprites.length;
    const floorTiles = s.layout.rows.join('').split('').filter((c) => c !== ' ' && c !== '#').length;
    expect(sprites.length).toBeGreaterThanOrEqual(floorTiles);
    for (const sp of sprites) {
      expect(sp.scale.x).toBe(2); expect(sp.scale.y).toBe(2);
      expect(sp.x % 2).toBe(0); expect(sp.y % 2).toBe(0);
      expect(sp.texture.frame.width * 2).toBeLessThanOrEqual(32); expect(sp.texture.frame.height * 2).toBeLessThanOrEqual(32);
    }
    layer.build(s);   // a rebuild replaces the sprites rather than adding more
    expect(floorArt(layer).children.length).toBe(n);
  });
});

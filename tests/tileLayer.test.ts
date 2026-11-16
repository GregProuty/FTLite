import { describe, it, expect } from 'vitest';
import { Container, Graphics, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { createRenderMemory } from '../src/renderer/src/render/memory';
import { createTileLayer } from '../src/renderer/src/render/tiles';
import { wallPicture, type Cell } from '../src/renderer/src/render/wallModel';
import { ROLE } from '../src/renderer/src/render/palette';
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
    // exactly one sprite per non-wall, non-space tile (doors included), plus one per floor part of each wall tile's picture
    const rows = s.layout.rows, cell = (x: number, y: number): Cell => { const c = rows[y]?.charAt(x) ?? ' '; return c === '' || c === ' ' ? 'space' : c === '#' ? 'wall' : c === '+' ? 'door' : 'floor'; };
    let expected = 0;
    for (let y = 0; y < s.derived.height; y++) for (let x = 0; x < s.derived.width; x++) {
      const c = cell(x, y);
      if (c === 'space') continue;
      expected += c !== 'wall' ? 1 : wallPicture(cell(x, y - 1), cell(x + 1, y), cell(x, y + 1), cell(x - 1, y), cell(x + 1, y - 1), cell(x + 1, y + 1), cell(x - 1, y + 1), cell(x - 1, y - 1)).floor.length;
    }
    expect(n).toBe(expected);
    for (const sp of sprites) {
      expect(sp.scale.x).toBe(2); expect(sp.scale.y).toBe(2);
      expect(sp.x % 2).toBe(0); expect(sp.y % 2).toBe(0);
      expect(sp.texture.frame.width * 2).toBeLessThanOrEqual(32); expect(sp.texture.frame.height * 2).toBeLessThanOrEqual(32);
    }
    layer.build(s);   // a rebuild replaces the sprites rather than adding more
    expect(floorArt(layer).children.length).toBe(n);
  });
  it('a rebuild destroys the old per-part textures but keeps the shared source', () => {
    const s = cutterState(), layer = createTileLayer(assets(true), createRenderMemory());
    layer.update(s, 0);
    const old = [...floorArt(layer).children] as Sprite[], textures = old.map((sp) => sp.texture);
    layer.build(s);
    expect(textures.every((t) => t.destroyed)).toBe(true);
    expect(source.destroyed).toBe(false);
  });
  it('with floor art on, the doors graphics draws no full-floor fill; procedurally it does', () => {
    const floorFills = (houseFloor: boolean): number => {
      const s = cutterState(), layer = createTileLayer(assets(houseFloor), createRenderMemory());
      layer.update(s, 0);
      const doors = layer.container.children[2] as Graphics;
      return doors.context.instructions.filter((i) => i.action === 'fill' && (i.data as { style: { color: number } }).style.color === ROLE.floor).length;
    };
    expect(floorFills(false)).toBeGreaterThan(0);
    expect(floorFills(true)).toBe(0);
  });
});

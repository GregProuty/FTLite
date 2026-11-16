import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { moduleSpecifiers } from './helpers/determinismGuard';
import { airlockOutlineBand, breachRect, failedRect, fireFallbackRect, ventSpeckRect } from '../src/renderer/src/render/effectsShapes';
import { TILE_PX } from '../src/shared/resolution';
import { onGrid, strokeBand } from './helpers/artGrid';

const RENDER = 'src/renderer/src/render';

describe('palette-driven procedural art (Art-i spec section 4)', () => {
  for (const file of ['tiles.ts', 'doorModel.ts', 'wallModel.ts', 'effects.ts']) it(`${file} has no 0x colour literal left`, () => {
    expect(readFileSync(join(RENDER, file), 'utf8').match(/0x[0-9a-fA-F]+/g) ?? []).toEqual([]);
  });
});

describe('the effects shapes are on the art-pixel grid (Art-i spec section 4)', () => {
  const tiles = [[0, 0], [1, 0], [3, 7], [28, 12]] as const;
  it('fire fallback, breach and failed-station rectangles', () => {
    for (const [tx, ty] of tiles) for (const r of [fireFallbackRect(tx, ty), breachRect(tx, ty), failedRect(tx, ty)]) expect(onGrid(r), JSON.stringify(r)).toBe(true);
    expect(fireFallbackRect(1, 2)).toEqual({ x: TILE_PX + 4, y: 2 * TILE_PX + 4, w: TILE_PX - 8, h: TILE_PX - 8 });
    expect(failedRect(1, 2)).toEqual({ x: TILE_PX + 8, y: 2 * TILE_PX + 8, w: TILE_PX - 16, h: TILE_PX - 16 });
  });
  it('vent specks: the centre rounded to an even world unit, 4 units square', () => {
    for (let k = 0; k < 200; k++) { const r = ventSpeckRect(100 + k * 0.37, 50 - k * 0.61); expect(onGrid(r), JSON.stringify(r)).toBe(true); expect([r.w, r.h]).toEqual([4, 4]); }
    expect(ventSpeckRect(17, 33)).toEqual({ x: 16, y: 32, w: 4, h: 4 });   // centre 17 -> 18, 33 -> 34 (Math.round rounds the half up)
  });
  it('the airlock outline paints the ring -2..0 outside the tile', () => {
    for (const [tx, ty] of tiles) {
      const o = airlockOutlineBand(tx, ty), b = strokeBand(o.rect, o.width, o.alignment);
      expect(onGrid(b.outer) && onGrid(b.inner)).toBe(true);
      expect(b.inner).toEqual({ x: tx * TILE_PX, y: ty * TILE_PX, w: TILE_PX, h: TILE_PX });
      expect(b.outer).toEqual({ x: tx * TILE_PX - 2, y: ty * TILE_PX - 2, w: TILE_PX + 4, h: TILE_PX + 4 });
    }
  });
});

describe('the renderer never reads the sim RNG (Art-i spec, top)', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });
  for (const file of walk(RENDER)) it(`${file.replaceAll('\\', '/')} imports no RNG module and touches no state.rng`, () => {
    const source = readFileSync(file, 'utf8');
    expect(moduleSpecifiers(source).filter((s) => /(?:^|\/)rng(?:\.ts)?$/i.test(s))).toEqual([]);
    expect(source.match(/\.rng\b/g) ?? []).toEqual([]);
  });
});

describe('pngjs and scripts/ never reach the renderer (Art-i spec section 3)', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });
  for (const file of [...walk(RENDER), ...walk(join(RENDER, '..', 'app'))]) it(`${file.replaceAll('\\', '/')} imports neither pngjs nor scripts/`, () => {
    const source = readFileSync(file, 'utf8');
    expect(moduleSpecifiers(source).filter((s) => s === 'pngjs' || /(^|\/)scripts\//.test(s))).toEqual([]);
  });
});

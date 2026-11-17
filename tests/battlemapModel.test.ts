import { describe, it, expect } from 'vitest';
import { BATTLEMAPS, battlemapFor, fitRect } from '../src/renderer/src/render/battlemapModel';
import { fitInBand, fitRectInBand } from '../src/renderer/src/render/worldFit';
import { TILE_PX } from '../src/shared/resolution';

describe('battlemap model (Art-iv spec sections 1 and 4)', () => {
  it('the Hound: 70 source px a tile, image corner at (-5.5, -3.5), so tile centres sit on square boundaries', () => {
    const h = BATTLEMAPS.hound!;
    expect(h.pxPerTile).toBe(70);
    const centreX = (tx: number) => (tx + 0.5 - h.origin.x) * h.pxPerTile, centreY = (ty: number) => (ty + 0.5 - h.origin.y) * h.pxPerTile;
    expect(centreX(0)).toBe(420); expect(centreX(6)).toBe(840); expect(centreY(4)).toBe(560);   // 140 px squares: boundaries 3, 6, 4
    expect(h.bounds.x + h.bounds.w).toBeCloseTo(23.186, 3); expect(h.bounds.y + h.bounds.h).toBeCloseTo(17.314, 3);
  });
  it('only a known layout with its asset loaded has a painting; otherwise the fit is the tile bounds', () => {
    expect(battlemapFor('hound', new Set())).toBe(BATTLEMAPS.hound);
    expect(battlemapFor('hound', new Set(['ship.hound.map']))).toBeNull();
    expect(battlemapFor('cutter', new Set())).toBeNull();
    expect(fitRect('cutter', 29, 13, new Set())).toEqual({ x: 0, y: 0, w: 29, h: 13 });
    expect(fitRect('hound', 23, 15, new Set())).toEqual(BATTLEMAPS.hound!.bounds);
  });
});

describe('fitRectInBand', () => {
  const band = { x: 0, y: 0, w: 1000, h: 500 };
  it('equals fitInBand for a rect at the origin', () => {
    for (const stage of [1, 1.5, 2]) expect(fitRectInBand(band, { x: 0, y: 0, w: 20, h: 10 }, stage)).toEqual(fitInBand(band, 20, 10, stage));
  });
  it('a rect starting at negative tiles is centred in the band and keeps tile (0,0) at fit.x/fit.y', () => {
    const r = { x: -4, y: -2, w: 30, h: 20 }, f = fitRectInBand(band, r, 1);
    const left = f.x + r.x * TILE_PX * f.scale, right = left + r.w * TILE_PX * f.scale;
    expect(Math.abs((left - band.x) - (band.x + band.w - right))).toBeLessThanOrEqual(1);
    expect(f.x).toBeGreaterThan(left);
  });
});

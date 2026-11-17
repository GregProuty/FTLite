import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng, readPng, type Image } from '../scripts/art/importCore';
import { findStars, luminance, starsFileText } from '../scripts/art/findStars';

/** Art-v spec section 2: the star finder, on a PNG generated into a temp dir (the owner's asset folder is never read). */
const W = 40, H = 30, BG: [number, number, number, number] = [30, 10, 20, 255];
const ORANGE: [number, number, number, number] = [220, 120, 40, 255];   // luminance 66 + 70.8 + 4.4 = 141.2
const DULL: [number, number, number, number] = [120, 70, 30, 255];      // luminance 36 + 41.3 + 3.3 = 80.6, under the threshold
function fixture(): Image {
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set(BG, i * 4);
  const put = (x: number, y: number, c: [number, number, number, number]): void => { data.set(c, (y * W + x) * 4); };
  put(30, 2, ORANGE);                                                       // a 1 px star at (30, 2)
  for (const [x, y] of [[4, 10], [5, 10], [4, 11], [5, 11]] as const) put(x, y, ORANGE);   // a 2x2 star, centroid (4.5, 10.5)
  put(5, 10, [255, 200, 120, 255]);                                         // its brightest pixel: 76.5 + 118 + 13.2 = 207.7
  put(10, 2, ORANGE); put(11, 3, ORANGE);                                   // diagonal neighbours: two stars, not one (4-connected)
  for (let y = 20; y < 27; y++) for (let x = 20; x < 27; x++) put(x, y, ORANGE);   // 49 px: too large to be a star
  put(35, 25, DULL);                                                        // dull: not a star
  return { width: W, height: H, data };
}

let dir = '';
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ftlite-stars-')); writeFileSync(join(dir, 'sky.png'), encodePng(fixture())); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('findStars (Art-v spec section 2)', () => {
  it('luminance is 0.3 R + 0.59 G + 0.11 B', () => {
    expect(luminance(220, 120, 40)).toBeCloseTo(141.2, 6);
    expect(luminance(0, 0, 0)).toBe(0);
  });
  it('finds each 4-connected bright speck with its centroid, size and peak, sorted by y then x; drops the large and the dull', () => {
    const { stars } = findStars(readPng(join(dir, 'sky.png')), { threshold: 110, maxSize: 40 });
    expect(stars).toEqual([
      [10, 2, 1, 141],
      [30, 2, 1, 141],
      [11, 3, 1, 141],
      [4.5, 10.5, 4, 208]
    ]);
  });
  it('the threshold decides which specks count', () => {
    const img = readPng(join(dir, 'sky.png'));
    expect(findStars(img, { threshold: 80, maxSize: 40 }).stars).toContainEqual([35, 25, 1, 81]);
    expect(findStars(img, { threshold: 150, maxSize: 40 }).stars).toEqual([[5, 10, 1, 208]]);   // only the bright pixel of the 2x2
  });
  it('the size cap: a component larger than maxSize is dropped, one at the cap is kept', () => {
    const img = readPng(join(dir, 'sky.png'));
    expect(findStars(img, { threshold: 110, maxSize: 48 }).stars.some((s) => s[2] === 49)).toBe(false);
    expect(findStars(img, { threshold: 110, maxSize: 49 }).stars).toContainEqual([23, 23, 49, 141]);
  });
  it('the tint is the mean colour of the kept star pixels', () => {
    const { tint } = findStars(readPng(join(dir, 'sky.png')), { threshold: 110, maxSize: 40 });
    // 6 orange pixels and one (255, 200, 120): R (6*220+255)/7 = 225, G (6*120+200)/7 = 131.4, B (6*40+120)/7 = 51.4
    expect(tint).toBe('#e18333');
  });
  it('is deterministic: the same input gives byte-identical JSON text in the committed shape', () => {
    const img = readPng(join(dir, 'sky.png'));
    const a = starsFileText('test/sky.png', img, { threshold: 110, maxSize: 40 }), b = starsFileText('test/sky.png', readPng(join(dir, 'sky.png')), { threshold: 110, maxSize: 40 });
    expect(a).toBe(b);
    const parsed = JSON.parse(a) as { source: string; width: number; height: number; threshold: number; maxSize: number; tint: string; stars: number[][] };
    expect(parsed).toMatchObject({ source: 'test/sky.png', width: W, height: H, threshold: 110, maxSize: 40, tint: '#e18333' });
    expect(parsed.stars).toHaveLength(4);
    expect(a.endsWith('\n')).toBe(true);
  });
});

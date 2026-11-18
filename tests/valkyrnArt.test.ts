// Valkyrn spec §4.1: the 2-Minute Tabletop Valkyrn is imported raw and rotated 90° clockwise (its nose, up in the source,
// faces right like the Hound's), as the optional asset ship.valkyrn.map, credited under CC BY-NC 4.0.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importConfig, rotateImage90, type Image } from '../scripts/art/importCore';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { CREDITS } from '../src/renderer/src/render/credits.generated';

const img = (w: number, h: number): Image => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; data[i] = x; data[i + 1] = y; data[i + 2] = 7; data[i + 3] = 200; }
  return { width: w, height: h, data };
};

describe('rotateImage90 (Valkyrn spec §4.1)', () => {
  it('turns a w × h image clockwise: the source pixel (x, y) lands at (h − 1 − y, x)', () => {
    const src = img(3, 2), out = rotateImage90(src);
    expect([out.width, out.height]).toEqual([2, 3]);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) {
      const d = (x * out.width + (2 - 1 - y)) * 4;
      expect([...out.data.subarray(d, d + 4)]).toEqual([x, y, 7, 200]);
    }
  });
  it('the config defaults to no rotation and takes 90', () => {
    const base = { pack: 'p.png', frames: [{ x: 0, y: 0, w: 1, h: 1 }], output: 'public/assets/paid/x.png', columns: 1 };
    expect(importConfig.parse({ outputs: [base] }).outputs[0]!.rotate).toBe(0);
    expect(importConfig.parse({ outputs: [{ ...base, rotate: 90 }] }).outputs[0]!.rotate).toBe(90);
    expect(importConfig.safeParse({ outputs: [{ ...base, rotate: 45 }] }).success).toBe(false);
  });
});

describe('the Valkyrn asset', () => {
  const config = importConfig.parse(JSON.parse(readFileSync('art/import.json', 'utf8')));
  it('art/import.json imports the whole 2240 × 2240 painting raw and rotated', () => {
    expect(config.outputs.find((o) => o.output === 'public/assets/paid/2mt/valkyrn.png')).toMatchObject({
      pack: '2mt-valkyrn/valkyrn.png', frames: [{ x: 0, y: 0, w: 2240, h: 2240 }], columns: 1, remap: false, flipX: false, rotate: 90
    });
  });
  it('the manifest names it, optional, with the spec credit and modification; the battlemap feature lists it', () => {
    const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as Record<string, unknown>[];
    expect(manifest.find((e) => e.name === 'ship.valkyrn.map')).toMatchObject({
      file: 'paid/2mt/valkyrn.png', required: false, license: 'CC-BY-NC-4.0', author: '2-Minute Tabletop',
      credit: 'Valkyrn by 2-Minute Tabletop (2minutetabletop.com), CC BY-NC 4.0', modifications: 'rotated 90° clockwise by npm run art:import'
    });
    expect(FEATURE_NAMES.battlemap).toEqual(['ship.hound.map', 'ship.valkyrn.map']);
    expect(CREDITS).toContain('Valkyrn by 2-Minute Tabletop (2minutetabletop.com), CC BY-NC 4.0');
  });
  it('docs/gates.md names the Valkyrn in the 2-Minute Tabletop licence gate', () => {
    expect(readFileSync('docs/gates.md', 'utf8')).toMatch(/2-Minute Tabletop Hound and Valkyrn art and Deep Space \(Red\) backdrop \(CC BY-NC 4\.0\)/);
  });
});

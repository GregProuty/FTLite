import { describe, it, expect } from 'vitest';
import {
  backdropChoice, BRIGHT_SHARE, brightFlags, coverFit, glintAlpha, parseStarFile, twinkleAlpha, twinkleParams, type StarFile
} from '../src/renderer/src/render/twinkleModel';
import committed from '../art/deep-space-red.stars.json';

/** Art-v spec section 2: the twinkle model, and the layer choice (section 3). */
describe('twinkle model (Art-v spec section 2)', () => {
  it('each star gets 0.25 to 1 Hz, a phase in [0, 2 pi) and a depth of 0.35 to 0.85, deterministically from k', () => {
    for (let k = 0; k < 500; k++) {
      const p = twinkleParams(k);
      expect(p.freq).toBeGreaterThanOrEqual(0.25); expect(p.freq).toBeLessThanOrEqual(1);
      expect(p.phase).toBeGreaterThanOrEqual(0); expect(p.phase).toBeLessThan(2 * Math.PI);
      expect(p.depth).toBeGreaterThanOrEqual(0.35); expect(p.depth).toBeLessThanOrEqual(0.85);
      expect(twinkleParams(k)).toEqual(p);
    }
  });
  it('different stars get different phases', () => {
    const phases = new Set(Array.from({ length: 200 }, (_, k) => twinkleParams(k).phase));
    expect(phases.size).toBe(200);
  });
  it('the alpha stays in [0, 1], is 1 - depth at the bottom of a dip, and is mostly lit', () => {
    for (let k = 0; k < 50; k++) {
      const { depth } = twinkleParams(k);
      let lo = 1, lit = 0, n = 0;
      for (let t = 0; t < 8; t += 0.01) {
        const a = twinkleAlpha(k, t, 1); n++;
        expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThanOrEqual(1);
        lo = Math.min(lo, a); if (a > 1 - depth / 2) lit++;
      }
      expect(lo).toBeCloseTo(1 - depth, 2);
      expect(lit / n).toBeGreaterThan(0.6);   // the cube keeps a star mostly lit, with brief dips
    }
  });
  it('is periodic in t with period 1 / freq', () => {
    for (const k of [0, 7, 99]) {
      const T = 1 / twinkleParams(k).freq;
      for (const t of [0, 0.3, 2.71]) expect(twinkleAlpha(k, t + T, 1)).toBeCloseTo(twinkleAlpha(k, t, 1), 9);
    }
  });
  it('feelScale 0 gives a constant 1 (no twinkle); a half scale halves the dip', () => {
    for (const t of [0, 0.4, 3.3]) expect(twinkleAlpha(5, t, 0)).toBe(1);
    for (const t of [0, 0.4, 3.3]) expect(1 - twinkleAlpha(5, t, 0.5)).toBeCloseTo((1 - twinkleAlpha(5, t, 1)) / 2, 9);
  });
  it('the slow cross glint: in [0, 1], 0 with feel off, and it pulses', () => {
    let lo = 1, hi = 0;
    for (let t = 0; t < 20; t += 0.05) {
      const g = glintAlpha(3, t, 1); lo = Math.min(lo, g); hi = Math.max(hi, g);
      expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThanOrEqual(1);
      expect(glintAlpha(3, t, 0)).toBe(0);
    }
    expect(lo).toBeLessThan(0.05); expect(hi).toBeGreaterThan(0.9);
  });
  it('the bright stars are the top 10 % by peak', () => {
    const peaks = Array.from({ length: 50 }, (_, k) => 100 + k);
    const flags = brightFlags(peaks.map((p, k) => [k, 0, 1, p]));
    expect(flags.filter(Boolean)).toHaveLength(Math.ceil(50 * BRIGHT_SHARE));
    expect(flags.slice(45).every(Boolean)).toBe(true);
    expect(brightFlags([])).toEqual([]);
  });
});

describe('the cover transform (Art-v spec section 1)', () => {
  it('fills 1280 x 720 from 2304 x 1584 at 0.5556, centred, 80 px cropped top and bottom', () => {
    const f = coverFit(2304, 1584, 1280, 720);
    expect(f.scale).toBeCloseTo(1280 / 2304, 9);
    expect(f.x).toBeCloseTo(0, 9);
    expect(f.y).toBeCloseTo(-80, 9);
  });
  it('a tall source is cropped left and right instead', () => {
    const f = coverFit(100, 400, 200, 200);
    expect(f.scale).toBe(2); expect(f.x).toBe(0); expect(f.y).toBe(-300);
  });
});

describe('the layer choice (Art-v spec section 3)', () => {
  const stars: StarFile = { width: 10, height: 10, tint: '#ff8800', stars: [[1, 1, 1, 120]] };
  it('the backdrop and the twinkle only when space.backdrop is loaded; the old starfield only when it is not', () => {
    expect(backdropChoice(new Set(), stars)).toEqual({ backdrop: true, twinkle: true, starfield: false });
    expect(backdropChoice(new Set(['space.backdrop']), stars)).toEqual({ backdrop: false, twinkle: false, starfield: true });
  });
  it('no star list: the backdrop draws, nothing twinkles', () => {
    expect(backdropChoice(new Set(), null)).toEqual({ backdrop: true, twinkle: false, starfield: false });
    expect(backdropChoice(new Set(['space.backdrop']), null)).toEqual({ backdrop: false, twinkle: false, starfield: true });
  });
  it('the committed star list parses, matches the backdrop size, and has stars', () => {
    const f = parseStarFile(committed);
    expect(f).not.toBeNull();
    expect(f!.width).toBe(2304); expect(f!.height).toBe(1584);
    expect(f!.stars.length).toBeGreaterThan(50);
    expect(parseStarFile({ nope: 1 })).toBeNull();
  });
});

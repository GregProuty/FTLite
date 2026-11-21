// UI round spec §2.1: the stage follows the window: height 720 with the width following (wide), or width 1280 with the
// height following (narrow); the scale is smooth; the stage fills the window to within a pixel.
import { describe, expect, it } from 'vitest';
import { REFERENCE_STAGE, stageSizeFor } from '../src/shared/resolution';
import { stageFit } from '../src/renderer/src/render/letterbox';

describe('stageSizeFor / stageFit (spec §2.1)', () => {
  it.each([
    [1280, 720, 1280, 720], [1920, 1080, 1280, 720], [2560, 1080, 1707, 720], [3840, 1080, 2560, 720],
    [1024, 768, 1280, 960], [1680, 1050, 1280, 800], [800, 600, 1280, 960], [1366, 768, 1281, 720]
  ])('window %ix%i -> stage %ix%i', (ww, wh, sw, sh) => {
    expect(stageSizeFor(ww, wh)).toEqual({ w: sw, h: sh });
  });
  it('never smaller than the reference', () => {
    for (const [ww, wh] of [[300, 900], [2000, 200], [640, 365]] as const) {
      const s = stageSizeFor(ww, wh);
      expect(s.w).toBeGreaterThanOrEqual(REFERENCE_STAGE.w); expect(s.h).toBeGreaterThanOrEqual(REFERENCE_STAGE.h);
    }
  });
  it('the scale is smooth and the stage fills the window within a pixel', () => {
    for (const [ww, wh] of [[1500, 900], [2560, 1080], [1024, 768], [1366, 768], [1920, 1080]] as const) {
      const f = stageFit(ww, wh);
      expect(Math.abs(f.w * f.scale - ww)).toBeLessThan(1.01);
      expect(Math.abs(f.h * f.scale - wh)).toBeLessThan(1.01);
      expect(f.offsetX).toBeGreaterThanOrEqual(0); expect(f.offsetX).toBeLessThan(1);
      expect(f.offsetY).toBeGreaterThanOrEqual(0); expect(f.offsetY).toBeLessThan(1);
    }
    expect(stageFit(2000, 1000).scale).toBeCloseTo(1000 / 720, 6);   // wide: stage 1440x720, not a half step
    expect(stageFit(1500, 900).scale).toBeCloseTo(900 / 768, 6);    // narrow: stage 1280x768
  });
});

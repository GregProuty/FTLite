import { describe, it, expect } from 'vitest';
import { fitInBand, snapWorldScale, worldFit, WORLD_BAND } from '../src/renderer/src/render/worldFit';
import { duelFit, INTERIOR_BAND } from '../src/renderer/src/render/duel/interiorModel';

const STAGES = [1, 1.5, 2, 2.5, 3] as const;
const CUTTER_FIT = 608 / 928, STARTER_FIT = 0.76;

describe('snapWorldScale (Art-i spec section 4 table)', () => {
  const table: [string, number, number[]][] = [
    ['duel interior, any ship (fit 1)', 1, [1, 1, 1, 1, 1]],
    ['sector Skiff (fit 1)', 1, [1, 1, 1, 1, 1]],
    ['sector Cutter (fit 0.655)', CUTTER_FIT, [0.5, CUTTER_FIT, 0.5, 0.6, 0.5]],
    ['sector starter (fit 0.76)', STARTER_FIT, [STARTER_FIT, 2 / 3, 0.75, 0.6, 2 / 3]]
  ];
  for (const [name, fit, want] of table) it(name, () => {
    STAGES.forEach((stage, i) => expect(snapWorldScale(fit, stage), `stage ${stage}`).toBeCloseTo(want[i]!, 9));
  });
  it('a snapped scale gives a whole number of screen pixels per art pixel; a kept one is the fit itself', () => {
    for (const fit of [1, CUTTER_FIT, STARTER_FIT]) for (const stage of STAGES) {
      const s = snapWorldScale(fit, stage), px = 2 * s * stage;
      if (s !== fit) expect(Math.abs(px - Math.round(px))).toBeLessThan(1e-9);
      expect(s).toBeGreaterThanOrEqual((2 / 3) * fit - 1e-12);   // UI round §2.1: the 2/3 floor (was 0.75)
    }
  });
  it('UI round §2.1: at a smooth (non-half-step) stage scale a snapped scale still gives whole screen pixels per art pixel', () => {
    const stage = 1.37;
    for (const fit of [1, STARTER_FIT, 0.9, 0.45]) {   // fit 1: the duel interior (n = 2, 2 / 2.74 = 0.73, kept under 0.75, snapped under 2/3)
      const s = snapWorldScale(fit, stage), px = 2 * s * stage;
      expect(s, `fit ${fit}`).not.toBe(fit);
      expect(Math.abs(px - Math.round(px))).toBeLessThan(1e-9); expect(Math.round(px)).toBeGreaterThanOrEqual(1);
    }
  });
  it('UI round 2b: a stage scale a hair under a half step (2560x1080: 2560 / 1707) keeps the whole number above, not 2/3', () => {
    const stage = 2560 / 1707, s = snapWorldScale(1, stage), px = 2 * s * stage;
    expect(Math.round(px)).toBe(3); expect(Math.abs(px - 3)).toBeLessThan(1e-9);
    expect(s).toBeGreaterThan(0.99); expect(s).toBeLessThan(1.01);
  });
  it('below stage 1 a fit that rounds to 0 art pixels, or snaps too small, is kept', () => {
    expect(snapWorldScale(CUTTER_FIT, 0.7)).toBe(CUTTER_FIT);   // n = floor(0.917) = 0
    expect(snapWorldScale(1, 0.9)).toBe(1);                      // n = 1, 1 / 1.8 = 0.556 < 2/3
  });
  it('final review: the rounded-up whole number is taken only within 1% over the fit, else n - 1', () => {
    // a tiny stage: 2 x 1 x 0.4925 = 0.985, the +0.02 rounds up to n = 1, 1 / 0.985 is 1.5% over the fit: n - 1 = 0, the fit is kept
    expect(snapWorldScale(1, 0.4925)).toBe(1);
    // 2 x 0.5 x 1.985 = 1.985 rounds up to 2 (0.76% over): taken
    expect(2 * snapWorldScale(0.5, 1.985) * 1.985).toBeCloseTo(2, 9);
    // 2 x 1 x 0.99005 = 1.9801 rounds up to 2, 1.01005 over (a hair past 1%): n - 1 = 1 is under the 2/3 floor, the fit is kept
    expect(snapWorldScale(1, 0.99005)).toBe(1);
  });
});

describe('worldFit and duelFit take the stage scale', () => {
  it('the Cutter (29 x 13) at stage 1 snaps to 0.5, re-centred in the band', () => {
    expect(worldFit(29, 13, 1)).toEqual({ scale: 0.5, x: 328, y: 104 });
  });
  it('the Cutter at stage 1.5 keeps its fit (about 21 px a tile), x and y on whole screen pixels', () => {
    const f = worldFit(29, 13, 1.5);
    expect(f.scale).toBeCloseTo(CUTTER_FIT, 9); expect(Math.round(32 * f.scale)).toBe(21); expect(f.x).toBe(256); expect(f.y).toBe(72);
  });
  it('the starter (25 x 12) at stage 1 keeps 0.76', () => {
    const f = worldFit(25, 12, 1);
    expect(f.scale).toBeCloseTo(0.76, 9); expect(f.x).toBe(256); expect(f.y).toBe(62);
  });
  it('draws the Skiff (18 x 9) at full size at every stage', () => {
    for (const stage of STAGES) expect(worldFit(18, 9, stage)).toEqual({ scale: 1, x: 272, y: 64 });
  });
  it('every fit stays inside its band and lands on whole screen pixels', () => {
    for (const [band, fit] of [[WORLD_BAND, worldFit], [INTERIOR_BAND, duelFit]] as const)
      for (const [w, h] of [[29, 13], [25, 12], [18, 9]] as const) for (const stage of STAGES) {
        const f = fit(w, h, stage);
        expect(f.x).toBeGreaterThanOrEqual(band.x - 1); expect(f.x + w * 32 * f.scale).toBeLessThanOrEqual(band.x + band.w + 1);
        expect(f.y).toBeGreaterThanOrEqual(band.y - 1); expect(f.y + h * 32 * f.scale).toBeLessThanOrEqual(band.y + band.h + 1);
        expect(Math.abs(f.x * stage - Math.round(f.x * stage))).toBeLessThan(1e-9); expect(Math.abs(f.y * stage - Math.round(f.y * stage))).toBeLessThan(1e-9);
      }
  });
  it('duelFit is fitInBand on the interior band', () => {
    expect(duelFit(29, 13, 1)).toEqual({ scale: 1, x: 176, y: 173 });   // UI round §2.2: the band is the full width ((1280 - 928) / 2)
    for (const stage of STAGES) expect(duelFit(29, 13, stage)).toEqual(fitInBand(INTERIOR_BAND, 29, 13, stage));
  });
});

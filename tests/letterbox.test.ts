import { expect, it } from 'vitest';
import { computeLetterbox } from '../src/renderer/src/render/letterbox';

it.each([[1280, 663], [800, 543], [640, 365]])('fits the entire game scene inside a %sx%s reserved viewport', (width, height) => {
  const fit = computeLetterbox(width, height, 1280, 720);
  expect(fit.scale).toBeGreaterThan(0);
  expect(fit.offsetX).toBeGreaterThanOrEqual(0); expect(fit.offsetY).toBeGreaterThanOrEqual(0);
  expect(fit.offsetX + 1280 * fit.scale).toBeLessThanOrEqual(width);
  expect(fit.offsetY + 720 * fit.scale).toBeLessThanOrEqual(height);
});
it('preserves half-step pixel scaling when the full scene fits at native size', () => {
  expect(computeLetterbox(1920, 1080, 1280, 720)).toEqual({ scale: 1.5, offsetX: 0, offsetY: 0 });
  expect(computeLetterbox(1800, 1000, 1280, 720)).toEqual({ scale: 1, offsetX: 260, offsetY: 140 });
});

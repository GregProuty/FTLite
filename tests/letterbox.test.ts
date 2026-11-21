import { expect, it } from 'vitest';
import { stageFit } from '../src/renderer/src/render/letterbox';

it.each([[1280, 663], [800, 543], [640, 365]])('fits the entire stage inside a %sx%s reserved viewport', (width, height) => {
  const fit = stageFit(width, height);
  expect(fit.scale).toBeGreaterThan(0);
  expect(fit.offsetX).toBeGreaterThanOrEqual(0); expect(fit.offsetY).toBeGreaterThanOrEqual(0);
  expect(fit.offsetX + fit.w * fit.scale).toBeLessThanOrEqual(width + 1e-9);
  expect(fit.offsetY + fit.h * fit.scale).toBeLessThanOrEqual(height + 1e-9);
});
it('UI round §2.1: the stage follows the window and the scale is smooth (no half steps)', () => {
  expect(stageFit(1280, 720)).toEqual({ w: 1280, h: 720, scale: 1, offsetX: 0, offsetY: 0 });
  expect(stageFit(1920, 1080)).toEqual({ w: 1280, h: 720, scale: 1.5, offsetX: 0, offsetY: 0 });
  const f = stageFit(1800, 1000);   // was the 1x letterbox at 260, 140
  expect({ w: f.w, h: f.h }).toEqual({ w: 1296, h: 720 }); expect(f.scale).toBeCloseTo(1000 / 720, 12);
  expect(f.offsetY).toBe(0); expect(f.offsetX).toBeGreaterThanOrEqual(0); expect(f.offsetX).toBeLessThanOrEqual(1);
});

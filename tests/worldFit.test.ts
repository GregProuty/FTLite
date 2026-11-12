import { describe, it, expect } from 'vitest';
import { worldFit } from '../src/renderer/src/render/worldFit';

describe('worldFit', () => {
  it('fits the cutter (29 x 13 tiles) by width', () => {
    const f = worldFit(29, 13);
    expect(f.scale).toBeCloseTo(768 / 928, 4); expect(f.x).toBe(256); expect(f.y).toBe(94);
  });
  it('fits the starter (25 x 12 tiles) by height', () => {
    const f = worldFit(25, 12);
    expect(f.scale).toBeCloseTo(0.96, 4); expect(f.x).toBe(256); expect(f.y).toBe(82);
  });
});

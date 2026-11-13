import { describe, it, expect } from 'vitest';
import { worldFit } from '../src/renderer/src/render/worldFit';

describe('worldFit', () => {
  it('fits the cutter (29 x 13 tiles) by width: about 21 px per tile in the narrower band (spec Demo-x-c section 3)', () => {
    const f = worldFit(29, 13);
    expect(f.scale).toBeCloseTo(608 / 928, 4); expect(Math.round(32 * f.scale)).toBe(21); expect(f.x).toBe(256); expect(f.y).toBe(72);
  });
  it('fits the starter (25 x 12 tiles) by width', () => {
    const f = worldFit(25, 12);
    expect(f.scale).toBeCloseTo(0.76, 4); expect(f.x).toBe(256); expect(f.y).toBe(62);
  });
  it('draws the Skiff (18 x 9 tiles) at full size', () => {
    const f = worldFit(18, 9);
    expect(f.scale).toBe(1); expect(f.x).toBe(256 + 16); expect(f.y).toBe(64);
  });
});

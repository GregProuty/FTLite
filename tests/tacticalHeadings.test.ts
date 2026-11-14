import { describe, expect, it } from 'vitest';
import { HEADING_X, HEADING_Y } from '../src/renderer/src/sim/tactical/headings';
import { dirBetween, hx, hy, wrapHeading } from '../src/renderer/src/sim/tactical/direction';
import { HEADING_COUNT, TURN_STEPS_PER_TICK } from '../src/renderer/src/sim/tactical/tuning';

describe('heading table (spec §4)', () => {
  it('has 256 entries of unit length', () => {
    expect(HEADING_X).toHaveLength(HEADING_COUNT);
    expect(HEADING_Y).toHaveLength(HEADING_COUNT);
    for (let i = 0; i < HEADING_COUNT; i++) expect(Math.abs(Math.sqrt(hx(i) * hx(i) + hy(i) * hy(i)) - 1)).toBeLessThan(1e-15);
  });
  it('points north at 0 and turns clockwise in y-down coordinates', () => {
    expect([hx(0), hy(0)]).toEqual([0, -1]);
    expect([hx(64), hy(64)]).toEqual([1, 0]);
    expect([hx(128), hy(128)]).toEqual([0, 1]);
    expect([hx(192), hy(192)]).toEqual([-1, 0]);
  });
  it('is exactly symmetric: opposite headings are exact negatives, quarter turns exact rotations', () => {
    for (let i = 0; i < HEADING_COUNT; i++) {
      expect(hx(i + 128)).toBe(-hx(i) || 0);
      expect(hy(i + 128)).toBe(-hy(i) || 0);
      expect(hx(i + 64)).toBe(-hy(i) || 0);
      expect(hy(i + 64)).toBe(hx(i));
    }
  });
  it('wraps any integer index', () => {
    expect(wrapHeading(-1)).toBe(255);
    expect(wrapHeading(256)).toBe(0);
    expect(wrapHeading(-257)).toBe(255);
  });
  it('dirBetween returns unit vectors between neighbours', () => {
    for (const [i, f] of [[0, 0], [10, 0.5], [255, 0.999]] as const) {
      const [x, y] = dirBetween(i, f);
      expect(Math.abs(Math.sqrt(x * x + y * y) - 1)).toBeLessThan(1e-15);
    }
    expect(dirBetween(64, 0)).toEqual([1, 0]);
  });
  it('turns at 150°/s: about 1.78 heading steps per tick', () => {
    expect(TURN_STEPS_PER_TICK).toBeCloseTo(1.7778, 4);
  });
});

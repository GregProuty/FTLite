import { describe, it, expect } from 'vitest';
import { clampIntent, NEUTRAL_INTENT } from '../src/shared/intent';

describe('clampIntent', () => {
  it('passes a neutral intent through unchanged', () => {
    expect(clampIntent({ ...NEUTRAL_INTENT })).toEqual(NEUTRAL_INTENT);
  });
  it('zeroes NaN and clamps the move vector to unit length', () => {
    const c = clampIntent({ ...NEUTRAL_INTENT, moveX: NaN, moveY: 5 });
    expect(c.moveX).toBe(0); expect(c.moveY).toBe(1);
    const d = clampIntent({ ...NEUTRAL_INTENT, moveX: 3, moveY: 4 });
    expect(Math.abs(Math.sqrt(d.moveX * d.moveX + d.moveY * d.moveY) - 1)).toBeLessThan(1e-9);
  });
  it('coerces non-boolean flags', () => {
    const c = clampIntent({ ...NEUTRAL_INTENT, interactHeld: 1 as unknown as boolean });
    expect(c.interactHeld).toBe(true);
  });
});

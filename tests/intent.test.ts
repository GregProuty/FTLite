import { describe, it, expect } from 'vitest';
import { clampIntent, NEUTRAL_INTENT } from '../src/shared/intent';
import { createIntentFeed, NEUTRAL_FRAME } from '../src/renderer/src/app/intents';
import { encodeIntent } from '../src/renderer/src/sim/replay';

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

describe('the Intent is unchanged by callouts (spec Coop-i section 3)', () => {
  it('has exactly its six fields; the feed emits exactly those; a replay encodes the same bytes as before', () => {
    const SIX = ['cancelPressed', 'confirmPressed', 'interactHeld', 'interactPressed', 'moveX', 'moveY'];
    expect(Object.keys(NEUTRAL_INTENT).sort()).toEqual(SIX);
    const feed = createIntentFeed(1); feed.beginFrame([{ ...NEUTRAL_FRAME, moveX: 1, interactHeld: true, confirmPresses: 1 }]);
    const [it0] = feed.tick(); expect(Object.keys(it0!).sort()).toEqual(SIX);
    expect(encodeIntent(it0!)).toEqual([1, 0, 1 | 4]);
    expect(encodeIntent({ ...NEUTRAL_INTENT, interactPressed: true, cancelPressed: true })).toEqual([0, 0, 2 | 8]);
  });
});

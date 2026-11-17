// Audio-i spec section 4 (c, d): the hum, the fire gain and the crackle buffer.
import { describe, it, expect } from 'vitest';
import { CRACKLE_SECONDS, FIRE_GAIN_MAX, HUM_IDLE_GAIN, HUM_IDLE_RATE, HUM_MAX_GAIN, HUM_MAX_RATE, crackleSamples, fireGain, humLevel, humTarget } from '../src/renderer/src/audio/loops';

const lcg = (seed: number): (() => number) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

describe('the hum (Audio-i spec section 4d)', () => {
  it('rises with thrust and speed, and with the jump swell', () => {
    expect(humLevel({ thrust: 0, speed: 0, charge: 0 })).toBe(0);
    expect(humLevel({ thrust: 1, speed: 0, charge: 0 })).toBeCloseTo(0.6);
    expect(humLevel({ thrust: -1, speed: 0, charge: 0 })).toBeCloseTo(0.6);   // reverse thrust hums too
    expect(humLevel({ thrust: 0, speed: 200, charge: 0 })).toBeCloseTo(0.2);
    expect(humLevel({ thrust: 1, speed: 9000, charge: 0 })).toBeCloseTo(1);
    expect(humLevel({ thrust: 0, speed: 0, charge: 0.9 })).toBeCloseTo(0.9);
    expect(humLevel({ thrust: Number.NaN, speed: Number.NaN, charge: Number.NaN })).toBe(0);
  });
  it('maps the level to gain and playback rate', () => {
    expect(humTarget({ thrust: 0, speed: 0, charge: 0 })).toEqual({ gain: HUM_IDLE_GAIN, rate: HUM_IDLE_RATE });
    const full = humTarget({ thrust: 1, speed: 400, charge: 0 });
    expect(full.gain).toBeCloseTo(HUM_MAX_GAIN); expect(full.rate).toBeCloseTo(HUM_MAX_RATE);
  });
});

describe('the fire crackle (Audio-i spec section 4c)', () => {
  it('is silent with no fire and grows per burning room to a cap', () => {
    const g = [0, 1, 2, 4, 9].map(fireGain);
    [0, 0.15, 0.23, 0.39, FIRE_GAIN_MAX].forEach((v, k) => expect(g[k]).toBeCloseTo(v));
    expect(g[0]).toBe(0);
  });
  it('is a seamless, bounded, deterministic noise loop with pops', () => {
    const a = crackleSamples(8000, lcg(3)), b = crackleSamples(8000, lcg(3));
    expect(a).toHaveLength(8000 * CRACKLE_SECONDS); expect(a).toEqual(b);
    let peak = 0; for (const v of a) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThanOrEqual(1); expect(peak).toBeGreaterThan(0.3);
    expect(Math.abs(a[0]!)).toBe(0); expect(Math.abs(a[a.length - 1]!)).toBeLessThan(0.01);   // faded at both ends
  });
});

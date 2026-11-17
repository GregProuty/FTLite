import { describe, it, expect } from 'vitest';
import { DEFAULT_FEEL, FEEL_KEY, feelScale, loadFeel, nextFeel, parseFeel, saveFeel } from '../src/renderer/src/render/feel';
import { createPresentClock } from '../src/renderer/src/render/presentClock';
import {
  createShake, duelHit, flashAlpha, FLASH_ALPHA, FLASH_TICKS, HITSTOP_SECONDS, HIT_FRESH_TICKS, kickShake, sectorHits, shakeOffset, SHAKE_ART_PX, SHAKE_SECONDS, SMOKE_SECONDS, stepShake
} from '../src/renderer/src/render/impactModel';
import type { ViewEvent } from '../src/renderer/src/render/tactical/fxModel';

const memory = (): { store: Map<string, string>; getItem(k: string): string | null; setItem(k: string, v: string): void } => {
  const store = new Map<string, string>();
  return { store, getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } };
};

describe('the feel setting (Art-i spec section 7)', () => {
  it('feelScale gives the shake, flash and hitstop multipliers for full, reduced and off', () => {
    expect(feelScale('full')).toEqual({ shake: 1, flash: 1, hitstop: 1 });
    expect(feelScale('reduced')).toEqual({ shake: 0.5, flash: 0.5, hitstop: 1 });
    expect(feelScale('off')).toEqual({ shake: 0, flash: 0, hitstop: 0 });
  });
  it('parses stored values, defaulting to full, and F9 cycles full, reduced, off', () => {
    expect([parseFeel('full'), parseFeel('reduced'), parseFeel('off'), parseFeel(null), parseFeel('loud')]).toEqual(['full', 'reduced', 'off', 'full', 'full']);
    expect(DEFAULT_FEEL).toBe('full');
    expect([nextFeel('full'), nextFeel('reduced'), nextFeel('off')]).toEqual(['reduced', 'off', 'full']);
  });
  it('loads and saves under ftlite-feel; a throwing storage gives the default and never escapes', () => {
    const m = memory();
    expect(loadFeel(() => m)).toBe('full');
    saveFeel(() => m, 'off');
    expect(m.store.get(FEEL_KEY)).toBe('off'); expect(FEEL_KEY).toBe('ftlite-feel');
    expect(loadFeel(() => m)).toBe('off');
    const denied = (): never => { throw new Error('SecurityError'); };
    expect(loadFeel(denied)).toBe('full');
    expect(() => saveFeel(denied, 'reduced')).not.toThrow();
  });
});

describe('the presentation clock and the hitstop (Art-i spec section 7)', () => {
  it('a 60 ms hitstop holds the clock for 60 ms of frames, then it runs on', () => {
    const c = createPresentClock(), frame = 1 / 60;
    c.advance(0.5);
    expect(c.t).toBeCloseTo(0.5);
    c.hitstop(HITSTOP_SECONDS);
    expect(HITSTOP_SECONDS).toBe(0.06);
    const runs = [1, 2, 3, 4, 5].map(() => c.advance(frame));
    expect(runs.slice(0, 3)).toEqual([0, 0, 0]);                     // three whole frames (50 ms) frozen
    expect(runs[3]).toBeCloseTo(frame - (0.06 - 3 * frame));          // the fourth frame loses the last 10 ms
    expect(runs[4]).toBeCloseTo(frame);
    expect(c.t).toBeCloseTo(0.5 + 5 * frame - 0.06);
    expect(c.stopped).toBe(false);
  });
  it('a second hit keeps the longer stop, and reset clears time and stop', () => {
    const c = createPresentClock();
    c.hitstop(0.06); c.advance(0.05); c.hitstop(0.02);
    expect(c.stopped).toBe(true);
    expect(c.advance(0.05)).toBeCloseTo(0.03);   // max(0.01 left, 0.02) = 0.02 held
    c.hitstop(1); c.reset();
    expect([c.t, c.stopped]).toEqual([0, false]);
  });
});

describe('the art-pixel shake (Art-i spec section 7)', () => {
  it('starts at 6 art pixels, steps in whole art pixels, decays linearly to 0 over 0.25 s', () => {
    expect([SHAKE_ART_PX, SHAKE_SECONDS]).toEqual([6, 0.25]);
    const s = createShake();
    expect(shakeOffset(s, 2)).toEqual({ x: 0, y: 0 });
    kickShake(s, feelScale('full'));
    for (let k = 0; k < 20; k++) {
      const o = shakeOffset(s, 2), bound = SHAKE_ART_PX * (s.left / SHAKE_SECONDS);
      for (const v of [o.x, o.y]) { expect(Number.isInteger(v / 2)).toBe(true); expect(Math.abs(v / 2)).toBeLessThanOrEqual(Math.round(bound) + 0.5); }
      stepShake(s, 1 / 60);
    }
    stepShake(s, 1);
    expect(shakeOffset(s, 2)).toEqual({ x: 0, y: 0 });
  });
  it('the offset is in art pixels of the parent: art pixel 1 at world scale 0.5', () => {
    const s = createShake(); kickShake(s, feelScale('full')); stepShake(s, 0.011);
    const a = shakeOffset(s, 1), b = shakeOffset(s, 2);
    expect([b.x, b.y]).toEqual([a.x * 2, a.y * 2]);
  });
  it('the feel scales it: reduced is 3 art pixels, off never shakes; a hitstop (pdt 0) holds it', () => {
    const r = createShake(); kickShake(r, feelScale('reduced'));
    expect(r.amp).toBe(3);
    const off = createShake(); kickShake(off, feelScale('off'));
    expect([off.left, shakeOffset(off, 2)]).toEqual([0, { x: 0, y: 0 }]);
    const s = createShake(); kickShake(s, feelScale('full'));
    stepShake(s, 0);
    expect(s.left).toBe(SHAKE_SECONDS);
  });
  it('a second hit restarts it without cutting a stronger one short', () => {
    const s = createShake(); kickShake(s, feelScale('full')); stepShake(s, 0.1);
    kickShake(s, feelScale('reduced'));
    expect(s.amp).toBeCloseTo(SHAKE_ART_PX * (0.15 / 0.25)); expect(s.left).toBe(SHAKE_SECONDS);
  });
});

describe('the flash and the hit signals (Art-i spec section 7)', () => {
  it('the flash is on for exactly 2 sim ticks, scaled by the feel and the duel share', () => {
    expect(FLASH_TICKS).toBe(2);
    expect([0, 1, 2, -1].map((k) => flashAlpha(k, feelScale('full')))).toEqual([FLASH_ALPHA, FLASH_ALPHA, 0, 0]);
    expect(flashAlpha(0, feelScale('reduced'))).toBeCloseTo(FLASH_ALPHA / 2);
    expect(flashAlpha(0, feelScale('full'), 0.5)).toBeCloseTo(FLASH_ALPHA / 2);
    expect(flashAlpha(0, feelScale('off'))).toBe(0);
  });
  it('sector: a room whose impactTick changed since the last frame and is fresh is hit; the first frame never is', () => {
    expect(SMOKE_SECONDS).toBe(3);
    let r = sectorHits([-1, 40, -1], 41, null);
    expect(r.rooms).toEqual([]);                                     // first frame of a run: nothing replays
    r = sectorHits([-1, 40, -1], 42, r.seen);
    expect(r.rooms).toEqual([]);                                     // unchanged
    r = sectorHits([50, 40, 50], 51, r.seen);
    expect(r.rooms).toEqual([0, 2]);                                 // two rooms hit in the same step
    r = sectorHits([50, 40, 50 + 0], 52, r.seen);
    expect(r.rooms).toEqual([]);
    r = sectorHits([50, 60, 50], 60 + HIT_FRESH_TICKS + 1, r.seen);
    expect(r.rooms).toEqual([]);                                     // stale: older than HIT_FRESH_TICKS
  });
  it('duel: a hit is any event hitsCrew accepts', () => {
    const laser = (ship: number, hit: boolean): ViewEvent => ({ kind: 'laser', ship, hit, x1: 0, y1: 0, x2: 1, y2: 1 } as unknown as ViewEvent);
    expect(duelHit([])).toBe(false);
    expect(duelHit([laser(1, false)])).toBe(false);
    expect(duelHit([laser(0, true)])).toBe(false);                   // the crew's own laser
    expect(duelHit([laser(1, false), laser(1, true)])).toBe(true);
  });
});

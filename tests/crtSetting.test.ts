import { describe, expect, it } from 'vitest';
import { BEZEL_PX, BEZEL_RADIUS, crtActive, crtFlicker, crtScale, CRT_KEY, DEFAULT_CRT, FLICKER_DEPTH, insideBezel, loadCrt, nextCrt, parseCrt, saveCrt } from '../src/renderer/src/render/crt';
import { installCrt } from '../src/renderer/src/app/crtBoot';
import type { CrtSetting } from '../src/renderer/src/render/crt';
import { blink, CRT, CRT_RAMP } from '../src/renderer/src/render/tactical/crtTheme';

const store = (v: string | null) => { const m = new Map<string, string>(); if (v !== null) m.set(CRT_KEY, v); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, x: string) => { m.set(k, x); } }; };

describe('where the CRT applies (CRT map spec section 1)', () => {
  it('the Helm map, the Weapons map and the flight view; not the interior', () => {
    expect((['helm', 'weapons', 'flight', 'interior'] as const).map(crtActive)).toEqual([true, true, true, false]);
  });
});

describe('the CRT setting (CRT map spec section 4)', () => {
  it('subtle by default; parse falls back to it; F10 cycles full, subtle, off', () => {
    expect(DEFAULT_CRT).toBe('subtle'); expect(CRT_KEY).toBe('ftlite-crt');
    expect([parseCrt('full'), parseCrt('off'), parseCrt('loud'), parseCrt(null), parseCrt(undefined)]).toEqual(['full', 'off', 'subtle', 'subtle', 'subtle']);
    expect([nextCrt('full'), nextCrt('subtle'), nextCrt('off')]).toEqual(['subtle', 'off', 'full']);
  });
  it('off zeroes every screen effect; full is all 1; subtle sits between; the same object each call', () => {
    expect(crtScale('off')).toEqual({ glow: 0, scanline: 0, mask: 0, flicker: 0, vignette: 0 });
    expect(crtScale('full')).toEqual({ glow: 1, scanline: 1, mask: 1, flicker: 1, vignette: 1 });
    for (const v of Object.values(crtScale('subtle'))) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(1); }
    expect(crtScale('subtle')).toBe(crtScale('subtle'));
  });
  it('load and save go through a try/catch: a throwing storage gives subtle and saving does not throw', () => {
    const s = store('full'); expect(loadCrt(() => s)).toBe('full');
    expect(loadCrt(() => { throw new Error('SecurityError'); })).toBe('subtle');
    saveCrt(() => s, 'off'); expect(s.m.get(CRT_KEY)).toBe('off');
    expect(() => saveCrt(() => { throw new Error('QuotaExceeded'); }, 'full')).not.toThrow();
  });
  it('installCrt reads once at boot and F10 cycles and saves in dev builds only', () => {
    let v: CrtSetting = 'full';
    const target = { crt: () => v, setCrt: (x: CrtSetting) => { v = x; } }, cbs: ((e: { code: string }) => void)[] = [], log: string[] = [];
    const keys = { addEventListener: (_t: 'keydown', cb: (e: { code: string }) => void) => { cbs.push(cb); } }, s = store(null);
    installCrt(target, { storage: () => s, keys, dev: true, log: (m) => log.push(m) });
    expect(v).toBe('subtle');
    for (const code of ['F9', 'F10', 'F10', 'F10']) for (const cb of cbs) cb({ code });
    expect(v).toBe('subtle'); expect(s.m.get(CRT_KEY)).toBe('subtle'); expect(log).toEqual(['crt: off', 'crt: full', 'crt: subtle']);
    const quiet: ((e: { code: string }) => void)[] = [];
    installCrt(target, { storage: () => store('off'), keys: { addEventListener: (_t, cb) => { quiet.push(cb); } }, dev: false });
    expect(v).toBe('off'); expect(quiet).toHaveLength(0);
  });
});

describe('the ramp, the blinks and the flicker (CRT map spec sections 2-4)', () => {
  it('six colours, darkest first', () => {
    expect(CRT_RAMP).toEqual([0x0c0e0b, 0x2a1a08, 0x7a4a10, 0xc47a12, 0xffae1a, 0xffd36b]);
    expect(CRT.glass).toBe(0x0c0e0b); expect(CRT.hot).toBe(0xffd36b);
  });
  it('a blink is a square wave on floor(t * 2 * hz) % 2: two states, never anything else', () => {
    expect([0, 0.24, 0.26, 0.49, 0.51, 0.76, 1.01].map((t) => blink(t, 2))).toEqual([0, 0, 1, 1, 0, 1, 0]);
    expect([0, 0.49, 0.5, 0.99, 1].map((t) => blink(t, 1))).toEqual([0, 0, 1, 1, 0]);
  });
  it('the flicker darkens by at most FLICKER_DEPTH x strength, and not at all at strength 0', () => {
    for (let t = 0; t < 20; t += 0.125) {
      const f = crtFlicker(t, 1); expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThanOrEqual(FLICKER_DEPTH);
      expect(crtFlicker(t, 0)).toBe(0);
    }
  });
});

describe('the bezel (CRT map spec section 3)', () => {
  it('3 internal pixels; a rectangle inside its inner edge passes, one under the band or in a rounded corner fails', () => {
    expect(BEZEL_PX).toBe(3);
    expect(insideBezel(3, 20, 10, 10, 1280, 720)).toBe(true);
    expect(insideBezel(2, 20, 10, 10, 1280, 720)).toBe(false);
    expect(insideBezel(1200, 700, 77, 17, 1280, 720)).toBe(false);   // its bottom-right corner is in the rounded corner
    expect(insideBezel(1200, 700, 60, 17, 1280, 720)).toBe(true);
    expect(insideBezel(1200, 700, 60, 18, 1280, 720)).toBe(false);
    expect(insideBezel(3, 3, 4, 4, 1280, 720)).toBe(false);   // the very corner is under the rounded edge
    expect(insideBezel(3 + BEZEL_RADIUS, 3, 4, 4, 1280, 720)).toBe(true);
  });
});

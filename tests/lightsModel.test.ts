import { describe, it, expect } from 'vitest';
import {
  CONSOLE_GLOW, consoleGlow, fireGlow, FIRE_GLOW, GLOW_STEPS, glowRuns, LAMP_ALERT, LAMP_CALM, lampLight, lampLit, screenCursor, screenPhase, STAR_LAYERS, stars
} from '../src/renderer/src/render/lightsModel';
import { WORLD_BAND } from '../src/renderer/src/render/worldFit';
import { INTERIOR_BAND } from '../src/renderer/src/render/duel/interiorModel';
import { deskPicture, type Side } from '../src/renderer/src/render/consoleModel';
import { onGrid } from './helpers/artGrid';

describe('posterised glows (Art-i spec section 5)', () => {
  it('are whole art pixels in 3 alpha steps with hard edges, brightest in the middle', () => {
    for (const radius of [4, 5, 8]) {
      const runs = glowRuns(radius);
      for (const r of runs) expect(onGrid(r), JSON.stringify(r)).toBe(true);
      expect(new Set(runs.map((r) => r.alpha))).toEqual(new Set(GLOW_STEPS));
      const centre = runs.find((r) => r.y === 0 && r.x <= 0 && r.x + r.w > 0)!;
      expect(centre.alpha).toBe(GLOW_STEPS[2]);
      for (const r of runs) { expect(Math.abs(r.x) <= radius * 2 && Math.abs(r.x + r.w) <= radius * 2).toBe(true); expect(Math.abs(r.y) <= radius * 2).toBe(true); }
    }
    const cells = (radius: number): number => glowRuns(radius).reduce((n, r) => n + (r.w / 2) * (r.h / 2), 0);
    expect(cells(5)).toBeGreaterThan(60); expect(cells(5)).toBeLessThan(100);   // about pi x 25 art pixels
  });
  it('consoles glow steady, brighter when occupied, dark when down; fire flickers between three steps', () => {
    expect([consoleGlow('free'), consoleGlow('occupied'), consoleGlow('down')]).toEqual([CONSOLE_GLOW.free, CONSOLE_GLOW.occupied, 0]);
    expect(CONSOLE_GLOW.occupied).toBeGreaterThan(CONSOLE_GLOW.free);
    const seen = new Set<number>();
    for (let k = 0; k < 200; k++) { const a = fireGlow(77, 12, k / 10); expect(FIRE_GLOW).toContain(a); seen.add(a); }
    expect(seen.size).toBe(3);
    expect(fireGlow(77, 12, 0.31)).toBe(fireGlow(77, 12, 0.39));          // steady within a tenth of a second
  });
});

describe('lamps, screens and stars (Art-i spec section 8)', () => {
  it('a lamp flickers dark briefly once a 3-7 s period when calm, and shows lampOn steadily in alert', () => {
    let dark = 0;
    for (let k = 0; k < 7 * 1000; k++) if (!lampLit(9, 3, k / 1000)) dark++;
    expect(dark).toBeGreaterThanOrEqual(140); expect(dark).toBeLessThanOrEqual(2 * 140 + 2);   // 0.14 s dark per period, 1 or 2 periods in 7 s
    expect(lampLight(true, false)).toEqual({ on: true, alpha: LAMP_ALERT });
    expect(lampLight(false, true)).toEqual({ on: false, alpha: LAMP_CALM });
    expect(lampLight(false, false)).toEqual({ on: false, alpha: 0 });
  });
  it('a console screen blinks between A and B at 1-2 Hz', () => {
    for (const station of [0, 1, 2, 3]) {
      let flips = 0, last = screenPhase(5, station, 0);
      for (let k = 1; k <= 10 * 100; k++) { const p = screenPhase(5, station, k / 100); if (p !== last) flips++; last = p; }
      expect(flips).toBeGreaterThanOrEqual(19); expect(flips).toBeLessThanOrEqual(41);   // 2 flips a cycle, 1 to 2 cycles a second, 10 s
    }
  });
  it('the screen cursor is 2 x 1 art pixels on the grid, inside the screen of every desk', () => {
    for (const side of ['n', 'e', 's', 'w'] as Side[]) for (const flush of [true, false]) {
      const s = deskPicture(side, flush, 'free').screen, c = screenCursor(64, 96, s);
      expect(onGrid(c), JSON.stringify(c)).toBe(true);
      expect(c.w * c.h).toBe(8);
      expect(c.x >= 64 + s.x && c.x + c.w <= 64 + s.x + s.w && c.y >= 96 + s.y && c.y + c.h <= 96 + s.y + s.h, `${side} ${flush} ${JSON.stringify(c)}`).toBe(true);
    }
  });
  it('the starfield: two layers drifting left at 4 and 10 art px/s, one art pixel, inside the band, on whole art pixels', () => {
    expect(STAR_LAYERS.map((l) => l.speed)).toEqual([4, 10]);
    const whole = (v: number): boolean => Math.abs(v - Math.round(v)) < 1e-9;
    for (const artPx of [2, 4 / 3, 1.31, 1]) for (const band of [WORLD_BAND, INTERIOR_BAND]) {
      for (const t of [0, 1.3, 17.77]) for (const s of stars(3, band, t, artPx)) {
        expect(s.x >= band.x && s.x + artPx <= band.x + band.w + 1e-9 && s.y >= band.y && s.y + artPx <= band.y + band.h + 1e-9).toBe(true);
        expect(whole((s.x - band.x) / artPx) && whole((s.y - band.y) / artPx), `${artPx} ${JSON.stringify(s)}`).toBe(true);
      }
      const a = stars(3, band, 10, artPx), b = stars(3, band, 11, artPx);
      const moved = a.map((s, k) => ({ layer: s.layer, dx: s.x - b[k]!.x, dy: s.y - b[k]!.y })).filter((m) => Math.abs(m.dx) < band.w / 2);
      expect(moved.length).toBeGreaterThan(60);
      for (const m of moved) { expect(m.dy).toBe(0); expect(Math.abs(m.dx - STAR_LAYERS[m.layer]!.speed * artPx)).toBeLessThanOrEqual(artPx + 1e-9); }
    }
  });
});

// UI round spec §1.7: the FPS meter (whole frames per second over each half second), the setting, the readout's place.
import { describe, expect, it } from 'vitest';
import { createFpsMeter } from '../src/renderer/src/app/fpsMeter';
import { DEFAULT_SETTINGS, loadSettings, SETTINGS_KEY } from '../src/renderer/src/app/settingsStore';
import { FPS_X, FPS_Y } from '../src/renderer/src/ui/FpsCounter';
import { INTERNAL_H, INTERNAL_W } from '../src/shared/resolution';
import { BY } from '../src/renderer/src/ui/duel/MapOverlay';

const mem = (raw: string) => { const m = new Map([[SETTINGS_KEY, raw]]); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

describe('the FPS counter (spec §1.7)', () => {
  it('counts frames per half second', () => {
    const m = createFpsMeter(500);
    expect(m.frame(0)).toBeNull();
    let out: number | null = null;
    for (let k = 1; k <= 30; k++) out = m.frame(k * (1000 / 60)) ?? out;   // 60 Hz for half a second
    expect(out).toBe(60);
    for (let k = 1; k <= 15; k++) out = m.frame(500 + k * (1000 / 30)) ?? out;   // then 30 Hz
    expect(out).toBe(30);
  });
  it('is on by default and saved', () => {
    expect(DEFAULT_SETTINGS.fpsCounter).toBe(true);
    expect(loadSettings(mem('{"version":3,"master":1,"music":1,"effects":1}')).fpsCounter).toBe(true);
    expect(loadSettings(mem('{"version":3,"master":1,"music":1,"effects":1,"fpsCounter":false}')).fpsCounter).toBe(false);
  });
  it('sits in the bottom-right corner, under the console scale bar label', () => {
    expect(FPS_X).toBe(INTERNAL_W - 8);
    expect(FPS_Y).toBe(702);
    expect(FPS_Y).toBeGreaterThan(BY + 8);   // the scale bar's label draws from BY - 8 for 16 px
    expect(FPS_Y + 16).toBeLessThanOrEqual(INTERNAL_H);
  });
});

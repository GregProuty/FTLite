// UI round spec §2.4a: the terminal layout at 1280x720: the HUD top left and bottom left, the station blocks right of the
// power panel, the own ship window under the HUD, the enemy window top right; nothing overlaps; the zoom box is gone.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INTERNAL_H, INTERNAL_W } from '../src/shared/resolution';
import * as L from '../src/renderer/src/render/duel/consoleLayout';
import { HUD, hullSegX, powerPanel } from '../src/renderer/src/render/duel/shipHudModel';
import { sitCardBox } from '../src/renderer/src/ui/duel/SitCard';
import { SIT_CARDS } from '../src/renderer/src/render/duel/sitModel';
import { pauseLineBox } from '../src/renderer/src/ui/duel/Banners';

type R = { x: number; y: number; w: number; h: number };
const overlaps = (a: R, b: R): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inStage = (r: R): boolean => r.x >= 0 && r.y >= 0 && r.x + r.w <= INTERNAL_W && r.y + r.h <= INTERNAL_H;

describe('the terminal layout (spec §2.4a)', () => {
  it('has the agreed numbers', () => {
    const p = powerPanel();
    expect(p.x + p.w).toBe(334);
    expect(L.STATION.x).toBe(346);
    expect(L.FLIGHT.x).toBe(658);
    expect(L.OWN_SHIP).toEqual({ x: 12, y: 160, w: 240, h: 170 });
    expect(L.CONTACT).toEqual({ x: 968, y: 42, w: 300, h: 420 });
    expect(L.CONSOLE_RESERVE).toEqual({ left: 264, right: 12 });
    expect(L.CONTACT_RESERVE).toBe(324);
    expect(L.INFO_BAND).toEqual({ left: L.TABS_RIGHT, right: L.CONTACT.x });
    expect(hullSegX(19) + HUD.hull.segW).toBe(330);
    expect('SIDE' in L || 'STATUS' in L || 'POWER_STRIP' in L).toBe(false);
    expect(existsSync('src/renderer/src/ui/duel/SideColumn.tsx') || existsSync('src/renderer/src/ui/duel/PowerStrip.tsx')).toBe(false);
  });
  it('every sit card sits between the HUD and the enemy window, clear of the own ship window and the pause line', () => {
    const pause = pauseLineBox('PAUSED   ESC: RESUME   F11: FULLSCREEN   M: MAIN MENU');
    for (const [seat, c] of Object.entries(SIT_CARDS)) for (const under of [false, true]) {
      const b = sitCardBox({ ...c, under });
      expect(b.x, seat).toBeGreaterThanOrEqual(L.HUD_TOP.x + L.HUD_TOP.w);
      expect(b.x + b.w, seat).toBeLessThanOrEqual(L.CONTACT.x);
      for (const r of [L.CONTACT, L.OWN_SHIP, pause]) expect(overlaps(b, r), `${seat} ${under}`).toBe(false);
    }
  });
  it('no two blocks overlap, and all sit on the stage, for every station', () => {
    const tabs = { x: L.TABS.x, y: L.TABS.y, w: L.TABS_RIGHT - L.TABS.x, h: L.TABS.h };
    const block = (s: 'helm' | 'weapons' | 'science'): R => ({ x: L.STATION.x, y: L.stationTop(s), w: L.STATION.w, h: L.STATION.h[s] });
    const pause = pauseLineBox('PAUSED   ESC: RESUME   F11: FULLSCREEN   M: MAIN MENU');
    for (const s of ['helm', 'weapons', 'science'] as const) {
      const rects: [string, R][] = [['tabs', tabs], ['hudTop', L.HUD_TOP], ['hudPower', L.HUD_POWER], ['block', block(s)], ['own', L.OWN_SHIP], ['contact', L.CONTACT], ['pause', pause],
        ...(s === 'helm' ? [['flight', L.FLIGHT] as [string, R]] : [])];
      for (const [n, r] of rects) expect(inStage(r), `${s} ${n}`).toBe(true);
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++)
        expect(overlaps(rects[i]![1], rects[j]![1]), `${s}: ${rects[i]![0]} x ${rects[j]![0]}`).toBe(false);
    }
  });
});

// UI round 2b: the console layout anchors to the stage's edges: at every stage the console rects sit on the stage and
// never overlap, the margins hold, and the pointer hit tests follow the layout.
import { describe, expect, it } from 'vitest';
import type { StageSize } from '../src/shared/resolution';
import * as L from '../src/renderer/src/render/duel/consoleLayout';
import { consoleLayout } from '../src/renderer/src/render/duel/consoleLayout';
import { onFlightMap, onHelmMap, onWeaponsMap } from '../src/renderer/src/app/duel/flightPointer';
import { pauseLineBox } from '../src/renderer/src/ui/duel/Banners';

type R = { x: number; y: number; w: number; h: number };
const overlaps = (a: R, b: R): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const STAGES: StageSize[] = [{ w: 1280, h: 720 }, { w: 1707, h: 720 }, { w: 2560, h: 720 }, { w: 1280, h: 800 }, { w: 1280, h: 960 }];
const PAUSE = 'PAUSED   ESC: RESUME   F11: FULLSCREEN   M: MAIN MENU';

describe('the anchored console layout', () => {
  it('is the reference layout at 1280x720, under the long-standing names', () => {
    const r = consoleLayout({ w: 1280, h: 720 });
    expect(r).toBe(consoleLayout());
    expect(r.CONTACT).toEqual(L.CONTACT);
    expect(r.FLIGHT).toEqual(L.FLIGHT);
    expect(r.HUD_POWER).toEqual(L.HUD_POWER);
    expect(r.INFO_BAND).toEqual(L.INFO_BAND);
    expect(r.CONTACT_RESERVE).toBe(324);
    expect(L.HUD_POWER.y + L.HUD_POWER.h).toBe(712);
    expect(r.stationTop('weapons')).toBe(L.stationTop('weapons'));
    expect(r.weaponCard('torpedo')).toEqual(L.weaponCard('torpedo'));
    expect(r.flightCard(1)).toEqual(L.flightCard(1));
  });
  for (const stage of STAGES) {
    const tag = `${stage.w}x${stage.h}`;
    it(`${tag}: every rect sits on the stage and no two overlap, for every station`, () => {
      const lay = consoleLayout(stage);
      const inStage = (r: R): boolean => r.x >= 0 && r.y >= 0 && r.x + r.w <= stage.w && r.y + r.h <= stage.h;
      const tabs = { x: L.TABS.x, y: L.TABS.y, w: L.TABS_RIGHT - L.TABS.x, h: L.TABS.h };
      const block = (s: 'helm' | 'weapons' | 'science'): R => ({ x: L.STATION.x, y: lay.stationTop(s), w: L.STATION.w, h: L.STATION.h[s] });
      const pause = pauseLineBox(PAUSE, stage.w);
      for (const s of ['helm', 'weapons', 'science'] as const) {
        const rects: [string, R][] = [['tabs', tabs], ['hudTop', L.HUD_TOP], ['hudPower', lay.HUD_POWER], ['block', block(s)], ['own', L.OWN_SHIP], ['contact', lay.CONTACT], ['pause', pause],
          ...(s === 'helm' ? [['flight', lay.FLIGHT] as [string, R]] : [])];
        for (const [n, r] of rects) expect(inStage(r), `${tag} ${s} ${n}`).toBe(true);
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++)
          expect(overlaps(rects[i]![1], rects[j]![1]), `${tag} ${s}: ${rects[i]![0]} x ${rects[j]![0]}`).toBe(false);
      }
    });
    it(`${tag}: the margins hold to the stage's edges`, () => {
      const lay = consoleLayout(stage);
      expect(lay.stage).toEqual(stage);
      expect(lay.CONTACT.x + lay.CONTACT.w).toBe(stage.w - 12);
      expect(lay.stationTop('weapons') + 268).toBe(stage.h - 12);
      expect(lay.HUD_POWER.y + lay.HUD_POWER.h).toBe(stage.h - 8);
      expect(lay.FLIGHT.y + lay.FLIGHT.h).toBe(stage.h - 12);
      expect(lay.INFO_BAND.right).toBe(lay.CONTACT.x);
      expect(lay.CONTACT_RESERVE).toBe(stage.w - lay.CONTACT.x + 12);
    });
  }
  it('the hit tests follow the layout', () => {
    const wide = consoleLayout({ w: 1707, h: 720 });
    expect(wide.CONTACT.x).toBe(1395);
    for (const on of [onFlightMap, onWeaponsMap, onHelmMap]) {
      expect(on({ x: 1690, y: 100 }, true, wide)).toBe(false);   // inside the contact window (x 1395 to 1695)
      expect(on({ x: 1690, y: 100 }, false, wide)).toBe(true);
      expect(on({ x: 1700, y: 100 }, true, wide)).toBe(true);    // the 12 px margin right of the window is map
      expect(on({ x: 1600, y: 600 }, true, wide)).toBe(true);    // the open map, past the reference stage's edge
      expect(on({ x: 1600, y: 600 }, true)).toBe(false);         // off the reference stage
      expect(on({ x: 1707, y: 600 }, true, wide)).toBe(false);   // off this stage
    }
    const tall = consoleLayout({ w: 1280, h: 960 });
    expect(onWeaponsMap({ x: 400, y: 940 }, true, tall)).toBe(false);   // the Weapons block
    expect(onWeaponsMap({ x: 400, y: 600 }, true, tall)).toBe(true);    // where the block sat at 720, open map now
    expect(onWeaponsMap({ x: 400, y: 600 }, true)).toBe(false);
  });
});

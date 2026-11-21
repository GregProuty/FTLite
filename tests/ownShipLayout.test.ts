// Own ship window spec §3 (UI round spec §2.4a: under the HUD's top block): the window's rect clears every console block
// and its header sits above its drawing box.
import { describe, expect, it } from 'vitest';
import {
  CONTACT, FLIGHT, HUD_POWER, HUD_TOP, OWN_SHIP, OWN_SHIP_BOX, OWN_SHIP_RIGHT, OWN_SHIP_STATUS_Y, OWN_SHIP_TITLE_Y, OWN_SHIP_X0,
  STATION, stationTop, TABS
} from '../src/renderer/src/render/duel/consoleLayout';
import { FONT_NATIVE } from '../src/renderer/src/render/theme';
import { INTERNAL_H, INTERNAL_W } from '../src/shared/resolution';

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('the own ship window layout (spec §3)', () => {
  it('is x 12 to 252, y 160 to 330, with the box x 20 to 244, y 200 to 322', () => {
    expect(OWN_SHIP).toEqual({ x: 12, y: 160, w: 240, h: 170 });
    expect(OWN_SHIP_BOX).toEqual({ x: 20, y: 200, w: 224, h: 122 });
  });
  it('lies on the stage, under the HUD\'s top block, clear of the tabs, the HUD, stations, FLIGHT and CONTACT', () => {
    expect(OWN_SHIP.x).toBeGreaterThanOrEqual(0); expect(OWN_SHIP.y).toBeGreaterThanOrEqual(0);
    expect(OWN_SHIP.x + OWN_SHIP.w).toBeLessThanOrEqual(INTERNAL_W); expect(OWN_SHIP.y + OWN_SHIP.h).toBeLessThanOrEqual(INTERNAL_H);
    expect(OWN_SHIP.y).toBeGreaterThanOrEqual(HUD_TOP.y + HUD_TOP.h);
    const blocks: Rect[] = [
      { x: TABS.x, y: TABS.y, w: 4 * TABS.w + 3 * TABS.gap, h: TABS.h },
      ...(['helm', 'weapons', 'science'] as const).map((s) => ({ x: STATION.x, y: stationTop(s), w: STATION.w, h: STATION.h[s] })),
      FLIGHT, HUD_TOP, HUD_POWER, CONTACT
    ];
    for (const b of blocks) expect(overlaps(OWN_SHIP, b), JSON.stringify(b)).toBe(false);
  });
  it('the box lies inside the window and the two header rows end above it', () => {
    expect(OWN_SHIP_BOX.x).toBeGreaterThanOrEqual(OWN_SHIP.x); expect(OWN_SHIP_BOX.y).toBeGreaterThanOrEqual(OWN_SHIP.y);
    expect(OWN_SHIP_BOX.x + OWN_SHIP_BOX.w).toBeLessThanOrEqual(OWN_SHIP.x + OWN_SHIP.w);
    expect(OWN_SHIP_BOX.y + OWN_SHIP_BOX.h).toBeLessThanOrEqual(OWN_SHIP.y + OWN_SHIP.h);
    expect(OWN_SHIP_TITLE_Y + FONT_NATIVE).toBeLessThanOrEqual(OWN_SHIP_STATUS_Y);
    expect(OWN_SHIP_STATUS_Y + FONT_NATIVE).toBeLessThanOrEqual(OWN_SHIP_BOX.y);
    expect(OWN_SHIP_X0 + 136 + 56).toBeLessThanOrEqual(OWN_SHIP_RIGHT - 24);   // the bar ends left of a 3-digit hull value
    expect(OWN_SHIP_X0 + 36 + 4 * 12 + 8).toBeLessThanOrEqual(OWN_SHIP_X0 + 100);   // 5 shield pips end before HULL
  });
});

// Own ship window spec §3: the window's rect clears every console block and its header sits above its drawing box.
import { describe, expect, it } from 'vitest';
import {
  CONTACT, FLIGHT, OWN_SHIP, OWN_SHIP_BOX, OWN_SHIP_RIGHT, OWN_SHIP_STATUS_Y, OWN_SHIP_TITLE_Y, OWN_SHIP_X0, SIDE, SIDE_H,
  STATION, STATUS, stationTop, TABS
} from '../src/renderer/src/render/duel/consoleLayout';
import { FONT_NATIVE } from '../src/renderer/src/render/theme';
import { INTERNAL_H, INTERNAL_W } from '../src/shared/resolution';

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('the own ship window layout (spec §3)', () => {
  it('is x 228 to 468, y 42 to 212, with the box x 236 to 460, y 82 to 204', () => {
    expect(OWN_SHIP).toEqual({ x: 228, y: 42, w: 240, h: 170 });
    expect(OWN_SHIP_BOX).toEqual({ x: 236, y: 82, w: 224, h: 122 });
  });
  it('lies on the stage, right of the status column, clear of the tabs, stations, FLIGHT, SIDE and CONTACT', () => {
    expect(OWN_SHIP.x).toBeGreaterThanOrEqual(0); expect(OWN_SHIP.y).toBeGreaterThanOrEqual(0);
    expect(OWN_SHIP.x + OWN_SHIP.w).toBeLessThanOrEqual(INTERNAL_W); expect(OWN_SHIP.y + OWN_SHIP.h).toBeLessThanOrEqual(INTERNAL_H);
    expect(OWN_SHIP.x).toBeGreaterThanOrEqual(STATUS.x + STATUS.w);
    const blocks: Rect[] = [
      { x: TABS.x, y: TABS.y, w: 4 * TABS.w + 3 * TABS.gap, h: TABS.h },
      ...(['helm', 'weapons', 'science'] as const).map((s) => ({ x: STATION.x, y: stationTop(s), w: STATION.w, h: STATION.h[s] })),
      FLIGHT, { x: SIDE.x, y: SIDE.y, w: SIDE.w, h: SIDE_H }, CONTACT
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

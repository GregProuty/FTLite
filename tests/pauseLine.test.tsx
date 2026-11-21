// UI round spec §1.5: the pause line sits at top centre on its panel, clear of the tab strip, the HUD's top block (§2.4a:
// on every view), the own ship window and the enemy window, for the longest local text.
import { describe, expect, it } from 'vitest';
import { INTERNAL_W } from '../src/shared/resolution';
import { PAUSE_H, PAUSE_Y, pauseLineBox } from '../src/renderer/src/ui/duel/Banners';
import { CONTACT, HUD_TOP, OWN_SHIP, TABS, TABS_RIGHT } from '../src/renderer/src/render/duel/consoleLayout';
import { HUD, HULL_SEGMENTS, hullSegX } from '../src/renderer/src/render/duel/shipHudModel';
import { STATUS_Y, INFO_Y } from '../src/renderer/src/render/tactical/weaponsModel';

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const LONGEST = 'PAUSED   ESC: RESUME   F11: FULLSCREEN   M: MAIN MENU';

describe('the pause line (spec §1.5)', () => {
  it('is centred at y 66..90, below the map headline and info line', () => {
    const b = pauseLineBox(LONGEST);
    expect([b.y, b.h, PAUSE_Y, PAUSE_H]).toEqual([66, 24, 66, 24]);
    expect(b.x + b.w / 2).toBeCloseTo(INTERNAL_W / 2, 6);
    expect(b.y).toBeGreaterThan(INFO_Y + 16);
    expect(STATUS_Y).toBeLessThan(INFO_Y);
  });
  it('overlaps no panel', () => {
    const b = pauseLineBox(LONGEST);
    const tabs = { x: TABS.x, y: TABS.y, w: TABS_RIGHT - TABS.x, h: TABS.h };
    // the ship view's hull bar and shield row (ShipHud's HUD block): from the HULL label to the shield pips' bottom, as
    // wide as the 20-segment bar (the shield row, SHIELDS and its pips, is narrower)
    const hullBar = { x: HUD.x, y: HUD.hull.labelY, w: hullSegX(HULL_SEGMENTS - 1) + HUD.hull.segW - HUD.x, h: HUD.shields.y + HUD.shields.pip - HUD.hull.labelY };
    for (const p of [tabs, hullBar, HUD_TOP, OWN_SHIP, CONTACT]) expect(overlaps(b, p), JSON.stringify(p)).toBe(false);
  });
});

// The Artemis-style console layout (spec 2026-11-17-artemis-consoles §2), internal 1280×720. Pure: shared by the
// components, the scene's map reserves and the tests.
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import { READOUT_W } from './readoutModel';

export const EDGE = 12;
export const TABS = { x: 12, y: 8, w: 96, gap: 4, h: 26 } as const;
export const TABS_RIGHT = TABS.x + 4 * TABS.w + 3 * TABS.gap;   // HELM, WEAPONS, SCIENCE, SHIP (Sci-1)
export const STATUS = { x: 12, y: 42, w: READOUT_W } as const;
export const STATION = { x: 12, w: 300, h: { helm: 200, weapons: 216, science: 96 } } as const;   // the frequency row takes the old steer row's place (Sci-1 spec §7.4)
export function stationTop(s: 'helm' | 'weapons' | 'science'): number { return INTERNAL_H - EDGE - STATION.h[s]; }
/** FTL targeting spec §1: the Weapons block's two weapon cards, LASER then TORPEDO, side by side at its top; `hit` is the
 *  card's clickable part above its FIRE / LAUNCH button, and the targeting line starts at `anchor` (the card's right edge
 *  mid-height of `hit`). */
export function weaponCard(weapon: 'laser' | 'torpedo'): { x: number; y: number; w: number; h: number; hitH: number; anchor: { x: number; y: number } } {
  const x0 = STATION.x + 8, y = stationTop('weapons') + 6, w = 138, h = 104, hitH = 72, x = weapon === 'laser' ? x0 : x0 + w + 8;
  return { x, y, w, h, hitH, anchor: { x: x + w, y: y + hitH / 2 } };
}
export const SIDE = { x: INTERNAL_W - EDGE - 132, y: 42, w: 132 } as const;
/** The side column panel's height (SideColumn). */
export const SIDE_H = 96;
/** The map's off-screen arrows and the Weapons notice keep clear of the status table and the right column. */
export const CONSOLE_RESERVE = { left: STATUS.x + STATUS.w + EDGE, right: EDGE + SIDE.w + EDGE } as const;
/** The contact window (enemy ship window spec §4.1): at the right edge, directly below the side column, ending at y 570 (Sci-1: room for the info lines). */
export const CONTACT = { x: INTERNAL_W - EDGE - 300, y: SIDE.y + SIDE_H + EDGE, w: 300, h: 420 } as const;
/** Its ship drawing box (spec §4.2 item 3): 276 × 200 under the title and status rows. */
export const CONTACT_BOX = { x: CONTACT.x + 12, y: CONTACT.y + 60, w: 276, h: 200 } as const;
/** The map's right reserve while the window is shown, instead of CONSOLE_RESERVE.right: the off-screen arrows and the top
 *  info line keep clear of it. */
export const CONTACT_RESERVE = INTERNAL_W - CONTACT.x + EDGE;

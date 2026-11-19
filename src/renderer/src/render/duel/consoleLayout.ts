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
/** FTL targeting spec §1, Engineering spike §10.3, §11: the Weapons block's three weapon cards, PEW PEW, BEAM ('laser')
 *  and TORPEDO, side by side at its top. `hit` is the card's clickable part (the beam's and the torpedo's pick-up; PEW
 *  PEW has none on this branch); `pipsY` the bar pips under it (left click adds a bar, right click removes one); FIRE /
 *  LAUNCH sits below them; the targeting line starts at `anchor` (the card's right edge mid-height of `hit`). */
export type CardWeapon = 'pew' | 'laser' | 'torpedo';
export const CARD_ORDER: readonly CardWeapon[] = ['pew', 'laser', 'torpedo'];
export function weaponCard(weapon: CardWeapon): { x: number; y: number; w: number; h: number; hitH: number; pipsY: number; anchor: { x: number; y: number } } {
  const x0 = STATION.x + 8, y = stationTop('weapons') + 6, w = 90, h = 104, hitH = 60, x = x0 + CARD_ORDER.indexOf(weapon) * (w + 6);
  return { x, y, w, h, hitH, pipsY: y + hitH + 2, anchor: { x: x + w, y: y + hitH / 2 } };
}
/** Valkyrn spec §5: the Flight seat's weapon block, beside the Helm block at the bottom: two cards (GUN or the laser fit's
 *  LASER, then TORPEDO), the reason line and, with the laser fit, the frequency row. */
export const FLIGHT = { x: STATION.x + STATION.w + EDGE, y: INTERNAL_H - EDGE - 166, w: 300, h: 166 } as const;
/** One Flight card, as weaponCard: `hit` is the clickable part, `anchor` where the targeting line starts. */
export function flightCard(slot: 0 | 1): { x: number; y: number; w: number; h: number; hitH: number; anchor: { x: number; y: number } } {
  const w = 138, x = FLIGHT.x + 8 + slot * (w + 8), y = FLIGHT.y + 6, h = 104, hitH = 72;
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
/** Feel-ii: the top px of a console map the off-screen arrows keep clear of: the status sentence (y 12, FONT_SIZE) and the
 *  Weapons info line under it (y 44, FONT_NATIVE), so an arrow never sits on their words. */
export const STATUS_RESERVE = 44;

/** Engineering spike §9.3: the console's power strip, to the right of the station block at the bottom: a title line,
 *  the slots in a row (10 fit: the Weapons system's, spec §10.1) and the heat bar. */
export const POWER_STRIP = { x: STATION.x + STATION.w + EDGE, w: 236, h: 54, slotW: 18, slotH: 14, slotGap: 2 } as const;
export function stripTop(): number { return INTERNAL_H - EDGE - POWER_STRIP.h; }

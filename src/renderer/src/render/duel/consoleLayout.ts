// The console layout at the fixed 1280×720 stage (spec 2026-11-17-artemis-consoles §2; UI round spec §2.4a: no status
// table and no side column; the ship HUD top left and bottom left on every view; the station blocks right of the HUD's
// power panel; the own ship window under the HUD; the enemy window in the top-right corner). Pure: shared by the
// components, the scene's map reserves, the pointer hit tests and the tests.
import { REFERENCE_STAGE, type StageSize } from '../../../../shared/resolution';
import { HUD, hullSegX, powerPanel } from './shipHudModel';

export const EDGE = 12;
export const TABS = { x: 12, y: 8, w: 96, gap: 4, h: 26 } as const;
export const TABS_RIGHT = TABS.x + 4 * TABS.w + 3 * TABS.gap;   // HELM, WEAPONS, SCIENCE, SHIP (Sci-1)
const PANEL = powerPanel();
/** UI round §2.4a: the HUD's top block (the hull bar, the shields row and the health row under them) and its power panel
 *  with the REACTOR line above it: never the map, and the console blocks keep clear of both. */
export const HUD_TOP = { x: HUD.x - 6, y: HUD.hull.labelY - 6, w: hullSegX(19) + HUD.hull.segW + 6 - (HUD.x - 6), h: 150 - (HUD.hull.labelY - 6) } as const;
export const STATION = { x: PANEL.x + PANEL.w + EDGE, w: 300, h: { helm: 200, weapons: 268, science: 96 } } as const;   // UI round §2.4a: right of the power panel (x 346); the frequency row takes the old steer row's place (Sci-1 spec §7.4); W-1: the PEW row on top (+28); Engineering spike §10.3: the bar pips (+12 on the PEW row, +12 under the cards)
/** W-1 (pew pew spec 1): the PEW row at the top of the Weapons block (its label, three charge pips and the click hint);
 *  Engineering spike §10.3: and its bar pips under the charge pips (+12). */
export const PEW_ROW_H = 40;
/** Engineering spike §10.3: the bar pips' row under each card's clickable part, above its FIRE / LAUNCH button. */
export const CARD_PIPS_H = 12;
/** UI round §2.4a: the own ship window under the HUD's top block (x 12 to 252, y 160 to 330). */
export const OWN_SHIP = { x: EDGE, y: 160, w: 240, h: 170 } as const;
/** Its drawing box under the two header rows (x 20 to 244, y 200 to 322). */
export const OWN_SHIP_BOX = { x: OWN_SHIP.x + 8, y: OWN_SHIP.y + 40, w: OWN_SHIP.w - 16, h: OWN_SHIP.h - 48 } as const;
/** Own ship window spec §2: the header's left and right text edges, the title row and the SHLD / HULL row. */
export const OWN_SHIP_X0 = OWN_SHIP.x + 8, OWN_SHIP_RIGHT = OWN_SHIP.x + OWN_SHIP.w - 8;
export const OWN_SHIP_TITLE_Y = OWN_SHIP.y + 4, OWN_SHIP_STATUS_Y = OWN_SHIP.y + 20;
/** The map's off-screen arrows and centre keep clear of the own ship window on the left and the stage edge on the right
 *  (CONTACT_RESERVE while the contact window shows). */
export const CONSOLE_RESERVE = { left: OWN_SHIP.x + OWN_SHIP.w + EDGE, right: EDGE } as const;
/** Feel-ii: the top px of a console map the off-screen arrows keep clear of: the status sentence (y 12, FONT_SIZE) and the
 *  Weapons info line under it (y 44, FONT_NATIVE), so an arrow never sits on their words. */
export const STATUS_RESERVE = 44;

export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface WeaponCardBox { x: number; y: number; w: number; h: number; hitH: number; pipsY: number; anchor: { x: number; y: number } }
export interface FlightCardBox { x: number; y: number; w: number; h: number; hitH: number; anchor: { x: number; y: number } }
/** UI round 2b: the stage-dependent part of the console layout, anchored to the stage's edges: the station blocks and the
 *  FLIGHT block to the bottom, the contact window to the top-right corner, the HUD's power panel to the bottom left. */
export interface ConsoleLayout {
  readonly stage: StageSize;
  readonly stationTop: (s: 'helm' | 'weapons' | 'science') => number;
  readonly FLIGHT: Rect;
  readonly CONTACT: Rect;
  readonly CONTACT_BOX: Rect;
  readonly CONTACT_RESERVE: number;
  readonly INFO_BAND: { readonly left: number; readonly right: number };
  readonly HUD_POWER: Rect;
  readonly weaponCard: (w: 'laser' | 'autocannon' | 'torpedo') => WeaponCardBox;
  readonly weaponPips: (slot: 0 | 1 | 2) => { x: number; y: number };
  readonly flightCard: (slot: 0 | 1) => FlightCardBox;
}

function buildLayout(stage: StageSize): ConsoleLayout {
  const panel = powerPanel(stage.h);
  const HUD_POWER = { x: panel.x, y: panel.y - 30, w: panel.w, h: panel.h + 30 } as const;
  const stationTop = (s: 'helm' | 'weapons' | 'science'): number => stage.h - EDGE - STATION.h[s];
  /** FTL targeting spec §1: the Weapons block's two weapon cards, BEAM (the laser) then TORPEDO, side by side under the PEW
   *  row (W-4 spec §10: on the Hound the first is the AUTOCANNON, in the beam's rectangle); `hit` is the card's clickable part above its bar pips (`pipsY`, Engineering spike §10.3) and its FIRE / LAUNCH
   *  button, and the targeting line starts at `anchor` (the card's right edge mid-height of `hit`). */
  const weaponCard = (weapon: 'laser' | 'autocannon' | 'torpedo'): WeaponCardBox => {
    const x0 = STATION.x + 8, y = stationTop('weapons') + 6 + PEW_ROW_H, w = 138, h = 104 + CARD_PIPS_H, hitH = 72, x = weapon === 'torpedo' ? x0 + w + 8 : x0;   // W-4 spec §10: the autocannon takes the beam's card
    return { x, y, w, h, hitH, pipsY: y + hitH + 2, anchor: { x: x + w, y: y + hitH / 2 } };
  };
  /** Engineering spike §10.3, §11: where a weapon slot's bar pips start: pew pew's (slot 0) on the PEW row under its charge
   *  pips, the beam's or autocannon's (1, one rectangle) and the torpedo's (2) under their cards' clickable parts. */
  const weaponPips = (slot: 0 | 1 | 2): { x: number; y: number } => {
    if (slot === 0) return { x: STATION.x + 8 + 44, y: stationTop('weapons') + 24 };
    const c = weaponCard(slot === 1 ? 'autocannon' : 'torpedo');   // W-4 spec §10: the same rectangle as the beam's
    return { x: c.x + 6, y: c.pipsY };
  };
  /** Valkyrn spec §5: the Flight seat's weapon block, beside the Helm block at the bottom: two cards (GUN or the laser fit's
   *  LASER, then TORPEDO), the reason line and, with the laser fit, the frequency row. */
  const FLIGHT = { x: STATION.x + STATION.w + EDGE, y: stage.h - EDGE - 166, w: 300, h: 166 } as const;
  /** One Flight card, as weaponCard: `hit` is the clickable part, `anchor` where the targeting line starts. */
  const flightCard = (slot: 0 | 1): FlightCardBox => {
    const w = 138, x = FLIGHT.x + 8 + slot * (w + 8), y = FLIGHT.y + 6, h = 104, hitH = 72;
    return { x, y, w, h, hitH, anchor: { x: x + w, y: y + hitH / 2 } };
  };
  /** The contact window (enemy ship window spec §4.1): UI round §2.4a: in the top-right corner, where the side column was. */
  const CONTACT = { x: stage.w - EDGE - 300, y: 42, w: 300, h: 420 } as const;
  /** Its ship drawing box (spec §4.2 item 3): 276 × 200 under the title and status rows. */
  const CONTACT_BOX = { x: CONTACT.x + 12, y: CONTACT.y + 60, w: 276, h: 200 } as const;
  /** The map's right reserve while the window is shown, instead of CONSOLE_RESERVE.right. */
  const CONTACT_RESERVE = stage.w - CONTACT.x + EDGE;
  /** The map's top band (the status sentence and the info line): from the tab strip to the contact window's left edge. */
  const INFO_BAND = { left: TABS_RIGHT, right: CONTACT.x } as const;
  return Object.freeze({ stage: Object.freeze({ w: stage.w, h: stage.h }), stationTop, FLIGHT, CONTACT, CONTACT_BOX, CONTACT_RESERVE, INFO_BAND, HUD_POWER, weaponCard, weaponPips, flightCard });
}

const memo = new Map<string, ConsoleLayout>();
/** The console layout for a stage (internal px), memoised per `w×h` so a per-frame call costs one map lookup. */
export function consoleLayout(stage: StageSize = REFERENCE_STAGE): ConsoleLayout {
  const key = `${stage.w}x${stage.h}`;
  let l = memo.get(key);
  if (!l) {
    if (memo.size >= 32) memo.clear();   // a window drag passes many sizes; keep the cache small
    l = buildLayout(stage);
    memo.set(key, l);
  }
  return l;
}

/** The reference (1280×720) layout's values under their long-standing names. */
const REF = consoleLayout();
export const { FLIGHT, CONTACT, CONTACT_BOX, CONTACT_RESERVE, INFO_BAND, HUD_POWER } = REF;
export const stationTop = REF.stationTop, weaponCard = REF.weaponCard, weaponPips = REF.weaponPips, flightCard = REF.flightCard;

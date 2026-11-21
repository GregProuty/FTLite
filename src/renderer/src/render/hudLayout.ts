import { INTERNAL_W, INTERNAL_H, REFERENCE_STAGE, type StageSize } from '../../../shared/resolution';
import { LINE, PAD } from './theme';

/** The HUD's rectangles in internal pixels (spec Demo-x-c sections 1 and 3). Pure: the HUD places every panel from here and tests check that nothing overlaps. */
export interface Rect { x: number; y: number; w: number; h: number }

/** A panel holding n text lines at LINE: the caps of the first line 8 px under its top, the last baseline 6 px over its bottom. */
export const panelH = (lines: number): number => lines * LINE + 4;

/** The left column: the clock card (hull and fuel, sector, time, director, quirk) over the power panel (title and seven rows). */
export const CLOCK: Rect = { x: 8, y: 8, w: 240, h: panelH(5) };
export const POWER: Rect = { x: 8, y: CLOCK.y + CLOCK.h + 8, w: 240, h: panelH(8) };
/** UI round 2b: the stage-dependent HUD rects, anchored to the stage's edges (right column and credits to the right edge, the
 *  player blocks and console cards to the bottom, the notice and event card on the gap between the columns). The reference
 *  values below are this at 1280x720, under the long-standing names. Memoised per size; copies the stage size first. */
export interface HudLayout {
  THREATS: Rect; NOTICE: Rect; NOTICE_X: number; EVENT_CARD: Rect; CREDITS: Rect; BLOCK_Y: number; CENTER_X: number;
  blockRect(i: number): Rect; cardRect(i: number, tabbed: boolean): Rect;
}
const cache = new Map<string, HudLayout>();
export function hudLayout(stage: StageSize = REFERENCE_STAGE): HudLayout {
  const w = stage.w, h = stage.h, key = `${w}x${h}`;
  const hit = cache.get(key); if (hit) return hit;
  const dw = w - INTERNAL_W, blockY = h - 8 - BLOCK_H, xs = [8, 430, 852 + dw, 852 + dw] as const;
  const notice: Rect = { x: 256 + dw / 2, y: 6, w: 608, h: 2 * LINE };
  const out: HudLayout = {
    THREATS: { x: 872 + dw, y: 8, w: 400, h: panelH(4) },
    NOTICE: notice, NOTICE_X: notice.x + notice.w / 2,
    EVENT_CARD: { x: 256 + dw / 2, y: 64, w: 608, h: 0 },
    CREDITS: { x: 40, y: 40, w: w - 80, h: h - 80 },
    BLOCK_Y: blockY, CENTER_X: w / 2,
    blockRect: (i) => ({ x: 8 + i * (BLOCK_W + 8), y: blockY, w: BLOCK_W, h: BLOCK_H }),
    cardRect: (i, tabbed) => { const ch = (CARD_BODY_LINES + (tabbed ? 1 : 0)) * LINE + 8; return { x: xs[i] ?? xs[3], y: blockY - 4 - ch, w: CARD_W, h: ch }; },
  };
  if (cache.size >= 32) cache.clear();   // a window drag passes many sizes; keep the cache small (as consoleLayout)
  cache.set(key, out); return out;
}

/** The right column (spec section 3): the threats panel on top, 400 x 100. */
export const THREATS: Rect = { x: 872, y: 8, w: 400, h: panelH(4) };
export const THREAT_ROWS = 4;

/** The four player blocks along the bottom edge. */
export const BLOCK_W = 308, BLOCK_H = panelH(4), BLOCK_Y = INTERNAL_H - 8 - BLOCK_H;
export function blockRect(i: number): Rect { return { x: 8 + i * (BLOCK_W + 8), y: BLOCK_Y, w: BLOCK_W, h: BLOCK_H }; }

/** A seated player's console card: 420 wide, nine lines (seven rows and a two-line footer, or Engineering's eight rows and its footer) plus the tab bar's line, and the 3 px charge strip under the last line. Three slots side by side above the blocks; the fourth player shares the third (the cards of players 3 and 4 can then overlap). */
export const CARD_W = 420, CARD_BODY_LINES = 9, CARD_INNER_W = CARD_W - 2 * PAD;
export function cardRect(i: number, tabbed: boolean): Rect { return hudLayout().cardRect(i, tabbed); }
/** Column positions inside a cell row (x from the row's left edge): the power panel's short rows and the Engineering card's full rows. */
export interface CellColumns { glyph: boolean; nameX: number; cellsX: number; cell: number; step: number; statusX: number; coolantX: number; colAX: number; colBX: number; width: number }
export const POWER_ROW: CellColumns = { glyph: true, nameX: 20, cellsX: 70, cell: 8, step: 10, statusX: 144, coolantX: 198, colAX: 0, colBX: 0, width: POWER.w - 2 * PAD };
export const CARD_ROW: CellColumns = { glyph: false, nameX: 4, cellsX: 144, cell: 10, step: 13, statusX: 242, coolantX: 296, colAX: 160, colBX: 270, width: CARD_INNER_W };
/** Inside a player block: the health bar and the oxygen icon on the first line. */
export const BLOCK_HP_X = 160, BLOCK_HP_W = 84, BLOCK_O2_X = 252, BLOCK_INNER_W = BLOCK_W - 2 * PAD;

/** The centre notice: two lines at the top, between the two columns. */
export const NOTICE: Rect = { x: 256, y: 6, w: 608, h: 2 * LINE };
export const NOTICE_X = NOTICE.x + NOTICE.w / 2;
/** The event card over the world band (spec Demo-x-b section 2). */
export const EVENT_CARD: Rect = { x: 256, y: 64, w: 608, h: 0 };
/** The lobby card and the game-over summary: one wide backdrop under the banner. */
export const SUMMARY_TOP = 120, SUMMARY_W = 1100;
export const BANNER_Y = 16, BANNER_GLYPHS_Y = 70, PROGRESS_Y = 94;
/** The credits overlay. */
export const CREDITS: Rect = { x: 40, y: 40, w: INTERNAL_W - 80, h: INTERNAL_H - 80 };
export const CREDITS_LINES = 22;

/** Two rectangles share any pixel. */
export function overlaps(a: Rect, b: Rect): boolean { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
export function inside(a: Rect, outer: Rect): boolean { return a.x >= outer.x && a.y >= outer.y && a.x + a.w <= outer.x + outer.w && a.y + a.h <= outer.y + outer.h; }

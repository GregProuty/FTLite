// Valkyrn spec §5.1, §6.2: what the pointer does on the Flight map this frame. Pure: the scene feeds it the pointer, the
// own ship's drawn marker and the right button's press; the tests drive it directly.
import { CONTACT, FLIGHT, SIDE, SIDE_H, STATION, STATUS, stationTop, TABS, TABS_RIGHT } from '../../render/duel/consoleLayout';
import { READOUT_ROWS } from '../../render/duel/readoutModel';
import { LINE, PAD } from '../../render/theme';
import { headingOf, pickRadius } from '../../render/tactical/tacticalModel';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';

interface Point { x: number; y: number }
interface Rect { x: number; y: number; w: number; h: number }
const inside = (p: Point, r: Rect): boolean => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
/** The console blocks drawn over the Flight map: the tab strip, the side column, the Helm block and the FLIGHT block. */
const BLOCKS: readonly Rect[] = [
  { x: TABS.x, y: TABS.y, w: TABS_RIGHT - TABS.x, h: TABS.h },
  { x: SIDE.x, y: SIDE.y, w: SIDE.w, h: SIDE_H },
  { x: STATION.x, y: stationTop('helm'), w: STATION.w, h: STATION.h.helm },
  FLIGHT
];

/** Spec §6.2: whether a screen point (internal pixels) is on the Flight map's open part: on the screen and clear of the
 *  console blocks, and of the contact window while it is shown. Over a side tool the aim keeps its last bearing. */
export function onFlightMap(p: Point, contactShown: boolean): boolean {
  if (p.x < 0 || p.y < 0 || p.x >= INTERNAL_W || p.y >= INTERNAL_H) return false;
  if (contactShown && inside(p, CONTACT)) return false;
  return !BLOCKS.some((r) => inside(p, r));
}

/** The console blocks drawn over the Weapons map: the tab strip, the side column and the Weapons block (its PEW row and cards).
 *  The status table is not here: its height follows its row count (onWeaponsMap). */
const WEAPONS_BLOCKS: readonly Rect[] = [
  { x: TABS.x, y: TABS.y, w: TABS_RIGHT - TABS.x, h: TABS.h },
  { x: SIDE.x, y: SIDE.y, w: SIDE.w, h: SIDE_H },
  { x: STATION.x, y: stationTop('weapons'), w: STATION.w, h: STATION.h.weapons }
];

/** W-1 (pew pew spec §1): whether a screen point (internal pixels) is on the Weapons map's open part: on the screen and clear
 *  of the console blocks, of the status table (`statusRows` rows, sized as ReadoutPanel sizes it: PAD, LINE a row, PAD) and of
 *  the contact window while it is shown. A click elsewhere is a console click, never a shot. */
export function onWeaponsMap(p: Point, contactShown: boolean, statusRows: number): boolean {
  if (p.x < 0 || p.y < 0 || p.x >= INTERNAL_W || p.y >= INTERNAL_H) return false;
  if (contactShown && inside(p, CONTACT)) return false;
  const status: Rect = { x: STATUS.x, y: STATUS.y, w: STATUS.w, h: PAD + LINE * Math.min(statusRows, READOUT_ROWS) + PAD };
  return !WEAPONS_BLOCKS.some((r) => inside(p, r)) && !inside(p, status);
}

export interface FlightPointerInput {
  /** The last canvas pointer position, or null. */
  pointer: Point | null;
  /** The own ship's drawn marker on screen. */
  ship: Point;
  zoom: number;
  contactShown: boolean;
  /** The right button went down since the last frame. */
  press: boolean;
  /** A weapon was picked up when the press came (this frame or the last drawn one): the right button only cancels it. */
  aimed: boolean;
}

/** The Flight seat's pointer this frame: `steer` the bearing to send (null: send nothing, the runtime keeps the last
 *  one), `launch` whether the right button launches the torpedo. */
export function flightPointer(i: FlightPointerInput): { steer: number | null; launch: boolean } {
  const p = i.pointer;
  const steer = p && onFlightMap(p, i.contactShown) && Math.hypot(p.x - i.ship.x, p.y - i.ship.y) > pickRadius(i.zoom)
    ? headingOf(p.x - i.ship.x, p.y - i.ship.y) : null;
  return { steer, launch: i.press && !i.aimed };
}

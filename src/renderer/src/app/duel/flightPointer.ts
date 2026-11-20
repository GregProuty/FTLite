// Valkyrn spec §5.1, §6.2: what the pointer does on the Flight map this frame. Pure: the scene feeds it the pointer, the
// own ship's drawn marker and the right button's press; the tests drive it directly.
import { CONTACT, FLIGHT, HUD_POWER, HUD_TOP, OWN_SHIP, STATION, stationTop, TABS, TABS_RIGHT } from '../../render/duel/consoleLayout';
import { headingOf, pickRadius } from '../../render/tactical/tacticalModel';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';

interface Point { x: number; y: number }
interface Rect { x: number; y: number; w: number; h: number }
const inside = (p: Point, r: Rect): boolean => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
/** The console blocks drawn over the maps, by name. */
const TAB_STRIP: Rect = { x: TABS.x, y: TABS.y, w: TABS_RIGHT - TABS.x, h: TABS.h };
const HELM_BLOCK: Rect = { x: STATION.x, y: stationTop('helm'), w: STATION.w, h: STATION.h.helm };
/** The console blocks drawn over the Flight map: the tab strip, the HUD's two blocks (UI round §2.4a), the Helm block, the
 *  FLIGHT block and the own ship window (own ship window spec §3). */
const BLOCKS: readonly Rect[] = [TAB_STRIP, HUD_TOP, HUD_POWER, HELM_BLOCK, FLIGHT, OWN_SHIP];

/** Spec §6.2: whether a screen point (internal pixels) is on the Flight map's open part: on the screen and clear of the
 *  console blocks, and of the contact window while it is shown. Over a side tool the aim keeps its last bearing. */
export function onFlightMap(p: Point, contactShown: boolean): boolean {
  if (p.x < 0 || p.y < 0 || p.x >= INTERNAL_W || p.y >= INTERNAL_H) return false;
  if (contactShown && inside(p, CONTACT)) return false;
  return !BLOCKS.some((r) => inside(p, r));
}

/** The console blocks drawn over the Weapons map: the tab strip, the HUD's two blocks (UI round §2.4a), the Weapons block
 *  (its PEW row and cards) and the own ship window. */
const WEAPONS_BLOCKS: readonly Rect[] = [
  TAB_STRIP,
  HUD_TOP,
  HUD_POWER,
  { x: STATION.x, y: stationTop('weapons'), w: STATION.w, h: STATION.h.weapons },
  OWN_SHIP   // W-1 merge: the own ship window (own ship window spec §3) is not the map
];

/** W-1 (pew pew spec §1): whether a screen point (internal pixels) is on the Weapons map's open part: on the screen and clear
 *  of the console blocks and of the contact window while it is shown. A click elsewhere is a console click, never a shot. */
export function onWeaponsMap(p: Point, contactShown: boolean): boolean {
  if (p.x < 0 || p.y < 0 || p.x >= INTERNAL_W || p.y >= INTERNAL_H) return false;
  if (contactShown && inside(p, CONTACT)) return false;
  return !WEAPONS_BLOCKS.some((r) => inside(p, r));
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

/** Playtest2feedback §4a: the console blocks over the crew Helm's map: the tab strip, the HUD's two blocks (UI round
 *  §2.4a), the Helm block and the own ship window (own ship window spec §3). */
const HELM_BLOCKS: readonly Rect[] = [TAB_STRIP, HUD_TOP, HUD_POWER, HELM_BLOCK, OWN_SHIP];
/** Whether a screen point is on the crew Helm map's open part: on the screen, clear of its blocks, and of the contact window
 *  while it is shown. */
export function onHelmMap(p: Point, contactShown: boolean): boolean {
  if (p.x < 0 || p.y < 0 || p.x >= INTERNAL_W || p.y >= INTERNAL_H) return false;
  if (contactShown && inside(p, CONTACT)) return false;
  return !HELM_BLOCKS.some((r) => inside(p, r));
}
/** Playtest2feedback §4a: the bearing the held left button steers to on the crew Helm's map: from the own ship's drawn
 *  marker to the pointer, or null (send nothing: the last bearing stands) off the open map or on the ship itself. */
export function helmSteer(i: { pointer: Point | null; ship: Point; zoom: number; contactShown: boolean }): number | null {
  const p = i.pointer;
  return p && onHelmMap(p, i.contactShown) && Math.hypot(p.x - i.ship.x, p.y - i.ship.y) > pickRadius(i.zoom) ? headingOf(p.x - i.ship.x, p.y - i.ship.y) : null;
}
/** W-4 spec §7: the bearing the held left button steers the crew's MANUAL torpedo to on the Weapons map: from the torpedo's
 *  drawn marker to the pointer while it is on the open map (onWeaponsMap) and off the marker, else null (send nothing: the
 *  last bearing stands). The Helm's helmSteer, aimed from the torpedo instead of the ship. */
export function torpedoSteer(i: { pointer: Point | null; torpedo: Point; zoom: number; contactShown: boolean }): number | null {
  const p = i.pointer;
  return p && onWeaponsMap(p, i.contactShown) && Math.hypot(p.x - i.torpedo.x, p.y - i.torpedo.y) > pickRadius(i.zoom) ? headingOf(p.x - i.torpedo.x, p.y - i.torpedo.y) : null;
}

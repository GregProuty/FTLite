// Valkyrn spec §5.1, §6.2: what the pointer does on the Flight map this frame. Pure: the scene feeds it the pointer, the
// own ship's drawn marker and the right button's press; the tests drive it directly. UI round 2b: the blocks and the
// stage bounds come from the console layout for the live stage (the reference layout by default).
import { consoleLayout, type ConsoleLayout, HUD_TOP, OWN_SHIP, STATION, TABS, TABS_RIGHT } from '../../render/duel/consoleLayout';
import { headingOf, pickRadius } from '../../render/tactical/tacticalModel';

interface Point { x: number; y: number }
interface Rect { x: number; y: number; w: number; h: number }
const inside = (p: Point, r: Rect): boolean => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
/** The console blocks drawn over the maps, by name. */
const TAB_STRIP: Rect = { x: TABS.x, y: TABS.y, w: TABS_RIGHT - TABS.x, h: TABS.h };
const stationBlock = (L: ConsoleLayout, s: 'helm' | 'weapons'): Rect => ({ x: STATION.x, y: L.stationTop(s), w: STATION.w, h: STATION.h[s] });
interface Blocks { flight: readonly Rect[]; weapons: readonly Rect[]; helm: readonly Rect[] }
const blockCache = new WeakMap<ConsoleLayout, Blocks>();
function blocksOf(L: ConsoleLayout): Blocks {
  let b = blockCache.get(L);
  if (!b) {
    const helm = stationBlock(L, 'helm');
    b = {
      /** The console blocks drawn over the Flight map: the tab strip, the HUD's two blocks (UI round §2.4a), the Helm block,
       *  the FLIGHT block and the own ship window (own ship window spec §3). */
      flight: [TAB_STRIP, HUD_TOP, L.HUD_POWER, helm, L.FLIGHT, OWN_SHIP],
      /** The console blocks drawn over the Weapons map: the tab strip, the HUD's two blocks (UI round §2.4a), the Weapons
       *  block (its PEW row and cards) and the own ship window (W-1 merge: own ship window spec §3, not the map). */
      weapons: [TAB_STRIP, HUD_TOP, L.HUD_POWER, stationBlock(L, 'weapons'), OWN_SHIP],
      /** Playtest2feedback §4a: the console blocks over the crew Helm's map: the tab strip, the HUD's two blocks (UI round
       *  §2.4a), the Helm block and the own ship window (own ship window spec §3). */
      helm: [TAB_STRIP, HUD_TOP, L.HUD_POWER, helm, OWN_SHIP]
    };
    blockCache.set(L, b);
  }
  return b;
}
/** On the layout's stage, clear of the contact window while it is shown and of every block in `blocks`. */
function onMap(p: Point, contactShown: boolean, L: ConsoleLayout, blocks: readonly Rect[]): boolean {
  if (p.x < 0 || p.y < 0 || p.x >= L.stage.w || p.y >= L.stage.h) return false;
  if (contactShown && inside(p, L.CONTACT)) return false;
  return !blocks.some((r) => inside(p, r));
}

/** Spec §6.2: whether a screen point (internal pixels) is on the Flight map's open part: on the screen and clear of the
 *  console blocks, and of the contact window while it is shown. Over a side tool the aim keeps its last bearing. */
export function onFlightMap(p: Point, contactShown: boolean, layout: ConsoleLayout = consoleLayout()): boolean {
  return onMap(p, contactShown, layout, blocksOf(layout).flight);
}

/** W-1 (pew pew spec §1): whether a screen point (internal pixels) is on the Weapons map's open part: on the screen and clear
 *  of the console blocks and of the contact window while it is shown. A click elsewhere is a console click, never a shot. */
export function onWeaponsMap(p: Point, contactShown: boolean, layout: ConsoleLayout = consoleLayout()): boolean {
  return onMap(p, contactShown, layout, blocksOf(layout).weapons);
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
  /** The console layout for the live stage (the reference layout when absent). */
  layout?: ConsoleLayout;
}

/** The Flight seat's pointer this frame: `steer` the bearing to send (null: send nothing, the runtime keeps the last
 *  one), `launch` whether the right button launches the torpedo. */
export function flightPointer(i: FlightPointerInput): { steer: number | null; launch: boolean } {
  const p = i.pointer;
  const steer = p && onFlightMap(p, i.contactShown, i.layout) && Math.hypot(p.x - i.ship.x, p.y - i.ship.y) > pickRadius(i.zoom)
    ? headingOf(p.x - i.ship.x, p.y - i.ship.y) : null;
  return { steer, launch: i.press && !i.aimed };
}

/** Whether a screen point is on the crew Helm map's open part: on the screen, clear of its blocks, and of the contact window
 *  while it is shown. */
export function onHelmMap(p: Point, contactShown: boolean, layout: ConsoleLayout = consoleLayout()): boolean {
  return onMap(p, contactShown, layout, blocksOf(layout).helm);
}
/** Playtest2feedback §4a: the bearing the held left button steers to on the crew Helm's map: from the own ship's drawn
 *  marker to the pointer, or null (send nothing: the last bearing stands) off the open map or on the ship itself. */
export function helmSteer(i: { pointer: Point | null; ship: Point; zoom: number; contactShown: boolean; layout?: ConsoleLayout }): number | null {
  const p = i.pointer;
  return p && onHelmMap(p, i.contactShown, i.layout) && Math.hypot(p.x - i.ship.x, p.y - i.ship.y) > pickRadius(i.zoom) ? headingOf(p.x - i.ship.x, p.y - i.ship.y) : null;
}
/** W-4 spec §7: the bearing the held left button steers the crew's MANUAL torpedo to on the Weapons map: from the torpedo's
 *  drawn marker to the pointer while it is on the open map (onWeaponsMap) and off the marker, else null (send nothing: the
 *  last bearing stands). The Helm's helmSteer, aimed from the torpedo instead of the ship. */
export function torpedoSteer(i: { pointer: Point | null; torpedo: Point; zoom: number; contactShown: boolean; layout?: ConsoleLayout }): number | null {
  const p = i.pointer;
  return p && onWeaponsMap(p, i.contactShown, i.layout) && Math.hypot(p.x - i.torpedo.x, p.y - i.torpedo.y) > pickRadius(i.zoom) ? headingOf(p.x - i.torpedo.x, p.y - i.torpedo.y) : null;
}

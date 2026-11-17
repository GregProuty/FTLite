import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { stationOnline } from '../sim/stations';
import { BAND, PANEL_THICK, type DoorRect } from './doorModel';
import { AMBER, WARN, over } from './theme';

/**
 * Visible consoles (spec Demo-xii section 1): a small dark desk at every station tile, against the nearest wall, with a screen strip on
 * its wall edge that shows the console's state. A console group (the Skiff's Helm and Ops) is one desk. Pure: no Pixi.
 */
export const DESK_FILL = 0x2b3647, DESK_OUTLINE = 0x1b1b1b;
/** The screen: free and online amber (one rule for every console, spec amendment 1), occupied a dim amber, failed or unpowered red. */
export const SCREEN_LIT = AMBER, SCREEN_DIM = over(AMBER, 0.45, DESK_FILL), SCREEN_DOWN = WARN;
const T = TILE_PX;
/** Whole art pixels (Art-i spec section 4: 2 world units each, even offsets): a desk 10 x 5 art pixels (about 0.6 x 0.3
 *  tile), a screen one art pixel deep, inset one art pixel, and a one-art-pixel outline drawn inside the desk. */
export const DESK_W = 20, DESK_D = 10, SCREEN_D = 2, SCREEN_INSET = 2, DESK_OUTLINE_W = 2;
/** The floor strip between a wall tile's thin band and the room (walls are drawn as a band in the wall tile's middle): a flush desk fills it. */
export const WALL_GAP = T - BAND - PANEL_THICK;

export type Side = 'n' | 'e' | 's' | 'w';
export type ConsoleLook = 'free' | 'occupied' | 'down';
export interface DeskPicture { desk: DoorRect; screen: DoorRect; fill: number; outline: number; screenFill: number }
export interface ConsoleDraw { members: readonly number[]; x: number; y: number; side: Side; flush: boolean; look: ConsoleLook; picture: DeskPicture }

const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];
const DIR: Readonly<Record<Side, { dx: number; dy: number }>> = { n: { dx: 0, dy: -1 }, e: { dx: 1, dy: 0 }, s: { dx: 0, dy: 1 }, w: { dx: -1, dy: 0 } };

/** Desk appearance uses authoritative occupancy and power; card focus is client-owned. The console's state over its members: down when no member is online (a group seats while one member is online), occupied when someone sits there, else free. */
export function consoleLook(state: SimState, members: readonly number[]): ConsoleLook {
  if (!members.some((j) => stationOnline(state, j))) return 'down';
  return state.stations.occupant[members[0]!]! >= 0 ? 'occupied' : 'free';
}

/** The wall side: the side with the nearest wall (1 = the neighbour tile is a wall); a tie prefers the side facing away from the room's centre (`away` = tile minus centre), then n, e, s, w. */
export function consoleSide(dist: Readonly<Record<Side, number>>, away: { dx: number; dy: number }): Side {
  let best: Side = 'n', bd = Infinity, bdot = -Infinity;
  for (const s of SIDES) {
    const d = dist[s], dot = DIR[s].dx * away.dx + DIR[s].dy * away.dy;
    if (d < bd || (d === bd && dot > bdot)) { best = s; bd = d; bdot = dot; }
  }
  return best;
}

/** The desk in tile-local pixels. `flush`: the wall is the neighbour tile, so the desk backs onto its thin band; otherwise it stands at the tile's edge. */
export function deskPicture(side: Side, flush: boolean, look: ConsoleLook): DeskPicture {
  const x = (T - DESK_W) / 2, y = flush ? -WALL_GAP : 0;   // 6 and -10 (or 0): even, so the desk is on the art-pixel grid
  const desk: DoorRect = { x, y, w: DESK_W, h: DESK_D };
  const screen: DoorRect = { x: x + SCREEN_INSET, y: y + SCREEN_INSET, w: DESK_W - 2 * SCREEN_INSET, h: SCREEN_D };   // drawn for the north side, then turned
  const turn = (r: DoorRect): DoorRect => side === 'n' ? r : side === 's' ? { x: r.x, y: T - r.y - r.h, w: r.w, h: r.h } : side === 'w' ? { x: r.y, y: r.x, w: r.h, h: r.w } : { x: T - r.y - r.h, y: r.x, w: r.h, h: r.w };
  return { desk: turn(desk), screen: turn(screen), fill: DESK_FILL, outline: DESK_OUTLINE, screenFill: look === 'free' ? SCREEN_LIT : look === 'occupied' ? SCREEN_DIM : SCREEN_DOWN };
}

/** Steps from the tile to the first wall in each direction through its own room's floor; a door or space first means no wall that way. */
function wallDistances(rows: readonly string[], tx: number, ty: number): Record<Side, number> {
  const own = rows[ty]!.charAt(tx), out = { n: Infinity, e: Infinity, s: Infinity, w: Infinity };
  for (const s of SIDES) {
    for (let k = 1; ; k++) {
      const c = rows[ty + DIR[s].dy * k]?.charAt(tx + DIR[s].dx * k) ?? '';
      if (c === own) continue;
      if (c === '#') out[s] = k;
      break;
    }
  }
  return out;
}

/** One desk per station, or per console group, at its tile (pixel origin of the tile). */
export function consoles(state: SimState): ConsoleDraw[] {
  const d = state.derived, rows = state.layout.rows, out: ConsoleDraw[] = [];
  for (let i = 0; i < d.stationTile.length; i++) {
    const g = d.stationGroup[i]!, members = g >= 0 ? d.groupStations[g]! : [i];
    if (members[0] !== i) continue;
    const t = d.stationTile[i]!, tx = t % d.width, ty = (t - tx) / d.width;
    const tiles = d.roomTiles[d.stationRoom[i]!] ?? [];
    let cx = tx, cy = ty;
    if (tiles.length) { cx = 0; cy = 0; for (const r of tiles) { cx += r % d.width; cy += Math.floor(r / d.width); } cx /= tiles.length; cy /= tiles.length; }
    const dist = wallDistances(rows, tx, ty), side = consoleSide(dist, { dx: tx - cx, dy: ty - cy }), flush = dist[side] === 1, look = consoleLook(state, members);
    out.push({ members, x: tx * T, y: ty * T, side, flush, look, picture: deskPicture(side, flush, look) });
  }
  return out;
}

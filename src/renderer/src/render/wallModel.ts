import { TILE_PX } from '../../../shared/resolution';
import { BAND, PANEL_THICK, type DoorRect } from './doorModel';

/**
 * Thin walls (the user, 2026-11-13: "fix the walls to be the same width as the doors so the external doors don't look weird").
 * A wall tile is drawn as a band as thick as a door panel along the tile's centre line, with an arm toward every neighbouring
 * wall, door or airlock; the halves of the tile that face a room are floor, the halves that face space are left empty. Pure: no Pixi.
 */
export type Cell = 'wall' | 'door' | 'floor' | 'space';
export interface WallPicture { floor: DoorRect[]; band: DoorRect[] }

const T = TILE_PX, HALF = T / 2;

/** n, e, s, w: what the neighbour on that side is; ne, se, sw, nw the diagonal neighbours (a room's corner touches its corner wall tile only diagonally). */
export function wallPicture(n: Cell, e: Cell, s: Cell, w: Cell, ne: Cell = 'space', se: Cell = 'space', sw: Cell = 'space', nw: Cell = 'space'): WallPicture {
  const floor: DoorRect[] = [];
  if (nw === 'floor') floor.push({ x: 0, y: 0, w: HALF, h: HALF });
  if (ne === 'floor') floor.push({ x: HALF, y: 0, w: HALF, h: HALF });
  if (se === 'floor') floor.push({ x: HALF, y: HALF, w: HALF, h: HALF });
  if (sw === 'floor') floor.push({ x: 0, y: HALF, w: HALF, h: HALF });
  if (n === 'floor') floor.push({ x: 0, y: 0, w: T, h: HALF });
  if (s === 'floor') floor.push({ x: 0, y: HALF, w: T, h: HALF });
  if (w === 'floor') floor.push({ x: 0, y: 0, w: HALF, h: T });
  if (e === 'floor') floor.push({ x: HALF, y: 0, w: HALF, h: T });
  const joins = (c: Cell): boolean => c === 'wall' || c === 'door';
  const band: DoorRect[] = [{ x: BAND, y: BAND, w: PANEL_THICK, h: PANEL_THICK }];
  if (joins(n)) band.push({ x: BAND, y: 0, w: PANEL_THICK, h: BAND });
  if (joins(s)) band.push({ x: BAND, y: BAND + PANEL_THICK, w: PANEL_THICK, h: T - BAND - PANEL_THICK });
  if (joins(w)) band.push({ x: 0, y: BAND, w: BAND, h: PANEL_THICK });
  if (joins(e)) band.push({ x: BAND + PANEL_THICK, y: BAND, w: T - BAND - PANEL_THICK, h: PANEL_THICK });
  return { floor, band };
}

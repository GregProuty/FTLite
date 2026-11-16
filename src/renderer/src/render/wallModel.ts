import { TILE_PX } from '../../../shared/resolution';
import { BAND, PANEL_THICK, type DoorRect } from './doorModel';
import { pickVariant } from './tilePick';

/**
 * Thin walls (the user, 2026-11-13: "fix the walls to be the same width as the doors so the external doors don't look weird").
 * A wall tile is drawn as a band as thick as a door panel along the tile's centre line, with an arm toward every neighbouring
 * wall, door or airlock; the halves of the tile that face a room are floor, the halves that face space are left empty.
 * Art-i spec section 4: every rectangle is whole art pixels (even world units at even offsets), the band has a one-art-pixel light
 * edge on its exposed top and left faces and a one-art-pixel shadow edge on its exposed bottom and right faces (light from the top-left). Pure: no Pixi.
 */
export type Cell = 'wall' | 'door' | 'floor' | 'space';
/** Draw order: floor, band, shadow, light (light wins where a corner pixel is both). */
export interface WallPicture { floor: DoorRect[]; band: DoorRect[]; light: DoorRect[]; shadow: DoorRect[] }

const T = TILE_PX, HALF = T / 2, EDGE = 2, LO = BAND, HI = BAND + PANEL_THICK;

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
  const jn = joins(n), je = joins(e), js = joins(s), jw = joins(w);
  const band: DoorRect[] = [{ x: LO, y: LO, w: PANEL_THICK, h: PANEL_THICK }];
  if (jn) band.push({ x: LO, y: 0, w: PANEL_THICK, h: LO });
  if (js) band.push({ x: LO, y: HI, w: PANEL_THICK, h: T - HI });
  if (jw) band.push({ x: 0, y: LO, w: LO, h: PANEL_THICK });
  if (je) band.push({ x: HI, y: LO, w: T - HI, h: PANEL_THICK });
  // Exposed faces, segment by segment: the hub's face is exposed only where no arm leaves it on that side.
  const hRow = (y: number, hub: boolean): DoorRect[] => [jw && { x: 0, y, w: LO, h: EDGE }, hub && { x: LO, y, w: PANEL_THICK, h: EDGE }, je && { x: HI, y, w: T - HI, h: EDGE }].filter((r): r is DoorRect => !!r);
  const vCol = (x: number, hub: boolean): DoorRect[] => [jn && { x, y: 0, w: EDGE, h: LO }, hub && { x, y: LO, w: EDGE, h: PANEL_THICK }, js && { x, y: HI, w: EDGE, h: T - HI }].filter((r): r is DoorRect => !!r);
  const light = [...hRow(LO, !jn), ...vCol(LO, !jw)];
  const shadow = [...hRow(HI - EDGE, !js), ...vCol(HI - EDGE, !je)];
  return { floor, band, light, shadow };
}

/** The quiet two-tone panel seam on every floor tile (Art-i spec section 4): one art pixel of `floorSeam` along the tile's top and left edges. */
export function floorSeams(): DoorRect[] { return [{ x: 0, y: 0, w: T, h: EDGE }, { x: 0, y: EDGE, w: EDGE, h: T - EDGE }]; }

/** The house floor art name for a tile (Art-i spec section 4 floor art hook): house.floor.N, N by a hash of the tile index. */
export function houseFloorName(tileIndex: number): string { return `house.floor.${pickVariant(tileIndex, 4)}`; }

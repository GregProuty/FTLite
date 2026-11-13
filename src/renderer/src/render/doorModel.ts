import { TILE_PX } from '../../../shared/resolution';
import { DoorState } from '../sim/grid';

/** FTL-style doors (spec Demo-x-c section 2): a door in the wall line, two panels a third of a tile thick that meet in the middle of the gap and slide apart into the walls. Pure: state and progress -> rectangles in tile-local pixels, no Pixi. */
export const DOOR_FILL = 0xd9a441, DOOR_OUTLINE = 0x1b1b1b, SEALED_FILL = 0xc8502d, HELD_TICK = 0xf5b942, SPACE_GAP = 0x0b0e14;
const T = TILE_PX, HALF = T / 2;
/** Panel thickness (a third of a tile) and the band's offset from the tile edge. */
export const PANEL_THICK = Math.round(T / 3), BAND = Math.floor((T - PANEL_THICK) / 2);

export interface DoorRect { x: number; y: number; w: number; h: number }
/** What to draw on a door or airlock tile, in order: the open airlock's gap to space, the floor of the doorway, the jambs, the panels (fill with the outline), the seam, the seal bar, the held ticks, the airlock stripes. */
export interface DoorPicture { gap: DoorRect | null; floor: DoorRect | null; jambs: DoorRect[]; panels: DoorRect[]; fill: number; outline: number; seam: DoorRect | null; bar: DoorRect | null; ticks: DoorRect[]; stripes: DoorRect[] }
export type DoorLook = 'closed' | 'open' | 'sealed' | 'held';
/** The look of an inner door by its sim state (a pending seal still reads by its current state). */
export function doorLook(state: number): DoorLook { return state === DoorState.Sealed ? 'sealed' : state === DoorState.HeldOpen ? 'held' : state === DoorState.Open ? 'open' : 'closed'; }

/**
 * One door. `progress` 0 closed .. 1 open (the door animation drives it); a sealed door is drawn closed whatever the progress.
 * `slide` 'x': the wall runs left-right (walls left and right of the tile), the panels slide sideways; 'y': the wall runs up-down.
 * `airlock`: the hull door, same panels with dark stripes, and space showing through as it opens.
 */
export function doorPicture(look: DoorLook, progress: number, slide: 'x' | 'y', airlock = false): DoorPicture {
  const p = look === 'sealed' ? 0 : Math.max(0, Math.min(1, progress)), w = HALF * (1 - p);
  const panels: DoorRect[] = w >= 0.5 ? [{ x: 0, y: BAND, w, h: PANEL_THICK }, { x: T - w, y: BAND, w, h: PANEL_THICK }] : [];
  const closed = p === 0;
  const pic: DoorPicture = {
    gap: airlock && p > 0 ? { x: 0, y: BAND, w: T, h: PANEL_THICK } : null,
    floor: airlock ? null : { x: 0, y: 0, w: T, h: T },
    jambs: [{ x: 0, y: BAND - 3, w: 2, h: PANEL_THICK + 6 }, { x: T - 2, y: BAND - 3, w: 2, h: PANEL_THICK + 6 }],
    panels, fill: look === 'sealed' ? SEALED_FILL : DOOR_FILL, outline: DOOR_OUTLINE,
    seam: closed ? { x: HALF - 1, y: BAND, w: 2, h: PANEL_THICK } : null,
    bar: look === 'sealed' ? { x: HALF - 6, y: BAND + Math.floor(PANEL_THICK / 2) - 1, w: 12, h: 3 } : null,
    ticks: look === 'held' ? [{ x: 2, y: BAND - 3, w: 3, h: PANEL_THICK + 6 }, { x: T - 5, y: BAND - 3, w: 3, h: PANEL_THICK + 6 }] : [],
    stripes: airlock ? panels.flatMap((r) => { const out: DoorRect[] = []; for (let x = r.x + 4; x + 2 <= r.x + r.w - 2; x += 6) out.push({ x, y: r.y + 2, w: 2, h: r.h - 4 }); return out; }) : [],
  };
  return slide === 'x' ? pic : transpose(pic);
}

const flip = (r: DoorRect): DoorRect => ({ x: r.y, y: r.x, w: r.h, h: r.w });
function transpose(p: DoorPicture): DoorPicture {
  return { ...p, gap: p.gap && flip(p.gap), floor: p.floor && flip(p.floor), jambs: p.jambs.map(flip), panels: p.panels.map(flip), seam: p.seam && flip(p.seam), bar: p.bar && flip(p.bar), ticks: p.ticks.map(flip), stripes: p.stripes.map(flip) };
}

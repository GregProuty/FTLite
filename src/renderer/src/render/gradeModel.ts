// The light and colour grade (Art-i spec section 5): the ambient multiply, the ship-wide alert pulse and the per-room
// vacuum tint, with one adapter per mode. Pure: no Pixi.
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import type { DuelState } from '../sim/duel/state';
import { CREW_SLOT } from '../sim/tactical/state';
import { SHIP_CLASSES } from '../sim/tactical/defs';
import { HULL_MAX } from '../sim/tuning';
import type { DoorRect } from './doorModel';
import { wallPicture, type Cell } from './wallModel';

/** Today's low-oxygen rule (render/effects.ts before Art-i-b): nothing at 0.98 or more, then LOW_O2_MAX_ALPHA x (1 - frac). */
export const LOW_O2_THRESHOLD = 0.98, LOW_O2_MAX_ALPHA = 0.6;
/** The ambient role's multiply strength over floors and walls (fixed), the alert's peak strength, its period. */
export const AMBIENT_STRENGTH = 0.3, ALERT_MAX_STRENGTH = 0.35, ALERT_PERIOD_S = 1.6, ALERT_HULL_FRACTION = 0.5;

export interface GradeInput {
  /** Hull left, 0..1. */
  hullFraction: number;
  /** Any fire aboard. */
  fire: boolean;
  /** Oxygen fraction per room (index = room), 0..1; empty when the mode runs no oxygen. */
  o2: readonly number[];
}
export interface Grade { ambient: number; alert: boolean; pulse: number; vacuum: { room: number; strength: number }[] }

/** Alert and vacuum are independent: both can be on. `t` is presentation seconds. */
export function gradeModel(input: GradeInput, t: number): Grade {
  const alert = input.hullFraction <= ALERT_HULL_FRACTION || input.fire;
  const pulse = alert ? 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / ALERT_PERIOD_S) : 0;
  const vacuum: Grade['vacuum'] = [];
  input.o2.forEach((frac, room) => { if (frac < LOW_O2_THRESHOLD) vacuum.push({ room, strength: LOW_O2_MAX_ALPHA * (1 - frac) }); });
  return { ambient: AMBIENT_STRENGTH, alert, pulse, vacuum };
}

/** The alert multiply's strength now (0 when not in alert). */
export function alertStrength(g: Grade): number { return g.alert ? ALERT_MAX_STRENGTH * g.pulse : 0; }

/** Sector: hull over HULL_MAX, any burning room, each room's oxygen over its volume (as effects.ts read it). */
export function sectorGradeInput(state: SimState): GradeInput {
  const d = state.derived, o2: number[] = [];
  for (let r = 0; r < d.volume.length; r++) o2.push(state.rooms.o2[r]! / d.volume[r]!);
  return { hullFraction: state.hull / HULL_MAX, fire: state.rooms.fire.some((f) => f > 0), o2 };
}

/** Duel: the crew ship's hull over its class's hull; the duel runs no fire or oxygen, so both are off. */
export function duelGradeInput(d: DuelState): GradeInput {
  const ship = d.tactical.systems[CREW_SLOT]!;
  return { hullFraction: ship.hull / SHIP_CLASSES[ship.cls]!.hull, fire: false, o2: [] };
}

/** The cell kind the tile layer uses (tiles.ts): ' ' or off the map is space, '#' wall, '+' door, anything else floor. */
export function cellAt(rows: readonly string[], x: number, y: number): Cell {
  const c = rows[y]?.charAt(x) ?? ' ';
  return c === '' || c === ' ' ? 'space' : c === '#' ? 'wall' : c === '+' ? 'door' : 'floor';
}

/** World units per art pixel (TILE_PX 32 shows 16 px art at 2x). */
const ART = 2;

/** What the grade covers, in ship world units: every floor and door tile whole, and each wall tile's floor parts and
 *  band (never the empty halves that face space, so the starfield there stays untinted). The rectangles never overlap:
 *  wallPicture's floor quarters overlap its halves and its band crosses them, and a multiply (or the duel flash drawn
 *  from this cover) painted twice would darken twice. So every part is painted onto an art-pixel mask of the whole
 *  ship and the mask is read back as row runs, a run merged downward while the rows below repeat it exactly. */
export function gradeCover(rows: readonly string[], width: number, height: number): DoorRect[] {
  const c = (x: number, y: number): Cell => cellAt(rows, x, y), per = TILE_PX / ART, W = width * per, H = height * per;
  const mask = new Uint8Array(W * H);
  const paint = (x: number, y: number, w: number, h: number): void => {
    for (let j = y / ART; j < (y + h) / ART; j++) mask.fill(1, j * W + x / ART, j * W + (x + w) / ART);
  };
  for (let ty = 0; ty < height; ty++) for (let tx = 0; tx < width; tx++) {
    const k = c(tx, ty), x = tx * TILE_PX, y = ty * TILE_PX;
    if (k === 'space') continue;
    if (k !== 'wall') { paint(x, y, TILE_PX, TILE_PX); continue; }
    const p = wallPicture(c(tx, ty - 1), c(tx + 1, ty), c(tx, ty + 1), c(tx - 1, ty), c(tx + 1, ty - 1), c(tx + 1, ty + 1), c(tx - 1, ty + 1), c(tx - 1, ty - 1));
    for (const r of [...p.floor, ...p.band]) paint(x + r.x, y + r.y, r.w, r.h);
  }
  const out: DoorRect[] = [];
  let open = new Map<number, DoorRect>();   // the runs of the row above, by start * W + end: a run that repeats grows down
  for (let j = 0; j < H; j++) {
    const next = new Map<number, DoorRect>();
    for (let i = 0; i < W; ) {
      if (!mask[j * W + i]) { i++; continue; }
      let e = i;
      while (e < W && mask[j * W + e]) e++;
      const key = i * W + e, above = open.get(key);
      if (above) above.h += ART;
      else out.push({ x: i * ART, y: j * ART, w: (e - i) * ART, h: ART });
      next.set(key, above ?? out[out.length - 1]!);
      i = e;
    }
    open = next;
  }
  return out;
}

/** A room's lamp: on its top-left floor tile (the first of its row-major tiles), LAMP_OFFSET world units in from the corner. */
export const LAMP_OFFSET = 6;
export function lampPoints(roomTiles: readonly (readonly number[])[], width: number): { room: number; x: number; y: number }[] {
  const out: { room: number; x: number; y: number }[] = [];
  roomTiles.forEach((tiles, room) => {
    if (!tiles.length) return;
    const t = Math.min(...tiles), tx = t % width, ty = (t - tx) / width;
    out.push({ room, x: tx * TILE_PX + LAMP_OFFSET, y: ty * TILE_PX + LAMP_OFFSET });
  });
  return out;
}

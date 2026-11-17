// Explosions on hits (Art-ii spec section 3): which blasts live, where, and which frame each shows on the presentation
// clock. Pure: no Pixi. interiorFeel.ts schedules them on a hit and on a breach opening and draws them as plain Sprites.
import { TILE_PX } from '../../../shared/resolution';

/** One shared cap of live blasts (room blasts and breach sparks together): a fifth cuts the oldest. */
export const BLAST_CAP = 4;
/** Drawn at 2x (one art pixel is two world units), anchored at the centre. */
export const BLAST_SCALE = 2;
export type BlastKind = 'room' | 'hit';
/** A live blast: its animation, its centre in world units, and its start on the presentation clock (seconds). */
export interface Blast { kind: BlastKind; x: number; y: number; start: number }
/** Each animation's frame count and rate. */
export type BlastTimings = Readonly<Record<BlastKind, { frames: number; fps: number }>>;

const T = TILE_PX, HALF = T / 2;
const even = (v: number): number => 2 * Math.round(v / 2);

/** A tile's centre in world units. */
export function tileCentre(tile: number, width: number): { x: number; y: number } {
  const tx = tile % width;
  return { x: tx * T + HALF, y: ((tile - tx) / width) * T + HALF };
}

/** A room's centroid: the mean of its tile centres, rounded to 2 world units (a whole art pixel). */
export function roomCentroid(tiles: readonly number[], width: number): { x: number; y: number } {
  let x = 0, y = 0;
  for (const t of tiles) { const c = tileCentre(t, width); x += c.x; y += c.y; }
  return { x: even(x / tiles.length), y: even(y / tiles.length) };
}

/** Adds a blast at the end (the newest); past the cap the oldest go first. */
export function addBlast(list: readonly Blast[], blast: Blast, cap = BLAST_CAP): Blast[] {
  const next = [...list, blast];
  return next.slice(Math.max(0, next.length - cap));
}

/** The frame a blast shows at presentation time `t`: floor((t - start) x fps). */
export function blastFrame(b: Blast, t: number, timing: BlastTimings): number {
  return Math.max(0, Math.floor((t - b.start) * timing[b.kind].fps));
}

/** The blasts still showing at `t` (oldest first): a blast is removed after its last frame. */
export function liveBlasts(list: readonly Blast[], t: number, timing: BlastTimings): Blast[] {
  return list.filter((b) => blastFrame(b, t, timing) < timing[b.kind].frames);
}

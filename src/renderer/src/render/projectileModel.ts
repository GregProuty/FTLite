import type { Derived } from '../sim/ship/derived';
import { ObjectKind } from '../sim/debris';
import { TICK_HZ } from '../sim/tuning';
import { TILE_PX } from '../../../shared/resolution';

/** Visible asteroids and enemy shots (spec Demo-vii section 2): pure motion math, render only. Nothing here feeds back into the sim. */
export const ASTEROID_SHOW_SECONDS = 6, SHOT_SHOW_SECONDS = 1.2;
export const EVADE_FADE_TICKS = 36;                                   // 0.6 s
export const RESET_JUMP_TICKS = 120;                                  // a forward jump of more than 2 s clears the tracked objects

export interface Pt { x: number; y: number }
export interface Band { x: number; y: number; w: number; h: number }
export interface Path { from: Pt; to: Pt }
export type Outcome = 'hit' | 'destroyed' | 'evaded';

/** A deterministic value in [0, 1) from a StableId and a salt (integer hash; render only, no sim RNG). */
export function hash01(id: number, salt: number): number {
  let h = Math.imul(id ^ 0x5bd1e995, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function showSecondsOf(kind: number): number { return kind === ObjectKind.Shot ? SHOT_SHOW_SECONDS : ASTEROID_SHOW_SECONDS; }

/** Entry point and target: debris from the top, the bottom or the front (right), never from behind (left); shots from the given origin (the enemy window's Weapons room, spec Demo-viii amendment R3), else the right edge. */
export function projectilePath(stableId: number, kind: number, roomCentre: Pt, band: Band, origin?: Pt): Path {
  const to = { x: roomCentre.x, y: roomCentre.y }, m = 32, u = hash01(stableId, 2);
  if (kind === ObjectKind.Shot && origin) return { from: { x: origin.x, y: origin.y }, to };
  if (kind === ObjectKind.Shot) return { from: { x: band.x + band.w + m, y: roomCentre.y + (u - 0.5) * band.h * 0.4 }, to };
  const side = Math.floor(hash01(stableId, 1) * 3);
  const x = band.x + band.w * (0.3 + 0.8 * u);                         // top and bottom entries lie over the front two thirds and beyond
  const edge = 12;                                                     // top and bottom entries start just outside the band: further out they would cross the notice lines and the console cards
  if (side === 0) return { from: { x, y: band.y - edge }, to };
  if (side === 1) return { from: { x, y: band.y + band.h + edge }, to };
  return { from: { x: band.x + band.w + m, y: band.y - m + (band.h + 2 * m) * u }, to };
}

/** Position during the last showSeconds before impactTick (ticks may be fractional); null outside the window. */
export function projectilePos(path: Path, impactTick: number, tick: number, showSeconds: number): Pt | null {
  const win = showSeconds * TICK_HZ, start = impactTick - win;
  if (tick < start || tick > impactTick) return null;
  const t = (tick - start) / win;
  return t === 1 ? { x: path.to.x, y: path.to.y } : { x: path.from.x + (path.to.x - path.from.x) * t, y: path.from.y + (path.to.y - path.from.y) * t };
}

/** An evaded object keeps its arrival velocity and fades from alpha 1 to 0 over EVADE_FADE_TICKS after impactTick, then is gone (spec Demo-vii amendment 10). */
export function evadePos(path: Path, impactTick: number, tick: number, showSeconds: number): (Pt & { alpha: number }) | null {
  const dt = tick - impactTick, alpha = 1 - dt / EVADE_FADE_TICKS;
  if (dt < 0 || alpha <= 0) return null;
  const win = showSeconds * TICK_HZ;
  return { x: path.to.x + (path.to.x - path.from.x) / win * dt, y: path.to.y + (path.to.y - path.from.y) / win * dt, alpha };
}

/** Judged on the first frame the object is absent (spec Demo-vii amendments 8 and 9). */
export function outcomeOf(tickNow: number, impactTick: number, roomImpactTick: number): Outcome {
  if (tickNow < impactTick) return 'destroyed';
  return roomImpactTick >= impactTick ? 'hit' : 'evaded';
}

/** Clear the tracked objects (no effects) on a jump, a new run or a snapshot load: the node changes, the tick goes back or leaps ahead. */
export function shouldReset(prevTick: number, tick: number, prevNode: number, node: number): boolean {
  return node !== prevNode || tick < prevTick || tick - prevTick > RESET_JUMP_TICKS;
}

/** A room's centre (mean of its tile centres) in internal pixels through worldFit. */
export function roomCentrePx(d: Derived, room: number, fit: { scale: number; x: number; y: number }): Pt {
  const tiles = d.roomTiles[room]!;
  let sx = 0, sy = 0;
  for (const t of tiles) { const tx = t % d.width; sx += tx + 0.5; sy += (t - tx) / d.width + 0.5; }
  const n = Math.max(1, tiles.length);
  return { x: fit.x + (sx / n) * TILE_PX * fit.scale, y: fit.y + (sy / n) * TILE_PX * fit.scale };
}

/** An irregular polygon about 14 to 22 px across (a field rock: 8 to 12 px, spec Demo-viii amendment A1), shaped from the StableId (seven to nine vertices round a centre at 0, 0). */
export function asteroidShape(stableId: number, small = false): Pt[] {
  const n = 7 + Math.floor(hash01(stableId, 3) * 3), radius = small ? 4 + hash01(stableId, 4) * 2 : 7 + hash01(stableId, 4) * 4, pts: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, r = radius * (0.75 + 0.25 * hash01(stableId, 10 + k));
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}

export function fragmentCount(stableId: number): number { return 8 + Math.floor(hash01(stableId, 5) * 5); }

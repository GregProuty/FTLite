// Painted fire (art spike): where each flame tongue stands on a burning tile and how it flickers on the presentation
// clock. Smooth (no art-pixel snapping); per-tile constants come from a hash of the tile, never a random source. Pure: no Pixi.
import { TILE_PX } from '../../../../shared/resolution';
import { hash2 } from '../particles/random';

/** One flame tongue: a teardrop with its round base centred at (x, y), base radius r, height h (tip above the base,
 *  screen up) and the tip's sideways lean, all in world units. */
export interface Tongue { x: number; y: number; r: number; h: number; lean: number }

export const TONGUES_PER_TILE = 4;
const T = TILE_PX;

/** The tongues on burning tile `tile` (index `tx`, `ty` in tiles) at presentation time `t` seconds, back to front. */
export function tileTongues(tile: number, tx: number, ty: number, t: number): Tongue[] {
  const out: Tongue[] = [];
  for (let k = 0; k < TONGUES_PER_TILE; k++) {
    const a = hash2(tile, k * 4 + 1), b = hash2(tile, k * 4 + 2), c = hash2(tile, k * 4 + 3), p = hash2(tile, k * 4 + 4) * Math.PI * 2;
    const r = T * (0.2 + 0.08 * c) * (k === 0 ? 1.25 : 1);
    const flick = 0.5 * Math.sin(t * (7.3 + 2.1 * a) + p) + 0.3 * Math.sin(t * (13.1 + 3.7 * b) + 2 * p) + 0.2 * Math.sin(t * 23.0 + 3 * p);
    out.push({
      x: (tx + 0.5) * T + (a - 0.5) * T * 0.7,
      y: (ty + 0.5) * T + (b - 0.3) * T * 0.55,
      r,
      h: r * (2.4 + 0.75 * flick),
      lean: r * 0.55 * Math.sin(t * (2.3 + a) + p * 1.7)
    });
  }
  return out.sort((u, v) => u.y - v.y);
}

/** The glow under a burning tile: a slow breathing strength in [0.55, 1]. */
export function flameGlow(tile: number, t: number): number {
  const p = hash2(tile, 99) * Math.PI * 2;
  return 0.775 + 0.225 * Math.sin(t * 5.1 + p) * Math.sin(t * 1.7 + p * 0.5);
}

import { TILE_PX } from '../../../shared/resolution';
import type { DoorRect } from './doorModel';

/**
 * The effects layer's procedural shapes on the art-pixel grid (Art-i spec section 4): even world units at even offsets.
 * Pure: tile coordinates or world points in, world-unit rectangles out (no Pixi), so the grid rule can be unit-tested.
 */
const T = TILE_PX;

/** A burning tile drawn without the fire art: the tile inset by 2 art pixels. */
export function fireFallbackRect(tx: number, ty: number): DoorRect { return { x: tx * T + 4, y: ty * T + 4, w: T - 8, h: T - 8 }; }

/** An active breach drawn without the decal art: the whole site tile. */
export function breachRect(tx: number, ty: number): DoorRect { return { x: tx * T, y: ty * T, w: T, h: T }; }

/** A failed station drawn without the arc art: the tile inset by 4 art pixels. */
export function failedRect(tx: number, ty: number): DoorRect { return { x: tx * T + 8, y: ty * T + 8, w: T - 16, h: T - 16 }; }

/** An oxygen speck streaming out of an open airlock: 2 art pixels square, its centre rounded to an even world unit. */
export function ventSpeckRect(cx: number, cy: number): DoorRect {
  const ex = 2 * Math.round(cx / 2), ey = 2 * Math.round(cy / 2);
  return { x: ex - 2, y: ey - 2, w: 4, h: 4 };
}

/** The Doors console's selection outline: a 2-unit stroke with alignment 1 (inside) on the tile grown by 2, so it paints the ring from -2 to 0 outside the tile. */
export function airlockOutlineBand(tx: number, ty: number): { rect: DoorRect; width: number; alignment: number } {
  return { rect: { x: tx * T - 2, y: ty * T - 2, w: T + 4, h: T + 4 }, width: 2, alignment: 1 };
}

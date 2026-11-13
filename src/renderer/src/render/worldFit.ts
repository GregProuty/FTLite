import { TILE_PX } from '../../../shared/resolution';

/** The world band in internal pixels: the ship is fitted inside it (spec Demo-iv section 3); projectiles enter from outside it (spec Demo-vii section 2). */
export const WORLD_BAND = { x: 256, y: 60, w: 608, h: 296 } as const;   // spec Demo-x-c section 3: x 256-864, between the left column and the right column's enemy window; above the console cards (y 360)
const BAND = WORLD_BAND;

/** Scale and position that fit a ship of the given tile size into the world band (spec Demo-iv section 3), centred and rounded to whole pixels. */
export function worldFit(widthTiles: number, heightTiles: number): { scale: number; x: number; y: number } {
  const w = widthTiles * TILE_PX, h = heightTiles * TILE_PX;
  const scale = Math.min(1, BAND.w / w, BAND.h / h);
  return { scale, x: Math.round(BAND.x + (BAND.w - w * scale) / 2), y: Math.round(BAND.y + (BAND.h - h * scale) / 2) };
}

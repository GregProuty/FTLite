import { TILE_PX } from '../../../shared/resolution';

const BAND = { x: 256, y: 76, w: 768, h: 380 };

/** Scale and position that fit a ship of the given tile size into the world band (spec Demo-iv section 3), centred and rounded to whole pixels. */
export function worldFit(widthTiles: number, heightTiles: number): { scale: number; x: number; y: number } {
  const w = widthTiles * TILE_PX, h = heightTiles * TILE_PX;
  const scale = Math.min(1, BAND.w / w, BAND.h / h);
  return { scale, x: Math.round(BAND.x + (BAND.w - w * scale) / 2), y: Math.round(BAND.y + (BAND.h - h * scale) / 2) };
}

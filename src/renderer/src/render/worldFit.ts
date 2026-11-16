import { TILE_PX } from '../../../shared/resolution';

/** The world band in internal pixels: the ship is fitted inside it (spec Demo-iv section 3); projectiles enter from outside it (spec Demo-vii section 2). */
export const WORLD_BAND = { x: 256, y: 60, w: 608, h: 296 } as const;   // spec Demo-x-c section 3: x 256-864, between the left column and the right column's enemy window; above the console cards (y 360)

export interface Band { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface Fit { scale: number; x: number; y: number }

/**
 * Art-i spec section 4: screen pixels per art pixel = 2 x worldScale x stageScale. Snap the world scale so that is a whole number,
 * unless snapping would shrink the ship below 0.75 of its fit (readability beats crispness), or no whole number fits (n = 0).
 * The 1e-9 guards against a product such as 2 x 0.75 x 2 landing a hair under a whole number in floating point.
 */
export function snapWorldScale(fit: number, stage: number): number {
  const n = Math.floor(2 * fit * stage + 1e-9);
  if (n >= 1 && n / (2 * stage) >= 0.75 * fit) return n / (2 * stage);
  return fit;
}

/** Fit a ship of the given tile size into a band (never above 1x), snap the scale for the stage scale, and centre it with x and y on whole screen pixels (x * stage and y * stage whole). */
export function fitInBand(band: Band, widthTiles: number, heightTiles: number, stage: number): Fit {
  const w = widthTiles * TILE_PX, h = heightTiles * TILE_PX;
  const scale = snapWorldScale(Math.min(1, band.w / w, band.h / h), stage);
  const onScreen = (v: number): number => Math.round(v * stage) / stage;
  return { scale, x: onScreen(band.x + (band.w - w * scale) / 2), y: onScreen(band.y + (band.h - h * scale) / 2) };
}

/** The sector ship in the world band (spec Demo-iv section 3), snapped for the stage scale (Art-i spec section 4). */
export function worldFit(widthTiles: number, heightTiles: number, stage: number): Fit {
  return fitInBand(WORLD_BAND, widthTiles, heightTiles, stage);
}

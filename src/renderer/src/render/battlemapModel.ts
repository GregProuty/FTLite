import { featureReady } from './fallback';

/** A rectangle in tiles, tile-edge coordinates (tile (0,0) spans 0..1). */
export interface TileRect { x: number; y: number; w: number; h: number }
/** A painted battlemap under a layout (Art-iv spec section 4): the asset name, source pixels per tile, the image's
 *  top-left corner in tiles, and the painted (alpha) bounds in tiles that the camera fits. */
export interface BattlemapDef { name: string; pxPerTile: number; origin: { x: number; y: number }; bounds: TileRect }

/** Hound: 140 px squares at two tiles a square; mirrored, so source x = 420 + 70 tx at a tile centre (spec section 1). */
export const BATTLEMAPS: Readonly<Record<string, BattlemapDef>> = {
  hound: { name: 'ship.hound.map', pxPerTile: 70, origin: { x: -5.5, y: -3.5 }, bounds: { x: -4.871, y: -2.486, w: 28.057, h: 19.8 } }
};

/** The painting for `layoutId`, or null when the layout has none or its asset is missing (the procedural fallback draws). */
export function battlemapFor(layoutId: string, missing: ReadonlySet<string>): BattlemapDef | null {
  const def = BATTLEMAPS[layoutId];
  return def && featureReady(missing, 'battlemap') && !missing.has(def.name) ? def : null;
}

/** What the camera fits: the painted bounds when a painting draws, else the tile bounds. */
export function fitRect(layoutId: string, widthTiles: number, heightTiles: number, missing: ReadonlySet<string>): TileRect {
  return battlemapFor(layoutId, missing)?.bounds ?? { x: 0, y: 0, w: widthTiles, h: heightTiles };
}

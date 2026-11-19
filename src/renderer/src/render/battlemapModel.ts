/** A rectangle in tiles, tile-edge coordinates (tile (0,0) spans 0..1). */
export interface TileRect { x: number; y: number; w: number; h: number }
/** A painted battlemap under a layout (Art-iv spec section 4): the asset name, source pixels per tile, the image's
 *  top-left corner in tiles, and the painted (alpha) bounds in tiles that the camera fits. */
export interface BattlemapDef { name: string; pxPerTile: number; origin: { x: number; y: number }; bounds: TileRect }

/** Hound: 140 px squares at two tiles a square; mirrored, so source x = 420 + 70 tx at a tile centre (Art-iv spec section 1).
 *  Valkyrn (Valkyrn spec §4.2): rotated 90° clockwise, source x = 560 + 70 tx and y = 910 + 70 ty at a tile centre; the bounds
 *  are the painting's alpha > 16 box, wings and engines included. */
export const BATTLEMAPS: Readonly<Record<string, BattlemapDef>> = {
  hound: { name: 'ship.hound.map', pxPerTile: 70, origin: { x: -5.5, y: -3.5 }, bounds: { x: -4.871, y: -2.486, w: 28.057, h: 19.8 } },
  valkyrn: { name: 'ship.valkyrn.map', pxPerTile: 70, origin: { x: -7.5, y: -12.5 }, bounds: { x: -7, y: -12.1, w: 30.557, h: 30.714 } }
};

/** The painting for `layoutId`, or null when the layout has none or its own asset is missing (the procedural fallback
 *  draws). Valkyrn spec §4.1: only the layout's own asset counts, so one missing painting never hides another. */
export function battlemapFor(layoutId: string, missing: ReadonlySet<string>): BattlemapDef | null {
  const def = BATTLEMAPS[layoutId];
  return def && !missing.has(def.name) ? def : null;
}

/** What the camera fits: the painted bounds when a painting draws, else the tile bounds. */
export function fitRect(layoutId: string, widthTiles: number, heightTiles: number, missing: ReadonlySet<string>): TileRect {
  return battlemapFor(layoutId, missing)?.bounds ?? { x: 0, y: 0, w: widthTiles, h: heightTiles };
}

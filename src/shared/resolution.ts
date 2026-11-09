// Single source of truth for the fixed internal render resolution (16:9) and tile size,
// shared by the main process (minimum content size) and the renderer (letterbox).
// Note: shared/ is scanned by tests/boundary.test.ts; do not mention DOM globals even in comments.
export const INTERNAL_W = 960;
export const INTERNAL_H = 540;
export const TILE_PX = 32;

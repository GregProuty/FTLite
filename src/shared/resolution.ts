// Single source of truth for the reference render resolution (16:9) and tile size, shared by the main process
// (minimum content size) and the renderer. The constants are the reference and the minimum; the stage itself follows
// the window (see stageSizeFor).
// Note: shared/ is scanned by tests/boundary.test.ts; do not mention DOM globals even in comments.
export const INTERNAL_W = 1280;
export const INTERNAL_H = 720;
export const TILE_PX = 32;

/** UI round spec §2.1: the stage's size in internal px for a window: height 720 with the width following the window
 *  when it is at least 16:9, else width 1280 with the height following; never smaller than the reference. */
export interface StageSize { readonly w: number; readonly h: number }
export const REFERENCE_STAGE: StageSize = Object.freeze({ w: INTERNAL_W, h: INTERNAL_H });
/** The stage's longest side: 32:9 wide (720 x 32 / 9 = 2560), and the same bound on the tall branch; past that the stage
 *  stops growing and stageFit leaves bars (a degenerate window, height 1, can't make a 921600-wide stage). */
export const MAX_STAGE_SIDE = 2560;
export function stageSizeFor(winW: number, winH: number): StageSize {
  const ww = Math.max(1, winW), wh = Math.max(1, winH);
  return ww * INTERNAL_H >= wh * INTERNAL_W
    ? { w: Math.min(MAX_STAGE_SIDE, Math.max(INTERNAL_W, Math.round((INTERNAL_H * ww) / wh))), h: INTERNAL_H }
    : { w: INTERNAL_W, h: Math.min(MAX_STAGE_SIDE, Math.max(INTERNAL_H, Math.round((INTERNAL_W * wh) / ww))) };
}

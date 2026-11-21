// UI round 2b: the live viewport. Each map mode keeps one Viewport object and copies the stage size into it at the top of
// every frame, so the runtimes, the online source and the scene that hold the reference all see the size the stage now
// has (the stage follows the window). Renderers without a stage (test fakes) give the 1280x720 reference.
import { REFERENCE_STAGE, type StageSize } from '../../../../shared/resolution';
import type { Viewport } from '../../render/tactical/camera';

/** The renderer's current stage size, or the reference when it has none. */
export function stageOf(renderer: { stage?(): StageSize }): StageSize {
  return renderer.stage?.() ?? REFERENCE_STAGE;
}

/** A new viewport at the renderer's current stage size. */
export function createLiveViewport(renderer: { stage?(): StageSize }): Viewport {
  const s = stageOf(renderer);
  return { w: s.w, h: s.h };
}

/** Copies the renderer's current stage size into `vp` in place; returns whether it changed. */
export function syncViewport(vp: Viewport, renderer: { stage?(): StageSize }): boolean {
  const s = stageOf(renderer);
  if (vp.w === s.w && vp.h === s.h) return false;
  vp.w = s.w; vp.h = s.h;
  return true;
}

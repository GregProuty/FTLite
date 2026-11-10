import type { Facing8 } from './assetNames';

/** Per-run render-only memory (spec §4 Run reset). Nothing here is sim state; reset() is called by session.start() via renderer.reset(). */
export interface RenderMemory {
  damaged: Set<number>;                              // tile indices with the damaged-floor overlay
  facing: Map<number, Facing8>;                      // by StableId
  prev: Map<number, { x: number; y: number }>;       // by StableId, position at the previous tick (interpolation start)
  lastDrawn: Map<number, { x: number; y: number }>;  // by StableId, interpolated position drawn last frame (movement/facing source)
  doorProgress: number[] | null;                     // per edge; null until the first draw of a run
  reset(): void;
}

export function createRenderMemory(): RenderMemory {
  const m: RenderMemory = {
    damaged: new Set(), facing: new Map(), prev: new Map(), lastDrawn: new Map(), doorProgress: null,
    reset() { m.damaged.clear(); m.facing.clear(); m.prev.clear(); m.lastDrawn.clear(); m.doorProgress = null; }
  };
  return m;
}

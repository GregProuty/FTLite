import type { Facing8 } from './assetNames';
import type { RepairWatch } from './particles/sources';

/** Per-run render-only memory (spec §4 Run reset). Nothing here is sim state; reset() is called by session.start() via renderer.reset(). */
export interface RenderMemory {
  damaged: Set<number>;                              // tile indices with the damaged-floor overlay
  facing: Map<number, Facing8>;                      // by StableId
  prev: Map<number, { x: number; y: number }>;       // by StableId, position at the previous tick (interpolation start)
  lastDrawn: Map<number, { x: number; y: number }>;  // by StableId, interpolated position drawn last frame (movement/facing source)
  doorProgress: number[] | null;                     // per edge; null until the first draw of a run
  repair: RepairWatch;                               // repair progress at the last two drawn ticks (Art-i spec section 6: who is working)
  reset(): void;
}

export function createRenderMemory(): RenderMemory {
  const m: RenderMemory = {
    damaged: new Set(), facing: new Map(), prev: new Map(), lastDrawn: new Map(), doorProgress: null, repair: { last: null, prev: null },
    reset() { m.damaged.clear(); m.facing.clear(); m.prev.clear(); m.lastDrawn.clear(); m.doorProgress = null; m.repair = { last: null, prev: null }; }
  };
  return m;
}

// UI round spec §1.7: frames per second over each window (default half a second), whole numbers. frame() is called once
// per drawn frame with performance.now(); it returns the new reading when a window closes, else null.
export interface FpsMeter { frame(nowMs: number): number | null }
export function createFpsMeter(windowMs = 500): FpsMeter {
  let start: number | null = null, frames = 0;
  return {
    frame(now) {
      if (start === null) { start = now; frames = 0; return null; }
      frames++;
      const span = now - start;
      if (span < windowMs - 1e-6) return null;
      const fps = Math.round((frames * 1000) / span);
      start = now; frames = 0;
      return fps;
    }
  };
}

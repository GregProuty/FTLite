// UI round spec §2.1: a window point to stage px, through the same fit the renderer uses (the canvas fills the window
// below the session strip).
import { stageFit } from '../../render/letterbox';

export function pointerToStage(canvas: { getBoundingClientRect(): { left: number; top: number; width: number; height: number } }, cx: number, cy: number): { x: number; y: number } {
  const r = canvas.getBoundingClientRect(), f = stageFit(r.width, r.height);
  return { x: (cx - r.left - f.offsetX) / f.scale, y: (cy - r.top - f.offsetY) / f.scale };
}

import { stageSizeFor } from '../../../shared/resolution';

/** UI round spec §2.1: the stage for a window and its smooth scale; the stage fills the window to within a pixel. */
export function stageFit(winW: number, winH: number): { w: number; h: number; scale: number; offsetX: number; offsetY: number } {
  const { w, h } = stageSizeFor(winW, winH), scale = Math.min(winW / w, winH / h);
  return { w, h, scale, offsetX: Math.floor((winW - w * scale) / 2), offsetY: Math.floor((winH - h * scale) / 2) };
}

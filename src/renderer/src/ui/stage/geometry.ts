// Internal pixels to CSS pixels on whole device pixels (React UI spec §4): every edge is rounded on its own, so widths
// follow the rounded edges and panels never blur at the half-step scales or under Windows display scaling.
import type { LayoutSlice } from '../menuState';

export function edge(internal: number, offset: number, scale: number, dpr: number): number {
  return Math.round((offset + internal * scale) * dpr) / dpr;
}
export function boxCss(x: number, y: number, w: number, h: number, l: Pick<LayoutSlice, 'scale' | 'offsetX' | 'offsetY' | 'dpr'>): { left: number; top: number; width: number; height: number } {
  const left = edge(x, l.offsetX, l.scale, l.dpr), top = edge(y, l.offsetY, l.scale, l.dpr);
  return { left, top, width: edge(x + w, l.offsetX, l.scale, l.dpr) - left, height: edge(y + h, l.offsetY, l.scale, l.dpr) - top };
}

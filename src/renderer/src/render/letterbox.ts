export function computeLetterbox(winW: number, winH: number, internalW: number, internalH: number): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.max(1, Math.floor(Math.min(winW / internalW, winH / internalH)));
  return { scale, offsetX: Math.floor((winW - internalW * scale) / 2), offsetY: Math.floor((winH - internalH * scale) / 2) };
}

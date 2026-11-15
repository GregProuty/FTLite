export function computeLetterbox(winW: number, winH: number, internalW: number, internalH: number): { scale: number; offsetX: number; offsetY: number } {
  const fit = Math.min(winW / internalW, winH / internalH);
  // The session strip reduces the available height even at the normal minimum
  // window size. Fit the full scene below native size; retain pixel steps above it.
  const scale = fit < 1 ? fit : Math.floor(fit * 2) / 2;
  return { scale, offsetX: Math.floor((winW - internalW * scale) / 2), offsetY: Math.floor((winH - internalH * scale) / 2) };
}

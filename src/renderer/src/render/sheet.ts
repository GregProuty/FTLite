export interface Rect { x: number; y: number; w: number; h: number }

/** Row-major frame rectangles over a grid-sliced sheet. Throws if the grid does not divide the image (the assets test checks this too). */
export function sliceGrid(imageW: number, imageH: number, frameW: number, frameH: number): Rect[] {
  if (frameW <= 0 || frameH <= 0 || imageW % frameW !== 0 || imageH % frameH !== 0) throw new Error(`frame ${frameW}x${frameH} does not divide image ${imageW}x${imageH}`);
  const out: Rect[] = [];
  for (let y = 0; y < imageH; y += frameH) for (let x = 0; x < imageW; x += frameW) out.push({ x, y, w: frameW, h: frameH });
  return out;
}

// The star finder (Art-v spec section 2): the painted stars of the Deep Space (Red) backdrop, as coordinates only.
// Scripts only (npm run art:stars); the renderer reads the committed JSON it writes, never this file.
import type { Image } from './importCore';

/** Star pixels: luminance at or above this (tuned on the screenshots, see the Art-v report). */
export const STAR_THRESHOLD = 80;
/** Components larger than this many pixels are not stars. */
export const STAR_MAX_SIZE = 40;

export interface StarOptions { threshold: number; maxSize: number }
/** [centroid x, centroid y, size in px, peak luminance], source pixels. */
export type FoundStar = [number, number, number, number];

export function luminance(r: number, g: number, b: number): number { return 0.3 * r + 0.59 * g + 0.11 * b; }

const round2 = (v: number): number => Math.round(v * 100) / 100;
const hex2 = (v: number): string => Math.round(v).toString(16).padStart(2, '0');

/** Each 4-connected component of star pixels with at most maxSize pixels is one star; sorted by y then x. The tint is the
 *  mean colour of every kept star pixel. */
export function findStars(img: Image, opts: StarOptions): { stars: FoundStar[]; tint: string } {
  const { width: w, height: h, data } = img, n = w * h;
  const lum = new Float64Array(n);
  for (let i = 0; i < n; i++) lum[i] = luminance(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!);
  const seen = new Uint8Array(n), stars: FoundStar[] = [];
  let sr = 0, sg = 0, sb = 0, sn = 0;
  const stack: number[] = [], pixels: number[] = [];
  for (let i = 0; i < n; i++) {
    if (seen[i] || lum[i]! < opts.threshold) continue;
    seen[i] = 1; stack.push(i); pixels.length = 0;
    while (stack.length) {
      const p = stack.pop()!; pixels.push(p);
      const x = p % w, y = (p - x) / w;
      const visit = (q: number): void => { if (!seen[q] && lum[q]! >= opts.threshold) { seen[q] = 1; stack.push(q); } };
      if (x > 0) visit(p - 1);
      if (x < w - 1) visit(p + 1);
      if (y > 0) visit(p - w);
      if (y < h - 1) visit(p + w);
    }
    if (pixels.length > opts.maxSize) continue;
    let cx = 0, cy = 0, peak = 0;
    for (const p of pixels) {
      const x = p % w; cx += x; cy += (p - x) / w; peak = Math.max(peak, lum[p]!);
      sr += data[p * 4]!; sg += data[p * 4 + 1]!; sb += data[p * 4 + 2]!; sn++;
    }
    stars.push([round2(cx / pixels.length), round2(cy / pixels.length), pixels.length, Math.round(peak)]);
  }
  stars.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const tint = sn ? `#${hex2(sr / sn)}${hex2(sg / sn)}${hex2(sb / sn)}` : '#ffffff';
  return { stars, tint };
}

/** The committed file's text: one star per line, so a retune diffs readably; the same input gives the same bytes. */
export function starsFileText(source: string, img: Image, opts: StarOptions): string {
  const { stars, tint } = findStars(img, opts);
  const head = { source, width: img.width, height: img.height, threshold: opts.threshold, maxSize: opts.maxSize, tint };
  const lines = Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  return `{\n${lines.join('\n')}\n  "stars": [\n${stars.map((s) => `    ${JSON.stringify(s)}`).join(',\n')}\n  ]\n}\n`;
}

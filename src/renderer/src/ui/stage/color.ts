/** A theme colour (0xRRGGBB) as CSS, optionally with alpha. */
export function hex(rgb: number, alpha?: number): string {
  if (alpha === undefined) return `#${rgb.toString(16).padStart(6, '0')}`;
  return `rgba(${(rgb >> 16) & 255}, ${(rgb >> 8) & 255}, ${rgb & 255}, ${alpha})`;
}

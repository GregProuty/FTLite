// The m5x7 glyph atlas (React UI spec §4): every character in GLYPH_CHARS drawn once at the font's native 16 px, alpha
// snapped to 0 or 255, one cell per character at its measured advance (as Pixi's dynamic BitmapFont measures) with
// GLYPH_X_PAD on each side. PixelText scales cells with nearest sampling, the rule Pixi's BitmapText follows.
// GLYPH_Y_OFFSET, GLYPH_LINE_H and GLYPH_X_OFFSET are calibrated by the ?mode=uiprobe text-parity probe (UI-ii Task 5).
import { advance, FONT_NATIVE } from '../render/theme';

/** Printable ASCII plus the non-ASCII characters the duel's banners use (onlineDuel.ts: LEAVING…, CONNECTION LOST —). */
export const GLYPH_CHARS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') + '…—';
/** Native pixels of padding each side of a cell, so ink past the advance is not cut off. Clipping only, not a calibration knob. */
export const GLYPH_X_PAD = 1;
/** Native pixels added to the glyph's vertical position to match BitmapText's line placement (probe-calibrated). */
export const GLYPH_Y_OFFSET = 0;
/** The line height anchors use, in native pixels; null = the measured fontBoundingBox height (probe-calibrated). */
export const GLYPH_LINE_H: number | null = null;
/** Native pixels added to each glyph's drawn x origin (probe-calibrated). */
export const GLYPH_X_OFFSET = 0;

export interface GlyphAtlas { canvas: CanvasImageSource; cellH: number; cells: Record<string, number>; advance: Record<string, number> }
/** A string's width in native pixels: the atlas's measured advances, the theme's for a character it lacks. */
export function atlasTextWidth(atlas: GlyphAtlas, text: string): number { let n = 0; for (const ch of text) n += atlas.advance[ch] ?? advance(ch); return n; }
interface AtlasCanvas { width: number; height: number; getContext(type: '2d'): CanvasRenderingContext2D | null }

export function snapAlpha(data: Uint8ClampedArray, threshold = 128): void {
  for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = data[i + 3]! >= threshold ? 255 : 0; }
}

export function buildGlyphAtlas(makeCanvas: (w: number, h: number) => AtlasCanvas, family: string): GlyphAtlas | null {
  const probe = makeCanvas(1, 1).getContext('2d'); if (!probe) return null;
  probe.font = `${FONT_NATIVE}px ${family}`;
  const cells: Record<string, number> = {}, adv: Record<string, number> = {};
  let width = 0;
  for (const ch of GLYPH_CHARS) { adv[ch] = Math.round(probe.measureText(ch).width); cells[ch] = width + GLYPH_X_PAD; width += adv[ch]! + 2 * GLYPH_X_PAD; }
  const m = probe.measureText(GLYPH_CHARS), ascent = Math.ceil(m.fontBoundingBoxAscent), cellH = GLYPH_LINE_H ?? ascent + Math.ceil(m.fontBoundingBoxDescent);
  const canvas = makeCanvas(width, cellH), ctx = canvas.getContext('2d'); if (!ctx) return null;
  ctx.font = `${FONT_NATIVE}px ${family}`; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#ffffff';
  for (const ch of GLYPH_CHARS) ctx.fillText(ch, cells[ch]!, ascent + GLYPH_Y_OFFSET);
  const img = ctx.getImageData(0, 0, width, cellH); snapAlpha(img.data); ctx.putImageData(img, 0, 0);
  return { canvas: canvas as unknown as CanvasImageSource, cellH, cells, advance: adv };
}

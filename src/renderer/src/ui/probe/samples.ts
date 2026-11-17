// The text-parity probe's samples (UI-ii Task 5): the same strings drawn by Pixi BitmapText on the left half and by
// <PixelText> 640 internal px to the right. They cover the font sizes, the anchors, the tints and every glyph.
import { AMBER, DIM, FONT_NATIVE, FONT_SIZE, TEXT, TITLE_SIZE, textPx } from '../../render/theme';
import { GLYPH_CHARS } from '../glyphs';

export interface ProbeSample { text: string; x: number; y: number; size: number; tint: number; anchorX: number; anchorY: number }

/** GLYPH_CHARS cut into lines no wider than `max` internal px at `size`. */
function chunks(size: number, max: number): string[] {
  const out: string[] = []; let cur = '';
  for (const ch of GLYPH_CHARS) { if (cur && textPx(cur + ch, size / FONT_NATIVE) > max) { out.push(cur); cur = ''; } cur += ch; }
  if (cur) out.push(cur);
  return out;
}
const s = (text: string, x: number, y: number, size: number, tint: number, anchorX = 0, anchorY = 0): ProbeSample => ({ text, x, y, size, tint, anchorX, anchorY });
const FOX = 'the quick brown fox 0123456789', PAUSED = 'PAUSED   ESC: RESUME', LENGTH = 'DUEL LENGTH 1:23', LEAVING = 'LEAVING…', LOST = 'CONNECTION LOST — RECONNECTING';

export const PROBE_SAMPLES: ProbeSample[] = [
  ...chunks(FONT_NATIVE, 600).map((t, i) => s(t, 8, 8 + i * 18, FONT_NATIVE, TEXT)),
  ...chunks(FONT_SIZE, 600).map((t, i) => s(t, 8, 48 + i * 34, FONT_SIZE, i % 2 ? DIM : TEXT)),
  s(FOX, 8, 230, FONT_NATIVE, TEXT),
  s(FOX, 300, 256, FONT_SIZE, DIM, 0.5),
  s(PAUSED, 600, 296, FONT_SIZE, AMBER, 1),
  s(LENGTH, 8, 340, TITLE_SIZE, TEXT),
  s(LEAVING, 300, 396, TITLE_SIZE, DIM, 0.5),
  s(LOST, 8, 500, FONT_SIZE, TEXT, 0, 0.5),
  s(LENGTH, 300, 560, FONT_SIZE, AMBER, 0.5, 1),
  s(LEAVING, 600, 600, FONT_NATIVE, DIM, 1, 0.5),
  s(FOX, 8, 636, FONT_NATIVE, TEXT, 0, 1),
  s(PAUSED, 300, 690, FONT_SIZE * 1.5, AMBER, 0.5, 1),
  s(LEAVING, 8, 470, FONT_SIZE * 1.5, TEXT, 0, 0.5)
];

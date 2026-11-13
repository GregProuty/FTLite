/** The HUD theme (spec Demo-x-c section 1, FTL's logic): dark panels, bright text, one amber accent. Every panel, card and overlay reads its colours, font size and text widths here. Pure: no Pixi. */

/** Panel fill (at PANEL_ALPHA), its 2 px border and its 1 px inner highlight. */
export const PANEL_FILL = 0x141a24, PANEL_ALPHA = 0.94, PANEL_BORDER = 0x6f86a6, PANEL_INNER = 0x2b3647;
export const PANEL_BORDER_W = 2;
/** Text colours: primary, secondary (never darker), headings and the selected row, warnings, good news. */
export const TEXT = 0xf2f5fa, DIM = 0xa9b6c8, AMBER = 0xf5b942, WARN = 0xff5b4a, GOOD = 0x8fe06a;
/** An event's blue option and the blue option under the cursor (spec Loop-v section 1), the Science officer's system row. */
export const BLUE = 0x7cc4ff, BLUE_LIT = 0xbfe3ff;
/** The selected row's dark amber bar. */
export const SELECT_BG = 0x4a3a14;
/** Power cells: on, off (dark), failed (red). */
export const BAR_ON = 0x6fd44e, BAR_OFF = 0x2a3340, BAR_FAIL = WARN;
/** The 1 px edge of an off cell, so an unpowered level still reads as a slot on the dark panel. */
export const CELL_EDGE = 0x5d6b80;
/** Thin rules inside a panel (the tab bar's underline). */
export const RULE = PANEL_BORDER;
/** The dark backing behind full-screen cards (the lobby, the game-over summary, the event card). */
export const BACKDROP = 0x05060a, BACKDROP_ALPHA = 0.9;

/** The bitmap font: m5x7 is drawn at its native 16 px (scale 1); the HUD draws it at a whole-pixel scale of 2 (spec section 1: at least 1.5x, whole pixels). */
export const FONT_NATIVE = 16, TEXT_SCALE = 2, FONT_SIZE = FONT_NATIVE * TEXT_SCALE;
/** The event card's title and the lobby or game-over banner: one step larger again. */
export const TITLE_SCALE = 3, TITLE_SIZE = FONT_NATIVE * TITLE_SCALE;
/** Pixels per text line at FONT_SIZE: the glyphs (caps at +8, descenders to +26) with a 6 px gap. */
export const LINE = 24;
/** Inner padding of a panel (left and right). */
export const PAD = 8;

/** m5x7 advance widths in font pixels at its native 16 px, from the font's hmtx table (public/assets/raw/m5x7/m5x7.ttf). */
const ADVANCE: Readonly<Record<string, number>> = {
  ' ': 5, '!': 2, '"': 4, '#': 6, '$': 6, '%': 6, '&': 7, "'": 2, '(': 3, ')': 3, '*': 4, '+': 6, ',': 3, '-': 6, '.': 2, '/': 4,
  ':': 2, ';': 3, '<': 4, '=': 5, '>': 4, '?': 6, '@': 6, '[': 3, '\\': 4, ']': 3, '^': 6, '_': 6, '`': 3, '{': 4, '|': 2, '}': 4, '~': 6,
  M: 8, W: 8, c: 5, f: 5, i: 3, j: 4, k: 5, l: 3, m: 8, r: 5, t: 5, w: 8,
};
/** One character's advance in font pixels (6 for every letter and digit not listed). */
export function advance(ch: string): number { return ADVANCE[ch] ?? 6; }
/** A string's width in internal pixels at the given text scale (default the HUD's). */
export function textPx(s: string, scale: number = TEXT_SCALE): number {
  let n = 0;
  for (const ch of s) n += advance(ch);
  return n * scale;
}

/** A HUD row's gap between parts and the width of a key glyph or an icon before a part's text (the HUD's fillRow lays rows out this way). */
export const ROW_GAP = 12, ROW_GLYPH = 20;
/** A row of parts as the HUD lays it out: each part's glyph, icon and text, ROW_GAP between parts. */
export function rowPx(parts: readonly { text: string; glyph?: boolean; icon?: boolean }[]): number {
  const shown = parts.filter((p) => p.text || p.glyph);
  return shown.reduce((n, p) => n + (p.glyph ? ROW_GLYPH : 0) + (p.icon ? ROW_GLYPH : 0) + Math.ceil(textPx(p.text)), 0) + ROW_GAP * Math.max(0, shown.length - 1);
}

/** WCAG relative luminance of a 0xRRGGBB colour. */
export function luminance(rgb: number): number {
  const ch = (v: number): number => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch((rgb >> 16) & 255) + 0.7152 * ch((rgb >> 8) & 255) + 0.0722 * ch(rgb & 255);
}
/** WCAG contrast ratio of two colours, 1..21. */
export function contrast(a: number, b: number): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** A colour composited over another at alpha (the panel fill over the dark background). */
export function over(top: number, alpha: number, under: number): number {
  const mix = (s: number): number => Math.round(((top >> s) & 255) * alpha + ((under >> s) & 255) * (1 - alpha));
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}
/** The text colours and the background each is drawn on: every pair must reach 4.5 : 1 (spec section 1). */
export const TEXT_PAIRS: readonly { name: string; fg: number; bg: number }[] = [
  ...([['text', TEXT], ['secondary', DIM], ['amber', AMBER], ['warning', WARN], ['good', GOOD], ['blue', BLUE], ['blue lit', BLUE_LIT]] as const).map(([name, fg]) => ({ name: `${name} on panel`, fg, bg: PANEL_FILL })),
  { name: 'amber on the selected row', fg: AMBER, bg: SELECT_BG },
  { name: 'blue lit on the selected row', fg: BLUE_LIT, bg: SELECT_BG },
  { name: 'text on the selected row', fg: TEXT, bg: SELECT_BG },
  { name: 'secondary on the backdrop', fg: DIM, bg: BACKDROP },
];

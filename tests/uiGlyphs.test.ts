// The glyph atlas (React UI spec §4): m5x7 rasterised once at 16 px with hard alpha, one cell per character (printable
// ASCII plus the online banners' … and —) at its measured advance plus padding.
import { describe, expect, it } from 'vitest';
import { atlasTextWidth, buildGlyphAtlas, GLYPH_CHARS, GLYPH_X_PAD, snapAlpha } from '../src/renderer/src/ui/glyphs';
import { advance } from '../src/renderer/src/render/theme';

describe('snapAlpha', () => {
  it('makes every pixel white and fully on or off at the threshold', () => {
    const d = new Uint8ClampedArray([10, 20, 30, 127, 1, 2, 3, 128, 0, 0, 0, 0, 9, 9, 9, 255]);
    snapAlpha(d);
    expect([...d]).toEqual([255, 255, 255, 0, 255, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 255]);
  });
});

describe('buildGlyphAtlas', () => {
  it('lays out a padded cell per character at its measured advance and draws each at its cell', () => {
    const calls: { ch: string; x: number }[] = [];
    let w = 0, h = 0;
    const ctx = {
      font: '', textBaseline: '', fillStyle: '',
      measureText: (t: string) => ({ width: t.length === 1 ? (t.charCodeAt(0) < 127 ? advance(t) : 7.4) : 0, fontBoundingBoxAscent: 11.2, fontBoundingBoxDescent: 3.4 }),
      fillText: (ch: string, x: number) => { calls.push({ ch, x }); },
      getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => {}
    };
    const atlas = buildGlyphAtlas((cw, ch) => { w = cw; h = ch; return { width: cw, height: ch, getContext: () => ctx as never }; }, 'm5x7')!;
    expect(GLYPH_CHARS.length).toBe(97); expect(atlas.cellH).toBe(16);   // GLYPH_LINE_H null: ceil(11.2) + ceil(3.4) = 12 + 4
    let x = 0;
    for (const ch of GLYPH_CHARS) { expect(atlas.cells[ch]).toBe(x + GLYPH_X_PAD); const a = ch.charCodeAt(0) < 127 ? advance(ch) : 7; expect(atlas.advance[ch]).toBe(a); x += a + 2 * GLYPH_X_PAD; }
    expect(w).toBe(x); expect(calls.find((c) => c.ch === 'M')!.x).toBe(atlas.cells.M); expect(ctx.font).toBe('16px m5x7');
    expect(atlasTextWidth(atlas, 'A…')).toBe(advance('A') + 7);
  });
  it('covers every character of the duel scene\'s banner and end-card strings', () => {
    for (const text of ['LEAVING…', 'CONNECTION LOST — RECONNECTING', 'PAUSED   ESC: RESUME   M: MAIN MENU', 'ENTER: REMATCH   ESC: LEAVE', 'YOU: HELM', 'DUEL LENGTH 1:23'])
      for (const ch of text) expect(GLYPH_CHARS, `${text}: ${ch}`).toContain(ch);
  });
  it('returns null without a 2D context', () => {
    expect(buildGlyphAtlas(() => ({ width: 0, height: 0, getContext: () => null }), 'm5x7')).toBeNull();
  });
});

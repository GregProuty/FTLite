import { expect, it } from 'vitest';
import { readMode } from '../src/renderer/src/app/duel/mode';
import { PROBE_SAMPLES } from '../src/renderer/src/ui/probe/samples';
import { GLYPH_CHARS } from '../src/renderer/src/ui/glyphs';
import { FONT_NATIVE, textPx } from '../src/renderer/src/render/theme';
it('reads ?mode=uiprobe and keeps every probe sample inside its half', () => {
  expect(readMode('?mode=uiprobe')).toBe('uiprobe'); expect(readMode('?mode=x')).toBe('sector');
  for (const s of PROBE_SAMPLES) {
    const w = textPx(s.text, s.size / FONT_NATIVE), h = 16 * (s.size / FONT_NATIVE);
    expect(s.x - s.anchorX * w, s.text).toBeGreaterThanOrEqual(0); expect(s.x + (1 - s.anchorX) * w, s.text).toBeLessThanOrEqual(632);
    expect(s.y - s.anchorY * h, s.text).toBeGreaterThanOrEqual(0); expect(s.y + (1 - s.anchorY) * h, s.text).toBeLessThanOrEqual(712);
  }
  const chars = PROBE_SAMPLES.map((s) => s.text).join('');
  for (const ch of GLYPH_CHARS) expect(chars, `probe covers ${JSON.stringify(ch)}`).toContain(ch);
});

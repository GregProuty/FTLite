import { describe, expect, it } from 'vitest';
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

import { HUD_FIXTURES } from '../src/renderer/src/app/hudFixtures';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import type { HudModel } from '../src/renderer/src/render/hudModel';
describe('the HUD probe fixtures (UI-iii Task 4)', () => {
  const built = (): HudModel[] => HUD_FIXTURES.map((f) => f());
  const kinds = (m: HudModel): (string | null)[] => m.players.map((p) => p.console === null ? null : 'kind' in p.console ? p.console.kind : 'engineering');
  it('has at least seven fixtures and every one builds', () => {
    expect(HUD_FIXTURES.length).toBeGreaterThanOrEqual(7);
    for (const m of built()) expect(m.players.length).toBeGreaterThan(0);
  });
  it('covers running, console, event, lobby, gameover and credits', () => {
    const [f0, f1, f2, f3, f4, f5, f6] = built();
    expect(f0!.phase).toBe('running'); expect(f0!.players.filter((p) => p.status === 'active')).toHaveLength(4); expect(f0!.threats.length).toBeGreaterThan(0); expect(f0!.map).not.toBeNull(); expect(f0!.notice.length).toBeGreaterThan(0);
    expect(kinds(f1!).slice(0, 2)).toEqual(['weapons', 'engineering']); expect(f1!.players[0]!.seated).toBe(StationKind.Weapons); expect(f1!.players[0]!.tabs).not.toBeNull(); expect(f1!.calloutFlash).toContain(StationKind.Engineering);
    expect(kinds(f2!)).toEqual(['engineering', 'science', 'navigation', 'doors']); expect((f2!.players[0]!.console as { page: number }).page).toBe(1);
    expect(f3!.eventCard).not.toBeNull(); expect(f3!.eventCard!.choices.some((c) => c.votes.length > 0)).toBe(true);
    expect(f4!.phase).toBe('lobby'); expect(f4!.lobbyLines.length).toBeGreaterThan(0); expect(f4!.lobbyShip).not.toBe(''); expect(f4!.progressLine).not.toBe('');
    expect(f5!.phase).toBe('gameover'); expect(f5!.summary!.length).toBeGreaterThan(0);
    expect(f6!.credits!.length).toBeGreaterThan(0);
  });
});

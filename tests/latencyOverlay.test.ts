// The F3 latency overlay (H-2 spec §9): its pure lines and its key switch. The Pixi draw is one text block and is
// seen in the duel smoke's screenshots.
import { describe, expect, it } from 'vitest';
import { createKeyToggle, latencyOverlayLines, OVERLAY_CODE } from '../src/renderer/src/render/duel/latencyOverlay';
import { latencyFigure } from '../src/renderer/src/net/duelRecord';

function target() {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  return {
    addEventListener(type: string, fn: (e: unknown) => void) { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn); },
    removeEventListener(type: string, fn: (e: unknown) => void) { listeners.get(type)?.delete(fn); },
    key(code: string, repeat = false) { let prevented = false; for (const fn of [...(listeners.get('keydown') ?? [])]) fn({ code, repeat, preventDefault() { prevented = true; } }); return prevented; },
    count: () => listeners.get('keydown')?.size ?? 0
  };
}
describe('the F3 latency overlay (spec §9)', () => {
  it('reads the live median and p95 of both delays, the route and the RTT', () => {
    expect(latencyOverlayLines({ transport: 'lan', held: latencyFigure([40, 50, 60, 70, 200]), command: latencyFigure([]), rttMs: 3.4 })).toEqual([
      'LATENCY  LAN   F3: HIDE', 'HELD n 5  MED 60  P95 200  MAX 200 MS', 'CMD  n 0  MED -  P95 -  MAX - MS', 'RTT 3 MS']);
    expect(latencyOverlayLines({ transport: null, held: latencyFigure([]), command: latencyFigure([12.6]), rttMs: null })[0]).toBe('LATENCY  LINK ?   F3: HIDE');
  });
  it('F3 flips the switch once per press, ignores auto-repeat and other keys, and lets go on destroy', () => {
    const t = target(), toggle = createKeyToggle(t as never);
    expect(OVERLAY_CODE).toBe('F3');
    expect(toggle.on()).toBe(false);
    expect(t.key('F3')).toBe(true); expect(toggle.on()).toBe(true);
    t.key('F3', true); expect(toggle.on()).toBe(true);
    expect(t.key('KeyF')).toBe(false); expect(toggle.on()).toBe(true);
    t.key('F3'); expect(toggle.on()).toBe(false);
    toggle.destroy(); expect(t.count()).toBe(0);
  });
});

// Browser fullscreen (web build spec §7.2): the Settings toggle uses the Fullscreen API and then tries
// navigator.keyboard.lock(['Escape']). With the lock, Esc reaches the game and the browser's exit is not a press. Without
// it, a user exit (Esc) counts as one Escape press only when the page did not start the exit, a match is running and no
// Escape keydown reached the game in the last 100 ms.
import { describe, expect, it, vi } from 'vitest';
import { createBrowserFullscreen } from '../src/renderer/src/app/web/browserFullscreen';

function harness(o: { lock?: 'resolve' | 'reject' | 'missing'; running?: boolean } = {}) {
  let element: object | null = null, now = 1000, running = o.running ?? true, change: (() => void) | undefined, keydown: ((e: { code: string }) => void) | undefined;
  const doc = { fullscreenEnabled: true, get fullscreenElement() { return element; },
    documentElement: { requestFullscreen: vi.fn(async () => { element = {}; change?.(); }) },
    exitFullscreen: vi.fn(async () => { element = null; }),   // the change event arrives after the promise, as a browser may order it
    addEventListener: (_: string, fn: () => void) => { change = fn; }, removeEventListener: vi.fn() };
  const keyboard = o.lock === 'missing' ? undefined : { lock: vi.fn(o.lock === 'reject' ? async () => { throw Error('not allowed'); } : async () => {}), unlock: vi.fn() };
  const win = { addEventListener: (_: string, fn: (e: { code: string }) => void) => { keydown = fn; }, removeEventListener: vi.fn(), dispatchEscape: vi.fn() };
  const onChange = vi.fn();
  const fs = createBrowserFullscreen({ document: doc, keyboard, window: win, matchRunning: () => running, now: () => now, onChange });
  return { fs, doc, keyboard, win, onChange, userExit: () => { element = null; change!(); }, fireChange: () => change!(), escape: () => keydown!({ code: 'Escape' }),
    advance: (ms: number) => { now += ms; }, setRunning: (v: boolean) => { running = v; } };
}
describe('createBrowserFullscreen', () => {
  it('enters with the Fullscreen API and locks Escape; a user exit under the lock is not a press', async () => {
    const h = harness({ lock: 'resolve' });
    expect(await h.fs.set(true)).toBe(true); expect(h.doc.documentElement.requestFullscreen).toHaveBeenCalledOnce();
    expect(h.keyboard!.lock).toHaveBeenCalledWith(['Escape']); expect(await h.fs.get()).toBe(true);
    h.advance(500); h.userExit(); expect(h.win.dispatchEscape).not.toHaveBeenCalled(); expect(h.keyboard!.unlock).toHaveBeenCalled();
  });
  for (const lock of ['missing', 'reject'] as const) it(`without the lock (${lock}) a user exit during a match is one Escape press`, async () => {
    const h = harness({ lock }); await h.fs.set(true); h.advance(2000); h.userExit();
    expect(h.win.dispatchEscape).toHaveBeenCalledOnce(); expect(await h.fs.get()).toBe(false);
  });
  it('never counts the page’s own exit, even when the change event comes after exitFullscreen resolves', async () => {
    const h = harness({ lock: 'missing' }); await h.fs.set(true); h.advance(2000);
    expect(await h.fs.set(false)).toBe(false); h.advance(50); h.fireChange();
    expect(h.doc.exitFullscreen).toHaveBeenCalledOnce(); expect(h.win.dispatchEscape).not.toHaveBeenCalled();
  });
  it('counts nothing outside a match, or when an Escape keydown reached the game within 100 ms', async () => {
    const a = harness({ lock: 'missing', running: false }); await a.fs.set(true); a.advance(2000); a.userExit(); expect(a.win.dispatchEscape).not.toHaveBeenCalled();
    const b = harness({ lock: 'missing' }); await b.fs.set(true); b.advance(2000); b.escape(); b.advance(100); b.userExit(); expect(b.win.dispatchEscape).not.toHaveBeenCalled();
    const c = harness({ lock: 'missing' }); await c.fs.set(true); c.advance(2000); c.escape(); c.advance(150); c.userExit(); expect(c.win.dispatchEscape).toHaveBeenCalledOnce();
  });
  it('reports availability and changes, and disposes its listeners', async () => {
    const h = harness(); expect(h.fs.available).toBe(true); await h.fs.set(true); expect(h.onChange).toHaveBeenCalled();
    h.fs.dispose(); expect(h.doc.removeEventListener).toHaveBeenCalled(); expect(h.win.removeEventListener).toHaveBeenCalled();
  });
});

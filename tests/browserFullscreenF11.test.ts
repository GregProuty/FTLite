// UI round spec §1.6: in the browser F11 is the page's: preventDefault, then the Fullscreen API toggle.
import { describe, expect, it, vi } from 'vitest';
import { createBrowserFullscreen, type FullscreenDocument } from '../src/renderer/src/app/web/browserFullscreen';

function fakes() {
  let element: unknown = null; const listeners: ((e: { code: string; preventDefault?: () => void }) => void)[] = [];
  const doc: FullscreenDocument = {
    fullscreenEnabled: true, get fullscreenElement() { return element; },
    documentElement: { requestFullscreen: async () => { element = {}; } }, exitFullscreen: async () => { element = null; },
    addEventListener() {}, removeEventListener() {}
  };
  const win = { addEventListener: (_t: 'keydown', fn: (e: { code: string }) => void) => { listeners.push(fn); }, removeEventListener() {}, dispatchEscape() {}, preventF11: true };
  return { doc, win, press: (code: string) => { const e = { code, preventDefault: vi.fn() }; for (const l of listeners) l(e); return e; }, on: () => element !== null };
}

describe('F11 in the browser (spec §1.6)', () => {
  it('toggles fullscreen on and off and prevents the browser default', async () => {
    const f = fakes(), fs = createBrowserFullscreen({ document: f.doc, keyboard: undefined, window: f.win, matchRunning: () => false, now: () => 0 });
    const e = f.press('F11'); await Promise.resolve(); await Promise.resolve();
    expect(e.preventDefault).toHaveBeenCalled(); expect(f.on()).toBe(true);
    f.press('F11'); await Promise.resolve(); await Promise.resolve();
    expect(f.on()).toBe(false);
    expect(await fs.toggle()).toBe(true);
  });
  it('leaves F11 alone without preventF11, and other keys always', async () => {
    const f = fakes(); f.win.preventF11 = false;
    createBrowserFullscreen({ document: f.doc, keyboard: undefined, window: f.win, matchRunning: () => false, now: () => 0 });
    const e = f.press('F11'); await Promise.resolve();
    expect(e.preventDefault).not.toHaveBeenCalled(); expect(f.on()).toBe(false);
  });
});

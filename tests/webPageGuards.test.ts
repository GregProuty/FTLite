// Keys and mouse in the page (web build spec §7.1, W-4): during a match the browser's own handling of Tab, Space,
// arrows, PageUp/PageDown, Home/End, Backspace and the game's bound keys is stopped; F11, modified shortcuts and text
// fields are left alone; the context menu and Ctrl+wheel (pinch) zoom are off; the plain wheel is untouched.
import { describe, expect, it, vi } from 'vitest';
import { GUARDED_CODES, inMatch, installPageGuards } from '../src/renderer/src/app/web/pageGuards';
import { INITIAL_MENU } from '../src/renderer/src/ui/menuState';

function target() {
  const listeners = new Map<string, { fn: (e: any) => void; opts: unknown }>();
  return { listeners, addEventListener: (type: string, fn: (e: any) => void, opts?: unknown) => listeners.set(type, { fn, opts }),
    removeEventListener: (type: string) => listeners.delete(type), fire: (type: string, e: object) => { const ev = { preventDefault: vi.fn(), ...e }; listeners.get(type)!.fn(ev); return ev.preventDefault; } };
}
const input = { closest: (s: string) => (s.includes('input') ? {} : null) };
describe('installPageGuards', () => {
  it('stops the browser default for scrolling, focus, navigation and bound keys during a match only', () => {
    let playing = true; const t = target(); installPageGuards(t, () => playing);
    for (const code of ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Backspace', 'KeyW', 'KeyE', 'Escape', 'Digit1', 'F3', 'Slash', 'Enter'])
      expect(t.fire('keydown', { code })).toHaveBeenCalledOnce();
    playing = false; expect(t.fire('keydown', { code: 'Space' })).not.toHaveBeenCalled();
  });
  it('leaves F11, unbound keys, modified shortcuts and text fields to the browser', () => {
    const t = target(); installPageGuards(t, () => true);
    expect(GUARDED_CODES.has('F11')).toBe(false);
    for (const e of [{ code: 'F11' }, { code: 'F5' }, { code: 'KeyW', ctrlKey: true }, { code: 'Tab', altKey: true }, { code: 'KeyR', metaKey: true }, { code: 'Backspace', target: input }])
      expect(t.fire('keydown', e)).not.toHaveBeenCalled();
  });
  it('turns off the context menu (but not in a text field) and Ctrl+wheel zoom, not the plain wheel', () => {
    const t = target(); const off = installPageGuards(t, () => false);
    expect(t.fire('contextmenu', { target: null })).toHaveBeenCalledOnce(); expect(t.fire('contextmenu', { target: input })).not.toHaveBeenCalled();
    expect(t.fire('wheel', { ctrlKey: true })).toHaveBeenCalledOnce(); expect(t.fire('wheel', { ctrlKey: false })).not.toHaveBeenCalled();
    expect(t.listeners.get('wheel')!.opts).toEqual({ passive: false, capture: true });
    off(); expect(t.listeners.size).toBe(0);
  });
  it('a match is Single player or a viewed online session', () => {
    expect(inMatch({ ...INITIAL_MENU, page: 'single' })).toBe(true);
    expect(inMatch({ ...INITIAL_MENU, page: 'session', hadView: true })).toBe(true);
    expect(inMatch({ ...INITIAL_MENU, page: 'session', hadView: false })).toBe(false);
    expect(inMatch(INITIAL_MENU)).toBe(false);
  });
});

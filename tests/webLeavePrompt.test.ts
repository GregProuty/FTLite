// Leaving the page (web build spec §7.6, W-4): while hosting, in a lobby or in a match the browser's own leave prompt
// shows; never otherwise; main.ts tears down on a real pagehide, not on beforeunload (a "Stay" keeps the game).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { installLeavePrompt, leaveWanted } from '../src/renderer/src/app/web/leavePrompt';
import { INITIAL_MENU } from '../src/renderer/src/ui/menuState';
import { idle } from './helpers/uiStore';

const at = (page: typeof INITIAL_MENU.page, phase: typeof idle.phase | null) => ({ menu: { ...INITIAL_MENU, page }, online: { available: true, status: phase ? { ...idle, phase } : null, receivedAt: 0 } });
describe('leaveWanted', () => {
  it('asks while hosting, in a lobby, in an online match or in Single player', () => {
    for (const phase of ['creating', 'joining', 'lobby', 'connecting', 'syncing', 'running', 'paused', 'reconnecting', 'saving', 'rehosting'] as const) expect(leaveWanted(at('session', phase))).toBe(true);
    expect(leaveWanted(at('single', null))).toBe(true);
  });
  it('does not ask on the menu or after a session ended', () => {
    for (const phase of ['idle', 'ended', 'error', 'saved'] as const) expect(leaveWanted(at('home', phase))).toBe(false);
    expect(leaveWanted(at('home', null))).toBe(false);
  });
});
describe('installLeavePrompt', () => {
  it('prompts only when wanted, and disposes', () => {
    let wanted = true; const t = new EventTarget(), off = installLeavePrompt(t, () => wanted);
    // Node's Event.returnValue is a read-only accessor; BeforeUnloadEvent's is a writable string, which this own field stands in for.
    class BeforeUnload extends Event { returnValue: any = undefined; constructor() { super('beforeunload', { cancelable: true }); } }
    const ask = (): { prevented: boolean; returnValue: unknown } => { const e = new BeforeUnload(); t.dispatchEvent(e); return { prevented: e.defaultPrevented, returnValue: e.returnValue }; };
    expect(ask()).toEqual({ prevented: true, returnValue: '' });
    wanted = false; expect(ask().prevented).toBe(false);
    wanted = true; off(); expect(ask().prevented).toBe(false);
  });
  it('main.ts tears down on pagehide, not beforeunload, and installs the prompt only in the browser', () => {
    const main = readFileSync('src/renderer/src/main.ts', 'utf8');
    expect(main).not.toMatch(/addEventListener\('beforeunload'/);
    expect(main).toMatch(/const offLeave = web \? installLeavePrompt\(window, \(\) => leaveWanted\(store\.getState\(\)\)\) : undefined;/);
    expect(main).toMatch(/window\.addEventListener\('pagehide', \(event\) => \{\s*if \(event\.persisted \|\| tornDown\) return;/);
    expect(main).toMatch(/if \(lock\.state === 'held'\) lock\.release\(\);/);   // review R1-F2
  });
});

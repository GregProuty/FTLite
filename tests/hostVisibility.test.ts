import { describe, expect, it } from 'vitest';
import { KEEP_VISIBLE_TEXT, watchHostVisibility } from '../src/renderer/src/app/online/hostVisibility';

function page() {
  const target = new EventTarget() as EventTarget & { visibilityState: string; title: string };
  target.visibilityState = 'visible'; target.title = 'FTLite';
  let push = (_status: any) => {};
  const stop = watchHostVisibility({ document: target as never, onStatus: cb => { push = cb; return () => {}; } });
  const hide = (hidden: boolean) => { target.visibilityState = hidden ? 'hidden' : 'visible'; target.dispatchEvent(new Event('visibilitychange')); };
  return { target, hide, push: (role: string | null, phase: string) => push({ role, phase }), stop };
}
describe('the keep-visible warning (web build spec §3.5, fail path)', () => {
  it('shows in the tab title while a hosting tab is hidden during a lobby or match, and restores the title', () => {
    const p = page(); p.push('host', 'running'); p.hide(true); expect(p.target.title).toBe(KEEP_VISIBLE_TEXT);
    p.hide(false); expect(p.target.title).toBe('FTLite');
  });
  it('never shows for a guest or an idle host', () => {
    const p = page(); p.push('guest', 'running'); p.hide(true); expect(p.target.title).toBe('FTLite');
    p.push('host', 'idle'); expect(p.target.title).toBe('FTLite');
  });
  it('shows when a non-host becomes a host while the tab is already hidden', () => {
    const p = page(); p.hide(true); p.push('guest', 'running'); expect(p.target.title).toBe('FTLite');
    p.push('host', 'lobby'); expect(p.target.title).toBe(KEEP_VISIBLE_TEXT);
  });
  it('clears when hosting ends while hidden, and on stop', () => {
    const p = page(); p.push('host', 'lobby'); p.hide(true); p.push(null, 'idle'); expect(p.target.title).toBe('FTLite');
    p.push('host', 'running'); expect(p.target.title).toBe(KEEP_VISIBLE_TEXT); p.stop(); expect(p.target.title).toBe('FTLite');
  });
});

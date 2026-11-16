import { expect, it, vi } from 'vitest';
import { createSessionRouter } from '../src/renderer/src/app/sessionRouter';
it('owns exactly one session and routes focus to online only, never pausing online authority', () => {
  const single = { frame: vi.fn(), dispose: vi.fn() };
  const online = { frame: vi.fn(), dispose: vi.fn(), setFocused: vi.fn() };
  const router = createSessionRouter({ single: () => single, online: () => online, resetInput: vi.fn() });
  router.frame(); expect(single.frame).not.toHaveBeenCalled(); expect(router.mode).toBe('home');
  router.selectSingle(); router.selectSingle(); expect(router.mode).toBe('single'); router.frame(); expect(single.frame).toHaveBeenCalledOnce();
  router.pause(); router.resume();   // single player owns its own focus pauses
  router.selectOnline(); expect(single.dispose).toHaveBeenCalledOnce(); router.pause(); router.resume();
  expect(online.setFocused.mock.calls).toEqual([[true], [false], [true]]);
  router.selectOnline(); router.frame(); expect(online.dispose).not.toHaveBeenCalled();
  router.dispose(); router.dispose(); expect(online.dispose).toHaveBeenCalledOnce();
  expect(() => router.selectSingle()).toThrow('session-disposed');
});
it('returns home from single player and starts a fresh one next time', () => {
  let made = 0; const disposed: number[] = [];
  const router = createSessionRouter({ single: () => { const id = ++made; return { frame() {}, dispose() { disposed.push(id); } }; },
    online: () => ({ frame() {}, dispose() {}, setFocused() {} }), resetInput: vi.fn() });
  router.selectSingle(); router.home(); expect(router.mode).toBe('home'); expect(disposed).toEqual([1]);
  router.selectSingle(); expect(made).toBe(2); router.home(); router.home(); expect(disposed).toEqual([1, 2]);
});

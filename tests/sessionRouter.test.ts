import { expect, it, vi } from 'vitest';
import { createSessionRouter } from '../src/renderer/src/app/sessionRouter';
it('owns exactly one session and routes focus without pausing online authority', () => {
  const couch = { frame: vi.fn(), dispose: vi.fn(), pause: vi.fn(), resume: vi.fn() };
  const online = { frame: vi.fn(), dispose: vi.fn(), setFocused: vi.fn() };
  const router = createSessionRouter({ couch: () => couch, online: () => online, resetInput: vi.fn() });
  router.frame(); expect(couch.frame).not.toHaveBeenCalled();
  router.selectCouch(); router.frame(); router.pause('blur'); expect(couch.pause).toHaveBeenCalledWith('blur');
  router.selectOnline(); expect(couch.dispose).toHaveBeenCalledOnce(); router.pause('blur'); router.resume('focus');
  expect(online.setFocused.mock.calls).toEqual([[false], [false], [true]]);
  router.selectOnline(); router.frame(); expect(online.dispose).not.toHaveBeenCalled();
  router.dispose(); router.dispose(); expect(online.dispose).toHaveBeenCalledOnce();
});

import { describe, expect, it, vi } from 'vitest';
import { CLOCK_JUMP_MS, createClockJumpLifecycle, createElectronLifecycle } from '../src/network/online/lifecycle';

function clock() {
  let epoch = 1_000_000, mono = 500, tick: (() => void) | undefined;
  const target = new EventTarget(), clearInterval = vi.fn();
  const lifecycle = createClockJumpLifecycle({ target, epochMs: () => epoch, monotonicMs: () => mono,
    setInterval: (cb, ms) => { expect(ms).toBe(1000); tick = cb; return 1; }, clearInterval });
  const order: string[] = []; lifecycle.onSuspend(() => order.push('suspend')); lifecycle.onResume(() => order.push('resume'));
  return { lifecycle, target, order, clearInterval, step(wall: number, monotonic: number) { epoch += wall; mono += monotonic; tick!(); } };
}
const page = (type: string, persisted: boolean) => Object.assign(new Event(type), { persisted });
describe('suspend and resume triggers (web build spec §3.1)', () => {
  it('counts a wall gap more than 15 s larger than the monotonic gap as one suspend then resume', () => {
    const c = clock();
    c.step(1000, 1000); c.step(60000, 60000); c.step(CLOCK_JUMP_MS + 1000, 1000);   // a throttled minute on both clocks, and exactly 15 s extra, are not sleep
    expect(c.order).toEqual([]);
    c.step(CLOCK_JUMP_MS + 1001, 1000); expect(c.order).toEqual(['suspend', 'resume']);
  });
  it('never fires on visibilitychange', () => {
    const c = clock(); c.target.dispatchEvent(new Event('visibilitychange')); c.step(1000, 1000); expect(c.order).toEqual([]);
  });
  it('treats a back-forward-cache pagehide as suspend and its pageshow as resume, and ignores ordinary ones', () => {
    const c = clock();
    c.target.dispatchEvent(page('pagehide', false)); c.target.dispatchEvent(page('pageshow', false)); expect(c.order).toEqual([]);
    c.target.dispatchEvent(page('pagehide', true)); c.step(120000, 1000);   // the frozen interval's jump is the same suspension
    c.target.dispatchEvent(page('pageshow', true)); expect(c.order).toEqual(['suspend', 'resume']);
    c.step(1000, 1000); expect(c.order).toEqual(['suspend', 'resume']);
  });
  it('stops its interval and page listeners on dispose', () => {
    const c = clock(); c.lifecycle.dispose(); expect(c.clearInterval).toHaveBeenCalledWith(1);
    c.target.dispatchEvent(page('pagehide', true)); expect(c.order).toEqual([]);
  });
  it("relays Electron main's app:suspend and app:resume pushes and unsubscribes on dispose", () => {
    const suspends = new Set<() => void>(), resumes = new Set<() => void>();
    const lifecycle = createElectronLifecycle({ onSuspend: cb => { suspends.add(cb); return () => { suspends.delete(cb); }; }, onResume: cb => { resumes.add(cb); return () => { resumes.delete(cb); }; } });
    const order: string[] = []; lifecycle.onSuspend(() => order.push('s')); lifecycle.onResume(() => order.push('r'));
    for (const cb of suspends) cb(); for (const cb of resumes) cb(); expect(order).toEqual(['s', 'r']);
    lifecycle.dispose(); expect(suspends.size + resumes.size).toBe(0);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOnlineRetry } from '../src/main/network/onlineRetry';
const clock = { nowMs: () => Date.now() };
const scheduler = { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>) };
afterEach(() => vi.useRealTimers());
describe('bounded online retry', () => {
  it('backs off 1/2/4/8/8 seconds inside one 30 second window', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const retry = createOnlineRetry(clock, scheduler), times: number[] = [], waits: number[] = [];
    const run = retry.run(async () => { times.push(Date.now()); throw { code: 'unavailable', retryable: true }; }, time => waits.push(time));
    const result = expect(run).rejects.toMatchObject({ code: 'retry-exhausted' });
    await vi.advanceTimersByTimeAsync(30000); await result;
    expect(times).toEqual([0, 1000, 3000, 7000, 15000, 23000]);
    expect(waits).toEqual([1000, 3000, 7000, 15000, 23000]); expect(vi.getTimerCount()).toBe(0);
  });
  it('includes hanging attempts in the deadline and aborts them', async () => {
    vi.useFakeTimers(); let signal!: AbortSignal;
    const retry = createOnlineRetry(clock, scheduler);
    const run = retry.run(s => { signal = s; return new Promise(() => {}); }, () => {});
    const result = expect(run).rejects.toMatchObject({ code: 'retry-exhausted' });
    await vi.advanceTimersByTimeAsync(30000); await result; expect(signal.aborted).toBe(true);
  });
  it('does not loop terminal errors or RetryAfter outside budget; explicit run gets a fresh budget', async () => {
    vi.useFakeTimers(); const retry = createOnlineRetry(clock, scheduler); let count = 0;
    await expect(retry.run(async () => { count++; throw { code: 'unauthorized', retryable: false }; }, () => {})).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(retry.run(async () => { count++; throw { code: 'rate-limited', retryable: true, retryAfterMs: 31000 }; }, () => {})).rejects.toMatchObject({ code: 'retry-exhausted' });
    await retry.run(async () => { count++; }, () => {}); expect(count).toBe(3); expect(vi.getTimerCount()).toBe(0);
  });
  it('cancel preempts an in-flight attempt', async () => {
    vi.useFakeTimers(); const retry = createOnlineRetry(clock, scheduler);
    const result = expect(retry.run(() => new Promise(() => {}), () => {})).rejects.toMatchObject({ code: 'cancelled' });
    retry.cancel(); await result; expect(vi.getTimerCount()).toBe(0);
  });
});

export interface OnlineClock { nowMs(): number; epochMs(): number }
export interface OnlineScheduler { setTimeout(callback: () => void, ms: number): unknown; clearTimeout(handle: unknown): void }
export const onlineFault = (code: string): Error & { code: string } => Object.assign(Error(code), { code });

/** One monotonic budget includes backoff and operations that never settle. */
export function createOnlineRetry(clock: Pick<OnlineClock, 'nowMs'>, scheduler: OnlineScheduler) {
  let active: AbortController | undefined;
  return {
    cancel() { active?.abort(onlineFault('cancelled')); },
    async run(attempt: (signal: AbortSignal) => Promise<void>, onWait: (retryAtMs: number) => void): Promise<void> {
      active?.abort(onlineFault('cancelled'));
      const controller = new AbortController(); active = controller;
      const end = clock.nowMs() + 30000;
      const deadline = scheduler.setTimeout(() => controller.abort(onlineFault('retry-exhausted')), 30000);
      let rejectAbort!: (reason: unknown) => void;
      const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
      const onAbort = () => rejectAbort(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
      let waiting: unknown, delay = 1000;
      try {
        while (true) {
          if (controller.signal.aborted) throw controller.signal.reason;
          if (clock.nowMs() >= end) throw onlineFault('retry-exhausted');
          try { await Promise.race([Promise.resolve().then(() => attempt(controller.signal)), aborted]); return; }
          catch (error) {
            if (controller.signal.aborted) throw controller.signal.reason;
            const failure = error as { retryable?: boolean; retryAfterMs?: number };
            if (!failure?.retryable) throw error;
            const pause = Math.max(delay, failure.retryAfterMs ?? 0), at = clock.nowMs() + pause;
            if (!Number.isFinite(at) || at >= end) throw onlineFault('retry-exhausted');
            onWait(at);
            await Promise.race([new Promise<void>(resolve => { waiting = scheduler.setTimeout(resolve, pause); }), aborted]);
            scheduler.clearTimeout(waiting); waiting = undefined; delay = Math.min(delay * 2, 8000);
          }
        }
      } finally {
        scheduler.clearTimeout(deadline); if (waiting !== undefined) scheduler.clearTimeout(waiting);
        controller.signal.removeEventListener('abort', onAbort); if (active === controller) active = undefined;
      }
    }
  };
}

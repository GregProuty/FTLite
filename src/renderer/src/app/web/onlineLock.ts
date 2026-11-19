// One online tab (web build spec §7.5, deviation W-5): the online session takes the Web Lock `ftlite-online` for as long
// as it exists (the page's life). A tab that cannot get it shows "FTLite is already open in another tab" on the
// Multiplayer screen; Single player stays available there.
export const ONLINE_LOCK_NAME = 'ftlite-online';
export type OnlineLock = { state: 'held'; release(): void } | { state: 'busy' } | { state: 'unavailable' };
/** Review R1-F2: start-up never waits on the lock longer than this; on timeout online is off and the menu still starts. */
export const LOCK_START_TIMEOUT_MS = 2000;
/** A busy lock is asked once more, waiting this long, so a reloaded tab's old document has time to release it. */
export const LOCK_RETRY_MS = 1500;
type Attempt = 'busy' | 'unavailable' | { release(): void };

/** AbortSignal.timeout where it exists, else a controller and a timer (older browsers must not throw at start-up). */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function acquireOnlineLock(locks: Pick<LockManager, 'request'> | undefined,
  o: { timeoutMs?: number; retryMs?: number } = {}): Promise<OnlineLock> {
  if (!locks) return { state: 'unavailable' };
  let gaveUp = false;
  const attempt = (options: LockOptions): Promise<Attempt> => new Promise(resolve => {
    let release!: () => void;
    const held = new Promise<void>(done => { release = done; });
    try {
      locks.request(ONLINE_LOCK_NAME, options, lock => {
        if (!lock) { resolve('busy'); return undefined; }
        if (gaveUp) { resolve('unavailable'); return undefined; }   // granted after start-up gave up: let it go at once
        resolve({ release }); return held;   // kept until release() (wired in Task 10's pagehide teardown, not yet) or the page goes away
      }).catch((error: unknown) => { const name = (error as { name?: string } | null)?.name; resolve(name === 'AbortError' || name === 'TimeoutError' ? 'busy' : 'unavailable'); });
    } catch { resolve('unavailable'); }
  });
  const work = (async (): Promise<OnlineLock> => {
    try {
    let result = await attempt({ ifAvailable: true });
    if (result === 'busy') result = await attempt({ signal: timeoutSignal(o.retryMs ?? LOCK_RETRY_MS) });
    return result === 'busy' ? { state: 'busy' } : result === 'unavailable' ? { state: 'unavailable' } : { state: 'held', release: result.release };
    } catch { return { state: 'unavailable' }; }   // acquisition never throws
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<OnlineLock>(resolve => { timer = setTimeout(() => resolve({ state: 'unavailable' }), o.timeoutMs ?? LOCK_START_TIMEOUT_MS); });
  const outcome = await Promise.race([work, timeout]);
  clearTimeout(timer); gaveUp = true;
  if (outcome.state !== 'held') void work.then(late => { if (late.state === 'held') late.release(); });   // a grant that lost the race is released
  return outcome;
}

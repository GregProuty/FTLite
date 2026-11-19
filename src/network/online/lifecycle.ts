// Suspend and resume for the page's online session (web build spec §3.1): OS sleep and wake only, never
// visibilitychange (a hidden hosting tab keeps playing). Electron pushes them from powerMonitor; a browser infers them.
type Unsubscribe = () => void;
export interface OnlineLifecycle { onSuspend(cb: () => void): Unsubscribe; onResume(cb: () => void): Unsubscribe; dispose(): void }
export const CLOCK_JUMP_MS = 15000, CLOCK_JUMP_INTERVAL_MS = 1000;
function hub() {
  const suspends = new Set<() => void>(), resumes = new Set<() => void>();
  const fire = (set: Set<() => void>) => { for (const cb of [...set]) { try { cb(); } catch { /* isolate observers */ } } };
  return {
    suspends, resumes, suspend: () => fire(suspends), resume: () => fire(resumes),
    api: { onSuspend(cb: () => void) { suspends.add(cb); return () => { suspends.delete(cb); }; }, onResume(cb: () => void) { resumes.add(cb); return () => { resumes.delete(cb); }; } }
  };
}
/** Electron: main's app:suspend and app:resume pushes (spec §3.3 job 5), through the preload's onSuspend/onResume. */
export function createElectronLifecycle(api: { onSuspend(cb: () => void): Unsubscribe; onResume(cb: () => void): Unsubscribe }): OnlineLifecycle {
  const h = hub(); let disposed = false;
  const offs = [api.onSuspend(() => { if (!disposed) h.suspend(); }), api.onResume(() => { if (!disposed) h.resume(); })];
  return { ...h.api, dispose() { if (disposed) return; disposed = true; for (const off of offs) off(); h.suspends.clear(); h.resumes.clear(); } };
}
export interface ClockJumpDeps {
  target: { addEventListener(type: string, listener: (event: any) => void): void; removeEventListener(type: string, listener: (event: any) => void): void };
  epochMs(): number; monotonicMs(): number;
  setInterval(cb: () => void, ms: number): unknown; clearInterval(handle: unknown): void;
}
/** Browser: a 1 s interval compares the wall and monotonic deltas; a wall gap more than 15 s larger is one sleep.
 *  A long gap on both clocks is hidden-tab throttling, not sleep. A back-forward-cache pagehide/pageshow is a
 *  suspend/resume. A platform whose monotonic clock runs through sleep is missed here; socket loss and lease expiry
 *  recover it as after a network drop. */
export function createClockJumpLifecycle(deps: ClockJumpDeps): OnlineLifecycle {
  const h = hub();
  let lastEpoch = deps.epochMs(), lastMono = deps.monotonicMs(), frozen = false, disposed = false;
  const resample = () => { lastEpoch = deps.epochMs(); lastMono = deps.monotonicMs(); };
  const timer = deps.setInterval(() => {
    if (disposed) return;
    const epoch = deps.epochMs(), mono = deps.monotonicMs(), jumped = (epoch - lastEpoch) - (mono - lastMono) > CLOCK_JUMP_MS;
    lastEpoch = epoch; lastMono = mono;
    if (jumped && !frozen) { h.suspend(); h.resume(); }
  }, CLOCK_JUMP_INTERVAL_MS);
  const hide = (event: { persisted?: boolean }) => { if (!disposed && event.persisted && !frozen) { frozen = true; h.suspend(); } };
  const show = (event: { persisted?: boolean }) => { if (!disposed && event.persisted && frozen) { frozen = false; resample(); h.resume(); } };
  deps.target.addEventListener('pagehide', hide); deps.target.addEventListener('pageshow', show);
  return { ...h.api, dispose() {
    if (disposed) return; disposed = true; deps.clearInterval(timer);
    deps.target.removeEventListener('pagehide', hide); deps.target.removeEventListener('pageshow', show); h.suspends.clear(); h.resumes.clear();
  } };
}

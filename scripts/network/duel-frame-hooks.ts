// TEST ONLY: the duel frame probe's main-thread task timer (imported first by duel-frame-observer.ts, so it runs before
// the duel gate's observer and before any page script). It wraps setTimeout, setInterval and every 'message' listener, and
// keeps, while the probe is armed, each callback over TASK_MIN_MS with its start, duration and kind, plus per-kind totals.
// The duel gate observer's own port listener (added while the page dispatches 'ftlite:online:test-port') is kept apart as
// 'observer', so the harness's own decoding cost is separable from the game's. Long animation frames are listed too.
const TASK_MIN_MS = 2;
const g = globalThis as any;
export const taskLog: { armed: boolean; tasks: [number, number, string][]; totals: Record<string, { n: number; ms: number }>; loaf: unknown[] } = { armed: false, tasks: [], totals: {}, loaf: [] };
g.__frameTasks = taskLog;
function timed<F extends (...a: any[]) => any>(fn: F, kind: string): F {
  return function (this: unknown, ...a: any[]) {
    if (!taskLog.armed) return fn.apply(this, a);
    const t0 = performance.now();
    try { return fn.apply(this, a); } finally {
      const d = performance.now() - t0, tot = (taskLog.totals[kind] ??= { n: 0, ms: 0 });
      tot.n++; tot.ms += d;
      if (d >= TASK_MIN_MS && taskLog.tasks.length < 200000) taskLog.tasks.push([t0, d, kind]);
    }
  } as F;
}
const nativeTimeout = g.setTimeout.bind(g), nativeInterval = g.setInterval.bind(g);
g.setTimeout = (fn: unknown, ms?: number, ...a: unknown[]) => nativeTimeout(typeof fn === 'function' ? timed(fn as any, 'timeout') : fn, ms, ...a);
g.setInterval = (fn: unknown, ms?: number, ...a: unknown[]) => nativeInterval(typeof fn === 'function' ? timed(fn as any, 'interval') : fn, ms, ...a);
// The observer's port listener is the one added while the test-port event is being dispatched (this module's listener
// sets the flag first; duel-frame-observer.ts adds the listener that clears it, after the duel observer's).
export const observerWindow = { open: false };
window.addEventListener('ftlite:online:test-port', () => { observerWindow.open = true; });
const wrapped = new WeakMap<object, unknown>();
const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
const kindOf = (target: unknown): string => observerWindow.open && target instanceof MessagePort ? 'msg-observer'
  : target instanceof MessagePort ? 'msg-port' : typeof Worker !== 'undefined' && target instanceof Worker ? 'msg-worker' : 'msg-other';
EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, listener: any, options?: any) {
  if (type === 'message' && typeof listener === 'function') {
    let w = wrapped.get(listener) as any;
    if (!w) { w = timed(listener, kindOf(this)); wrapped.set(listener, w); }
    return add.call(this, type, w, options);
  }
  return add.call(this, type, listener, options);
};
EventTarget.prototype.removeEventListener = function (this: EventTarget, type: string, listener: any, options?: any) {
  return remove.call(this, type, (type === 'message' && wrapped.get(listener)) || listener, options);
};
// onmessage setters (MessagePort, Worker): wrapped the same way.
for (const C of [g.MessagePort, g.Worker].filter(Boolean)) {
  const d = Object.getOwnPropertyDescriptor(C.prototype, 'onmessage');
  if (!d?.set || !d.get) continue;
  Object.defineProperty(C.prototype, 'onmessage', { configurable: true, enumerable: d.enumerable, get() { return d.get!.call(this); },
    set(fn: any) { d.set!.call(this, typeof fn === 'function' ? timed(fn, C === g.Worker ? 'msg-worker' : kindOf(this)) : fn); } });
}
try {
  new PerformanceObserver((list) => {
    if (!taskLog.armed) return;
    for (const e of list.getEntries() as any[]) taskLog.loaf.push({ start: e.startTime, duration: e.duration, blocking: e.blockingDuration, render: e.renderStart, scripts: (e.scripts ?? []).map((s: any) => ({ invoker: s.invoker, type: s.invokerType, ms: Math.round(s.duration), fn: s.sourceFunctionName, url: String(s.sourceURL ?? '').split('/').pop() })) });
  }).observe({ type: 'long-animation-frame', buffered: false });
} catch { /* not supported */ }

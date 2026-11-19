// TEST ONLY (web build spec §3.5): the host Worker's 60 Hz tick (the production tick driver) and its 5 s lease cadence.
import { createTickDriver } from '../../../src/renderer/src/authority/tickDriver';
import { TICK_HZ } from '../../../src/renderer/src/sim/tuning';
import type { WorkerIn, WorkerOut } from './protocol';

const scope = self as unknown as {
  postMessage(message: WorkerOut): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
};
let relay: MessagePort | undefined, driver: ReturnType<typeof createTickDriver> | undefined;
let windowStart = 0, windowCount = 0, maxLateness = 0, leaseId = 0, lastCompletion = 0;
let leaseTimer: ReturnType<typeof setTimeout> | undefined;
const windows: number[] = [], gaps: number[] = [], trips: number[] = [], sent = new Map<number, number>();
/** A tick counts toward its window only when it ran within two tick periods of its deadline. */
const ON_TIME_MS = 2 * 1000 / TICK_HZ;
function closeWindows(now: number): void {
  while (now >= windowStart + 10000) { windows.push(windowCount); windowCount = 0; windowStart += 10000; }
}
function lease(): void {
  const id = ++leaseId; sent.set(id, performance.now());
  relay!.postMessage({ kind: 'lease', id } satisfies WorkerOut);
  leaseTimer = setTimeout(lease, 5000);
}
function receive(message: WorkerIn): void {
  if (message.kind === 'lease-reply') {
    const started = sent.get(message.id); if (started === undefined) return;
    sent.delete(message.id);
    const now = performance.now(); trips.push(now - started); gaps.push(now - lastCompletion); lastCompletion = now;
    return;
  }
  if (message.kind === 'stop') {
    driver?.dispose(); clearTimeout(leaseTimer);
    const now = performance.now(); closeWindows(now);
    relay!.postMessage({ kind: 'result', tickWindows: windows, maxTickLatenessMs: maxLateness, leaseGapsMs: [...gaps, now - lastCompletion], leaseRoundTripsMs: trips } satisfies WorkerOut);
  }
}
scope.addEventListener('message', event => {
  const message = event.data as WorkerIn;
  if (message.kind !== 'start' || relay || event.ports.length !== 1) return;
  relay = event.ports[0]!;
  relay.addEventListener('message', e => receive(e.data as WorkerIn)); relay.start();
  windowStart = lastCompletion = performance.now();
  driver = createTickDriver({ nowMs: () => performance.now() },
    { schedule(ms, callback) { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); } },
    (tick, deadline) => {
      const now = performance.now(); closeWindows(now);
      if (now - deadline <= ON_TIME_MS) windowCount++;
      maxLateness = Math.max(maxLateness, now - deadline);
      relay!.postMessage({ kind: 'tick', tick, dueAt: performance.timeOrigin + deadline } satisfies WorkerOut);
    });
  lease();
});

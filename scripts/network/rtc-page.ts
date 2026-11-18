// TEST ONLY (Web-i Task 10): one RTC endpoint per Electron page. A guest page holds a production page transport and the
// production client of rtc-smoke-client (the hidden window and the visible guest page of the old topology, merged as in the
// app); the host page holds the production Worker owner over the built Worker, the host transport and the passive
// observer relay. Main relays signals between pages. Every promise-valued call returns a Settled value, so executeJavaScript
// never has to carry a page error message.
import { createPageTransport, type PageTransport } from '../../src/network/transport/pageTransport';
import { createWorkerHostPlatform, startWorkerHost, type HostProcessHandle, type WorkerLike } from '../../src/network/host/workerHost';
import type { TransportController } from '../../src/network/transport/contracts';
import { base64ToBytes, bytesToBase64 } from '../../src/shared/bytes';
import { createObserver, createProbe } from './rtc-smoke-client';
import { trackPagePorts } from './page-port-tracker';

// Before any transport or host exists: every page MessagePort is observed from creation (shared gate rule, Task 9).
trackPagePorts();

declare global { interface Window { rtcPage: typeof api } }
type Settled<T> = { ok: true; value: T } | { ok: false; error: string };
const settle = <T,>(promise: Promise<T>): Promise<Settled<T>> =>
  promise.then(value => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error: String((error as Error)?.message ?? error) }));
const workerUrl = new URLSearchParams(location.search).get('worker');
const owned = new Map<string, PageTransport>(), controllers = new Map<string, TransportController>();
const attempts = new Map<string, { readiness: Promise<Settled<{ latestPayloadLimit: number }>>; port: MessagePort }>();
const observers = new Map<string, ReturnType<typeof createObserver>>(), probes = new Map<string, ReturnType<typeof createProbe>>(), relays = new Map<string, MessagePort>();
const signals: { name: string; signal: any }[] = [], workers: { terminated: boolean; errored: boolean }[] = [];
let host: HostProcessHandle | undefined, hostExit: string | null = null, hostStarting: Promise<unknown> | undefined;
const key = (name: string, attemptId: string) => `${name}:${attemptId}`;
const lifecycle = { onSuspend: () => () => {}, onResume: () => () => {} };
function watch(name: string, controller: TransportController): void {
  controllers.set(name, controller);
  controller.onSignal(signal => signals.push({ name, signal }));
}
/** The early-failure helpers act inside the spawn task itself, never in a later executeJavaScript call. */
function createWorker(mode: string, abort: AbortController): () => WorkerLike {
  return () => {
    const worker = new Worker(workerUrl!, { type: 'module' }), record = { terminated: false, errored: false }; workers.push(record);
    const terminate = worker.terminate.bind(worker); worker.terminate = () => { record.terminated = true; terminate(); };
    worker.addEventListener('error', () => { record.errored = true; });
    if (mode === 'abort-after-spawn') abort.abort();
    if (mode === 'crash-on-spawn') queueMicrotask(() => worker.dispatchEvent(new ErrorEvent('error', { message: 'injected worker crash', cancelable: true })));
    return worker;
  };
}
const api = {
  createTransport(name: string, identity: object) { const transport = createPageTransport(identity as never); owned.set(name, transport); watch(name, transport.controller); },
  startHost(options: object, mode: 'normal' | 'abort-after-spawn' | 'crash-on-spawn' = 'normal') {
    const abort = new AbortController();
    const work = startWorkerHost({ ...options, signal: abort.signal } as never, createWorkerHostPlatform({ lifecycle, createWorker: createWorker(mode, abort) }))
      .then(handle => { host = handle; hostExit = null; handle.onExit(reason => { hostExit = reason; }); watch('host', handle.transport); });
    hostStarting = work.catch(() => {});
    return settle(work);
  },
  hostExit: () => hostExit,
  hostRequest(command: any) {
    const wire = command.kind === 'start' ? { ...command, initBytes: base64ToBytes(command.initBytes) }
      : command.kind === 'restore' ? { ...command, checkpointBytes: base64ToBytes(command.checkpointBytes) } : command;
    return settle(host!.request(wire).then((r: any) => r.ok && r.checkpointBytes ? { ...r, checkpointBytes: bytesToBase64(r.checkpointBytes) } : r));
  },
  startAttempt(name: string, options: { attemptId: string }) {
    const { port1, port2 } = new MessageChannel();
    attempts.set(key(name, options.attemptId), { readiness: settle(controllers.get(name)!.startAttempt(options as never, port1)), port: port2 });
    return true;
  },
  readiness: (name: string, attemptId: string) => attempts.get(key(name, attemptId))!.readiness,
  receiveSignal: (name: string, signal: unknown) => settle(controllers.get(name)!.receiveSignal(signal as never)),
  closeAttempt: (name: string, attemptId: string) => settle(controllers.get(name)!.closeAttempt(attemptId)),
  takeSignals: () => signals.splice(0),
  /** Host page: the passive observer relay between the attempt's port and a fresh authority port attached to the Worker
   *  (raw, unmodified forwarding; the observer receives copies and cannot satisfy readiness or any ACK). */
  relayToHost(name: string, attemptId: string, peer: string, players: number[], latestPayloadLimit: number) {
    const k = key(name, attemptId), attempt = attempts.get(k)!, authority = new MessageChannel(), observer = createObserver();
    observers.set(k, observer); relays.set(k, authority.port1);
    const relay = (from: MessagePort, to: MessagePort, incoming: boolean) => {
      from.addEventListener('message', event => { if (event.data?.type === 'data') observer.observe(new Uint8Array(event.data.bytes), incoming); to.postMessage(event.data); });
      from.start();
    };
    relay(authority.port1, attempt.port, true); relay(attempt.port, authority.port1, false);
    return settle(host!.attachPeer(peer, players, authority.port2, { streamed: true, latestPayloadLimit }));
  },
  observerCall(name: string, attemptId: string, method: 'publication' | 'notifications' | 'stats', argument?: number) {
    const observer = observers.get(key(name, attemptId))!;
    return method === 'publication' ? observer.publication(argument!) ?? null : method === 'notifications' ? observer.notifications() : observer.stats();
  },
  /** Guest page: the production client (rtc-smoke-client's installPage) on this attempt's port, through its own rtc-smoke-port path. */
  attachClient(name: string, attemptId: string, player: number, runId?: string) {
    window.dispatchEvent(new MessageEvent('message', { source: window, data: { kind: 'rtc-smoke-port', player, runId }, ports: [attempts.get(key(name, attemptId))!.port] }));
    return true;
  },
  /** Host page: the sacrificial fragmentation probe on an attempt's port (the mid-transfer close). */
  probe(name: string, attemptId: string) { const k = key(name, attemptId); probes.set(k, createProbe(attempts.get(k)!.port)); probes.get(k)!.send(); return true; },
  release(name: string, attemptId: string) {
    const k = key(name, attemptId);
    probes.get(k)?.close('disposed'); probes.delete(k); observers.get(k)?.dispose(); observers.delete(k);
    relays.get(k)?.close(); relays.delete(k); attempts.get(k)?.port.close(); attempts.delete(k); return true;
  },
  disposeTransport(name: string) { const transport = owned.get(name); if (!transport) return false; owned.delete(name); controllers.delete(name); transport.dispose(); return true; },
  killHostTransport: () => settle(host!.transport.dispose()),
  /** Page MessagePorts created through MessageChannel; `open` counts those neither closed nor transferred. */
  ports: () => trackPagePorts(),
  /** workerExits counts only the owner's terminate() (the wrapper); an injected or real `error` event is separate evidence. */
  counts: () => ({ workers: workers.length, workerExits: workers.filter(w => w.terminated).length, workerErrors: workers.filter(w => w.errored).length }),
  async dispose() {
    await hostStarting;   // a start still in flight finishes first, so its Worker is disposed below as well
    for (const transport of owned.values()) transport.dispose(); owned.clear();
    if (host) await host.dispose().catch(() => {});
    for (const k of [...attempts.keys()]) { const [name, id] = k.split(':'); api.release(name!, id!); }
    return { ...api.counts(), ports: trackPagePorts() };
  }
};
window.rtcPage = api;

// TEST ONLY (Web-i Task 11): injected into the app page's main world before any page script by
// scripts/network/online-app-smoke.cjs through its session preload (online-app-probe-preload.cjs). It observes the page's own fetch,
// Worker, MessagePorts and online status; product code is unchanged. Main drains it with onlineProbe.take().
type Flags = { holdUploads: boolean; delayExitCommit: boolean; holdRestore: boolean; blockNextGrant: boolean; delayNextFetch: boolean;
  stopping: boolean; recoveryObserve: boolean; countPorts: boolean };
interface WorkerRecord { index: number; terminated: boolean; errored: boolean; runId?: string; utilityEpoch?: string; hostGeneration?: number;
  initialCaptureTick?: number; periodicCapturedTick?: number; bootstrapAfterCommit?: boolean; producerChanges: unknown[]; invalidations: string[];
  captures: { cause: string; bytes: string }[]; restores: string[]; evidence: unknown[] }
const b64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const busy = (ms: number) => { const end = performance.now() + ms; while (performance.now() < end) { /* deliberate */ } };
const probe = {
  flags: { holdUploads: false, delayExitCommit: false, holdRestore: false, blockNextGrant: false, delayNextFetch: false, stopping: false, recoveryObserve: false, countPorts: false } as Flags,
  bodies: [] as { method: string; bytes: string }[], pendingBody: undefined as string | undefined, heldUploads: 0, exitCommitDelayMs: 0,
  exitCommitAcknowledged: undefined as boolean | undefined, mainBlockedMs: 0, restoreRelease: undefined as (() => void) | undefined,
  /** The recovery gate's Worker source (observer prelude + exactly-instrumented production chunk), set by the wrapper. */
  recoveryWorkerSource: undefined as string | undefined,
  workers: [] as WorkerRecord[], ports: new Set<MessagePort>(), gone: new WeakSet<MessagePort>(), phases: [] as string[], mirrorReceipts: [] as any[],
  set(flags: Partial<Flags>) { Object.assign(probe.flags, flags); return true; },
  releaseRestore() { probe.restoreRelease?.(); return true; },
  /** Drain the queued observations; main accumulates them per Worker index (online-app-smoke.cjs absorb()). */
  take() {
    const pendingBody = probe.pendingBody; probe.pendingBody = undefined;
    return { bodies: probe.bodies.splice(0), pendingBody, heldUploads: probe.heldUploads, mainBlockedMs: probe.mainBlockedMs,
      exitCommitDelayMs: probe.exitCommitDelayMs, exitCommitAcknowledged: probe.exitCommitAcknowledged, phases: [...probe.phases], mirrorReceipts: [...probe.mirrorReceipts],
      workers: probe.workers.map(w => ({ ...w, producerChanges: w.producerChanges.splice(0), invalidations: w.invalidations.splice(0),
        captures: w.captures.splice(0), restores: w.restores.splice(0), evidence: w.evidence.splice(0) })) };
  },
  /** Only channels created after the driver armed counting (its first online action): the online stack's own ports,
   *  not React's scheduler channel or any other page-start channel that lives for the page's lifetime. */
  openPorts: () => [...probe.ports].filter(port => !probe.gone.has(port)).length,
  /** Worker exits count only the owner's own terminate() (the owner also terminates after an error event); error events
   *  are reported separately and never stand in for an exit. */
  counts() { return { workers: probe.workers.length, workerExits: probe.workers.filter(w => w.terminated).length, workerErrors: probe.workers.filter(w => w.errored).length,
    ports: probe.openPorts(), observedPagePorts: probe.ports.size }; }
};
(window as any).onlineProbe = probe;
// fetch: hold, delay and record checkpoint bodies (the old main-side fetch wrapper, now in the page that fetches).
const nativeFetch = window.fetch.bind(window), delay = (ms: number) => new Promise(done => setTimeout(done, ms));
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input instanceof Request ? input.url : input)), checkpoint = url.pathname.endsWith('/checkpoint'), method = init?.method ?? 'GET';
  if (probe.flags.delayNextFetch) { probe.flags.delayNextFetch = false; await delay(1200); }
  if (checkpoint && method === 'PUT' && probe.flags.holdUploads) {
    probe.heldUploads++; probe.pendingBody = b64(new Uint8Array(init!.body as Uint8Array));
    await new Promise((_, reject) => { const abort = () => reject(Error('held-upload-aborted')); if (init?.signal?.aborted) abort(); else init?.signal?.addEventListener('abort', abort, { once: true }); });
  }
  if (checkpoint && method === 'PUT' && probe.flags.stopping && probe.flags.delayExitCommit) {
    probe.flags.delayExitCommit = false; probe.exitCommitAcknowledged = false; const began = performance.now(); await delay(2600); probe.exitCommitDelayMs = performance.now() - began;
  }
  const response = await nativeFetch(input, init);
  if (checkpoint && method === 'PUT' && probe.flags.stopping && probe.exitCommitAcknowledged === false) probe.exitCommitAcknowledged = response.ok;
  if (checkpoint && response.ok) {
    const bytes = method === 'PUT' ? new Uint8Array(init!.body as Uint8Array) : new Uint8Array(await response.clone().arrayBuffer());
    probe.bodies.push({ method, bytes: b64(bytes) }); if (probe.bodies.length > 16) probe.bodies.shift();
    if (method === 'GET' && probe.flags.holdRestore) { probe.flags.holdRestore = false; await new Promise<void>(done => { probe.restoreRelease = done; }); }
  }
  return response;
};
// MessagePorts: online-owned channels (created once counting is armed), and which of them were closed or transferred.
const NativeChannel = window.MessageChannel;
window.MessageChannel = class extends NativeChannel {
  constructor() { super(); if (probe.flags.countPorts) { probe.ports.add(this.port1); probe.ports.add(this.port2); } }
} as typeof MessageChannel;
const close = MessagePort.prototype.close, portPost = MessagePort.prototype.postMessage as (m: unknown, t?: Transferable[]) => void;
MessagePort.prototype.close = function (this: MessagePort) { probe.gone.add(this); return close.call(this); };
const transferList = (argument: unknown): unknown[] => Array.isArray(argument) ? argument : Array.isArray((argument as any)?.transfer) ? (argument as any).transfer : [];
const transferred = (list: unknown) => { for (const item of transferList(list)) if (item instanceof MessagePort) probe.gone.add(item); };
MessagePort.prototype.postMessage = function (this: MessagePort, message: unknown, transfer?: any) { const result = portPost.call(this, message, transfer); transferred(transfer); return result; } as never;
// Workers: the old utility postMessage and message observation, on the page's Worker object.
const NativeWorker = window.Worker;
window.Worker = new Proxy(NativeWorker, { construct(Target, args) {
  // The recovery gate runs the production chunk with its observation prelude, from a blob of the bytes the wrapper hashed
  // (a module Worker's file:// script load does not pass through Electron's protocol handlers).
  if (probe.flags.recoveryObserve && probe.recoveryWorkerSource && /\/authorityWorker\.js$/.test(new URL(String(args[0]), location.href).pathname))
    args = [URL.createObjectURL(new Blob([probe.recoveryWorkerSource], { type: 'text/javascript' })), ...args.slice(1)];
  const worker: Worker = Reflect.construct(Target, args), record: WorkerRecord = { index: probe.workers.length, terminated: false, errored: false,
    producerChanges: [], invalidations: [], captures: [], restores: [], evidence: [] };
  probe.workers.push(record);
  if (probe.flags.recoveryObserve) {
    // The first message the Worker sees, before the owner's initialize; the recovery prelude consumes it. This channel
    // is the harness's own (native constructor), never counted as an online-owned port.
    const channel = new NativeChannel(); channel.port1.onmessage = event => { record.evidence.push(event.data); if (record.evidence.length > 64) record.evidence.shift(); };
    worker.postMessage({ kind: '__recovery-evidence' }, [channel.port2]);
  }
  const terminate = worker.terminate.bind(worker); worker.terminate = () => { record.terminated = true; terminate(); };
  worker.addEventListener('error', () => { record.errored = true; });
  worker.addEventListener('message', event => {
    const message = event.data;
    if (message?.kind !== 'checkpoint') return;
    const candidate = message.candidate;
    if (candidate?.bytes) { record.captures.push({ cause: candidate.cause, bytes: b64(candidate.bytes) }); if (record.captures.length > 64) record.captures.shift(); }
    if (candidate?.cause === 'initial' && candidate.capturedTick === 0) record.initialCaptureTick = 0;
    if (candidate?.cause === 'periodic' && candidate.capturedTick === 300) record.periodicCapturedTick = 300;
  });
  const post = worker.postMessage.bind(worker) as (m: any, t?: Transferable[]) => void;
  worker.postMessage = ((message: any, transfer?: Transferable[]) => {
    const delayedGrant = message?.kind === 'lease-grant' && probe.flags.blockNextGrant;
    if (delayedGrant) { probe.flags.blockNextGrant = false; const began = performance.now(); busy(25000); probe.mainBlockedMs = performance.now() - began; }
    if (message?.kind === 'initialize') { record.runId = message.sessionLease?.runId; record.utilityEpoch = message.sessionLease?.utilityEpoch; record.hostGeneration = message.hostGeneration; }
    if (message?.kind === 'command' && message.command?.kind === 'restore') record.restores.push(b64(message.command.checkpointBytes));
    if (message?.kind === 'lease-invalidate') record.invalidations.push(message.reason);
    if (message?.kind === 'bootstrap-complete') record.bootstrapAfterCommit = record.initialCaptureTick === 0 && probe.mirrorReceipts.some(m => m.runId === record.runId && m.capturedTick === 0);
    if (message?.kind === 'command') record.producerChanges.push({ kind: message.command?.kind, seatId: message.command?.seatId, player: message.command?.player, human: message.command?.human });
    post(message, transfer ?? []); transferred(transfer);
    // Keep the page's queued timeout/teardown callbacks blocked until the old Worker has examined the late reply.
    if (delayedGrant) busy(500);
  }) as typeof worker.postMessage;
  return worker;
} });
// Status: the test facade (deviation D-1) once the page creates it.
const watch = setInterval(() => {
  const facade = (window as any).__ftliteOnlineTest; if (!facade) return; clearInterval(watch);
  facade.onStatus((envelope: any) => {
    const status = envelope.status;
    if (probe.phases.at(-1) !== status.phase) { probe.phases.push(status.phase); if (probe.phases.length > 64) probe.phases.shift(); }
    const m = status.mirror?.committed;
    if (m && !probe.mirrorReceipts.some(old => old.runId === m.runId && old.hostGeneration === m.hostGeneration && old.checkpointSequence === m.checkpointSequence)) {
      probe.mirrorReceipts.push({ runId: m.runId, hostGeneration: m.hostGeneration, checkpointSequence: m.checkpointSequence, capturedTick: m.capturedTick, payloadSha256: m.payloadSha256 });
      if (probe.mirrorReceipts.length > 64) probe.mirrorReceipts.shift();
    }
  });
}, 20);
export {};

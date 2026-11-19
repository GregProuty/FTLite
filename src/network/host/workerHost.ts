import { boundedHostBytes, isHostCommand, positiveSafeInteger, SESSION_PROTOCOL_VERSION, type HostCommandInput, type HostResponse } from '../../shared/netSession';
import { isHostIdentity, isHostResponse, isCheckpointDelivery, matchesIdentity, matchesSessionLease, isLeaseFenceReason, validPeer, validStreamAttachmentOptions,
  type HostIdentity } from '../../shared/hostProcessProtocol';
import { copyCheckpoint, isCaptureCause, type CheckpointCandidate } from '../../shared/sessionCheckpoint';
import { validateSessionLeaseIdentity, validateLeaseRenewalRequest, type LeaseRenewalRequest } from '../../shared/sessionLease';
import { validateLeaseGrant } from '../../shared/roomSession';
import { createPageTransport, type PageTransport, type PageTransportOptions } from '../transport/pageTransport';
import type { HostProcessHandle, HostProcessOptions } from './contracts';

export type { HostProcessHandle, HostProcessOptions } from './contracts';
type Unsubscribe = () => void;
export interface HostWorker {
  postMessage(message: unknown, transfer?: MessagePort[]): void;
  onMessage(cb: (message: any) => void): Unsubscribe;
  onExit(cb: () => void): Unsubscribe;
  kill(): void;
}
/** Structural platform seam: tests exercise the same owner without a real Worker. */
export interface HostPlatform {
  spawn(): HostWorker;
  createTransport(identity: HostIdentity): Pick<PageTransport, 'controller' | 'connect' | 'onExit' | 'dispose'>;
  createChannel(): { port1: MessagePort; port2: MessagePort };
  onSuspend(cb: () => void): Unsubscribe;
  onResume?(cb: () => void): Unsubscribe;
}
export interface WorkerLike {
  postMessage(message: unknown, transfer: Transferable[]): void;
  terminate(): void;
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
}
/** The page starts the host's simulation only while hosting (web build spec §3.2). */
export function defaultAuthorityWorker(): WorkerLike {
  return new Worker(new URL('../../worker/authorityWorker.ts', import.meta.url), { type: 'module' });
}
/** onExit fires once: on the Worker's error or messageerror event, or after terminate(). */
export function spawnHostWorker(create: () => WorkerLike = defaultAuthorityWorker): HostWorker {
  const worker = create(), exits = new Set<() => void>();
  let exited = false, killed = false;
  function exit(): void {
    if (exited) return; exited = true;
    worker.removeEventListener('error', failed); worker.removeEventListener('messageerror', failed);
    for (const cb of [...exits]) { try { cb(); } catch { /* isolate owners */ } }
    exits.clear();
  }
  function failed(event: { preventDefault?(): void }): void {
    event.preventDefault?.();
    if (!killed) { killed = true; try { worker.terminate(); } catch { /* already gone */ } }
    exit();
  }
  worker.addEventListener('error', failed); worker.addEventListener('messageerror', failed);
  return {
    postMessage(message, transfer = []) { if (exited) throw Error('worker-exited'); worker.postMessage(message, transfer); },
    onMessage(cb) { const listener = (event: MessageEvent) => { if (!exited) cb(event.data); }; worker.addEventListener('message', listener); return () => worker.removeEventListener('message', listener); },
    onExit(cb) { if (exited) { cb(); return () => {}; } exits.add(cb); return () => { exits.delete(cb); }; },
    // Idempotent: a second kill before the exit microtask has run must not terminate twice.
    kill() { if (exited || killed) return; killed = true; try { worker.terminate(); } catch { /* already gone */ } queueMicrotask(exit); }
  };
}
export function createWorkerHostPlatform(options: { lifecycle: { onSuspend(cb: () => void): Unsubscribe; onResume(cb: () => void): Unsubscribe };
  createWorker?: () => WorkerLike; transport?: PageTransportOptions }): HostPlatform {
  return {
    spawn: () => spawnHostWorker(options.createWorker),
    createTransport: identity => createPageTransport(identity, options.transport),
    createChannel: () => new MessageChannel(),
    onSuspend: cb => options.lifecycle.onSuspend(cb),
    onResume: cb => options.lifecycle.onResume(cb)
  };
}
const close = (port: MessagePort) => { try { port.close(); } catch { /* a transferred endpoint may already be detached */ } };

/** The platform-neutral owner of the host Worker (web build spec §3.2). Readiness has two parts now: the Worker's
 *  ready and the page transport's transport-ready answer over the Worker's transport port. */
export async function startWorkerHost(options: HostProcessOptions, platform: HostPlatform): Promise<HostProcessHandle> {
  if (!isHostIdentity(options)) throw Error('invalid-identity');
  if (options.sessionLease !== undefined && (!validateSessionLeaseIdentity(options.sessionLease)
    || options.sessionLease.hostGeneration !== options.hostGeneration)) throw Error('invalid-lease');
  const sessionLease = options.sessionLease && { ...options.sessionLease };
  if (options.signal?.aborted) throw Error('cancelled');
  const identity: HostIdentity = { modeId: options.modeId, schemaVersion: options.schemaVersion, simVersion: options.simVersion,
    contentDigest: options.contentDigest, hostGeneration: options.hostGeneration };
  const worker = platform.spawn();
  let transport: ReturnType<HostPlatform['createTransport']>;
  try { transport = platform.createTransport(identity); } catch (cause) { worker.kill(); throw cause; }
  let stopped = false, stopping = false, ready = false, workerReady = false, bridgeReady = false, connected = false;
  let nextId = 0, disposal: Promise<void> | undefined, exitReason: string | undefined;
  const removers: Unsubscribe[] = [], exits = new Set<(reason: string) => void>(), ownedPorts = new Set<MessagePort>();
  const renewals = new Set<(request: LeaseRenewalRequest) => void>();
  const checkpoints = new Set<(candidate: CheckpointCandidate) => void>();
  let latestCheckpoint: CheckpointCandidate | undefined;
  function adoptCheckpoint(candidate: CheckpointCandidate): void {
    // Each handle owns one Worker epoch. Requested and push deliveries share IDs.
    if (latestCheckpoint && candidate.captureId <= latestCheckpoint.captureId) return;
    latestCheckpoint = copyCheckpoint(candidate);
    for (const cb of [...checkpoints]) { try { cb(copyCheckpoint(candidate)); } catch { /* isolate observers */ } }
  }
  let renewal: LeaseRenewalRequest | undefined;
  const pending = new Map<number, { kind: 'response' | 'attached' | 'captured'; resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  let resolveReady!: (handle: HostProcessHandle) => void, rejectReady!: (error: Error) => void;
  const starting = new Promise<HostProcessHandle>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const readyTimer = setTimeout(() => stop('ready-timeout'), 5000);
  function stop(reason: string): void {
    if (stopped) return; stopped = true; stopping = true; exitReason = reason;
    clearTimeout(readyTimer);
    renewals.clear(); renewal = undefined;
    checkpoints.clear(); latestCheckpoint = undefined;
    for (const remove of removers.splice(0)) { try { remove(); } catch { /* release remaining owners */ } }
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error(reason)); } pending.clear();
    for (const port of ownedPorts) close(port); ownedPorts.clear();
    try { transport.dispose(); } catch { /* still terminate the Worker */ }
    try { worker.kill(); } catch { /* already exited */ }
    if (!ready) rejectReady(Error(reason));
    for (const callback of [...exits]) { try { callback(reason); } catch { /* isolate observers */ } } exits.clear();
  }
  function checkReady(): void {
    if (!stopped && workerReady && bridgeReady) { ready = true; clearTimeout(readyTimer); resolveReady(handle); }
  }
  function connect(): void {
    if (stopped || connected || !workerReady) return; connected = true;
    try {
      const { port1, port2 } = platform.createChannel(); ownedPorts.add(port1); ownedPorts.add(port2);
      worker.postMessage({ kind: 'transport', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity }, [port1]);
      ownedPorts.delete(port1);
      transport.connect(port2); ownedPorts.delete(port2);
    } catch { stop('transfer-failed'); }
  }
  function send<T>(kind: 'response' | 'attached' | 'captured', message: (id: number) => unknown, ports?: MessagePort[]): Promise<T> {
    if (stopped || (stopping && kind !== 'response')) return Promise.reject(Error('disposed'));
    if (pending.size >= 64 || nextId >= Number.MAX_SAFE_INTEGER) return Promise.reject(Error('request-capacity'));
    const id = ++nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => stop('request-timeout'), 5000);
      pending.set(id, { kind, resolve, reject, timer });
      try { worker.postMessage(message(id), ports); if (ports) for (const port of ports) ownedPorts.delete(port); }
      catch { stop('transfer-failed'); }
    });
  }
  function request(command: HostCommandInput, duringDispose = false): Promise<HostResponse> {
    if (stopped || (stopping && !duringDispose)) return Promise.reject(Error('disposed'));
    // Validate caller payload before allocating a stamp. Runtime JS callers cannot inject IDs.
    if (!command || Object.hasOwn(command, 'requestId') || Object.hasOwn(command, 'hostGeneration')
      || !isHostCommand({ ...command, requestId: 1, hostGeneration: identity.hostGeneration })) return Promise.reject(Error('invalid-command'));
    const copy = command.kind === 'start' ? { ...command, initBytes: new Uint8Array(command.initBytes) }
      : command.kind === 'restore' ? { ...command, checkpointBytes: new Uint8Array(command.checkpointBytes) } : { ...command };
    return send('response', requestId => ({ kind: 'command', command: { ...copy, requestId, hostGeneration: identity.hostGeneration } }));
  }
  const handle: HostProcessHandle = {
    onCheckpoint(callback) {
      if (stopped) return () => {};
      if (checkpoints.size >= 64) throw Error('request-capacity');
      checkpoints.add(callback); if (latestCheckpoint) callback(copyCheckpoint(latestCheckpoint));
      return () => { checkpoints.delete(callback); };
    },
    ackCheckpoint(captureId) {
      if (stopped || stopping || !positiveSafeInteger(captureId) || !latestCheckpoint || captureId > latestCheckpoint.captureId) return Promise.reject(Error('capture-unavailable'));
      return send<HostResponse>('response', requestId => ({ kind: 'ack-checkpoint', requestId, hostGeneration: identity.hostGeneration, captureId }))
        .then(reply => { if (!reply.ok) throw Error('capture-unavailable'); });
    },
    captureCheckpoint(cause) {
      if (stopped || stopping || !isCaptureCause(cause)) return Promise.reject(Error('capture-unavailable'));
      return send('captured', requestId => ({ kind: 'capture-checkpoint', requestId, hostGeneration: identity.hostGeneration, cause }));
    },
    onLeaseRequest(callback) {
      if (stopped || !sessionLease) return () => {};
      if (renewals.size >= 64) throw Error('request-capacity');
      renewals.add(callback); if (renewal) callback({ ...renewal });
      return () => { renewals.delete(callback); };
    },
    applyLease(request, grant) {
      if (!renewal || !validateLeaseRenewalRequest(request) || !validateLeaseGrant(grant)
        || Object.keys(renewal).some(k => request[k as keyof LeaseRenewalRequest] !== renewal![k as keyof LeaseRenewalRequest])) return Promise.reject(Error('stale-lease'));
      renewal = undefined;
      return privateRequest('lease-grant', { request: { ...request }, grant: { ...grant } });
    },
    invalidateLease(reason) {
      if (!isLeaseFenceReason(reason)) return Promise.reject(Error('invalid-lease'));
      renewal = undefined; return privateRequest('lease-invalidate', { sessionLease, reason });
    },
    completeBootstrap() { return privateRequest('bootstrap-complete', { sessionLease }); },
    transport: transport.controller,
    request,
    attachPeer(peer, players, port, options) {
      if (stopped || stopping) { close(port); return Promise.reject(Error('disposed')); }
      if (!validPeer(peer, players) || !validStreamAttachmentOptions(options)) { close(port); return Promise.reject(Error('invalid-peer')); }
      ownedPorts.add(port);
      const result = send<void>('attached', requestId => ({ kind: 'attach', peer, players: [...players], requestId, hostGeneration: identity.hostGeneration,
        ...(options ? { options: { ...options } } : {}) }), [port]);
      // Capacity refusal happens before transfer and must release the offered endpoint.
      return result.catch(error => { if (ownedPorts.delete(port)) close(port); throw error; });
    },
    onExit(callback) {
      if (exitReason) { callback(exitReason); return () => {}; }
      exits.add(callback); return () => { exits.delete(callback); };
    },
    dispose() {
      if (disposal) return disposal;
      if (stopped) return Promise.resolve();
      stopping = true;
      disposal = new Promise<void>(resolve => {
        const timer = setTimeout(() => { stop('disposed'); resolve(); }, 250);
        request({ kind: 'dispose' }, true).catch(() => {}).finally(() => { clearTimeout(timer); stop('disposed'); resolve(); });
      });
      return disposal;
    }
  };
  function privateRequest(kind: string, data: object): Promise<void> {
    if (!sessionLease || stopped || stopping) return Promise.reject(Error('lease-unavailable'));
    return send<HostResponse>('response', requestId => ({ kind, requestId, hostGeneration: identity.hostGeneration, ...data }))
      .then(reply => { if (!reply.ok) throw Error('lease-unavailable'); });
  }
  removers.push(worker.onExit(() => stop('worker-exit')), transport.onExit(() => stop('transport-exit')),
    worker.onMessage(message => {
      if (stopped) return;
      if (!message || typeof message !== 'object') { stop('protocol-failure'); return; }
      const generation = message.kind === 'response' ? message.response?.hostGeneration : message.hostGeneration;
      if (positiveSafeInteger(generation) && generation !== identity.hostGeneration) return;
      if (message.kind === 'checkpoint' || message.kind === 'captured') {
        if (generation !== identity.hostGeneration || !isCheckpointDelivery(message)) { stop('protocol-failure'); return; }
        if (message.kind === 'checkpoint') { adoptCheckpoint(message.candidate); return; }
        const item = pending.get(message.requestId);
        if (!item || item.kind !== 'captured') { stop('protocol-failure'); return; }
        pending.delete(message.requestId); clearTimeout(item.timer);
        if (message.ok) { adoptCheckpoint(message.candidate); item.resolve(copyCheckpoint(message.candidate)); }
        else item.reject(Error('capture-unavailable'));
        return;
      }
      if (message.kind === 'lease-request') {
        const r = message.request;
        if (!sessionLease || !validateLeaseRenewalRequest(r)) { stop('protocol-failure'); return; }
        const { nonce: _nonce, ...leaseIdentity } = r;
        if (!matchesSessionLease(leaseIdentity, sessionLease!) || Object.keys(message).some(k => !['kind', 'hostGeneration', 'request'].includes(k))) { stop('protocol-failure'); return; }
        renewal = { ...r };
        for (const cb of [...renewals]) { try { cb({ ...r }); } catch { /* isolate private observers */ } }
        return;
      }
      if (message.kind === 'ready') {
        if (workerReady || !matchesIdentity(message, identity)) { stop('incompatible-ready'); return; }
        workerReady = true; connect(); checkReady(); return;
      }
      if (message.kind === 'transport-ready' && connected && !bridgeReady && message.hostGeneration === identity.hostGeneration) { bridgeReady = true; checkReady(); return; }
      if (message.kind === 'transport-ready' && !connected) return;
      if (message.kind === 'fatal') { stop('worker-protocol-failure'); return; }
      if (message.kind === 'crash' && message.hostGeneration === identity.hostGeneration) {
        try {
          const record = message.record;
          if (!record || (record.checkpoint !== null && !boundedHostBytes(record.checkpoint))
            || new TextEncoder().encode(JSON.stringify(record.diagnostic)).byteLength > 65536) { stop('protocol-failure'); return; }
          options.onCrash?.({ checkpoint: record.checkpoint === null ? null : new Uint8Array(record.checkpoint), diagnostic: record.diagnostic });
        } catch { /* fault observers cannot prevent teardown */ }
        finally { stop('authority-crash'); }
        return;
      }
      const response = message.kind === 'response' ? message.response : message;
      if ((message.kind !== 'response' && message.kind !== 'attached') || !positiveSafeInteger(response?.requestId)
        || response.hostGeneration !== identity.hostGeneration || (message.kind === 'response' ? !isHostResponse(response) : typeof message.ok !== 'boolean')) {
        stop('protocol-failure'); return;
      }
      const item = pending.get(response.requestId);
      if (!item || item.kind !== message.kind) { stop('protocol-failure'); return; }
      pending.delete(response.requestId); clearTimeout(item.timer);
      if (message.kind === 'attached') { if (message.ok) item.resolve(undefined); else item.reject(Error('peer-unavailable')); }
      else item.resolve(response);
    }), platform.onSuspend(() => {
      if (sessionLease && ready && !stopping) { void handle.invalidateLease('suspended').catch(() => stop('suspend-failed')); return; }
      if (ready && !stopping) void request({ kind: 'pause', reason: 'system-suspend' }).then(response => { if (!response.ok) stop('suspend-failed'); }, () => stop('suspend-failed'));
      else stop('system-suspend');
    }));
  if (platform.onResume) removers.push(platform.onResume(() => {
    if (sessionLease && ready && !stopping) void handle.invalidateLease('resumed').catch(() => stop('resume-failed'));
  }));
  const abort = () => stop('cancelled');
  options.signal?.addEventListener('abort', abort, { once: true });
  removers.push(() => options.signal?.removeEventListener('abort', abort));
  if (options.signal?.aborted) abort();
  if (!stopped) {
    try { worker.postMessage({ kind: 'initialize', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity, ...(sessionLease ? { sessionLease } : {}) }); }
    catch { stop('initialize-failed'); }
  }
  return starting;
}

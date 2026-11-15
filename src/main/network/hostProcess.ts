import type { MessagePortMain } from 'electron';
import { boundedHostBytes, isHostCommand, positiveSafeInteger, SESSION_PROTOCOL_VERSION, type HostCommandInput, type HostResponse } from '../../shared/netSession';
import { isHostIdentity, isHostResponse, matchesIdentity, validPeer, validStreamAttachmentOptions, type HostIdentity, type StreamAttachmentOptions } from '../../shared/hostProcessProtocol';

type Unsubscribe = () => void;
export interface HostProcessOptions extends HostIdentity {
  signal?: AbortSignal;
  onCrash?(record: { checkpoint: Uint8Array | null; diagnostic: unknown }): void;
}
export interface HostProcessHandle {
  request(command: HostCommandInput): Promise<HostResponse>;
  attachPeer(peer: string, players: readonly number[], port: MessagePortMain, options?: StreamAttachmentOptions): Promise<void>;
  onExit(callback: (reason: string) => void): Unsubscribe;
  dispose(): Promise<void>;
}
/** Structural platform seam: tests exercise the same owner without loading native Electron. */
export interface HostPlatform {
  spawn(): { postMessage(message: unknown, ports?: MessagePortMain[]): void; onMessage(cb: (message: any) => void): Unsubscribe; onExit(cb: () => void): Unsubscribe; kill(): void };
  createTransport(identity: HostIdentity): { load(): Promise<void>; connect(port: MessagePortMain): void; onReady(cb: () => void): Unsubscribe; onExit(cb: () => void): Unsubscribe; dispose(): void };
  createChannel(): { port1: MessagePortMain; port2: MessagePortMain };
  onSuspend(cb: () => void): Unsubscribe;
}
const close = (port: MessagePortMain) => { try { port.close(); } catch { /* a transferred endpoint may already be detached */ } };

export async function startHostProcess(options: HostProcessOptions, suppliedPlatform?: HostPlatform): Promise<HostProcessHandle> {
  if (!isHostIdentity(options)) throw Error('invalid-identity');
  if (options.signal?.aborted) throw Error('cancelled');
  const platform = suppliedPlatform ?? (await import('./transportWindow')).createHostPlatform();
  if (options.signal?.aborted) throw Error('cancelled');
  const identity: HostIdentity = { modeId: options.modeId, schemaVersion: options.schemaVersion, simVersion: options.simVersion,
    contentDigest: options.contentDigest, hostGeneration: options.hostGeneration };
  const utility = platform.spawn();
  let transport: ReturnType<HostPlatform['createTransport']>;
  try { transport = platform.createTransport(identity); } catch (cause) { utility.kill(); throw cause; }
  let stopped = false, stopping = false, ready = false, utilityReady = false, windowReady = false, bridgeReady = false, connected = false;
  let nextId = 0, disposal: Promise<void> | undefined, exitReason: string | undefined;
  const removers: Unsubscribe[] = [], exits = new Set<(reason: string) => void>(), ownedPorts = new Set<MessagePortMain>();
  const pending = new Map<number, { kind: 'response' | 'attached'; resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  let resolveReady!: (handle: HostProcessHandle) => void, rejectReady!: (error: Error) => void;
  const starting = new Promise<HostProcessHandle>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const readyTimer = setTimeout(() => stop('ready-timeout'), 5000);
  function stop(reason: string): void {
    if (stopped) return; stopped = true; stopping = true; exitReason = reason;
    clearTimeout(readyTimer);
    for (const remove of removers.splice(0)) { try { remove(); } catch { /* release remaining owners */ } }
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error(reason)); } pending.clear();
    for (const port of ownedPorts) close(port); ownedPorts.clear();
    try { transport.dispose(); } catch { /* still terminate utility */ }
    try { utility.kill(); } catch { /* already exited */ }
    if (!ready) rejectReady(Error(reason));
    for (const callback of [...exits]) { try { callback(reason); } catch { /* isolate observers */ } } exits.clear();
  }
  function checkReady(): void {
    if (!stopped && utilityReady && windowReady && bridgeReady) {
      ready = true; clearTimeout(readyTimer); resolveReady(handle);
    }
  }
  function connect(): void {
    if (stopped || connected || !utilityReady || !windowReady) return; connected = true;
    try {
      const { port1, port2 } = platform.createChannel(); ownedPorts.add(port1); ownedPorts.add(port2);
      utility.postMessage({ kind: 'transport', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity }, [port1]);
      ownedPorts.delete(port1);
      transport.connect(port2); ownedPorts.delete(port2);
    } catch { stop('transfer-failed'); }
  }
  function send<T>(kind: 'response' | 'attached', message: (id: number) => unknown, ports?: MessagePortMain[]): Promise<T> {
    if (stopped || (stopping && kind !== 'response')) return Promise.reject(Error('disposed'));
    if (pending.size >= 64 || nextId >= Number.MAX_SAFE_INTEGER) return Promise.reject(Error('request-capacity'));
    const id = ++nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => stop('request-timeout'), 5000);
      pending.set(id, { kind, resolve, reject, timer });
      try { utility.postMessage(message(id), ports); if (ports) for (const port of ports) ownedPorts.delete(port); }
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
  removers.push(utility.onExit(() => stop('utility-exit')), transport.onExit(() => stop('transport-exit')),
    transport.onReady(() => { windowReady = true; connect(); checkReady(); }),
    utility.onMessage(message => {
      if (stopped) return;
      if (!message || typeof message !== 'object') { stop('protocol-failure'); return; }
      const generation = message.kind === 'response' ? message.response?.hostGeneration : message.hostGeneration;
      if (positiveSafeInteger(generation) && generation !== identity.hostGeneration) return;
      if (message.kind === 'ready') {
        if (utilityReady || !matchesIdentity(message, identity)) { stop('incompatible-ready'); return; }
        utilityReady = true; connect(); checkReady(); return;
      }
      if (message.kind === 'transport-ready' && connected && !bridgeReady && message.hostGeneration === identity.hostGeneration) { bridgeReady = true; checkReady(); return; }
      if (message.kind === 'fatal') { stop('utility-protocol-failure'); return; }
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
      if (ready && !stopping) void request({ kind: 'pause', reason: 'system-suspend' }).then(response => { if (!response.ok) stop('suspend-failed'); }, () => stop('suspend-failed'));
      else stop('system-suspend');
    }));
  const abort = () => stop('cancelled');
  options.signal?.addEventListener('abort', abort, { once: true });
  removers.push(() => options.signal?.removeEventListener('abort', abort));
  if (options.signal?.aborted) abort();
  if (!stopped) {
    try { utility.postMessage({ kind: 'initialize', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity }); }
    catch { stop('initialize-failed'); }
    if (!stopped) void transport.load().catch(() => stop('transport-load-failed'));
  }
  return starting;
}

import { createHash, randomBytes } from 'node:crypto';
import type { MessagePortMain } from 'electron';
import { RoomServiceClientError, type RoomServiceClient, type RoomServiceEvent } from '../../network/session/serviceClient';
import { RTC_MAX_HEADER_BYTES, RTC_MAX_PACKET_BYTES } from '../../network/rtc/contracts';
import { copyOnlineStatus, isOnlineErrorCode, validateOnlineAction, type OnlineAction, type OnlineErrorCode, type OnlinePortDescriptor, type OnlineResult, type OnlineStatus } from '../../shared/onlineSession';
import { SERVICE_ERROR_RETRYABLE, type CommittedStart, type LeaseGrant, type RoomSnapshot, type SeatSession } from '../../shared/roomSession';
import type { HostIdentity } from '../../shared/hostProcessProtocol';
import type { HostProcessHandle } from './hostProcess';
import type { TransportController } from './rtcTransport';
import { resolveOnlineConfig, type OnlineConfig } from './onlineConfig';
import { validateSavedSeat, type SavedSeatV1, type SeatStore } from './seatStore';
import { createOnlinePeers, type OnlinePeer } from './onlinePeers';
import { createOnlineIce, type OnlineIce } from './onlineIce';
import { createOnlineRetry, onlineFault, type OnlineClock, type OnlineScheduler } from './onlineRetry';
import { sectorCompatibility, sectorInit, sectorJoinCompatibilities, validateCommittedSectorStart, validateSectorMirror } from './onlineSector';
import { createOnlineMirrors, type OnlineMirrors } from './onlineMirrors';
import { validateMirror, type MirrorStore, type SessionMirror } from './mirrorStore';
import type { LeaseRenewalRequest } from '../../shared/sessionLease';

export type { OnlineClock, OnlineScheduler } from './onlineRetry';
type Unsubscribe = () => void;
export interface OwnedOnlineTransport { controller: TransportController; onExit(callback: () => void): Unsubscribe; dispose(): Promise<void> }
export interface OnlinePlatform {
  startLeasedHost(identity: HostIdentity, signal: AbortSignal, sessionLease: import('../../shared/sessionLease').SessionLeaseIdentity): Promise<HostProcessHandle>;
  createTransport(identity: HostIdentity): Promise<OwnedOnlineTransport>;
  channel(): { port1: MessagePortMain; port2: MessagePortMain };
  publishPort(descriptor: OnlinePortDescriptor, port: MessagePortMain): void;
  onVisibleGone(callback: () => void): Unsubscribe;
}
export interface OnlineSessionDeps {
  config: OnlineConfig; seatStore: SeatStore; mirrorStore: MirrorStore; service(): RoomServiceClient; platform: OnlinePlatform;
  clock: OnlineClock; scheduler: OnlineScheduler; nonce(): string;
}
export interface OnlineSessionOwner {
  dispatch(action: OnlineAction): Promise<OnlineResult>; status(): OnlineStatus;
  subscribe(callback: (status: OnlineStatus) => void): Unsubscribe; suspend(): Promise<void>; resume(): Promise<void>; prepareExit(): Promise<void>; dispose(): Promise<void>;
}
const codeOf = (error: unknown): OnlineErrorCode => {
  const code = (error as { code?: unknown } | null)?.code;
  return isOnlineErrorCode(code) ? code : 'unavailable';
};
const close = (port: MessagePortMain) => { try { port.close(); } catch {} };

/** Main-only credentials and resource ownership. Renderer progress never grants gameplay authority. */
export function createOnlineSession(deps: OnlineSessionDeps): OnlineSessionOwner {
  const { platform, scheduler, clock } = deps;
  const resolved = deps.config.enabled ? resolveOnlineConfig({ packaged: false, ...(deps.config.iceMode === 'loopback' ? { localServiceUrl: deps.config.baseUrl } : { serviceUrl: deps.config.baseUrl }) }) : deps.config;
  const config: OnlineConfig = resolved.enabled && deps.config.enabled && (resolved.iceMode !== deps.config.iceMode || resolved.allowInsecureLocalhost !== deps.config.allowInsecureLocalhost) ? { enabled: false } : resolved;
  let disposed = false, epoch = 0, attachmentEpoch = 0, operation: AbortController | undefined;
  let factories = 0, retiring: Promise<void> | undefined, disposal: Promise<void> | undefined, forgetting: Promise<OnlineResult> | undefined;
  let saved: SavedSeatV1 | null = null, readyValue: boolean | undefined, readyWork: Promise<OnlineResult> | undefined;
  let mirrorReceipt: number | null = null;
  let rehostWork: Promise<OnlineResult> | undefined, exitWork: Promise<void> | undefined;
  let value: OnlineStatus = { phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: false, actions: [] };
  const listeners = new Set<(status: OnlineStatus) => void>(), retry = createOnlineRetry(clock, scheduler);
  type Context = { epoch: number; abort: AbortController; service: RoomServiceClient; seat?: SeatSession; transport?: OwnedOnlineTransport; host?: HostProcessHandle;
    peers?: ReturnType<typeof createOnlinePeers>; ice?: OnlineIce; removers: Unsubscribe[]; gameRemovers: Unsubscribe[]; ports: Set<MessagePortMain>; timers: Set<unknown>;
    gameEpoch: number; gameRetiring?: Promise<void>; claiming?: boolean; claimSnapshot?: RoomSnapshot;
    starting?: Promise<void>; committedHash?: string; active: boolean; authorityReady?: boolean; recovering: boolean; attached: Set<string>;
    synced?: () => void; syncedPromise?: Promise<void>; lease?: LeaseGrant; cleanup?: Promise<void>; mirrors?: OnlineMirrors; renewal?: AbortController; explicitStart?: boolean; captureWork?: Promise<void>; graceful?: Promise<void> };
  let context: Context | undefined;
  const current = (c: Context) => !disposed && context === c && epoch === c.epoch && !c.abort.signal.aborted;
  const check = (c: Context) => { if (!current(c)) throw c.abort.signal.reason ?? onlineFault('cancelled'); };
  const gameCurrent = (c: Context, generation: number) => current(c) && c.gameEpoch === generation;
  const checkGame = (c: Context, generation: number) => { check(c); if (c.gameEpoch !== generation) throw onlineFault('cancelled'); };
  function emit(update: Partial<OnlineStatus> = {}) {
    if (update.mirror) mirrorReceipt = update.mirror.receivedAgeMs === null ? null : clock.nowMs() - update.mirror.receivedAgeMs;
    value = { ...value, ...update };
    value.mirror = { ...value.mirror, receivedAgeMs: mirrorReceipt === null ? null : Math.max(0, clock.nowMs() - mirrorReceipt) };
    const idle = value.phase === 'idle' || value.phase === 'error';
    const canStart = value.role === 'host' && value.phase === 'lobby' && !!value.snapshot?.seats.every(s => !s.occupied || s.ready && s.connected) && !!context?.peers?.allReady();
    value.actions = !config.enabled || disposed ? ['forget-seat'] : idle ? ['host', 'join', ...(saved ? ['reconnect', 'retry'] as const : []), 'forget-seat']
      : value.phase === 'saved' ? ['reconnect', ...(context?.seat && !context.claiming && value.snapshot?.phase === 'lost' && value.mirror.committed && value.snapshot.seats[value.ownSeat!]?.occupied ? ['rehost'] as const : []), 'leave', 'forget-seat']
      : value.phase === 'lobby' ? ['ready', ...(canStart ? ['start'] as const : []), ...(value.role === 'host' ? ['remove-seat'] as const : []), 'leave', 'forget-seat'] : ['leave', 'forget-seat'];
    for (const cb of [...listeners]) { try { cb(copyOnlineStatus(value)); } catch {} }
  }
  function timer(c: Context, fn: () => void, ms: number) {
    const id = scheduler.setTimeout(() => { c.timers.delete(id); if (current(c)) fn(); }, Math.max(0, ms)); c.timers.add(id); return id;
  }
  async function wait<T>(c: Context, promise: Promise<T>, timeout = 5000): Promise<T> {
    check(c); let rejectAbort!: (reason: unknown) => void;
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(c.abort.signal.reason ?? onlineFault('cancelled'));
    c.abort.signal.addEventListener('abort', onAbort, { once: true });
    const timeoutId = scheduler.setTimeout(() => rejectAbort(onlineFault('timeout')), timeout);
    try { const result = await Promise.race([promise, aborted]); check(c); return result; }
    finally { scheduler.clearTimeout(timeoutId); c.abort.signal.removeEventListener('abort', onAbort); }
  }
  async function acquire<T extends { dispose(): Promise<void> }>(c: Context, factory: () => Promise<T>, adopt: (resource: T) => void): Promise<T> {
    check(c); if (factories >= 4) throw onlineFault('capacity'); factories++;
    const gameEpoch = c.gameEpoch;
    const produced = Promise.resolve().then(() => { checkGame(c, gameEpoch); return factory(); }).then(async resource => {
      if (!current(c) || c.gameEpoch !== gameEpoch) { await resource.dispose(); throw onlineFault('cancelled'); }
      adopt(resource); return resource;
    }).finally(() => { factories--; });
    return wait(c, produced);
  }
  function cleanup(c: Context): Promise<void> {
    if (c.cleanup) return c.cleanup;
    c.abort.abort(onlineFault('cancelled'));
    c.renewal?.abort(); c.mirrors?.dispose();
    c.ice?.dispose();
    for (const off of c.removers.splice(0)) { try { off(); } catch {} }
    for (const off of c.gameRemovers.splice(0)) { try { off(); } catch {} }
    for (const id of c.timers) scheduler.clearTimeout(id); c.timers.clear();
    for (const port of c.ports) close(port); c.ports.clear();
    c.service.close();
    c.cleanup = Promise.allSettled([c.gameRetiring, c.peers?.dispose(), c.host?.dispose(), c.transport?.dispose()]).then(() => {});
    return c.cleanup;
  }
  function stop(reason?: OnlineErrorCode, release = false): Promise<void> {
    epoch++; operation?.abort(onlineFault('cancelled')); operation = undefined; retry.cancel(); readyValue = undefined; readyWork = undefined;
    const old = context; context = undefined;
    if (old && release && old.seat?.seatId === old.seat?.snapshot.hostSeatId && old.seat?.snapshot.phase === 'active') {
      // Request is issued before closing its socket; cleanup does not wait on a lost server.
      void old.service.request({ type: 'host-release' }).catch(() => {});
    }
    const retain = reason && value.snapshot && value.snapshot.phase !== 'lobby';
    emit({ phase: retain ? 'saved' : reason ? 'error' : 'idle', ...(retain ? {} : { role: null, ownSeat: null, snapshot: null }), attachmentEpoch: 0, error: reason ?? null, retryAtMs: null });
    const pending = Promise.allSettled([retiring, old ? cleanup(old) : undefined]).then(() => {});
    retiring = pending;
    void pending.then(() => { if (retiring === pending) retiring = undefined; });
    return pending;
  }
  function fail(c: Context, code: OnlineErrorCode, cause?: RoomServiceClientError) {
    if (!current(c)) return;
    const guest = c.seat && c.seat.seatId !== c.seat.snapshot.hostSeatId;
    if (c.recovering) {
      const serviceCode = code === 'transport-lost' ? 'unavailable' : code;
      c.abort.abort(cause ?? (serviceCode in SERVICE_ERROR_RETRYABLE
        ? new RoomServiceClientError({ code: serviceCode as keyof typeof SERVICE_ERROR_RETRYABLE, retryable: SERVICE_ERROR_RETRYABLE[serviceCode as keyof typeof SERVICE_ERROR_RETRYABLE] }) : onlineFault(code)));
      void cleanup(c); return;
    }
    if (c.seat && (c.active || value.phase === 'saved' || value.phase === 'rehosting') && ['host-lost', 'lease-expired', 'transport-lost', 'suspended', 'clock-discontinuity', 'unavailable', 'timeout'].includes(code)) {
      savedState(c, code);
      if (guest && ['unavailable', 'timeout', 'transport-lost'].includes(code)) {
        void c.gameRetiring?.then(() => { if (current(c) && value.phase === 'saved' && !operation && !exitWork) void dispatch({ type: 'retry' }); });
      }
      return;
    }
    if (guest && saved && (code === 'unavailable' || code === 'timeout' || code === 'transport-lost')) {
      const retiredEpoch = epoch + 1;
      void stop().then(() => { if (!disposed && epoch === retiredEpoch && !context && !operation) void dispatch({ type: 'retry' }); });
    } else void stop(code);
  }
  function updateSnapshot(c: Context, snapshot: RoomSnapshot) {
    check(c); sectorInit(snapshot);
    if (snapshot.hostGeneration < c.seat!.snapshot.hostGeneration) return;
    c.seat!.snapshot = structuredClone(snapshot);
    if (snapshot.phase === 'lost' || snapshot.phase === 'ended') { emit({ snapshot }); savedState(c, 'host-lost'); return; }
    emit({ snapshot }); void c.peers?.reconcile();
  }
  function retireGame(c: Context): Promise<void> {
    c.gameEpoch++;
    c.ice?.invalidate();
    const host = c.host, transport = c.transport, peers = c.peers;
    c.host = undefined; c.transport = undefined; c.peers = undefined; c.active = false; c.authorityReady = false; c.starting = undefined;
    c.renewal?.abort(); c.renewal = undefined; c.lease = undefined;
    for (const off of c.gameRemovers.splice(0)) { try { off(); } catch {} }
    for (const id of c.timers) scheduler.clearTimeout(id); c.timers.clear();
    for (const port of c.ports) close(port); c.ports.clear(); c.attached.clear();
    // Queue invalidation before native disposal; the utility is the permission owner.
    if (host) void host.invalidateLease('service-fenced').catch(() => {});
    return c.gameRetiring = Promise.allSettled([c.gameRetiring, peers?.dispose(), host?.dispose(), transport?.dispose()]).then(() => {});
  }
  function savedState(c: Context, error: OnlineErrorCode = 'host-lost') {
    if (!current(c)) return;
    void retireGame(c); c.recovering = false; c.synced?.(); c.synced = undefined;
    emit({ phase: 'saved', snapshot: c.seat!.snapshot, attachmentEpoch: 0, error, retryAtMs: null });
    void mirrors(c).refresh().catch(() => {});
  }
  async function setupPeers(c: Context) {
    const gameEpoch = c.gameEpoch;
    await c.gameRetiring; checkGame(c, gameEpoch);
    const seat = c.seat!, transport = await acquire(c, () => platform.createTransport(identityOf(seat.snapshot)), resource => { c.transport = resource; });
    checkGame(c, gameEpoch);
    c.gameRemovers.push(transport.onExit(() => { if (c.transport === transport) fail(c, 'transport-lost'); }));
    if (!config.enabled) throw onlineFault('online-disabled');
    c.ice ??= createOnlineIce({ service: c.service, clock, mode: config.iceMode });
    const peers = createOnlinePeers({ controller: transport.controller, service: c.service, ownSeat: seat.seatId, snapshot: () => c.seat!.snapshot, channel: () => platform.channel(),
      ice: c.ice, clock, scheduler, iceOwner: () => { const owner = c.service.connectionIdentity(); if (!owner) throw onlineFault('stale-connection'); return owner; },
      onChange: () => { if (current(c) && c.peers === peers) emit(); }, onReady: peer => { if (c.peers === peers) void attach(c, peer); },
      onLost: () => { if (c.peers === peers && seat.seatId !== c.seat!.snapshot.hostSeatId) fail(c, 'transport-lost'); },
      onFailure: error => { if (c.peers === peers) fail(c, error ? codeOf(error) : 'transport-lost', error instanceof RoomServiceClientError ? error : undefined); } });
    c.peers = peers;
  }
  function publish(c: Context, port: MessagePortMain) {
    check(c); const s = c.seat!, snapshot = s.snapshot;
    const descriptor: OnlinePortDescriptor = { epoch: ++attachmentEpoch, runId: snapshot.runId, hostGeneration: snapshot.hostGeneration, seatId: s.seatId, compatibility: snapshot.compatibility };
    platform.publishPort(descriptor, port); c.ports.delete(port);
    emit({ phase: 'syncing', attachmentEpoch, retryAtMs: null });
  }
  async function attach(c: Context, peer: OnlinePeer) {
    if (!current(c) || !c.active || c.attached.has(peer.attemptId)) return;
    const s = c.seat!, gameEpoch = c.gameEpoch;
    if (s.seatId === s.snapshot.hostSeatId && !c.authorityReady) return;
    c.attached.add(peer.attemptId); c.ports.add(peer.port);
    try {
      if (c.host) {
        await wait(c, c.host.attachPeer(peer.attemptId, [peer.seatId], peer.port, { streamed: true, latestPayloadLimit: peer.latestPayloadLimit }));
        checkGame(c, gameEpoch); c.ports.delete(peer.port);
      } else publish(c, peer.port);
      peer.transferred = true;
    } catch (error) { close(peer.port); c.ports.delete(peer.port); if (gameCurrent(c, gameEpoch)) fail(c, codeOf(error)); }
  }
  function mirrors(c: Context): OnlineMirrors {
    if (c.mirrors) return c.mirrors;
    if (!config.enabled) throw onlineFault('online-disabled');
    const s = c.seat!.snapshot;
    return c.mirrors = createOnlineMirrors({ service: c.service, store: deps.mirrorStore, serviceOrigin: config.baseUrl,
      roomId: s.roomId, runId: s.runId, hostGeneration: s.hostGeneration, compatibility: s.compatibility, clock, signal: c.abort.signal,
      validatePayload: validateSectorMirror, onChange: mirror => { if (current(c)) emit({ mirror }); } });
  }
  function resetMirrors(c: Context) { c.mirrors?.dispose(); c.mirrors = undefined; }
  function bridgeLease(c: Context, host: HostProcessHandle): Promise<void> {
    let resolve!: () => void, reject!: (e: unknown) => void;
    const initial = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    // Ready may precede subscription. The native handle replays the latest utility-owned request.
    c.gameRemovers.push(host.onLeaseRequest((request: LeaseRenewalRequest) => {
      if (!current(c) || c.host !== host) return;
      c.renewal?.abort(); const renewal = new AbortController(); c.renewal = renewal;
      void c.service.request({ type: 'lease-renew', nonce: request.nonce }, { signal: renewal.signal }).then(async reply => {
        if (!current(c) || renewal.signal.aborted || c.renewal !== renewal) return;
        const lease = reply.lease, s = c.seat!.snapshot;
        if (lease.nonce !== request.nonce || lease.roomId !== s.roomId || lease.hostGeneration !== s.hostGeneration || lease.hostSeatId !== s.hostSeatId || lease.expiresAtEpochMs <= clock.epochMs()) throw onlineFault('lease-expired');
        await host.applyLease(request, lease);
        if (!current(c) || renewal.signal.aborted) return;
        c.lease = lease;
        // Main only cleans up resources; the utility enforces its shorter local work deadline.
        timer(c, () => { if (c.lease === lease) fail(c, 'lease-expired'); }, lease.expiresAtEpochMs - clock.epochMs());
        resolve();
      }).catch(error => { if (current(c) && !renewal.signal.aborted) { reject(error); fail(c, codeOf(error)); } });
    }));
    return initial;
  }
  function graceful(c: Context): Promise<void> {
    if (c.graceful) return c.graceful;
    if (!c.host || !c.authorityReady || !current(c)) return Promise.resolve();
    const start = clock.nowMs(), remaining = () => Math.max(0, 3000 - (clock.nowMs() - start));
    c.graceful = Promise.resolve().then(async () => {
      try {
        const candidate = await wait(c, c.host!.captureCheckpoint('exit'), remaining());
        await wait(c, mirrors(c).adopt(candidate), remaining());
        await wait(c, mirrors(c).flush(remaining()), remaining());
      } catch { /* The current pending file survives unsuccessful graceful commitment. */ }
    });
    emit({ phase: 'saving' });
    return c.graceful;
  }
  async function installHost(c: Context, bytes: Uint8Array, restore: boolean) {
    const s = c.seat!.snapshot;
    const sessionLease = { roomId: s.roomId, runId: s.runId, hostGeneration: s.hostGeneration, hostSeatId: s.hostSeatId, utilityEpoch: randomBytes(16).toString('hex') };
    const host = await acquire(c, () => platform.startLeasedHost(identityOf(s), c.abort.signal, sessionLease), resource => { c.host = resource; });
    c.gameRemovers.push(host.onExit(() => { if (c.host === host) fail(c, 'host-lost'); }));
    const granted = wait(c, bridgeLease(c, host)); void granted.catch(() => {});
    let resolveCapture!: () => void, rejectCapture!: (e: unknown) => void;
    const captured = new Promise<void>((yes, no) => { resolveCapture = yes; rejectCapture = no; }); void captured.catch(() => {});
    c.gameRemovers.push(host.onCheckpoint(candidate => {
      if (!current(c) || c.host !== host) return;
      const work = mirrors(c).adopt(candidate).then(async () => { check(c); if (c.host !== host) throw onlineFault('host-lost'); await host.ackCheckpoint(candidate.captureId); if (candidate.cause === 'initial') resolveCapture(); });
      c.captureWork = work; void work.catch(error => { if (candidate.cause === 'initial') rejectCapture(error); });
    }));
    const started = await wait(c, host.request(restore ? { kind: 'restore', checkpointBytes: bytes } : { kind: 'start', initBytes: bytes }));
    if (!started.ok) throw onlineFault('host-lost');
    if (restore) {
      const baseline = await wait(c, host.captureCheckpoint('pause'));
      await wait(c, mirrors(c).adopt(baseline));
    } else await wait(c, captured);
    await granted;
    if (!await wait(c, mirrors(c).flush(3000))) throw onlineFault('save-unavailable');
    if (c.host !== host || !c.active) throw onlineFault('host-lost');
    if (!restore) await wait(c, host.completeBootstrap());
    const { port1, port2 } = platform.channel(); c.ports.add(port1); c.ports.add(port2);
    await wait(c, host.attachPeer('online-local', [c.seat!.seatId], port1, { streamed: true, latestPayloadLimit: RTC_MAX_PACKET_BYTES - RTC_MAX_HEADER_BYTES })); c.ports.delete(port1);
    if (c.host !== host || !c.active) throw onlineFault('host-lost');
    publish(c, port2); c.authorityReady = true;
  }
  function activate(c: Context, committed: CommittedStart): Promise<void> {
    if (c.starting) {
      if (c.committedHash !== committed.initHash) return Promise.reject(onlineFault('invalid-frame'));
      return c.starting;
    }
    c.committedHash = committed.initHash;
    c.starting = (async () => {
      const init = await validateCommittedSectorStart(c.seat!.snapshot, committed); check(c);
      c.active = true; c.seat!.snapshot = { ...c.seat!.snapshot, phase: 'active' }; emit({ snapshot: c.seat!.snapshot, phase: 'connecting' });
      if (c.seat!.seatId === c.seat!.snapshot.hostSeatId) {
        await installHost(c, new TextEncoder().encode(JSON.stringify(init)), false);
      } else await mirrors(c).refresh();
      for (const peer of c.peers?.ready() ?? []) await attach(c, peer);
    })();
    return c.starting;
  }
  function event(c: Context, e: RoomServiceEvent) {
    if (!current(c)) return;
    try {
      switch (e.type) {
        case 'roster': updateSnapshot(c, e.snapshot); break;
        case 'link-issued': c.peers?.issued(e.link); break;
        case 'signal': c.peers?.signal(e.signal); break;
        case 'link-state': if (e.state === 'closed') c.peers?.closed(e.attemptId); else c.peers?.serviceReady(e.attemptId); break;
        case 'started': void activate(c, e).catch(error => { if (current(c) && !c.explicitStart) fail(c, codeOf(error)); }); break;
        case 'checkpoint-status': if (!c.claiming) void mirrors(c).refresh().catch(() => {}); break;
        case 'host-departed':
          if (e.hostGeneration !== c.seat!.snapshot.hostGeneration) break;
          updateSnapshot(c, { ...c.seat!.snapshot, phase: 'lost' }); break;
        case 'host-changed':
          if (e.snapshot.hostGeneration <= c.seat!.snapshot.hostGeneration) break;
          sectorInit(e.snapshot);
          if (e.snapshot.roomId !== c.seat!.snapshot.roomId || e.snapshot.runId !== c.seat!.snapshot.runId) throw onlineFault('invalid-frame');
          c.claimSnapshot = structuredClone(e.snapshot);
          if (c.claiming) { c.seat!.snapshot = structuredClone(e.snapshot); emit({ snapshot: e.snapshot }); }
          else void followHost(c, e.snapshot);
          break;
        case 'error': fail(c, e.error.code); break;
      }
    } catch (error) { fail(c, codeOf(error)); }
  }
  async function followHost(c: Context, snapshot: RoomSnapshot) {
    const retired = retireGame(c), gameEpoch = c.gameEpoch;
    resetMirrors(c);
    // Adopt the generation before yielding, so another event cannot follow an older snapshot.
    c.seat!.snapshot = structuredClone(snapshot);
    emit({ phase: 'reconnecting', snapshot, role: c.seat!.seatId === snapshot.hostSeatId ? 'host' : 'guest', attachmentEpoch: 0, error: null });
    try {
      await retired; checkGame(c, gameEpoch);
      if (c.seat!.seatId === snapshot.hostSeatId || snapshot.phase !== 'active') { savedState(c); return; }
      const seat = await wait(c, c.service.join(saved!.joinCode, saved!.compatibility, saved!.seatToken)); checkGame(c, gameEpoch);
      if (seat.seatId !== c.seat!.seatId || seat.snapshot.roomId !== snapshot.roomId || seat.snapshot.runId !== snapshot.runId || seat.seatToken !== saved!.seatToken) throw onlineFault('unauthorized');
      c.seat = seat; await setupPeers(c); checkGame(c, gameEpoch);
      const actual = await wait(c, c.service.connect(seat)); checkGame(c, gameEpoch); updateSnapshot(c, actual); checkGame(c, gameEpoch);
      if (actual.phase !== 'active' || actual.hostSeatId === seat.seatId) { savedState(c); return; }
      c.active = true; await mirrors(c).refresh(); checkGame(c, gameEpoch);
      emit({ phase: 'connecting' });
      for (const peer of c.peers?.ready() ?? []) { await attach(c, peer); checkGame(c, gameEpoch); }
    } catch (error) {
      if (gameCurrent(c, gameEpoch)) savedState(c, codeOf(error));
    }
  }
  function validateRecovery(c: Context, mirror: SessionMirror): Uint8Array {
    validateMirror(mirror, value => validateSectorMirror(value, c.seat!.snapshot.capacity));
    const s = c.seat!.snapshot, m = mirror.metadata;
    if (m.roomId !== s.roomId || m.runId !== s.runId || m.hostGeneration > s.hostGeneration
      || Object.entries(s.compatibility).some(([k, v]) => m.compatibility[k as keyof typeof s.compatibility] !== v)) throw onlineFault('save-invalid');
    return new Uint8Array(mirror.bytes);
  }
  async function rehost(c: Context) {
    if (value.phase !== 'saved' || c.seat!.snapshot.phase !== 'lost' || !value.mirror.committed) throw onlineFault('invalid-state');
    c.claiming = true; c.claimSnapshot = undefined; emit({ phase: 'rehosting', error: null });
    try {
      await c.gameRetiring; check(c);
      resetMirrors(c);
      validateRecovery(c, await wait(c, c.service.getCheckpoint({ signal: c.abort.signal })));
      const expectedHostGeneration = c.seat!.snapshot.hostGeneration;
      let claimError: unknown;
      try { await wait(c, c.service.request({ type: 'rehost-claim', expectedHostGeneration, nonce: deps.nonce() })); }
      catch (error) { check(c); claimError = error; }
      check(c);
      const actual = c.claimSnapshot as RoomSnapshot | undefined;
      const latest = c.seat!.snapshot as RoomSnapshot;
      if (actual && (latest.hostGeneration > actual.hostGeneration || latest.hostGeneration === actual.hostGeneration && latest.phase !== 'active')) throw onlineFault('lease-expired');
      if (!actual || actual.hostGeneration <= expectedHostGeneration) {
        if (claimError && !['timeout', 'unavailable', 'stale-connection', 'stale-generation', 'conflict'].includes(codeOf(claimError))) throw claimError;
        // Rejoining replaces the seat connection and may fence an uncertain own claim.
        // Never reconstruct its generation from the claim reply or resume it implicitly.
        const seat = await wait(c, c.service.join(saved!.joinCode, saved!.compatibility, saved!.seatToken));
        if (seat.seatId !== c.seat!.seatId || seat.snapshot.roomId !== c.seat!.snapshot.roomId || seat.snapshot.runId !== c.seat!.snapshot.runId || seat.seatToken !== saved!.seatToken) throw onlineFault('unauthorized');
        c.seat = seat; c.seat.snapshot = await wait(c, c.service.connect(seat));
        if (c.seat.snapshot.phase === 'active' && c.seat.snapshot.hostSeatId !== seat.seatId) { await followHost(c, c.seat.snapshot); return; }
        savedState(c, claimError ? codeOf(claimError) : 'host-lost'); throw claimError ?? onlineFault('host-lost');
      }
      if (actual.hostSeatId !== c.seat!.seatId) { await followHost(c, actual); return; }
      // A confirmed host-changed event provides the identity. An uncertain reply additionally
      // queries ownership on this same connection; this grant never opens the utility gate.
      if (claimError) {
        const nonce = deps.nonce(), reply = await wait(c, c.service.request({ type: 'lease-renew', nonce }));
        if (reply.lease.nonce !== nonce || reply.lease.roomId !== actual.roomId || reply.lease.hostSeatId !== actual.hostSeatId || reply.lease.hostGeneration !== actual.hostGeneration || reply.lease.expiresAtEpochMs <= clock.epochMs()) throw onlineFault('lease-expired');
      }
      resetMirrors(c); c.seat!.snapshot = structuredClone(actual);
      emit({ snapshot: actual, role: 'host' });
      const bytes = validateRecovery(c, await wait(c, c.service.getCheckpoint({ signal: c.abort.signal })));
      await setupPeers(c); c.active = true; await installHost(c, bytes, true);
      await c.peers?.reconcile(); for (const peer of c.peers?.ready() ?? []) await attach(c, peer);
    } catch (error) {
      const claimed = c.claimSnapshot as RoomSnapshot | undefined;
      if (current(c) && claimed?.hostSeatId === c.seat!.seatId && c.seat!.snapshot.hostGeneration === claimed.hostGeneration && c.seat!.snapshot.phase === 'active') {
        await retireGame(c);
        try { await wait(c, c.service.request({ type: 'host-release' })); } catch { /* Service expiry also fences this failed activation. */ }
      }
      throw error;
    } finally { c.claiming = false; }
  }
  function identityOf(s: RoomSnapshot): HostIdentity { return { modeId: s.compatibility.modeId, schemaVersion: s.compatibility.schemaVersion,
    simVersion: s.compatibility.simVersion, contentDigest: s.compatibility.contentDigest, hostGeneration: s.hostGeneration }; }
  async function establish(action: Extract<OnlineAction, { type: 'host' | 'join' | 'reconnect' | 'retry' }>, signal: AbortSignal, recovering: boolean) {
    if (!config.enabled) throw onlineFault('online-disabled');
    const c: Context = { epoch: ++epoch, abort: new AbortController(), service: deps.service(), removers: [], gameRemovers: [], gameEpoch: 0, ports: new Set(), timers: new Set(), active: false, recovering, attached: new Set() };
    context = c;
    const cancel = () => { c.abort.abort(signal.reason ?? onlineFault('cancelled')); void cleanup(c); };
    signal.addEventListener('abort', cancel, { once: true }); c.removers.push(() => signal.removeEventListener('abort', cancel));
    if (signal.aborted) { cancel(); throw signal.reason; }
    emit({ phase: recovering ? 'reconnecting' : action.type === 'host' ? 'creating' : 'joining', error: null, retryAtMs: null, attachmentEpoch: 0,
      ...(!recovering ? { role: null, ownSeat: null, snapshot: null, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null } } : {}) });
    try {
      let seat: SeatSession;
      if (action.type === 'host') seat = await wait(c, c.service.create(sectorCompatibility(action.capacity), action.capacity));
      else if (action.type === 'join') {
        const layouts = sectorJoinCompatibilities();
        try { seat = await wait(c, c.service.join(action.code.trim().toUpperCase(), layouts[0]!)); }
        catch (error) { if (codeOf(error) !== 'incompatible') throw error; seat = await wait(c, c.service.join(action.code.trim().toUpperCase(), layouts[1]!)); }
      } else {
        const credential = saved ?? await wait(c, deps.seatStore.load());
        check(c);
        if (!credential || !validateSavedSeat(credential) || credential.serviceOrigin !== config.baseUrl) throw onlineFault('storage-invalid');
        saved = credential;
        seat = await wait(c, c.service.join(credential.joinCode, credential.compatibility, credential.seatToken));
        if (seat.snapshot.roomId !== credential.roomId || seat.seatId !== credential.seatId || seat.seatToken !== credential.seatToken) throw onlineFault('unauthorized');
      }
      check(c); sectorInit(seat.snapshot); c.seat = seat;
      saved = { version: 1, serviceOrigin: config.baseUrl, roomId: seat.snapshot.roomId, joinCode: seat.snapshot.joinCode, compatibility: seat.snapshot.compatibility,
        seatId: seat.seatId, seatGeneration: seat.seatGeneration, seatToken: seat.seatToken };
      let persistent = true;
      try { await wait(c, deps.seatStore.save(saved)); } catch (error) { check(c); if (codeOf(error) === 'cancelled') throw error; persistent = false; }
      emit({ persistent, error: persistent ? null : 'storage-write-failed', role: seat.seatId === seat.snapshot.hostSeatId ? 'host' : 'guest', ownSeat: seat.seatId, snapshot: seat.snapshot });
      if (seat.snapshot.phase === 'lobby' || seat.snapshot.phase === 'active' && seat.seatId !== seat.snapshot.hostSeatId) await setupPeers(c);
      c.removers.push(c.service.onEvent(e => event(c, e)));
      if (recovering) c.syncedPromise = new Promise(resolve => { c.synced = resolve; });
      const snapshot = await wait(c, c.service.connect(seat)); check(c);
      if (snapshot.phase === 'lost' || snapshot.phase === 'ended' || snapshot.phase === 'active' && seat.seatId === snapshot.hostSeatId) {
        c.seat.snapshot = snapshot; savedState(c); await mirrors(c).refresh().catch(() => {}); check(c); return;
      }
      c.active = snapshot.phase === 'active'; updateSnapshot(c, snapshot); check(c);
      if (c.active && seat.seatId !== snapshot.hostSeatId) void mirrors(c).refresh().catch(() => {});
      emit({ phase: c.active ? 'connecting' : 'lobby' });
      for (const peer of c.peers?.ready() ?? []) await attach(c, peer);
      if (recovering && c.active) await wait(c, c.syncedPromise!, 30000);
      check(c); c.recovering = false;
    } catch (error) { await cleanup(c); if (context === c) context = undefined; throw error; }
  }
  async function lifecycle(action: Extract<OnlineAction, { type: 'host' | 'join' | 'reconnect' | 'retry' }>, signal: AbortSignal) {
    if (action.type !== 'retry' && action.type !== 'reconnect') return establish(action, signal, false);
    const cancel = () => retry.cancel(); signal.addEventListener('abort', cancel, { once: true });
    try {
      await retry.run(async retrySignal => {
        try { await establish(action, retrySignal, true); }
        catch (error) {
          const code = codeOf(error);
          if (code === 'transport-lost' || code === 'timeout' || code === 'unavailable') throw new RoomServiceClientError({ code: code === 'transport-lost' ? 'unavailable' : code,
            retryable: true, ...((error as { retryAfterMs?: number })?.retryAfterMs === undefined ? {} : { retryAfterMs: (error as { retryAfterMs: number }).retryAfterMs }) });
          throw error;
        }
      }, retryAtMs => emit({ phase: 'reconnecting', retryAtMs: retryAtMs === null ? null : clock.epochMs() + Math.max(0, retryAtMs - clock.nowMs()) }));
    } finally { signal.removeEventListener('abort', cancel); }
  }
  async function perform(action: OnlineAction, signal: AbortSignal): Promise<void> {
    if (action.type === 'host' || action.type === 'join' || action.type === 'reconnect' || action.type === 'retry') {
      if (context) {
        if (value.phase !== 'saved' || action.type !== 'reconnect' && action.type !== 'retry') throw onlineFault('invalid-state');
        const old = context; context = undefined; epoch++; await cleanup(old);
      }
      await lifecycle(action, signal); return;
    }
    const c = context; if (!c?.seat) throw onlineFault('invalid-state'); check(c);
    const snapshot = c.seat.snapshot, host = c.seat.seatId === snapshot.hostSeatId;
    if (action.type === 'rehost') await rehost(c);
    else if (action.type === 'ready') { if (snapshot.phase !== 'lobby') throw onlineFault('invalid-state'); updateSnapshot(c, (await wait(c, c.service.request({ type: 'ready', ready: action.ready }))).snapshot); }
    else if (action.type === 'remove-seat') {
      if (!host || snapshot.phase !== 'lobby' || action.seatId === c.seat.seatId || !snapshot.seats[action.seatId]?.occupied) throw onlineFault('invalid-action');
      updateSnapshot(c, (await wait(c, c.service.request({ type: 'remove-seat', seatId: action.seatId }))).snapshot);
    } else if (action.type === 'start') {
      if (!host || snapshot.phase !== 'lobby' || !snapshot.seats.every(s => !s.occupied || s.ready && s.connected) || !c.peers?.allReady()) throw onlineFault('invalid-state');
      const bytes = Buffer.from(JSON.stringify(sectorInit(snapshot))), expectedRosterRevision = snapshot.rosterRevision;
      const proposal = await wait(c, c.service.request({ type: 'start-propose', expectedRosterRevision, initBase64: bytes.toString('base64'), initHash: createHash('sha256').update(bytes).digest('hex') }));
      c.explicitStart = true;
      const committed = await wait(c, c.service.request({ type: 'start-commit', proposalId: proposal.proposalId, expectedRosterRevision }));
      await activate(c, committed);
    } else throw onlineFault('invalid-action');
  }
  async function dispatch(action: OnlineAction): Promise<OnlineResult> {
    if (!validateOnlineAction(action)) return { ok: false, code: 'invalid-action' };
    if (action.type === 'leave' || action.type === 'forget-seat') {
      if (forgetting) return forgetting;
      if (action.type === 'leave') { await prepareExit(); return { ok: true }; }
      const stopped = stop(undefined, true);
      if (action.type === 'forget-seat') {
        saved = null; emit({ persistent: false, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null } });
        // Enqueue removal immediately after cancellation, before a replacement can enqueue a save.
        const clear = Promise.all([deps.seatStore.clear(), deps.mirrorStore.clear()]);
        const result = (async (): Promise<OnlineResult> => {
          try { await Promise.all([stopped, clear]); return { ok: true }; }
          catch { await stopped; emit({ error: 'storage-clear-failed' }); return { ok: false, code: 'storage-clear-failed' }; }
        })();
        forgetting = result; void result.then(() => { if (forgetting === result) forgetting = undefined; }); return result;
      }
      await stopped;
      return { ok: true };
    }
    if (disposed || !config.enabled) return { ok: false, code: 'online-disabled' };
    if (action.type === 'rehost' && rehostWork) return rehostWork;
    if (action.type === 'view-state') {
      const c = context;
      if (!c || !current(c) || !c.active || !value.attachmentEpoch || action.epoch !== value.attachmentEpoch || value.phase === 'saving') return { ok: false, code: 'invalid-action' };
      // This hint cancels only the connection watchdog. Native readiness and full-state ingress ACK stay independent.
      c.synced?.(); c.synced = undefined;
      emit({ phase: action.phase === 'synced' ? 'syncing' : action.phase }); return { ok: true };
    }
    if (action.type === 'ready' && readyWork) { readyValue = action.ready; return readyWork; }
    if (operation || retiring || forgetting || context?.graceful || disposal || exitWork) return { ok: false, code: 'busy' };
    const active = new AbortController(); operation = active;
    const execute = async (): Promise<OnlineResult> => {
      try {
        if (action.type === 'ready') {
          readyValue = action.ready;
          while (readyValue !== undefined) { const next = readyValue; readyValue = undefined; await perform({ type: 'ready', ready: next }, active.signal); }
        } else await perform(action, active.signal);
        return active.signal.aborted ? { ok: false, code: 'cancelled' } : { ok: true };
      } catch (error) {
        const code = active.signal.aborted ? 'cancelled' : codeOf(error);
        if (!active.signal.aborted && operation === active) {
          if (action.type === 'rehost' && context?.seat && ['saved', 'rehosting'].includes(value.phase)) savedState(context, code);
          else if (!['invalid-action', 'invalid-state'].includes(code)) await stop(code);
        }
        return { ok: false, code };
      } finally { if (operation === active) operation = undefined; }
    };
    const result = execute();
    if (action.type === 'rehost') { rehostWork = result; void result.finally(() => { if (rehostWork === result) rehostWork = undefined; }); }
    if (action.type === 'ready') { readyWork = result; void result.finally(() => { if (readyWork === result) readyWork = undefined; }); }
    return result;
  }
  function prepareExit(): Promise<void> {
    if (exitWork) return exitWork;
    const c = context;
    let resolve!: () => void, reject!: (e: unknown) => void;
    const work = new Promise<void>((yes, no) => { resolve = yes; reject = no; }); exitWork = work;
    void (async () => { if (c) await graceful(c); if (context === c) await stop(undefined, true); })().then(resolve, reject);
    void work.then(() => { if (exitWork === work) exitWork = undefined; }, () => { if (exitWork === work) exitWork = undefined; }); return work;
  }
  const offVisible = platform.onVisibleGone(() => { void owner.dispose(); });
  const owner: OnlineSessionOwner = {
    dispatch, status: () => copyOnlineStatus({ ...value, mirror: { ...value.mirror, receivedAgeMs: mirrorReceipt === null ? null : Math.max(0, clock.nowMs() - mirrorReceipt) } }),
    subscribe(cb) { if (disposed) return () => {}; if (listeners.size >= 64) throw onlineFault('capacity'); listeners.add(cb); return () => { listeners.delete(cb); }; },
    async suspend() { const c = context; if (!c) return; if (!c.seat) { await stop('suspended'); return; } if (c.host) void c.host.invalidateLease('suspended').catch(() => {}); savedState(c, 'suspended'); await c.gameRetiring; },
    async resume() {
      const c = context;
      // A persisted credential is availability, not consent to leave couch/Helm/home.
      if (!c?.seat || disposed || exitWork || disposal || value.phase === 'idle' || value.phase === 'error') return;
      if (c.host) void c.host.invalidateLease('resumed').catch(() => {});
      savedState(c, 'suspended'); await c.gameRetiring;
      if (current(c) && saved && !operation && !exitWork && !disposal) await dispatch({ type: 'reconnect' });
    },
    prepareExit,
    dispose() { if (disposal) return disposal; offVisible(); disposal = prepareExit().then(() => { disposed = true; listeners.clear(); }); return disposal; }
  };
  emit();
  // Loading the private seat changes availability only; a newer lifecycle owns any subsequent save.
  const initialEpoch = epoch;
  void deps.seatStore.load().then(seat => {
    if (disposed || epoch !== initialEpoch || operation) return;
    if (seat && (!validateSavedSeat(seat) || !config.enabled || seat.serviceOrigin !== config.baseUrl)) { emit({ error: 'storage-invalid' }); return; }
    saved = seat; emit({ persistent: !!seat });
  }).catch(error => { if (!disposed && epoch === initialEpoch && !operation) emit({ error: codeOf(error) }); });
  return owner;
}

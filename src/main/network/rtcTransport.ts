import type { MessagePortMain } from 'electron';
import { isHostIdentity, matchesIdentity, type HostIdentity } from '../../shared/hostProcessProtocol';
import { isRtcAttemptOptions, isRtcResponse, isRtcSignal, RTC_MAX_ATTEMPTS, RTC_OWNER_ATTEMPT_LIMIT, RTC_SETUP_MS,
  type RtcAttemptOptions, type RtcRequest, type RtcSignal } from '../../shared/rtcSession';

type Unsubscribe = () => void;
export interface RtcLinkStats { rttMs: number; route: 'lan' | 'internet' }
export type { RtcAttemptOptions } from '../../shared/rtcSession';
export interface TransportController {
  startAttempt(options: RtcAttemptOptions, port: MessagePortMain): Promise<{ latestPayloadLimit: number }>;
  receiveSignal(signal: RtcSignal): Promise<void>;
  onSignal(callback: (signal: RtcSignal) => void): Unsubscribe;
  onAttemptClosed(callback: (attemptId: string) => void): Unsubscribe;
  /** A ready attempt's link figures (H-2 spec §8), about once a second: its RTT and route label. */
  onStats?(callback: (attemptId: string, stats: RtcLinkStats) => void): Unsubscribe;
  closeAttempt(attemptId: string): Promise<void>;
  dispose(): Promise<void>;
}
export interface RtcTransportWire {
  send(message: RtcRequest, ports?: MessagePortMain[]): void;
  onResponse(callback: (message: unknown) => void): Unsubscribe;
  dispose(): void;
}
const closePort = (port: MessagePortMain) => { try { port.close(); } catch {} };
/** Main owns IDs, generations, lifetime bounds and trusted configuration. No renderer-facing API. */
export function createRtcTransport(identity: HostIdentity, wire: RtcTransportWire): TransportController {
  let disposed = false, nextId = 0;
  const usedIds = new Set<string>(), observers = new Set<(signal: RtcSignal) => void>();
  const closedObservers = new Set<(attemptId: string) => void>();
  const statsObservers = new Set<(attemptId: string, stats: RtcLinkStats) => void>();
  type Attempt = { id: string; generation: number; remote: string; port: MessagePortMain; portReady: boolean; ready: boolean;
    resolve(value: { latestPayloadLimit: number }): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
  const attempts = new Map<string, Attempt>();
  const pending = new Map<number, { attemptId: string; kind: 'applied' | 'closed'; resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  function stamp() { if (nextId >= Number.MAX_SAFE_INTEGER) throw Error('rtc-request-capacity'); return { version: 1 as const, hostGeneration: identity.hostGeneration, requestId: ++nextId }; }
  function retire(entry: Attempt, reason: string) {
    if (attempts.get(entry.id) !== entry) return;
    attempts.delete(entry.id); clearTimeout(entry.timer); closePort(entry.port);
    entry.reject(Error(reason));
    for (const [id, item] of pending) if (item.attemptId === entry.id && item.kind !== 'closed') {
      pending.delete(id); clearTimeout(item.timer); item.reject(Error(reason));
    }
    for (const callback of [...closedObservers]) { try { callback(entry.id); } catch {} }
  }
  function notifyClose(entry: Attempt) {
    try { wire.send({ ...stamp(), kind: 'close', attemptId: entry.id, attemptGeneration: entry.generation }); } catch {}
  }
  function fail(entry: Attempt) { retire(entry, 'rtc-attempt-failed'); notifyClose(entry); }
  const off = wire.onResponse(value => {
    if (disposed || !isRtcResponse(value) || value.hostGeneration !== identity.hostGeneration) return;
    const operation = pending.get(value.requestId);
    if (operation && operation.attemptId === value.attemptId && operation.kind === value.kind) {
      pending.delete(value.requestId); clearTimeout(operation.timer); operation.resolve(); return;
    }
    const entry = attempts.get(value.attemptId);
    if (!entry || entry.generation !== value.requestId) return;
    if (value.kind === 'failed' || value.kind === 'closed') { retire(entry, 'rtc-attempt-failed'); return; }
    if (value.kind === 'port-ready') { if (entry.portReady) fail(entry); else entry.portReady = true; return; }
    if (value.kind === 'ready') {
      if (!entry.portReady || entry.ready) { fail(entry); return; }
      entry.ready = true; clearTimeout(entry.timer); entry.resolve({ latestPayloadLimit: value.latestPayloadLimit }); return;
    }
    if (value.kind === 'stats') {
      if (!entry.ready) return;
      for (const callback of [...statsObservers]) { try { callback(entry.id, { rttMs: value.rttMs, route: value.route }); } catch {} }
      return;
    }
    if (value.kind === 'signal') {
      for (const callback of [...observers]) { try { callback(value.signal); } catch { fail(entry); break; } }
    }
  });
  function operation(entry: Attempt, kind: 'applied' | 'closed', build: (base: ReturnType<typeof stamp>) => RtcRequest): Promise<void> {
    if (pending.size >= 64) { fail(entry); return Promise.reject(Error('rtc-request-capacity')); }
    let base: ReturnType<typeof stamp>;
    try { base = stamp(); } catch { fail(entry); return Promise.reject(Error('rtc-request-capacity')); }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(base.requestId); reject(Error('rtc-request-timeout')); fail(entry);
      }, 5000);
      pending.set(base.requestId, { attemptId: entry.id, kind, resolve, reject, timer });
      try { wire.send(build(base)); }
      catch { pending.delete(base.requestId); clearTimeout(timer); reject(Error('rtc-transfer-failed')); fail(entry); }
    });
  }
  return {
    startAttempt(options, port) {
      const invalid = (reason: string) => { closePort(port); return Promise.reject(Error(reason)); };
      if (disposed) return invalid('rtc-disposed');
      if (!isRtcAttemptOptions(options) || !matchesIdentity(options.identity, identity)) return invalid('rtc-config-invalid');
      if (options.ticketExpiresAtEpochMs <= Date.now()) return invalid('rtc-ticket-expired');
      if (usedIds.has(options.attemptId) || usedIds.size >= RTC_OWNER_ATTEMPT_LIMIT) return invalid('rtc-attempt-id-used');
      for (const entry of attempts.values()) if (entry.remote === options.identity.remoteConnectionId) { retire(entry, 'rtc-replaced'); notifyClose(entry); }
      if (attempts.size >= RTC_MAX_ATTEMPTS) return invalid('rtc-attempt-capacity');
      usedIds.add(options.attemptId);
      let base: ReturnType<typeof stamp>;
      try { base = stamp(); } catch { return invalid('rtc-request-capacity'); }
      const owned = structuredClone(options);
      return new Promise<{ latestPayloadLimit: number }>((resolve, reject) => {
        const entry: Attempt = { id: options.attemptId, generation: base.requestId, remote: options.identity.remoteConnectionId,
          port, portReady: false, ready: false, resolve, reject, timer: setTimeout(() => fail(entry), RTC_SETUP_MS + 1000) };
        attempts.set(entry.id, entry);
        try { wire.send({ ...base, kind: 'start', options: owned }, [port]); }
        catch { fail(entry); }
      });
    },
    receiveSignal(signal) {
      if (disposed) return Promise.reject(Error('rtc-disposed'));
      if (!isRtcSignal(signal)) return Promise.reject(Error('rtc-signal-invalid'));
      const entry = attempts.get(signal.attemptId); if (!entry) return Promise.resolve();
      return operation(entry, 'applied', base => ({ ...base, kind: 'signal', attemptId: entry.id, attemptGeneration: entry.generation, signal: structuredClone(signal) }));
    },
    onSignal(callback) { if (!disposed) observers.add(callback); return () => { observers.delete(callback); }; },
    onAttemptClosed(callback) {
      if (!disposed) { if (closedObservers.size >= 64) throw Error('rtc-observer-capacity'); closedObservers.add(callback); }
      return () => { closedObservers.delete(callback); };
    },
    onStats(callback) {
      if (!disposed) { if (statsObservers.size >= 64) throw Error('rtc-observer-capacity'); statsObservers.add(callback); }
      return () => { statsObservers.delete(callback); };
    },
    closeAttempt(attemptId) {
      const entry = attempts.get(attemptId); if (!entry || disposed) return Promise.resolve();
      retire(entry, 'rtc-cancelled');
      return operation(entry, 'closed', base => ({ ...base, kind: 'close', attemptId, attemptGeneration: entry.generation }));
    },
    async dispose() {
      if (disposed) return; disposed = true; off();
      for (const entry of [...attempts.values()]) { retire(entry, 'rtc-disposed'); notifyClose(entry); }
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('rtc-disposed')); } pending.clear();
      observers.clear(); closedObservers.clear(); statsObservers.clear(); usedIds.clear(); wire.dispose();
    }
  };
}

/** Guest owns one hidden window and no authority utility. */
export async function startGuestTransport(identity: HostIdentity): Promise<TransportController> {
  if (!isHostIdentity(identity)) throw Error('invalid-identity');
  const { createHostPlatform } = await import('./transportWindow');
  const owner = createHostPlatform().createTransport({ modeId: identity.modeId, schemaVersion: identity.schemaVersion,
    simVersion: identity.simVersion, contentDigest: identity.contentDigest, hostGeneration: identity.hostGeneration });
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const removers: Unsubscribe[] = [];
      const finish = (error?: Error) => {
        if (settled) return; settled = true; clearTimeout(timer);
        for (const off of removers) off(); error ? reject(error) : resolve();
      };
      const timer = setTimeout(() => finish(Error('transport-ready-timeout')), 5000);
      removers.push(owner.onReady(() => finish()), owner.onExit(() => finish(Error('transport-exit'))));
      void owner.load().catch(() => finish(Error('transport-load-failed')));
    });
    return owner.controller;
  } catch (error) { owner.dispose(); throw error; }
}

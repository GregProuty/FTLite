// The online session in the page (web build spec §3.3): the session, its lobby client, its peers and the host Worker
// are built here, in Electron and in a browser alike. The returned facade has the shape of the former preload online
// API plus onPort; the session object itself is never put on window.
import { createOnlineSession, type OnlineSessionDeps, type OnlineSessionOwner } from '../../../../network/online/onlineSession';
import { createSeatStore } from '../../../../network/online/seatStore';
import { createMirrorStore } from '../../../../network/online/mirrorStore';
import { createIndexedDbRecordStore, type OnlineRecordStore } from '../../../../network/online/recordStore';
import { validateModeMirror } from '../../../../network/online/onlineModes';
import { createPagePlatform } from '../../../../network/online/pagePlatform';
import { createClockJumpLifecycle, createElectronLifecycle, type OnlineLifecycle } from '../../../../network/online/lifecycle';
import { createWorkerHostPlatform, type HostPlatform } from '../../../../network/host/workerHost';
import { createRoomServiceClient } from '../../../../network/session/serviceClient';
import { randomHex } from '../../../../network/random';
import { sessionConfigOf, validatePageOnlineConfig, type PageOnlineConfig } from '../../../../shared/onlineConfig';
import { copyOnlineStatus, validateOnlineAction, validateOnlineLinkStats, validateOnlineResult, type DuelCrewSize, type FtlitePreloadApi, type OnlineAction,
  type OnlinePortDescriptor, type OnlinePreloadApi, type OnlineResult, type OnlineStatus, type OnlineStatusEnvelope, type Unsubscribe } from '../../../../shared/onlineSession';

export type PortListener = (descriptor: OnlinePortDescriptor, port: MessagePort) => void;
export interface PageOnline extends OnlinePreloadApi {
  onPort(callback: PortListener): Unsubscribe;
  /** The session's bounded exit save, then disposal (Electron's app:prepare-exit). Settles even when the save fails. */
  prepareExit(): Promise<void>;
  /** A non-persisted pagehide (spec §3.1): the host release over the open socket, no checkpoint capture. */
  releaseForUnload(): void;
  dispose(): Promise<void>;
}
export interface PageWindow {
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
  dispatchEvent(event: Event): boolean;
  ftlite?: FtlitePreloadApi;
}
export interface PageOnlineDeps {
  window: PageWindow;
  records?: OnlineRecordStore;
  lifecycle?: OnlineLifecycle;
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
  hostPlatform?(lifecycle: OnlineLifecycle): HostPlatform;
  createSession?(deps: OnlineSessionDeps): OnlineSessionOwner;
}
const invalidStatus = (): OnlineStatus => ({ phase: 'error', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: 'invalid-status', retryAtMs: null,
  mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: false, actions: [] });
export function createPageOnline(config: PageOnlineConfig, deps: PageOnlineDeps): PageOnline {
  if (!validatePageOnlineConfig(config)) throw Error('invalid-online-config');
  const win = deps.window;
  // Capture one native networking implementation for this owner.
  const nativeFetch = deps.fetch ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined);
  const NativeWebSocket = deps.WebSocket ?? globalThis.WebSocket;
  const lifecycle = deps.lifecycle ?? (win.ftlite ? createElectronLifecycle(win.ftlite) : createClockJumpLifecycle({ target: win,
    epochMs: () => Date.now(), monotonicMs: () => performance.now(),
    setInterval: (cb, ms) => setInterval(cb, ms), clearInterval: handle => clearInterval(handle as ReturnType<typeof setInterval>) }));
  const probe = config.testProbe && !config.packaged;
  let portListener: PortListener | undefined, disposed = false;
  const platform = createPagePlatform({
    hostPlatform: () => (deps.hostPlatform ?? (l => createWorkerHostPlatform({ lifecycle: l })))(lifecycle),
    deliver(descriptor, port) {
      if (!portListener) throw Error('invalid-port');
      if (probe) win.dispatchEvent(new CustomEvent('ftlite:online:test-port', { detail: { descriptor: structuredClone(descriptor), port } }));
      portListener(descriptor, port);
    }
  });
  const scheduler = { setTimeout: (cb: () => void, ms: number) => setTimeout(cb, ms), clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
  const sessionConfig = typeof nativeFetch === 'function' && typeof NativeWebSocket === 'function' ? sessionConfigOf(config) : { enabled: false } as const;
  const records = deps.records ?? createIndexedDbRecordStore();
  const owner = (deps.createSession ?? createOnlineSession)({
    config: sessionConfig, seatStore: createSeatStore(records), mirrorStore: createMirrorStore(records, validateModeMirror), platform,
    sectorTestEntry: config.sectorOnlineTest, duelTestSeed: config.duelTestSeed ?? undefined,
    clock: { nowMs: () => performance.now(), epochMs: () => Date.now() }, scheduler, nonce: () => randomHex(16),
    service() {
      if (!sessionConfig.enabled) throw Error('online-disabled');
      return createRoomServiceClient({ baseUrl: sessionConfig.baseUrl, allowInsecureLocalhost: sessionConfig.allowInsecureLocalhost,
        fetch: (url, init) => nativeFetch!(url, init), createWebSocket: url => new NativeWebSocket(url),
        clock: { nowMs: () => Date.now(), ...scheduler } });
    }
  });
  let revision = 1;
  const safe = (value: OnlineStatus): OnlineStatus => { try { return copyOnlineStatus(value); } catch { return invalidStatus(); } };
  let current: OnlineStatus;
  try { current = safe(owner.status()); } catch { current = invalidStatus(); }
  const envelope = (): OnlineStatusEnvelope => ({ version: 1, revision, status: copyOnlineStatus(current) });
  const statusListeners = new Set<(value: OnlineStatusEnvelope) => void>();
  const offOwner = owner.subscribe(status => {
    if (disposed || revision >= Number.MAX_SAFE_INTEGER) return;
    current = safe(status); revision++;
    const value = envelope();
    for (const cb of [...statusListeners]) { try { cb(structuredClone(value)); } catch { /* isolate UI observers */ } }
  });
  async function action(value: OnlineAction): Promise<OnlineResult> {
    if (!validateOnlineAction(value)) return { ok: false, code: 'invalid-action' };
    try {
      const result = await owner.dispatch(structuredClone(value));
      return validateOnlineResult(result) ? structuredClone(result) : { ok: false, code: 'invalid-status' };
    } catch { return { ok: false, code: 'unavailable' }; }
  }
  const offSuspend = lifecycle.onSuspend(() => { void owner.suspend().catch(() => {}); });
  const offResume = lifecycle.onResume(() => { void owner.resume().catch(() => {}); });
  const pagehide = (event: { persisted?: boolean }) => { if (!event.persisted) api.releaseForUnload(); };
  win.addEventListener('pagehide', pagehide);
  function detach(): void {
    if (disposed) return; disposed = true;
    offOwner(); offSuspend(); offResume(); lifecycle.dispose(); win.removeEventListener('pagehide', pagehide);
    statusListeners.clear(); portListener = undefined;
  }
  const api: PageOnline = {
    // Exactly the former preload's forms (Sci-2: a duel room for a crew of 2, 3 or 4; the sector is the test-only entry).
    host: room => action(room?.mode === 'sector' ? { type: 'host', mode: 'sector', capacity: room.capacity } : { type: 'host', mode: 'duel', capacity: room?.capacity as DuelCrewSize }),
    join: (code, mode) => action(mode ? { type: 'join', code, mode } : { type: 'join', code }),
    ready: ready => action({ type: 'ready', ready }),
    removeSeat: seatId => action({ type: 'remove-seat', seatId }),
    viewState: (epoch, phase) => action({ type: 'view-state', epoch, phase }),
    reconnect: () => action({ type: 'reconnect' }),
    rehost: () => action({ type: 'rehost' }),
    start: helmPlayer => action(helmPlayer === undefined ? { type: 'start' } : { type: 'start', helmPlayer }),
    retry: () => action({ type: 'retry' }),
    leave: () => action({ type: 'leave' }),
    forgetSeat: () => action({ type: 'forget-seat' }),
    async readStatus() { return envelope(); },
    async linkStats() {
      try { const stats = owner.linkStats?.() ?? null; return validateOnlineLinkStats(stats) ? { route: stats.route, rttMs: stats.rttMs } : null; } catch { return null; }
    },
    onStatus(callback) {
      if (disposed || statusListeners.size >= 64) return () => {};
      statusListeners.add(callback); return () => { statusListeners.delete(callback); };
    },
    onPort(callback) {
      if (disposed) return () => {};
      if (portListener) throw Error('invalid-port');
      portListener = callback;
      return () => { if (portListener === callback) portListener = undefined; };
    },
    prepareExit() { return owner.prepareExit().catch(() => {}).then(() => owner.dispose()).catch(() => {}).finally(detach); },
    releaseForUnload() { if (disposed) return; try { owner.releaseForUnload(); } finally { detach(); } },
    async dispose() { try { await owner.dispose(); } finally { detach(); } }
  };
  if (probe) Object.defineProperty(win, '__ftliteOnlineTest', { configurable: false, enumerable: false, writable: false, value: Object.freeze({
    host: api.host, join: api.join, ready: api.ready, removeSeat: api.removeSeat, viewState: api.viewState, reconnect: api.reconnect, rehost: api.rehost,
    start: api.start, retry: api.retry, leave: api.leave, forgetSeat: api.forgetSeat, readStatus: api.readStatus, linkStats: api.linkStats, onStatus: api.onStatus }) });
  return api;
}

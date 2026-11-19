import { describe, expect, it, vi } from 'vitest';
import { createOnlineBridge } from '../src/renderer/src/app/onlineBridge';
import { validateOnlineStatusEnvelope } from '../src/shared/onlineSession';

const status = { phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: false, actions: ['host'] } as const;
const descriptor = { epoch: 1, runId: 'a'.repeat(32), hostGeneration: 1, seatId: 1, compatibility: { protocolVersion: 2, modeId: 'sector', schemaVersion: 1, simVersion: 35, contentDigest: 'b'.repeat(64), layoutHash: '12345678' } };
const native = vi.hoisted(() => ({ listeners: new Map<string, Set<(...args: any[]) => void>>(), exposed: null as any, invoke: vi.fn(), sendSync: vi.fn() }));
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld(_name: string, value: any) { native.exposed = value; } }, ipcRenderer: {
  invoke: native.invoke, sendSync: native.sendSync,
  on(name: string, cb: (...args: any[]) => void) { const set = native.listeners.get(name) ?? new Set(); set.add(cb); native.listeners.set(name, set); },
  off(name: string, cb: (...args: any[]) => void) { native.listeners.get(name)?.delete(cb); }
} }));
function harness() {
  const statuses = new Set<(value: any) => void>(); let initial!: (value: any) => void, deliver: ((d: any, p: any) => void) | undefined;
  const read = new Promise<any>(resolve => { initial = resolve; }), offPort = vi.fn();
  const api = { host: vi.fn(), join: vi.fn(), ready: vi.fn(), removeSeat: vi.fn(), viewState: vi.fn(), reconnect: vi.fn(), rehost: vi.fn(), start: vi.fn(),
    retry: vi.fn(), leave: vi.fn(), forgetSeat: vi.fn(), readStatus: () => read, prepareExit: vi.fn(), dispose: vi.fn(),
    onStatus(cb: (value: any) => void) { statuses.add(cb); return () => { statuses.delete(cb); }; },
    onPort(cb: (d: any, p: any) => void) { deliver = cb; return offPort; } };
  const bridge = createOnlineBridge(api as never);
  const port = () => ({ close: vi.fn() });
  const transfer = (d: any, p = port()) => { deliver!(d, p); return p; };
  return { bridge, api, statuses, initial, transfer, offPort };
}
describe('the renderer online bridge over the page facade', () => {
  it('delivers ports with detached descriptors and closes stale and malformed transfers', () => {
    const h = harness(), receive = vi.fn(), off = h.bridge.onPort(receive), first = h.transfer(descriptor);
    expect(receive).toHaveBeenCalledWith(descriptor, first); expect(first.close).not.toHaveBeenCalled();
    expect(h.transfer(descriptor).close).toHaveBeenCalledOnce();
    expect(h.transfer({ ...descriptor, epoch: 0 }).close).toHaveBeenCalledOnce();
    expect(h.transfer({ ...descriptor, epoch: 2, token: 'private' }).close).toHaveBeenCalledOnce();
    const second = h.transfer({ ...descriptor, epoch: 2 }); expect(receive).toHaveBeenCalledTimes(2);
    expect(receive.mock.calls[0]![0]).not.toBe(descriptor); expect(second.close).not.toHaveBeenCalled();
    off(); expect(h.transfer({ ...descriptor, epoch: 3 }).close).toHaveBeenCalledOnce();
    h.bridge.dispose(); expect(h.offPort).toHaveBeenCalledOnce();
  });
  it('retires an unclaimed valid epoch so it cannot be replayed after a listener arrives', () => {
    const h = harness(); expect(h.transfer(descriptor).close).toHaveBeenCalledOnce();
    const receive = vi.fn(); h.bridge.onPort(receive);
    expect(h.transfer(descriptor).close).toHaveBeenCalledOnce(); expect(receive).not.toHaveBeenCalled(); h.bridge.dispose();
  });
  it('exposes the named actions only, never the session lifetime', () => {
    const h = harness();
    expect((h.bridge as Record<string, unknown>).prepareExit).toBeUndefined();
    h.bridge.dispose(); expect(h.api.dispose).not.toHaveBeenCalled();
  });
  it('subscribes before initial read, rejects unsafe envelopes and ignores old replies', async () => {
    const h = harness(), receive = vi.fn(), off = h.bridge.onStatus(receive);
    expect(h.statuses.size).toBe(1);
    for (const cb of h.statuses) cb({ version: 1, revision: 2, status: { ...status, persistent: true } });
    h.initial({ version: 1, revision: 1, status }); await Promise.resolve(); await Promise.resolve();
    expect(receive).toHaveBeenCalledTimes(1); expect(receive).toHaveBeenLastCalledWith({ ...status, persistent: true });
    for (const cb of h.statuses) { cb({ version: 1, revision: 2, status }); cb({ version: 1, revision: 3, status: { ...status, seatToken: 'private' } }); }
    expect(receive).toHaveBeenCalledTimes(1); off(); expect(h.statuses.size).toBe(0); h.bridge.dispose();
  });
  it('delivers initial status to a subscriber arriving after the original initial query', async () => {
    const h = harness(); h.initial({ version: 1, revision: 1, status }); await Promise.resolve();
    const first = vi.fn(), off = h.bridge.onStatus(first); await Promise.resolve(); await Promise.resolve();
    expect(first).toHaveBeenCalledWith(status); off(); h.bridge.dispose();
  });
  it('validates fixed versioned bounded status envelope without credential fields', () => {
    expect(validateOnlineStatusEnvelope({ version: 1, revision: 1, status })).toBe(true);
    for (const bad of [{ version: 2, revision: 1, status }, { version: 1, revision: 0, status }, { version: 1, revision: Number.MAX_SAFE_INTEGER + 1, status }, { version: 1, revision: 1, status, seatToken: 'private' }, { version: 1, revision: 1, status: { ...status, seatToken: 'private' } }]) expect(validateOnlineStatusEnvelope(bad)).toBe(false);
  });
});
describe('the isolated preload API (web build spec §3.3)', () => {
  const config = { serviceOrigin: 'http://127.0.0.1:8787', iceMode: 'loopback', allowInsecureLocalhost: true, packaged: false, sectorOnlineTest: false, duelTestSeed: null, testProbe: false };
  it('hands over a validated frozen online config and no online IPC surface', async () => {
    vi.resetModules(); native.listeners.clear(); native.sendSync.mockReset().mockReturnValueOnce(config);
    await import('../src/preload/index');
    expect(native.sendSync).toHaveBeenCalledWith('app:online-config');
    expect(native.exposed.onlineConfig).toEqual(config); expect(Object.isFrozen(native.exposed.onlineConfig)).toBe(true);
    expect(native.exposed.online).toBeUndefined(); expect(native.exposed.invoke).toBeUndefined(); expect(native.exposed.send).toBeUndefined();
    vi.resetModules(); native.sendSync.mockReturnValueOnce({ ...config, serviceOrigin: 'http://evil.example' }); await import('../src/preload/index');
    expect(native.exposed.onlineConfig.serviceOrigin).toBeNull();
  });
  it('runs the page exit handler on app:prepare-exit and answers the same request number', async () => {
    vi.resetModules(); native.listeners.clear(); native.invoke.mockReset().mockResolvedValue(true); native.sendSync.mockReturnValueOnce(null);
    await import('../src/preload/index');
    const handler = vi.fn(async () => {}), off = native.exposed.onPrepareExit(handler);
    for (const cb of native.listeners.get('app:prepare-exit') ?? []) cb({}, 4);
    await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledWith('app:prepare-exit', 4)); expect(handler).toHaveBeenCalledOnce();
    off(); for (const cb of native.listeners.get('app:prepare-exit') ?? []) { cb({}, 'x'); cb({}, 5); }
    await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledWith('app:prepare-exit', 5));
    expect(handler).toHaveBeenCalledOnce(); expect(native.invoke).not.toHaveBeenCalledWith('app:prepare-exit', 'x');
  });
  it('relays app:suspend and app:resume to subscribers', async () => {
    vi.resetModules(); native.listeners.clear(); native.sendSync.mockReturnValueOnce(null); await import('../src/preload/index');
    const off = native.exposed.onSuspend(() => {}); expect(native.listeners.get('app:suspend')?.size).toBe(1); off(); expect(native.listeners.get('app:suspend')?.size).toBe(0);
    const offResume = native.exposed.onResume(() => {}); expect(native.listeners.get('app:resume')?.size).toBe(1); offResume();
  });
});

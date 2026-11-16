import { describe, expect, it, vi } from 'vitest';
import { createOnlineBridge } from '../src/renderer/src/app/onlineBridge';
import { validateOnlineStatusEnvelope } from '../src/shared/onlineSession';

const status = { phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: false, actions: ['host'] } as const;
const descriptor = { epoch: 1, runId: 'a'.repeat(32), hostGeneration: 1, seatId: 1, compatibility: { protocolVersion: 2, modeId: 'sector', schemaVersion: 1, simVersion: 35, contentDigest: 'b'.repeat(64), layoutHash: '12345678' } };
const native = vi.hoisted(() => ({ listeners: new Map<string, Set<(...args: any[]) => void>>(), exposed: null as any, invoke: vi.fn() }));
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld(_name: string, value: any) { native.exposed = value; } }, ipcRenderer: {
  invoke: native.invoke,
  on(name: string, cb: (...args: any[]) => void) { const set = native.listeners.get(name) ?? new Set(); set.add(cb); native.listeners.set(name, set); },
  off(name: string, cb: (...args: any[]) => void) { native.listeners.get(name)?.delete(cb); }
} }));
function harness() {
  const listeners = new Set<(event: any) => void>(), statuses = new Set<(value: any) => void>();
  let initial!: (value: any) => void;
  const read = new Promise<any>(resolve => { initial = resolve; });
  const api = { host: vi.fn(), onStatus(cb: (value: any) => void) { statuses.add(cb); return () => { statuses.delete(cb); }; }, readStatus: () => read };
  const win = { addEventListener(_name: string, cb: any) { listeners.add(cb); }, removeEventListener(_name: string, cb: any) { listeners.delete(cb); } };
  const bridge = createOnlineBridge(win as any, api as any);
  const port = () => ({ close: vi.fn(), start: vi.fn() });
  function message(data: any, ports: any[] = [], source: any = win) { for (const cb of listeners) cb({ source, data, ports }); }
  const transfer = (d: any, p = port(), source?: any) => { message({ source: 'ftlite:online:main', version: 1, descriptor: d }, [p], source); return p; };
  return { bridge, listeners, api, statuses, initial, message, transfer, port };
}
describe('renderer-owned online bridge', () => {
  it('delivers actual transferred ports with detached descriptors and closes stale, malformed and foreign transfers', () => {
    const h = harness(), receive = vi.fn(), off = h.bridge.onPort(receive), first = h.transfer(descriptor);
    expect(receive).toHaveBeenCalledWith(descriptor, first); expect(first.close).not.toHaveBeenCalled();
    expect(h.transfer(descriptor).close).toHaveBeenCalledOnce();
    expect(h.transfer({ ...descriptor, epoch: 0 }).close).toHaveBeenCalledOnce();
    expect(h.transfer({ ...descriptor, epoch: 2, token: 'private' }).close).toHaveBeenCalledOnce();
    expect(h.transfer({ ...descriptor, epoch: 3 }, undefined, {}).close).toHaveBeenCalledOnce();
    const second = h.transfer({ ...descriptor, epoch: 2 }); expect(receive).toHaveBeenCalledTimes(2);
    expect(receive.mock.calls[0]![0]).not.toBe(descriptor); expect(second.close).not.toHaveBeenCalled();
    off(); expect(h.transfer({ ...descriptor, epoch: 3 }).close).toHaveBeenCalledOnce();
    h.bridge.dispose(); expect(h.listeners.size).toBe(0);
  });
  it('cannot turn page messages into privileged operations and releases every unclaimed transfer', () => {
    const h = harness(), p = h.port();
    h.message({ source: 'ftlite:online:main', type: 'host', capacity: 4 }, [p]);
    h.message({ channel: 'online:host', message: { type: 'host', capacity: 4 } });
    expect(h.api.host).not.toHaveBeenCalled(); expect(p.close).toHaveBeenCalledOnce(); h.bridge.dispose();
  });
  it('retires an unclaimed valid epoch so it cannot be replayed after a listener arrives', () => {
    const h = harness(); expect(h.transfer(descriptor).close).toHaveBeenCalledOnce();
    const receive = vi.fn(); h.bridge.onPort(receive);
    expect(h.transfer(descriptor).close).toHaveBeenCalledOnce(); expect(receive).not.toHaveBeenCalled(); h.bridge.dispose();
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

describe('isolated preload transfer and API', () => {
  it('validates before transfer, supplies a fixed source marker and never clones ports through contextBridge', async () => {
    vi.resetModules(); native.listeners.clear();
    const postMessage = vi.fn(); vi.stubGlobal('window', { postMessage });
    try {
      await import('../src/preload/index');
      const deliver = (value: unknown, ports: any[]) => { for (const cb of native.listeners.get('online:port') ?? []) cb({ ports }, value); };
      const first = { close: vi.fn() }; deliver({ version: 1, descriptor }, [first]);
      expect(postMessage).toHaveBeenCalledWith({ source: 'ftlite:online:main', version: 1, descriptor }, '*', [first]);
      for (const value of [{ version: 1, descriptor }, { version: 2, descriptor: { ...descriptor, epoch: 2 } }, { version: 1, descriptor: { ...descriptor, epoch: 2, token: 'private' } }]) {
        const p = { close: vi.fn() }; deliver(value, [p]); expect(p.close).toHaveBeenCalledOnce();
      }
      expect(native.exposed.online.onPort).toBeUndefined(); expect(native.exposed.invoke).toBeUndefined(); expect(native.exposed.send).toBeUndefined();
      const off = native.exposed.onSuspend(() => {}); expect(native.listeners.get('app:suspend')?.size).toBe(1); off(); expect(native.listeners.get('app:suspend')?.size).toBe(0);
      native.invoke.mockResolvedValueOnce({ ok: true, token: 'private' }).mockRejectedValueOnce(Error('private'));
      expect(await native.exposed.online.host(2)).toEqual({ ok: false, code: 'invalid-status' });
      expect(await native.exposed.online.host(2)).toEqual({ ok: false, code: 'unavailable' });
      const calls = native.invoke.mock.calls.length;
      expect(await native.exposed.online.host(9)).toEqual({ ok: false, code: 'invalid-action' }); expect(native.invoke.mock.calls.length).toBe(calls);
      const statusCb = vi.fn(), offStatus = native.exposed.online.onStatus(statusCb);
      for (const cb of native.listeners.get('online:status') ?? []) { cb({}, { version: 2, revision: 1, status }); cb({}, { version: 1, revision: 1, status }); }
      expect(statusCb).toHaveBeenCalledTimes(1); offStatus(); expect(native.listeners.get('online:status')?.size).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });
});

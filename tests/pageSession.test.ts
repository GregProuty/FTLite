import { describe, expect, it, vi } from 'vitest';
import { createPageOnline } from '../src/renderer/src/app/online/pageSession';
import { createMemoryRecordStore } from '../src/network/online/recordStore';
import { DISABLED_PAGE_ONLINE_CONFIG, type PageOnlineConfig } from '../src/shared/onlineConfig';
import type { OnlineSessionDeps, OnlineSessionOwner } from '../src/network/online/onlineSession';

const status = () => ({ phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null,
  mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: false, actions: ['host'] } as const);
const descriptor = { epoch: 1, runId: 'a'.repeat(32), hostGeneration: 1, seatId: 1, compatibility: { protocolVersion: 2 as const, modeId: 'duel', schemaVersion: 2, simVersion: 35, contentDigest: 'b'.repeat(64), layoutHash: '12345678' } };
const config = (overrides: Partial<PageOnlineConfig> = {}): PageOnlineConfig => ({ serviceOrigin: 'http://127.0.0.1:8787', iceMode: 'loopback', allowInsecureLocalhost: true,
  packaged: false, sectorOnlineTest: false, duelTestSeed: null, testProbe: false, ...overrides });
function harness(pageConfig: PageOnlineConfig = config()) {
  const listeners = new Set<(value: any) => void>(); let deps!: OnlineSessionDeps;
  const owner: OnlineSessionOwner = { dispatch: vi.fn(async () => ({ ok: true as const })), status: vi.fn(status),
    subscribe: cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, suspend: vi.fn(async () => {}), resume: vi.fn(async () => {}),
    prepareExit: vi.fn(async () => {}), dispose: vi.fn(async () => {}), releaseForUnload: vi.fn(), linkStats: vi.fn(() => ({ route: 'lan' as const, rttMs: 4 })) };
  const suspends = new Set<() => void>(), resumes = new Set<() => void>();
  const lifecycle = { onSuspend: (cb: () => void) => { suspends.add(cb); return () => { suspends.delete(cb); }; },
    onResume: (cb: () => void) => { resumes.add(cb); return () => { resumes.delete(cb); }; }, dispose: vi.fn() };
  const win = new EventTarget() as EventTarget & Record<string, any>;
  const online = createPageOnline(pageConfig, { window: win, records: createMemoryRecordStore(), lifecycle, fetch: vi.fn() as never,
    WebSocket: class {} as never, hostPlatform: vi.fn() as never, createSession: d => { deps = d; return owner; } });
  return { online, owner, deps: () => deps, win, suspends, resumes, lifecycle, push: (value: unknown) => { for (const cb of [...listeners]) cb(value); } };
}
describe('the page online session (web build spec §3.3)', () => {
  it('builds the session from the page config: origin, loopback ICE, test entries and a 32-hex nonce', () => {
    const h = harness(config({ sectorOnlineTest: true, duelTestSeed: 7 })), d = h.deps();
    expect(d.config).toEqual({ enabled: true, baseUrl: 'http://127.0.0.1:8787', allowInsecureLocalhost: true, iceMode: 'loopback' });
    expect(d.sectorTestEntry).toBe(true); expect(d.duelTestSeed).toBe(7); expect(d.nonce()).toMatch(/^[0-9a-f]{32}$/);
    expect(harness(DISABLED_PAGE_ONLINE_CONFIG).deps().config).toEqual({ enabled: false });
  });
  it('refuses an invalid config', () => {
    expect(() => createPageOnline(config({ packaged: true, testProbe: true }), { window: new EventTarget() })).toThrow('invalid-online-config');
  });
  it('validates actions before dispatch and copies results', async () => {
    const h = harness();
    expect(await h.online.rehost()).toEqual({ ok: true }); expect(h.owner.dispatch).toHaveBeenLastCalledWith({ type: 'rehost' });
    expect(await h.online.host({ mode: 'duel', capacity: 3 })).toEqual({ ok: true }); expect(h.owner.dispatch).toHaveBeenLastCalledWith({ type: 'host', mode: 'duel', capacity: 3 });
    const calls = vi.mocked(h.owner.dispatch).mock.calls.length;
    expect(await h.online.host({ mode: 'sector', capacity: 9 })).toEqual({ ok: false, code: 'invalid-action' }); expect(vi.mocked(h.owner.dispatch).mock.calls.length).toBe(calls);
    vi.mocked(h.owner.dispatch).mockResolvedValueOnce({ ok: true, token: 'private' } as never).mockRejectedValueOnce(Error('private'));
    expect(await h.online.join('ABCDEFGH')).toEqual({ ok: false, code: 'invalid-status' }); expect(await h.online.leave()).toEqual({ ok: false, code: 'unavailable' });
  });
  it('pushes revisioned status envelopes, never unknown fields, and answers reads with the latest', async () => {
    const h = harness(), seen: any[] = []; h.online.onStatus(value => seen.push(value));
    expect(await h.online.readStatus()).toEqual({ version: 1, revision: 1, status: status() });
    h.push({ ...status(), persistent: true }); h.push({ ...status(), seatToken: 'private' });
    expect(seen.map(v => v.revision)).toEqual([2, 3]); expect(seen[0].status.persistent).toBe(true);
    expect(seen[1].status.phase).toBe('error'); expect(JSON.stringify(seen)).not.toContain('private');
    expect(((await h.online.readStatus()) as { revision: number }).revision).toBe(3);
  });
  it('answers link figures with the route and RTT only', async () => {
    const h = harness(); expect(await h.online.linkStats!()).toEqual({ route: 'lan', rttMs: 4 });
    vi.mocked(h.owner.linkStats!).mockReturnValueOnce({ route: 'lan', rttMs: 4, address: '192.0.2.1' } as never); expect(await h.online.linkStats!()).toBeNull();
  });
  it('feeds the lifecycle to the session and releases on a non-persisted pagehide only', () => {
    const h = harness(); for (const cb of h.suspends) cb(); for (const cb of h.resumes) cb();
    expect(h.owner.suspend).toHaveBeenCalledOnce(); expect(h.owner.resume).toHaveBeenCalledOnce();
    h.win.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true })); expect(h.owner.releaseForUnload).not.toHaveBeenCalled();
    h.win.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: false })); expect(h.owner.releaseForUnload).toHaveBeenCalledOnce();
    expect(h.lifecycle.dispose).toHaveBeenCalledOnce(); expect(h.suspends.size).toBe(0);
    h.win.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: false })); expect(h.owner.releaseForUnload).toHaveBeenCalledOnce();
  });
  it('runs the exit save then disposal for app:prepare-exit, and still disposes when the save fails', async () => {
    const h = harness(); vi.mocked(h.owner.prepareExit).mockRejectedValueOnce(Error('save'));
    await expect(h.online.prepareExit()).resolves.toBeUndefined();
    expect(h.owner.dispose).toHaveBeenCalledOnce(); expect(h.lifecycle.dispose).toHaveBeenCalledOnce();
  });
  it('hands game ports to one onPort listener and keeps the session off window', () => {
    const h = harness(), received = vi.fn(), early = { close: vi.fn() } as never as MessagePort & { close: ReturnType<typeof vi.fn> };
    expect(() => h.deps().platform.publishPort(descriptor, early)).toThrow('invalid-port'); expect(early.close).toHaveBeenCalledOnce();
    h.online.onPort(received); expect(() => h.online.onPort(vi.fn())).toThrow('invalid-port');
    const next = { close: vi.fn() } as never; h.deps().platform.publishPort({ ...descriptor, epoch: 2 }, next);
    expect(received).toHaveBeenCalledWith({ ...descriptor, epoch: 2 }, next);
    expect(Object.getOwnPropertyNames(h.win)).toEqual([]);
  });
  it('exposes the test probe only when unpackaged and asked (Web-i deviation D-1)', () => {
    const h = harness(config({ testProbe: true })), events: any[] = [];
    h.win.addEventListener('ftlite:online:test-port', event => events.push((event as CustomEvent).detail));
    h.online.onPort(vi.fn()); const p = { close: vi.fn() } as never; h.deps().platform.publishPort(descriptor, p);
    expect(events).toEqual([{ descriptor, port: p }]);
    expect(Object.isFrozen(h.win.__ftliteOnlineTest)).toBe(true); expect(typeof h.win.__ftliteOnlineTest.readStatus).toBe('function');
    expect(h.win.__ftliteOnlineTest.prepareExit).toBeUndefined();
  });
});

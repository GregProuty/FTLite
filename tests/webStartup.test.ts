// Browser start-up (web build spec §7.3, §7.4, §7.5, §7.7): the API checks and Safari, the ftlite-online Web Lock,
// navigator.storage.persist() on the first online use (a refusal is not an error), and the first-gesture audio unlock.
import { describe, expect, it, vi } from 'vitest';
import { checkBrowserSupport, isSafari, ONE_TAB_TEXT, SAFARI_NOTE, UNSUPPORTED_TEXT } from '../src/renderer/src/app/web/browserSupport';
import { acquireOnlineLock, ONLINE_LOCK_NAME } from '../src/renderer/src/app/web/onlineLock';
import { installAudioUnlock } from '../src/renderer/src/app/audioUnlock';
import { createPageOnline } from '../src/renderer/src/app/online/pageSession';
import { createMemoryRecordStore } from '../src/network/online/recordStore';
import type { OnlineSessionOwner } from '../src/network/online/onlineSession';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';
const full = () => ({ RTCPeerConnection: function () {}, Worker: function () {}, indexedDB: {}, crypto: { subtle: {}, getRandomValues: () => {} }, MessageChannel: function () {},
  navigator: { locks: {}, userAgent: CHROME, vendor: 'Google Inc.' } });

describe('checkBrowserSupport', () => {
  it('needs every API, and names the missing ones', () => {
    expect(checkBrowserSupport(full())).toEqual({ ok: true, missing: [], safari: false });
    const g = full() as any; delete g.RTCPeerConnection; g.navigator.locks = undefined; g.crypto.subtle = undefined;
    expect(checkBrowserSupport(g)).toEqual({ ok: false, missing: ['RTCPeerConnection', 'crypto.subtle', 'navigator.locks'], safari: false });
  });
  it('knows Safari, and only Safari', () => {
    expect(isSafari(SAFARI, 'Apple Computer, Inc.')).toBe(true);
    expect(isSafari(CHROME, 'Google Inc.')).toBe(false); expect(isSafari(FIREFOX, '')).toBe(false);
    expect(isSafari(SAFARI.replace('Version/18.0', 'CriOS/140.0'), 'Apple Computer, Inc.')).toBe(false);
  });
  it('carries the spec texts', () => {
    expect(UNSUPPORTED_TEXT).toBe('FTLite needs a recent Chrome, Edge or Firefox on a computer.');
    expect(SAFARI_NOTE).toBe('Safari is not tested'); expect(ONE_TAB_TEXT).toBe('FTLite is already open in another tab');
  });
});

describe('acquireOnlineLock', () => {
  it('holds ftlite-online while available, and is unavailable without a working lock manager', async () => {
    let held: Promise<unknown> | undefined;
    const free = { request: vi.fn((name: string, opts: { ifAvailable: boolean }, cb: (lock: object | null) => Promise<unknown> | undefined) => { held = cb({}); return Promise.resolve(); }) };
    const lock = await acquireOnlineLock(free as never);
    expect(free.request.mock.calls[0]!.slice(0, 2)).toEqual([ONLINE_LOCK_NAME, { ifAvailable: true }]); expect(lock.state).toBe('held');
    let released = false; void held!.then(() => { released = true; }); (lock as { release(): void }).release(); await Promise.resolve(); await Promise.resolve();
    expect(released).toBe(true);
    expect(await acquireOnlineLock(undefined)).toEqual({ state: 'unavailable' });
    expect(await acquireOnlineLock({ request: () => Promise.reject(Object.assign(Error('x'), { name: 'SecurityError' })) } as never)).toEqual({ state: 'unavailable' });
    expect(await acquireOnlineLock({ request: () => { throw Error('sync'); } } as never)).toEqual({ state: 'unavailable' });
  });
  it('retries a busy lock once with a waiting, time-limited request (a reload racing its old document)', async () => {
    const calls: object[] = [];
    const later = { request: vi.fn((_n: string, opts: object, cb: (lock: object | null) => unknown) => { calls.push(opts);
      if (calls.length === 1) { cb(null); return Promise.resolve(); } cb({}); return Promise.resolve(); }) };
    expect((await acquireOnlineLock(later as never, { retryMs: 30 })).state).toBe('held');
    expect(calls[0]).toEqual({ ifAvailable: true }); expect((calls[1] as { signal: unknown }).signal).toBeInstanceOf(AbortSignal);
    const still = { request: vi.fn((_n: string, opts: { ifAvailable?: boolean }, cb: (lock: null) => unknown) => {
      if (opts.ifAvailable) { cb(null); return Promise.resolve(); } return Promise.reject(Object.assign(Error('t'), { name: 'TimeoutError' })); }) };
    expect(await acquireOnlineLock(still as never, { retryMs: 30 })).toEqual({ state: 'busy' });
  });
  it('gives up after its start-up limit, and releases a grant that arrives later', async () => {
    let grant: ((lock: object) => Promise<unknown> | undefined) | undefined;
    const stuck = { request: vi.fn((_n: string, _o: object, cb: (lock: object) => Promise<unknown> | undefined) => { grant = cb; return new Promise(() => {}); }) };
    const began = performance.now();
    expect(await acquireOnlineLock(stuck as never, { timeoutMs: 50 })).toEqual({ state: 'unavailable' });
    expect(performance.now() - began).toBeLessThan(1000);
    expect(grant!({})).toBeUndefined();   // returning no promise lets the late lock go at once
  });
});

describe('storage persistence on first online use', () => {
  it('asks once, on the first host/join/reconnect/rehost, and survives a refusal', async () => {
    const persistStorage = vi.fn(async () => { throw Error('refused'); });
    const owner: OnlineSessionOwner = { dispatch: vi.fn(async () => ({ ok: true as const })), status: () => ({ phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null,
      retryAtMs: null, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: false, actions: ['host'] }) as never,
      subscribe: () => () => {}, suspend: vi.fn(async () => {}), resume: vi.fn(async () => {}), prepareExit: vi.fn(async () => {}), dispose: vi.fn(async () => {}), releaseForUnload: vi.fn() };
    const lifecycle = { onSuspend: () => () => {}, onResume: () => () => {}, dispose: vi.fn() };
    const online = createPageOnline({ serviceOrigin: 'http://127.0.0.1:8787', iceMode: 'loopback', allowInsecureLocalhost: true, packaged: false, sectorOnlineTest: false, duelTestSeed: null, testProbe: false },
      { window: new EventTarget() as never, records: createMemoryRecordStore(), lifecycle, fetch: vi.fn() as never, WebSocket: class {} as never, hostPlatform: vi.fn() as never,
        createSession: () => owner, persistStorage });
    await online.ready(true); expect(persistStorage).not.toHaveBeenCalled();
    expect(await online.join('ABCDEFGH')).toEqual({ ok: true }); expect(persistStorage).toHaveBeenCalledOnce();
    await online.host({ mode: 'duel', capacity: 2 }); await online.reconnect(); expect(persistStorage).toHaveBeenCalledOnce();
  });
});

describe('installAudioUnlock', () => {
  it('resumes audio on the first key or pointer event and on every focus', () => {
    const t = new EventTarget(), audio = { unlock: vi.fn() }, off = installAudioUnlock(t as never, audio);
    t.dispatchEvent(new Event('pointerdown')); t.dispatchEvent(new Event('pointerdown')); t.dispatchEvent(new Event('keydown'));
    expect(audio.unlock).toHaveBeenCalledTimes(2);
    t.dispatchEvent(new Event('focus')); t.dispatchEvent(new Event('focus')); expect(audio.unlock).toHaveBeenCalledTimes(4);
    off(); t.dispatchEvent(new Event('focus')); expect(audio.unlock).toHaveBeenCalledTimes(4);
  });
});

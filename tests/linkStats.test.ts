// The link figures (H-2 spec §8, §9): the hidden window labels the selected candidate pair's route and reports it with
// the RTT once a second; main keeps the newest for a ready attempt and answers the renderer's one named channel. Only
// the label and the RTT cross any boundary, never a candidate or address.
import { describe, expect, it, vi } from 'vitest';
import { localAddress, rtcRoute } from '../src/network/rtc/route';
import { createTransportController, STATS_MS } from '../src/network/transport/controller';
import { createRtcTransport } from '../src/network/transport/owner';
import { isRtcResponse, type RtcAttemptOptions, type RtcRequest, type RtcResponse } from '../src/shared/rtcSession';
import { validateOnlineLinkStats } from '../src/shared/onlineSession';
import type { PortEndpoint } from '../src/shared/netSession';
import type { Link } from '../src/renderer/src/net/contracts';
import { createPageOnline } from '../src/renderer/src/app/online/pageSession';
import { createMemoryRecordStore } from '../src/network/online/recordStore';

const identity = { modeId: 'counter', schemaVersion: 1, simVersion: 9, contentDigest: 'a'.repeat(64), hostGeneration: 7 };
function config(attemptId: string): RtcAttemptOptions {
  return { attemptId, role: 'offerer', identity: { ...identity, protocolVersion: 2, layoutHash: '1234abcd', runId: 'run', roomId: 'room', seatGeneration: 1,
    localConnectionId: 'host', remoteConnectionId: attemptId }, localTicket: 'local', expectedRemoteTicket: 'remote', ticketExpiresAtEpochMs: Date.now() + 20000, iceServers: [] };
}

describe('the route label (spec §8)', () => {
  const c = (candidateType: string, address?: string) => ({ candidateType, ...(address ? { address } : {}) });
  it('two host candidates are lan; any relay or server-reflexive candidate is internet', () => {
    expect(rtcRoute(c('host'), c('host'))).toBe('lan');
    for (const [l, r] of [['relay', 'host'], ['host', 'relay'], ['host', 'srflx'], ['srflx', 'host'], ['relay', 'srflx']]) expect(rtcRoute(c(l!), c(r!))).toBe('internet');
  });
  it('a peer-reflexive candidate is judged by its address, a hidden remote one by the local host candidate; unknown gives no label', () => {
    expect(rtcRoute(c('host'), c('prflx', '192.168.1.20'))).toBe('lan');
    expect(rtcRoute(c('host'), c('prflx', '203.0.113.9'))).toBe('internet');
    // Chromium hides a remote prflx address: only on a direct attempt (no STUN/TURN) does a private local host decide;
    // with ICE servers configured a NATed internet peer looks the same, so the route is unknown.
    expect(rtcRoute(c('host', '192.168.1.5'), c('prflx'), true)).toBe('lan');
    expect(rtcRoute(c('host', '192.168.1.5'), c('prflx'))).toBeNull();
    expect(rtcRoute(c('host', '203.0.113.4'), c('prflx'), true)).toBeNull();
    expect(rtcRoute(c('host'), c('prflx'))).toBeNull();
    expect(rtcRoute(c('prflx'), c('prflx'))).toBeNull();
    // A local prflx candidate is checked by its own address too.
    expect(rtcRoute(c('prflx', '10.0.0.3'), c('host'))).toBe('lan');
    expect(rtcRoute(c('prflx', '198.51.100.2'), c('host'))).toBe('internet');
    expect(rtcRoute(c('prflx'), c('host'))).toBeNull();
    expect(rtcRoute(undefined, c('host'))).toBeNull();
    expect(rtcRoute(c('host'), c('mystery'))).toBeNull();
    for (const a of ['10.0.0.2', '172.16.4.4', '172.31.0.1', '192.168.0.9', '169.254.1.1', '127.0.0.1', 'abcd-1234.local', 'fd12::1', 'fe80::1', '::1']) expect(localAddress(a)).toBe(true);
    for (const a of ['172.32.0.1', '8.8.8.8', '2001:db8::1', 7]) expect(localAddress(a)).toBe(false);
  });
});

describe('the hidden window reports a ready attempt once a second (spec §8)', () => {
  class Port implements PortEndpoint {
    messages = new Set<(data: unknown) => void>(); closes = new Set<() => void>(); closed = false;
    postMessage() {} onMessage(cb: (data: unknown) => void) { this.messages.add(cb); return () => { this.messages.delete(cb); }; }
    onClose(cb: () => void) { this.closes.add(cb); return () => { this.closes.delete(cb); }; }
    start() {} close() { this.closed = true; }
  }
  function rig() {
    const responses: RtcResponse[] = [], timers: { at: number; cb: () => void }[] = [];
    let now = 0, route: 'lan' | 'internet' | null = null, rttMs: number | null = 3.04, resolve!: (link: Link) => void, closeLink = () => {};
    const scheduler = { schedule(ms: number, cb: () => void) { const t = { at: now + ms, cb }; timers.push(t); return () => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); }; } };
    const controller = createTransportController({ identity, respond: (r) => responses.push(r), wallNow: () => Date.now(), clock: { nowMs: () => 0 }, scheduler,
      createPeer() { const ready = new Promise<Link>((done) => { resolve = done; });
        return { ready, close() {}, receiveSignal: async () => {}, linkFigures: () => ({ route, rttMs }), diagnostics: () => ({ rttMs: rttMs ?? 0, lossPct: 0, bufferedBytes: 0, relayed: false }) }; } });
    const link: Link = { peer: 'p', caps: { unreliable: true, maxDatagram: 16088, p2p: true, hidesPeerIp: false }, send() {}, stats: () => ({ rttMs: 0, lossPct: 0, relayed: false, bufferedBytes: 0 }),
      onMessage: () => () => {}, onClose(cb) { closeLink = () => cb('closed'); return () => {}; }, close() { closeLink(); } };
    return { controller, responses, timers, link, resolve: () => resolve(link), closeLink: () => closeLink(),
      advance(ms: number) { now += ms; for (const t of timers.filter((x) => x.at <= now)) { timers.splice(timers.indexOf(t), 1); t.cb(); } },
      set(r: typeof route, ms = rttMs) { route = r; rttMs = ms; } };
  }
  it('sends nothing until the peer has a route and a real RTT, then its RTT and label only, every STATS_MS; it stops on close', async () => {
    const h = rig();
    h.controller.receive({ version: 1, kind: 'start', hostGeneration: 7, requestId: 1, options: config('a') }, [new Port()]);
    h.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(h.responses.map((r) => r.kind)).toEqual(['port-ready', 'ready']);
    h.advance(STATS_MS); expect(h.responses.filter((r) => r.kind === 'stats')).toEqual([]);   // no sample yet
    h.set('lan', null); h.advance(STATS_MS); expect(h.responses.filter((r) => r.kind === 'stats')).toEqual([]);   // no RTT in the sample: not a 0 ms figure
    h.set('lan', 3.04); h.advance(STATS_MS); h.set('internet', 41.27); h.advance(STATS_MS);
    const stats = h.responses.filter((r) => r.kind === 'stats');
    expect(stats).toEqual([{ version: 1, hostGeneration: 7, requestId: 1, attemptId: 'a', kind: 'stats', rttMs: 3, route: 'lan' }, { version: 1, hostGeneration: 7, requestId: 1, attemptId: 'a', kind: 'stats', rttMs: 41.3, route: 'internet' }]);
    expect(stats.every(isRtcResponse)).toBe(true);
    h.closeLink(); h.advance(STATS_MS * 3);
    expect(h.responses.filter((r) => r.kind === 'stats')).toHaveLength(2); expect(h.timers).toHaveLength(0);
    h.controller.dispose();
  });
  it('the response schema admits only a bounded RTT and the two labels', () => {
    const base = { version: 1, hostGeneration: 7, requestId: 1, attemptId: 'a', kind: 'stats' };
    expect(isRtcResponse({ ...base, rttMs: 0, route: 'internet' })).toBe(true);
    for (const bad of [{ ...base, rttMs: -1, route: 'lan' }, { ...base, rttMs: 60001, route: 'lan' }, { ...base, rttMs: 4, route: 'relay' }, { ...base, rttMs: 4, route: 'lan', address: '10.0.0.1' }, { ...base, route: 'lan' }])
      expect(isRtcResponse(bad)).toBe(false);
  });
});

describe('main keeps the figures of a ready attempt and answers one named channel (spec §8)', () => {
  it('the transport owner forwards stats for a ready attempt only', async () => {
    let receive = (_: unknown) => {};
    const requests: RtcRequest[] = [], seen = vi.fn();
    const owner = createRtcTransport(identity, { send(message) { requests.push(message); }, onResponse(cb) { receive = cb; return () => {}; }, dispose() {} });
    owner.onStats!(seen);
    const started = owner.startAttempt(config('a'), { close() {} } as never), request = requests[0]!;
    const reply = (kind: string, extra = {}) => receive({ version: 1, hostGeneration: 7, requestId: request.requestId, attemptId: 'a', kind, ...extra });
    reply('stats', { rttMs: 5, route: 'lan' }); expect(seen).not.toHaveBeenCalled();   // not ready yet
    reply('port-ready'); reply('ready', { latestPayloadLimit: 16088 }); await started;
    reply('stats', { rttMs: 5, route: 'lan' });
    receive({ version: 1, hostGeneration: 7, requestId: request.requestId + 1, attemptId: 'a', kind: 'stats', rttMs: 9, route: 'lan' });   // another generation
    expect(seen.mock.calls).toEqual([['a', { rttMs: 5, route: 'lan' }]]);
    await owner.dispose();
  });
  it('the page facade answers validated figures only (web build spec §3.3)', async () => {
    let stats: unknown = { route: 'internet', rttMs: 48.5 };
    const owner = { dispatch: vi.fn(async () => ({ ok: true as const })), status: () => ({ phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null,
      mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: false, actions: [] }),
      subscribe: () => () => {}, suspend: async () => {}, resume: async () => {}, prepareExit: async () => {}, dispose: async () => {}, releaseForUnload() {}, linkStats: () => stats as never };
    const online = createPageOnline({ serviceOrigin: null, iceMode: 'turn', allowInsecureLocalhost: false, packaged: true, sectorOnlineTest: false, duelTestSeed: null, testProbe: false },
      { window: new EventTarget(), records: createMemoryRecordStore(), lifecycle: { onSuspend: () => () => {}, onResume: () => () => {}, dispose() {} }, createSession: () => owner as never });
    expect(await online.linkStats!()).toEqual({ route: 'internet', rttMs: 48.5 });
    stats = { route: 'internet', rttMs: 48.5, address: '203.0.113.9' }; expect(await online.linkStats!()).toBeNull();
    stats = null; expect(await online.linkStats!()).toBeNull();
    await online.dispose();
  });
  it('the shared figures are exactly a route label and a bounded RTT', () => {
    expect(validateOnlineLinkStats({ route: 'lan', rttMs: 0 })).toBe(true);
    for (const bad of [null, { route: 'lan' }, { route: 'wan', rttMs: 1 }, { route: 'lan', rttMs: Number.NaN }, { route: 'lan', rttMs: 1, candidate: 'x' }]) expect(validateOnlineLinkStats(bad)).toBe(false);
  });
});

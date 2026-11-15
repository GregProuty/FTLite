import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoomServiceClient, type RoomServiceSocket, type RoomServiceSocketEvent } from '../src/network/session/serviceClient';
import { type RoomSnapshot, type SeatSession, type ServerPayload, type ReplyOutcome } from '../src/shared/roomSession';

const compatibility = { protocolVersion: 2, modeId: 'opaque', schemaVersion: 2, simVersion: 35, contentDigest: 'a'.repeat(64), layoutHash: 'b87a0284' } as const;
const snapshot: RoomSnapshot = { roomId: '1'.repeat(32), runId: '2'.repeat(32), joinCode: 'ABCDEFGH', compatibility, capacity: 2, hostSeatId: 0, hostGeneration: 1, phase: 'lobby', rosterRevision: 1,
  seats: [0, 1].map(seatId => ({ seatId, seatGeneration: 1, occupied: true, connected: true, ready: false })) };
const session: SeatSession = { snapshot, seatId: 0, seatGeneration: 1, seatToken: 'T'.repeat(43) };
class Socket implements RoomServiceSocket {
  readyState = 1; bufferedAmount = 0; sent: string[] = []; closed = false;
  listeners = new Map<string, Set<(e: RoomServiceSocketEvent) => void>>();
  send(value: string) { this.sent.push(value); }
  close() { this.closed = true; }
  addEventListener(type: string, cb: (e: RoomServiceSocketEvent) => void) { const set = this.listeners.get(type) ?? new Set(); set.add(cb); this.listeners.set(type, set); }
  removeEventListener(type: string, cb: (e: RoomServiceSocketEvent) => void) { this.listeners.get(type)?.delete(cb); }
  emit(type: string, data?: unknown) { for (const cb of [...this.listeners.get(type) ?? []]) cb({ type, data }); }
  sequence = 0;
  event(payload: ServerPayload) { this.emit('message', JSON.stringify({ sequence: ++this.sequence, payload })); }
  reply(requestId: number, outcome: ReplyOutcome) { this.event({ type: 'reply', requestId, outcome }); }
  frames() { return this.sent.map(s => JSON.parse(s) as { type: string; requestId?: number; sequence?: number }); }
}
const clients: ReturnType<typeof createRoomServiceClient>[] = [];
afterEach(() => { for (const c of clients.splice(0)) c.close(); vi.useRealTimers(); });
const clock = { nowMs: () => Date.now(), setTimeout: (cb: () => void, ms: number) => setTimeout(cb, ms), clearTimeout: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>) };
function rig(fetcher: (url: string, init?: RequestInit) => Promise<Response> = async url => Response.json(url.endsWith('/socket-ticket') ? { ticket: 'S'.repeat(43), connectionId: '3'.repeat(32), expiresAtEpochMs: Date.now() + 5000 } : session)) {
  const socket = new Socket(), urls: string[] = [];
  const fetch = vi.fn(fetcher);
  const c = createRoomServiceClient({ baseUrl: 'https://service', fetch, createWebSocket: url => { urls.push(url); return socket; }, clock }); clients.push(c);
  return { c, socket, fetch, urls };
}
async function connected(r = rig()) {
  const waiting = r.c.connect(session); await vi.waitFor(() => expect(r.socket.sent).toHaveLength(1));
  r.socket.event({ type: 'authenticated', session: { snapshot, seatId: 0, seatGeneration: 1 } }); await waiting;
  return r;
}
describe('generic room service client', () => {
  it.each(['http://example.com', 'https://user:pass@service', 'https://service?q=x', 'https://service/#x', 'http://127.1', 'https://service/prefix'])('rejects unsafe service base %s', baseUrl => {
    expect(() => createRoomServiceClient({ baseUrl, fetch: globalThis.fetch, createWebSocket: () => new Socket(), clock })).toThrow('invalid-request');
  });
  it('uses private Authorization, redirect rejection and a token-free first WS auth/URL', async () => {
    const r = await connected();
    expect(r.urls).toEqual(['wss://service/v2/rooms/' + '1'.repeat(32) + '/socket']);
    expect(r.fetch.mock.calls[0]![1]).toMatchObject({ redirect: 'error', headers: { Authorization: 'Bearer ' + session.seatToken } });
    expect(r.socket.frames()[0]).toEqual({ type: 'auth', ticket: 'S'.repeat(43), connectionId: '3'.repeat(32) });
    expect(r.socket.sent.join('')).not.toContain(session.seatToken);
  });
  it('correlates out-of-order replies without allocating IDs for ACK', async () => {
    const { c, socket } = await connected();
    const a = c.request({ type: 'ready', ready: true }), b = c.request({ type: 'host-release' });
    socket.reply(2, { kind: 'void' }); socket.reply(1, { kind: 'snapshot', snapshot });
    expect(await a).toEqual({ kind: 'snapshot', snapshot }); expect(await b).toEqual({ kind: 'void' });
    expect(socket.frames().filter(f => f.requestId).map(f => f.requestId)).toEqual([1, 2]);
  });
  it.each([
    { kind: 'void' },
    { kind: 'snapshot', snapshot: { ...snapshot, roomId: '9'.repeat(32) } },
    { kind: 'snapshot', snapshot: { ...snapshot, seats: snapshot.seats.map(s => ({ ...s, seatGeneration: 2 })) } },
  ])('rejects wrong ready reply before resolution: %j', async outcome => {
    const { c, socket } = await connected(); const p = c.request({ type: 'ready', ready: true });
    socket.reply(1, outcome as ReplyOutcome); await expect(p).rejects.toThrow('invalid-frame'); expect(socket.closed).toBe(true);
  });
  it.each(['gap', 'duplicate', 'unknown-id', 'binary', 'oversized', 'extra-key'])('fails closed and removes listeners on %s', async mode => {
    const { c, socket } = await connected(); const p = c.request({ type: 'ready', ready: true });
    if (mode === 'unknown-id') socket.reply(9, { kind: 'void' });
    else if (mode === 'binary') socket.emit('message', new Uint8Array([1]));
    else if (mode === 'oversized') socket.emit('message', ' '.repeat(98305));
    else socket.emit('message', JSON.stringify({ sequence: mode === 'gap' ? 3 : mode === 'duplicate' ? 1 : 2, payload: { type: 'roster', snapshot }, ...(mode === 'extra-key' ? { leak: session.seatToken } : {}) }));
    await expect(p).rejects.toThrow('invalid-frame'); expect([...socket.listeners.values()].every(v => v.size === 0)).toBe(true);
  });
  it('enforces 64 pending before allocation and reuses available capacity without gaps', async () => {
    const { c, socket } = await connected(); const ps = Array.from({ length: 64 }, () => c.request({ type: 'host-release' }));
    ps.forEach(p => void p.catch(() => {}));
    await expect(c.request({ type: 'host-release' })).rejects.toThrow('capacity');
    socket.reply(1, { kind: 'void' }); await ps[0];
    const next = c.request({ type: 'host-release' }); void next.catch(() => {});
    expect(socket.frames().filter(f => f.requestId).at(-1)?.requestId).toBe(65);
  });
  it('bounds aggregate pending bytes and rejects oversized outbound frames before send', async () => {
    const { c, socket } = await connected();
    const operation = { type: 'start-propose', expectedRosterRevision: 1, initBase64: btoa('x'.repeat(65536)), initHash: 'a'.repeat(64) } as const;
    const a = c.request(operation), b = c.request(operation); void a.catch(() => {}); void b.catch(() => {});
    await expect(c.request(operation)).rejects.toThrow('capacity');
    await expect(c.request({ ...operation, initBase64: btoa('x'.repeat(65537)) })).rejects.toThrow('invalid-request');
    expect(socket.frames().filter(f => f.requestId)).toHaveLength(2);
  });
  it('dispatches link-issued synchronously before a following signal and ACKs after dispatch', async () => {
    const { c, socket } = await connected(), seen: string[] = [];
    const identity = { ...compatibility, roomId: snapshot.roomId, runId: snapshot.runId, hostGeneration: 1, seatGeneration: 1, localConnectionId: '3'.repeat(32), remoteConnectionId: '4'.repeat(32) };
    c.onEvent(e => { seen.push(e.type); expect(socket.frames().at(-1)?.sequence).toBeLessThan(socket.sequence); });
    socket.event({ type: 'link-issued', link: { attemptId: '5'.repeat(32), role: 'offerer', identity, localTicket: 'L'.repeat(43), expectedRemoteTicket: 'R'.repeat(43), ticketExpiresAtEpochMs: Date.now() + 30000 } });
    socket.event({ type: 'signal', signal: { attemptId: '5'.repeat(32), roomId: snapshot.roomId, hostGeneration: 1, seatGeneration: 1, from: '4'.repeat(32), to: '3'.repeat(32), kind: 'candidate', candidate: null } });
    expect(seen).toEqual(['link-issued', 'signal']); expect(socket.frames().at(-1)).toEqual({ type: 'ack', sequence: 3 });
  });
  it('accepts host-changed before the matching claim reply and rejects other old-generation work', async () => {
    const { c, socket } = await connected(), nonce = '6'.repeat(32);
    const p = c.request({ type: 'rehost-claim', expectedHostGeneration: 1, nonce });
    const old = c.request({ type: 'host-release' }); void old.catch(() => {});
    const changed = { ...snapshot, hostGeneration: 2, rosterRevision: 2, phase: 'active' as const };
    const lease = { roomId: snapshot.roomId, hostSeatId: 0, hostGeneration: 2, nonce, expiresAtEpochMs: Date.now() + 15000 };
    socket.event({ type: 'host-changed', snapshot: changed, lease });
    socket.reply(1, { kind: 'lease', lease });
    await expect(p).resolves.toEqual({ kind: 'lease', lease }); await expect(old).rejects.toThrow('stale-generation');
    // The service may still reply to already accepted, locally invalidated requests.
    socket.reply(2, { kind: 'void' });
    const next = c.request({ type: 'host-release' }); socket.reply(3, { kind: 'void' }); await next;
  });
  it('cleans up when a callback closes or throws, without ACKing a disposed connection', async () => {
    for (const throws of [false, true]) {
      const { c, socket } = await connected();
      c.onEvent(() => { if (throws) throw Error(session.seatToken); c.close(); });
      socket.event({ type: 'roster', snapshot });
      expect(socket.closed).toBe(true); expect(socket.frames().at(-1)).toEqual({ type: 'ack', sequence: 1 });
    }
  });
  it('preserves host-release when host-departed precedes its reply', async () => {
    const { c, socket } = await connected();
    const release = c.request({ type: 'host-release' });
    socket.event({ type: 'host-departed', hostGeneration: 1 });
    socket.reply(1, { kind: 'void' });
    await expect(release).resolves.toEqual({ kind: 'void' });
  });
  it('bounds an unresolved socket factory and closes sockets produced after expiry', async () => {
    vi.useFakeTimers(); let release!: (s: Socket) => void;
    const s = new Socket(), c = createRoomServiceClient({ baseUrl: 'https://service', clock,
      fetch: async () => Response.json({ ticket: 'S'.repeat(43), connectionId: '3'.repeat(32), expiresAtEpochMs: Date.now() + 5000 }),
      createWebSocket: () => new Promise(r => { release = r; }) }); clients.push(c);
    const p = c.connect(session); void p.catch(() => {});
    await vi.advanceTimersByTimeAsync(5001); await expect(p).rejects.toThrow('timeout');
    release(s); await vi.advanceTimersByTimeAsync(0); expect(s.closed).toBe(true);
  });
  it('aborts a delayed create on close and does not adopt its late token', async () => {
    let release!: (r: Response) => void, signal: AbortSignal | undefined;
    const { c } = rig(async (_, init) => { signal = init?.signal ?? undefined; return new Promise(r => { release = r; }); });
    const p = c.create(compatibility, 2); c.close(); expect(signal?.aborted).toBe(true); release(Response.json(session));
    await expect(p).rejects.toThrow('stale-connection'); await expect(c.getCheckpoint()).rejects.toThrow('invalid-state');
  });
  it('lets a later join supersede create and prevents a late socket from resurrecting connect', async () => {
    let release!: (r: Response) => void;
    const r = rig(async url => url.endsWith('/join') ? Response.json(session) : new Promise(resolve => { release = resolve; }));
    const a = r.c.create(compatibility, 2); void a.catch(() => {}); const b = r.c.join('abcdefgh', compatibility); await b;
    release(Response.json(session)); await expect(a).rejects.toThrow('stale-connection');
    let socketReady!: (s: Socket) => void;
    const socket = new Socket(), c = createRoomServiceClient({ baseUrl: 'https://service', clock, fetch: async () => Response.json({ ticket: 'S'.repeat(43), connectionId: '3'.repeat(32), expiresAtEpochMs: Date.now() + 5000 }), createWebSocket: () => new Promise(r => { socketReady = r; }) }); clients.push(c);
    const connect = c.connect(session); await vi.waitFor(() => expect(socketReady).toBeTypeOf('function')); c.close(); socketReady(socket);
    await expect(connect).rejects.toThrow('stale-connection'); expect(socket.closed).toBe(true); expect(socket.sent).toEqual([]);
  });
  it('expires stalled HTTP bodies and pending requests with redacted errors', async () => {
    vi.useFakeTimers();
    const r = rig(async () => new Response(new ReadableStream({ start() {} })));
    const p = r.c.create(compatibility, 2); void p.catch(() => {}); await vi.advanceTimersByTimeAsync(5001); await expect(p).rejects.toThrow('timeout');
    const s = rig(); const connectedPromise = s.c.connect(session); await vi.advanceTimersByTimeAsync(0);
    s.socket.event({ type: 'authenticated', session: { snapshot, seatId: 0, seatGeneration: 1 } }); await connectedPromise;
    const q = s.c.request({ type: 'host-release' }); void q.catch(() => {}); await vi.advanceTimersByTimeAsync(5001); await expect(q).rejects.toThrow('timeout'); expect(s.socket.closed).toBe(true);
  });
  it('rejects malformed and credential-bearing HTTP errors without reflecting values', async () => {
    const r = rig(async () => new Response(JSON.stringify({ error: { code: 'unauthorized', retryable: false, secret: session.seatToken } }), { status: 401 }));
    await expect(r.c.create(compatibility, 2)).rejects.toThrow('invalid-frame');
    const t = rig(async () => { throw Error(session.seatToken); });
    await expect(t.c.create(compatibility, 2)).rejects.toThrow(/^unavailable$/);
  });
  it.each([
    { type: 'remove-seat', seatId: 1 }, { type: 'start-propose', expectedRosterRevision: 1, initBase64: '', initHash: 'a'.repeat(64) },
    { type: 'start-commit', proposalId: 'a'.repeat(32), expectedRosterRevision: 1 }, { type: 'link-request', guestSeatId: 1 },
    { type: 'lease-renew', nonce: 'a'.repeat(32) }, { type: 'rehost-claim', expectedHostGeneration: 1, nonce: 'b'.repeat(32) },
  ] as const)('rejects operation-mismatched outcomes for $type', async op => {
    const { c, socket } = await connected(); const p = c.request(op); socket.reply(1, { kind: 'void' });
    await expect(p).rejects.toThrow('invalid-frame');
  });
  it('redacts invalid UTF8 HTTP replies as malformed frames', async () => {
    const { c } = rig(async () => new Response(new Uint8Array([0xff])));
    await expect(c.create(compatibility, 1)).rejects.toThrow('invalid-frame');
  });
  it('rejects turn credentials immediately when host authority changes during its await', async () => {
    let release!: (r: Response) => void; let signal: AbortSignal | undefined;
    const r = await connected(rig(async (url, init) => {
      if (url.endsWith('/turn')) { signal = init?.signal ?? undefined; return new Promise(resolve => { release = resolve; }); }
      return Response.json({ ticket: 'S'.repeat(43), connectionId: '3'.repeat(32), expiresAtEpochMs: Date.now() + 5000 });
    }));
    const p = r.c.getTurn(); void p.catch(() => {});
    r.socket.event({ type: 'host-departed', hostGeneration: 1 });
    expect(signal?.aborted).toBe(true);
    release(Response.json({ iceServers: [{ urls: 'stun:example.com' }], expiresAtEpochMs: Date.now() + 10000 }));
    await expect(p).rejects.toThrow('stale-generation');
  });
  it('rejects changing host seat without a host generation transition', async () => {
    const { c, socket } = await connected(); const p = c.request({ type: 'ready', ready: true });
    socket.reply(1, { kind: 'snapshot', snapshot: { ...snapshot, hostSeatId: 1 } });
    await expect(p).rejects.toThrow('invalid-frame');
  });
  it('does not authenticate an already-closed socket and handles an opening socket once', async () => {
    for (const state of [0, 3]) {
      const r = rig(); r.socket.readyState = state;
      const p = r.c.connect(session); void p.catch(() => {});
      await vi.waitFor(() => expect(r.fetch).toHaveBeenCalled());
      if (state === 0) {
        await vi.waitFor(() => expect(r.socket.listeners.get('open')?.size).toBe(1));
        expect(r.socket.sent).toEqual([]); r.socket.readyState = 1; r.socket.emit('open'); r.socket.emit('open');
        expect(r.socket.sent).toHaveLength(1);
        r.socket.event({ type: 'authenticated', session: { snapshot, seatId: 0, seatGeneration: 1 } }); await p;
      } else await expect(p).rejects.toThrow('unavailable');
    }
  });
  it('allows explicit literal loopback HTTP and rejects redirects or oversized REST bodies', async () => {
    const c = createRoomServiceClient({ baseUrl: 'http://127.0.0.1:1234', allowInsecureLocalhost: true, clock, fetch: async () => Response.json(session), createWebSocket: () => new Socket() }); clients.push(c);
    expect((await c.create(compatibility, 2)).seatId).toBe(0);
    for (const response of [new Response(null, { status: 302, headers: { Location: 'https://other' } }), new Response('x'.repeat(8193))]) {
      const r = rig(async () => response); await expect(r.c.create(compatibility, 2)).rejects.toThrow();
    }
  });
  it('bounds immediately resolved empty reads before accepting a valid HTTP reply', async () => {
    let reads = 0;
    const { c } = rig(async () => new Response(new ReadableStream({ pull(controller) {
      if (++reads <= 65) controller.enqueue(new Uint8Array());
      else { controller.enqueue(new TextEncoder().encode(JSON.stringify(session))); controller.close(); }
    } })));
    await expect(c.create(compatibility, 2)).rejects.toThrow('invalid-frame');
    expect(reads).toBeLessThanOrEqual(66);
  });
  it('checks the absolute deadline between productive immediate response reads', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(session)); let offset = 0, calls = 0;
    vi.spyOn(clock, 'nowMs').mockImplementation(() => Date.now() + calls++ * 1000);
    const { c } = rig(async () => new Response(new ReadableStream({ pull(controller) {
      if (offset < bytes.length) controller.enqueue(bytes.slice(offset, ++offset)); else controller.close();
    } })));
    await expect(c.create(compatibility, 2)).rejects.toThrow('timeout');
    expect(offset).toBeLessThan(64);
    vi.restoreAllMocks();
  });
  it('rejects connect if its authentication ACK cannot be sent', async () => {
    const r = rig(), p = r.c.connect(session); void p.catch(() => {});
    await vi.waitFor(() => expect(r.socket.sent).toHaveLength(1));
    r.socket.send = () => { throw Error('synthetic failure'); };
    r.socket.event({ type: 'authenticated', session: { snapshot, seatId: 0, seatGeneration: 1 } });
    await expect(p).rejects.toThrow('invalid-frame');
  });
  it('does not erase a replacement connect started synchronously by an error callback', async () => {
    const r = await connected(); let replacement: Promise<RoomSnapshot> | undefined;
    r.c.onEvent(e => { if (e.type === 'error' && !replacement) { replacement = r.c.connect(session); void replacement.catch(() => {}); } });
    r.socket.emit('close');
    await vi.waitFor(() => expect(r.socket.frames().filter(f => f.type === 'auth')).toHaveLength(2));
    r.socket.sequence = 0;
    r.socket.event({ type: 'authenticated', session: { snapshot, seatId: 0, seatGeneration: 1 } });
    await expect(replacement).resolves.toEqual(snapshot);
  });
});

import { afterEach, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import worker from '../src/index';
import { createRoomServiceClient, type RoomServiceClient, type RoomServiceEvent, type RoomServiceSocket } from '../../../src/network/session/serviceClient';
import { isRtcAttemptOptions, type RtcSignal } from '../../../src/shared/rtcSession';
import type { LinkIssued, RoomSnapshot, SessionCheckpointMetadata } from '../../../src/shared/roomSession';
import { compatibility } from './helpers';
import { provider } from './turn-helpers';
import { hashBytes } from './checkpoint-helpers';

const clients: RoomServiceClient[] = [];
afterEach(() => { for (const client of clients.splice(0)) client.close(); });
/** Only this trusted workerd bridge adapts unsupported redirect:error to no-follow. */
function client() {
  const events: RoomServiceEvent[] = [], paths: string[] = [];
  let raw: WebSocket | undefined;
  const c = createRoomServiceClient({ baseUrl: 'https://service',
    clock: { nowMs: () => Date.now(), setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: id => clearTimeout(id as number) },
    async fetch(url, init) {
      expect(init?.redirect).toBe('error');
      paths.push(url);
      const headers = new Headers(init?.headers); headers.set('CF-Connecting-IP', '192.0.2.1');
      const response = await worker.fetch(new Request(url, { ...init, headers, redirect: 'manual' }), { ...env, IP_HASH_SALT: 'synthetic-runtime-test-salt' });
      if (response.redirected || response.status >= 300 && response.status < 400) { void response.body?.cancel(); throw Error('redirect rejected'); }
      return response;
    },
    async createWebSocket(url): Promise<RoomServiceSocket> {
      paths.push(url);
      const response = await worker.fetch(new Request(url.replace(/^ws/, 'http'), { headers: { Upgrade: 'websocket', 'CF-Connecting-IP': '192.0.2.1' } }), { ...env, IP_HASH_SALT: 'synthetic-runtime-test-salt' });
      expect(response.status).toBe(101);
      raw = response.webSocket!; const socket = raw; socket.accept();
      return { get readyState() { return socket.readyState; }, bufferedAmount: 0,
        send: text => socket.send(text), close: () => socket.close(1000),
        addEventListener: (type, cb) => socket.addEventListener(type, cb), removeEventListener: (type, cb) => socket.removeEventListener(type, cb) };
    },
  });
  c.onEvent(e => events.push(e)); clients.push(c);
  return { c, events, paths, raw: () => raw! };
}
async function until(predicate: () => boolean) { await expect.poll(predicate, { timeout: 2500, interval: 5 }).toBe(true); }
function latestSnapshot(events: RoomServiceEvent[], initial: RoomSnapshot) {
  for (const e of [...events].reverse()) if (e.type === 'roster' || e.type === 'host-changed') return e.snapshot;
  return initial;
}

it.each(['held', 'lost', 'timely'] as const)('keeps provisional rehost private across guest retirement and %s Directory acknowledgement', async mode => {
  const host = client(), claimant = client(), spare = client();
  const hs = await host.c.create(compatibility, 3);
  const gs = await claimant.c.join(hs.snapshot.joinCode, compatibility);
  const ss = await spare.c.join(hs.snapshot.joinCode, compatibility);
  await host.c.connect(hs); await claimant.c.connect(gs); await spare.c.connect(ss);
  for (const [peer, seat] of [[claimant, gs], [spare, ss]] as const) {
    const link = await host.c.request({ type: 'link-request', guestSeatId: seat.seatId });
    await host.c.request({ type: 'link-ready', attemptId: link.attemptId });
    await peer.c.request({ type: 'link-ready', attemptId: link.attemptId });
    await peer.c.request({ type: 'ready', ready: true });
  }
  const ready = await host.c.request({ type: 'ready', ready: true });
  const proposal = await host.c.request({ type: 'start-propose', expectedRosterRevision: ready.snapshot.rosterRevision,
    initBase64: btoa('provisional-proof'), initHash: await hashBytes(new TextEncoder().encode('provisional-proof')) });
  await host.c.request({ type: 'start-commit', proposalId: proposal.proposalId, expectedRosterRevision: ready.snapshot.rosterRevision });
  const bytes = new Uint8Array([8, 4]), metadata: SessionCheckpointMetadata = { version: 1, protocolVersion: 2,
    roomId: hs.snapshot.roomId, runId: hs.snapshot.runId, compatibility, hostGeneration: 1,
    checkpointSequence: 1, capturedTick: 5, payloadSha256: await hashBytes(bytes) };
  await host.c.putCheckpoint(metadata, bytes); await host.c.request({ type: 'host-release' });
  const stub = env.ROOMS.get(env.ROOMS.idFromName(hs.snapshot.roomId));
  let release = () => {}, entered = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await runInDurableObject(stub, room => {
    const real = room.lifecycle.directory;
    Object.defineProperty(room.lifecycle, 'directory', { configurable: true, value: {
      releaseFenced: (...args: Parameters<typeof real.releaseFenced>) => real.releaseFenced(...args),
      fenceActivation: (...args: Parameters<typeof real.fenceActivation>) => real.fenceActivation(...args),
      reserveActivation: (...args: Parameters<typeof real.reserveActivation>) => real.reserveActivation(...args),
      commitActivation: async (...args: Parameters<typeof real.commitActivation>) => {
        const result = await real.commitActivation(...args); entered = true;
        if (mode !== 'lost') { await gate; return result; }
        return { ok: false, error: { code: 'unavailable', retryable: true } };
      },
    } });
  });
  const claim = claimant.c.request({ type: 'rehost-claim', expectedHostGeneration: 1, nonce: 'a'.repeat(32) });
  void claim.catch(() => {});
  try {
    await until(() => entered);
    if (mode === 'lost') await expect(claim).rejects.toThrow('unavailable');
    await runInDurableObject(stub, room => {
      expect(room.store.activation()?.state).toBe('committed');
      expect(room.store.snapshot()).toMatchObject({ phase: 'active', hostGeneration: 2, hostSeatId: gs.seatId });
    });
    spare.c.close();
    await runInDurableObject(stub, room => {
      const row = room.sockets.rows().find(r => r.seat_id === ss.seatId);
      if (row) room.sockets.close(row.socket_id, 1000);
      room.sockets.roster();
    });
    // A request/reply round trip drains prior roster publication on this socket.
    await expect(host.c.request({ type: 'lease-renew', nonce: 'b'.repeat(32) })).rejects.toThrow('forbidden');
    expect(host.events.filter(e => e.type === 'error')).toEqual([]);
    expect(claimant.events.filter(e => e.type === 'error')).toEqual([]);
    expect(host.events.some(e => e.type === 'roster' && e.snapshot.hostGeneration === 2)).toBe(false);
    await expect(claimant.c.request({ type: 'link-request', guestSeatId: hs.seatId })).rejects.toThrow('unavailable');
    const retry = client();
    await expect(retry.c.join(hs.snapshot.joinCode, compatibility, ss.seatToken)).rejects.toThrow('unavailable');
    await expect(retry.c.connect(ss)).rejects.toThrow('unavailable');
    if (mode === 'timely') {
      release();
      expect((await claim).lease).toMatchObject({ hostGeneration: 2, hostSeatId: gs.seatId });
      await until(() => host.events.some(e => e.type === 'host-changed'));
      expect(latestSnapshot(host.events, hs.snapshot)).toMatchObject({ phase: 'active', hostGeneration: 2, hostSeatId: gs.seatId });
      expect([...host.events, ...claimant.events].filter(e => e.type === 'error')).toEqual([]);
      expect(await host.c.getCheckpoint()).toEqual({ metadata, bytes });
      return;
    }
    await runInDurableObject(stub, room => {
      room.store.sql.exec('UPDATE room_lease SET expires_at = ?', Date.now() - 1);
      room.store.expire();
      Object.defineProperty(room.lifecycle, 'directory', { value: env.DIRECTORY.get(env.DIRECTORY.idFromName('global')) });
    });
    release();
    if (mode === 'held') await expect(claim).rejects.toThrow('stale-generation');
    await runInDurableObject(stub, room => room.alarm());
    await until(() => latestSnapshot(host.events, hs.snapshot).hostGeneration === 2);
    for (const peer of [host, claimant]) {
      expect(peer.events.filter(e => e.type === 'error')).toEqual([]);
      expect(peer.events.some(e => e.type === 'host-changed')).toBe(false);
      expect(latestSnapshot(peer.events, hs.snapshot)).toMatchObject({ phase: 'lost', hostGeneration: 2, hostSeatId: gs.seatId });
      expect(await peer.c.getCheckpoint()).toEqual({ metadata, bytes });
    }
    const next = await host.c.request({ type: 'rehost-claim', expectedHostGeneration: 2, nonce: 'c'.repeat(32) });
    expect(next.lease).toMatchObject({ hostGeneration: 3, hostSeatId: hs.seatId });
    await until(() => claimant.events.some(e => e.type === 'host-changed' && e.snapshot.hostGeneration === 3));
    expect(claimant.events.filter(e => e.type === 'error')).toEqual([]);
  } finally {
    release();
    await runInDurableObject(stub, room => { Object.defineProperty(room.lifecycle, 'directory', { value: env.DIRECTORY.get(env.DIRECTORY.idFromName('global')) }); });
  }
});

it('settles a real asynchronously retired issuance reply while keeping both production clients connected', async () => {
  const host = client(), guest = client(), hs = await host.c.create(compatibility, 2);
  const gs = await guest.c.join(hs.snapshot.joinCode, compatibility);
  await host.c.connect(hs); await guest.c.connect(gs);
  const stub = env.ROOMS.get(env.ROOMS.idFromName(hs.snapshot.roomId));
  await runInDurableObject(stub, room => {
    const real = room.sockets.onRequest!;
    room.sockets.onRequest = async (connection, request) => {
      const outcome = await real(connection, request);
      if (outcome.kind === 'attempt') room.signals.invalidate(room.signals.rows().find(a => a.attempt_id === outcome.attemptId)!);
      return outcome;
    };
  });
  const result = await host.c.request({ type: 'link-request', guestSeatId: gs.seatId });
  await until(() => guest.events.some(e => e.type === 'link-state' && e.state === 'closed'));
  expect(host.events.filter(e => e.type === 'link-issued' || e.type === 'link-state').map(e => e.type)).toEqual(['link-issued', 'link-state']);
  await expect(host.c.request({ type: 'link-ready', attemptId: result.attemptId })).rejects.toThrow('stale-generation');
  await host.c.request({ type: 'ready', ready: true }); await guest.c.request({ type: 'ready', ready: true });
  expect([...host.events, ...guest.events].filter(e => e.type === 'error')).toEqual([]);
});

it('drives real public endpoints through production clients: unequal-generation RTC, start, TURN, checkpoint, lease and rehost', async () => {
  const host = client(), guest = client();
  const first = await host.c.create(compatibility, 2);
  const gs = await guest.c.join(first.snapshot.joinCode.toLowerCase(), compatibility);
  const hs = await host.c.join(first.snapshot.joinCode, compatibility, first.seatToken);
  expect(hs.seatGeneration).toBe(2); expect(gs.seatGeneration).toBe(1);
  await host.c.connect(hs); await guest.c.connect(gs);
  const providerCalls = provider(); const turn = await host.c.getTurn();
  expect(turn.iceServers).toHaveLength(2); expect(providerCalls()).toBe(1);
  expect(host.paths.join('')).not.toContain(hs.seatToken);
  // Real transport reconstruction must leave the production client's sequence intact.
  await evictDurableObject(env.ROOMS.get(env.ROOMS.idFromName(hs.snapshot.roomId)), { webSockets: 'hibernate' });
  const order: string[] = []; let hLink: LinkIssued | undefined, gLink: LinkIssued | undefined;
  guest.c.onEvent(e => { if (e.type === 'link-issued') { gLink = e.link; order.push('guest-start'); } if (e.type === 'signal') order.push('guest-signal'); });
  host.c.onEvent(e => { if (e.type === 'link-issued') { hLink = e.link; order.push('host-start'); } });
  const issued = await host.c.request({ type: 'link-request', guestSeatId: gs.seatId });
  await until(() => !!hLink && !!gLink);
  expect(issued).toEqual({ kind: 'attempt', attemptId: hLink!.attemptId });
  expect(hLink!.identity.seatGeneration).toBe(1); expect(gLink!.identity.seatGeneration).toBe(1);
  expect(hLink!.localTicket).toBe(gLink!.expectedRemoteTicket); expect(gLink!.localTicket).toBe(hLink!.expectedRemoteTicket);
  expect(isRtcAttemptOptions({ ...hLink!, iceServers: turn.iceServers })).toBe(true);
  const signal: RtcSignal = { attemptId: hLink!.attemptId, roomId: hs.snapshot.roomId, seatGeneration: 1, hostGeneration: 1,
    from: hLink!.identity.localConnectionId, to: hLink!.identity.remoteConnectionId, kind: 'description', description: { type: 'offer', sdp: 'opaque-service-proof' } };
  await host.c.request({ type: 'signal', signal });
  await until(() => guest.events.some(e => e.type === 'signal'));
  expect(order.indexOf('guest-start')).toBeLessThan(order.indexOf('guest-signal'));
  expect(guest.events.find(e => e.type === 'signal')).toEqual({ type: 'signal', signal });
  await host.c.request({ type: 'link-ready', attemptId: issued.attemptId });
  await guest.c.request({ type: 'link-ready', attemptId: issued.attemptId });
  await host.c.request({ type: 'ready', ready: true });
  await guest.c.request({ type: 'ready', ready: true });
  await until(() => latestSnapshot(host.events, hs.snapshot).seats.every(s => s.ready));
  const revision = latestSnapshot(host.events, hs.snapshot).rosterRevision, bytes = new Uint8Array([2, 9, 1]);
  const initBase64 = btoa('second-mode-opaque'), initHash = await hashBytes(new TextEncoder().encode('second-mode-opaque'));
  const proposed = await host.c.request({ type: 'start-propose', expectedRosterRevision: revision, initBase64, initHash });
  const start = await host.c.request({ type: 'start-commit', proposalId: proposed.proposalId, expectedRosterRevision: revision });
  expect(start).toMatchObject({ kind: 'started', initBase64, initHash, lease: { hostGeneration: 1 } });
  const metadata: SessionCheckpointMetadata = { version: 1, protocolVersion: 2, roomId: hs.snapshot.roomId, runId: hs.snapshot.runId, compatibility,
    hostGeneration: 1, checkpointSequence: 1, capturedTick: 80, payloadSha256: await hashBytes(bytes) };
  await host.c.putCheckpoint(metadata, bytes);
  expect(await guest.c.getCheckpoint()).toEqual({ metadata, bytes });
  const renewal = await host.c.request({ type: 'lease-renew', nonce: 'a'.repeat(32) });
  expect(renewal.lease.nonce).toBe('a'.repeat(32));
  await host.c.request({ type: 'host-release' });
  await until(() => guest.events.some(e => e.type === 'host-departed'));
  const claimed = await guest.c.request({ type: 'rehost-claim', expectedHostGeneration: 1, nonce: 'b'.repeat(32) });
  expect(claimed.lease).toMatchObject({ hostGeneration: 2, hostSeatId: gs.seatId });
  expect(guest.events.some(e => e.type === 'host-changed' && e.snapshot.hostGeneration === 2)).toBe(true);
  // A committed save from generation 1 remains valid after generation 2 takes over.
  expect(await guest.c.getCheckpoint()).toEqual({ metadata, bytes });
  await guest.c.request({ type: 'lease-renew', nonce: 'c'.repeat(32) });
  expect(guest.events.some(e => e.type === 'error')).toBe(false);
});

it.each(['malformed', 'replay'])('real service rejects %s frames and production client disposes its pending work', async mode => {
  const { c, raw, events } = client(); const session = await c.create(compatibility, 1); await c.connect(session);
  await c.request({ type: 'ready', ready: true });
  raw().send(mode === 'malformed' ? '{"type":"ready","requestId":2,"ready":true,"extra":1}' : '{"type":"ready","requestId":1,"ready":true}');
  await until(() => events.some(e => e.type === 'error'));
  await expect(c.request({ type: 'ready', ready: false })).rejects.toThrow('invalid-state');
});

it('keeps the production client connected across actual expired rehost fencing and its lost-generation roster', async () => {
  const { c, events } = client(), session = await c.create(compatibility, 1);
  await c.connect(session);
  const ready = await c.request({ type: 'ready', ready: true });
  const proposed = await c.request({ type: 'start-propose', expectedRosterRevision: ready.snapshot.rosterRevision,
    initBase64: btoa('fencing-proof'), initHash: await hashBytes(new TextEncoder().encode('fencing-proof')) });
  await c.request({ type: 'start-commit', expectedRosterRevision: ready.snapshot.rosterRevision, proposalId: proposed.proposalId });
  const bytes = new Uint8Array([7, 3]), metadata: SessionCheckpointMetadata = { version: 1, protocolVersion: 2,
    roomId: session.snapshot.roomId, runId: session.snapshot.runId, compatibility, hostGeneration: 1,
    checkpointSequence: 1, capturedTick: 5, payloadSha256: await hashBytes(bytes) };
  await c.putCheckpoint(metadata, bytes); await c.request({ type: 'host-release' });
  const stub = env.ROOMS.get(env.ROOMS.idFromName(session.snapshot.roomId));
  await runInDurableObject(stub, room => {
    const real = room.lifecycle.directory;
    Object.defineProperty(room.lifecycle, 'directory', { configurable: true, value: {
      releaseFenced: (...args: Parameters<typeof real.releaseFenced>) => real.releaseFenced(...args),
      fenceActivation: (...args: Parameters<typeof real.fenceActivation>) => real.fenceActivation(...args),
      reserveActivation: async (...args: Parameters<typeof real.reserveActivation>) => {
        await real.reserveActivation(...args);
        return { ok: false, error: { code: 'unavailable', retryable: true } };
      },
    } });
  });
  try {
    await expect(c.request({ type: 'rehost-claim', expectedHostGeneration: 1, nonce: 'd'.repeat(32) })).rejects.toThrow('unavailable');
    await runInDurableObject(stub, room => {
      expect(room.store.activation()?.state).toBe('prepared');
      room.store.sql.exec('UPDATE room_activation SET expires_at = ?', Date.now() - 1);
      room.store.expire(); expect(room.store.activation()?.state).toBe('fenced');
      Object.defineProperty(room.lifecycle, 'directory', { value: env.DIRECTORY.get(env.DIRECTORY.idFromName('global')) });
    });
    await evictDurableObject(stub, { webSockets: 'hibernate' });
    await runInDurableObject(stub, room => room.alarm());
    await until(() => events.some(e => e.type === 'roster' && e.snapshot.hostGeneration === 2 && e.snapshot.phase === 'lost') || events.some(e => e.type === 'error'));
    expect(events.filter(e => e.type === 'error')).toEqual([]);
    expect(events.some(e => e.type === 'host-changed')).toBe(false);
    expect(latestSnapshot(events, session.snapshot)).toMatchObject({ hostGeneration: 2, phase: 'lost' });
    expect(await c.getCheckpoint()).toEqual({ metadata, bytes });
    await expect(c.request({ type: 'lease-renew', nonce: 'e'.repeat(32) })).rejects.toThrow('lease-expired');
    const claim = await c.request({ type: 'rehost-claim', expectedHostGeneration: 2, nonce: 'f'.repeat(32) });
    expect(claim.lease.hostGeneration).toBe(3);
    expect(events.some(e => e.type === 'host-changed' && e.snapshot.hostGeneration === 3)).toBe(true);
  } finally { await runInDurableObject(stub, room => { Object.defineProperty(room.lifecycle, 'directory', { value: env.DIRECTORY.get(env.DIRECTORY.idFromName('global')) }); }); }
});

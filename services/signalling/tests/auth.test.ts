import { connect } from './socket-helpers';
import { env } from 'cloudflare:workers';
import { started } from './lifecycle-helpers';
import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import { compatibility, create, request } from './helpers';
import type { SeatSession, SocketTicket } from '../../../src/shared/roomSession';
import { tokenHash } from '../src/crypto';
import { unwrapDomain } from '../src/errors';

it('rejoins by token, advances generation and retires the old durable connection before returning', async () => {
  const host = await create();
  const room = env.ROOMS.get(env.ROOMS.idFromName(host.snapshot.roomId));
  await runInDurableObject(room, (_, { storage }) => storage.sql.exec("UPDATE room_seats SET connection_id = ?, connected = 1, ready = 1 WHERE seat_id = 0", 'c'.repeat(32)));
  const response = await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility }, { Authorization: `Bearer ${host.seatToken}` });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ seatId: 0, seatGeneration: 2, snapshot: { seats: [
    { seatId: 0, seatGeneration: 2, connected: false, ready: false }, {}, {}, {},
  ] } });
  expect(await runInDurableObject(room, (_, { storage }) => storage.sql.exec('SELECT connection_id FROM room_seats WHERE seat_id = 0').one())).toEqual({ connection_id: null });
});

it('retains revoked slot generations and rejects the old token after slot reuse', async () => {
  const host = await create();
  const guest = await (await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility })).json<SeatSession>();
  const room = env.ROOMS.get(env.ROOMS.idFromName(host.snapshot.roomId));
  await runInDurableObject(room, instance => instance.store.revokeSeat(guest.seatId));
  const replacement = await (await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility })).json<SeatSession>();
  expect(replacement.seatId).toBe(1);
  expect(replacement.seatGeneration).toBeGreaterThan(guest.seatGeneration);
  expect((await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility }, { Authorization: `Bearer ${guest.seatToken}` })).status).toBe(401);
});

it('stores only hashed tokens/tickets and permits at most one current ticket before rejoin', async () => {
  const host = await create();
  const path = `/v2/rooms/${host.snapshot.roomId}/socket-ticket`;
  const headers = { Authorization: `Bearer ${host.seatToken}` };
  const response = await request(path, {}, headers);
  expect(response.status).toBe(200);
  const ticket = await response.json<SocketTicket>();
  expect(ticket.expiresAtEpochMs - Date.now()).toBeGreaterThan(28000);
  expect(ticket.expiresAtEpochMs - Date.now()).toBeLessThanOrEqual(30000);
  expect((await request(path, {}, headers)).status).toBe(409);
  const room = env.ROOMS.get(env.ROOMS.idFromName(host.snapshot.roomId));
  await evictDurableObject(room);
  expect((await request(path, {}, headers)).status).toBe(409);
  const stored = await runInDurableObject(room, (_, { storage }) => JSON.stringify({
    seats: storage.sql.exec('SELECT * FROM room_seats').toArray(), tickets: storage.sql.exec('SELECT * FROM room_tickets').toArray(),
    meta: storage.sql.exec('SELECT * FROM room_meta').toArray(),
  }));
  expect(stored).not.toContain(host.seatToken);
  expect(stored).not.toContain(ticket.ticket);
  expect(stored).toContain(ticket.connectionId);
  await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility }, headers);
  expect((await request(path, {}, headers)).status).toBe(200);
});

it('rejects new humans in frozen/retained rooms while keeping reserved-token rejoin', async () => {
  for (const phase of ['active', 'lost', 'ended']) {
    const { host } = await started();
    const room = env.ROOMS.get(env.ROOMS.idFromName(host.snapshot.roomId));
    if (phase !== 'active') await runInDurableObject(room, instance => instance.store.fence(Date.now(), phase as 'lost' | 'ended'));
    expect((await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility })).status).toBe(409);
    expect((await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility }, { Authorization: `Bearer ${host.seatToken}` })).status).toBe(200);
  }
});

it('revalidates generation after ticket hashing and never resurrects pre-rejoin authority', async () => {
  const host = await create();
  const hash = await tokenHash(host.seatToken);
  const room = env.ROOMS.get(env.ROOMS.idFromName(host.snapshot.roomId));
  await runInDurableObject(room, async instance => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const original = crypto.subtle.digest.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => { await gate; return original(...args); });
    try {
      const pending = instance.auth.socketTicket(hash);
      const checked = expect(pending).rejects.toThrow('stale-generation');
      instance.auth.join(compatibility, hash, hash);
      release();
      await checked;
      expect(instance.store.sql.exec('SELECT COUNT(*) AS n FROM room_tickets').one()).toEqual({ n: 0 });
      expect(instance.store.seat(0)).toMatchObject({ generation: 2, ticket_eligible: 1 });
    } finally { release(); spy.mockRestore(); }
  });
});

it('closes the replaced transport using a real accepted hibernating socket', async () => {
  const host = await create(), peer = await connect(host);
  const response = await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility }, { Authorization: `Bearer ${host.seatToken}` });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ seatGeneration: 2 });
  await peer.until(() => peer.closes.includes(1000));
});
it('keeps ticket metadata bounded across concurrent issuance, expiry and rejoin', async () => {
  const host = await create();
  const path = `/v2/rooms/${host.snapshot.roomId}/socket-ticket`;
  const headers = { Authorization: `Bearer ${host.seatToken}` };
  const responses = await Promise.all(Array.from({ length: 10 }, () => request(path, {}, headers)));
  expect(responses.filter(r => r.status === 200)).toHaveLength(1);
  expect(responses.filter(r => r.status === 409)).toHaveLength(9);
  await Promise.all(responses.map(r => r.arrayBuffer()));
  const room = env.ROOMS.get(env.ROOMS.idFromName(host.snapshot.roomId));
  await runInDurableObject(room, (_, { storage }) => storage.sql.exec('UPDATE room_tickets SET expires_at = 0'));
  expect((await request(path, {}, headers)).status).toBe(409);
  expect(await runInDurableObject(room, (_, { storage }) => storage.sql.exec('SELECT COUNT(*) AS n FROM room_tickets').one())).toEqual({ n: 0 });
  await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility }, headers);
  expect((await request(path, {}, headers)).status).toBe(200);
  expect(await runInDurableObject(room, (_, { storage }) => storage.sql.exec('SELECT COUNT(*) AS n FROM room_tickets').one())).toEqual({ n: 1 });
});

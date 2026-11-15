import { runInDurableObject, runDurableObjectAlarm } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import { create, connect, upgrade, ticket, Peer, stub, join, request, compatibility } from './socket-helpers';

it('upgrades and atomically accepts one replayed ticket, sequences authenticated before roster', async () => {
  const host = await create(), t = await ticket(host);
  const responses = await Promise.all([upgrade(host), upgrade(host)]);
  expect(responses.map(r => r.status)).toEqual([101, 101]);
  const peers = responses.map(r => new Peer(r.webSocket!));
  for (const peer of peers) peer.send({ type: 'auth', ticket: t.ticket, connectionId: t.connectionId });
  await peers[0]!.until(() => peers.filter(p => p.messages.some(m => m.payload.type === 'authenticated')).length === 1 && peers.some(p => p.closes.length > 0));
  const winner = peers.find(p => p.messages.some(m => m.payload.type === 'authenticated'))!;
  expect(winner.messages[0]).toMatchObject({ sequence: 1, payload: { type: 'authenticated', session: { seatGeneration: 1 } } });
  expect(winner.messages[1]).toMatchObject({ sequence: 2, payload: { type: 'roster' } });
});
it('caps unauthenticated sockets at eight and expires using persisted deadline', async () => {
  const host = await create();
  for (let i = 0; i < 8; i++) { const response = await upgrade(host); expect(response.status).toBe(101); new Peer(response.webSocket!); }
  const overflow = await upgrade(host); expect(overflow.status).toBe(429); await overflow.text();
  await runInDurableObject(stub(host), (_, state) => state.storage.sql.exec('UPDATE room_connections SET auth_deadline = ?', Date.now() - 1));
  await runDurableObjectAlarm(stub(host));
  const again = await upgrade(host); expect(again.status).toBe(101); new Peer(again.webSocket!);
});
it.each([{ type: 'ack', sequence: 1 }, { type: 'ready', requestId: 1, ready: true }])('rejects non-auth first message %j', async frame => {
  const response = await upgrade(await create()); expect(response.status).toBe(101);
  const peer = new Peer(response.webSocket!); peer.send(frame); await peer.until(() => peer.closes.length === 1);
});
it('rejects second auth and ordered request replay without repeating mutation', async () => {
  const host = await create(), peer = await connect(host);
  peer.send({ type: 'ready', requestId: 1, ready: true });
  expect(await peer.reply(1)).toMatchObject({ outcome: { kind: 'snapshot', snapshot: { seats: [{ ready: true }, {}, {}, {}] } } });
  peer.send({ type: 'ready', requestId: 1, ready: false });
  await peer.until(() => peer.closes.length === 1);
  const fresh = await create(), other = await connect(fresh);
  other.send({ type: 'auth', ticket: 'a'.repeat(43), connectionId: 'a'.repeat(32) }); await other.until(() => other.closes.length === 1);
});
it('rejoin and host removal fence old sockets without letting old close clear replacement', async () => {
  const host = await create(), guest = await join(host), hp = await connect(host), old = await connect(guest);
  const response = await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility }, { Authorization: `Bearer ${guest.seatToken}` });
  const replacement = await response.json() as typeof guest;
  const current = await connect(replacement);
  await old.until(() => old.closes.length === 1);
  current.send({ type: 'ready', requestId: 1, ready: true });
  expect(await current.reply(1)).toMatchObject({ outcome: { kind: 'snapshot', snapshot: { seats: [{}, { seatGeneration: 2, connected: true, ready: true }, {}, {}] } } });
  hp.send({ type: 'remove-seat', requestId: 1, seatId: guest.seatId });
  expect(await hp.reply(1)).toMatchObject({ outcome: { kind: 'snapshot', snapshot: { seats: [{}, { occupied: false }, {}, {}] } } });
  await current.until(() => current.closes.length === 1);
});
it('correlates invalid lifecycle transitions in the lobby', async () => {
  const peer = await connect(await create()); peer.send({ type: 'host-release', requestId: 1 });
  expect(await peer.reply(1)).toMatchObject({ outcome: { kind: 'error', error: { code: 'invalid-state' } } });
});
it('rejects an expired ticket and binary frame without granting seat authority', async () => {
  const host = await create(), t = await ticket(host), response = await upgrade(host); expect(response.status).toBe(101);
  const peer = new Peer(response.webSocket!);
  await runInDurableObject(stub(host), (_, state) => { state.storage.sql.exec('UPDATE room_tickets SET expires_at = ?', Date.now() - 1); });
  peer.send({ type: 'auth', ticket: t.ticket, connectionId: t.connectionId }); await peer.until(() => peer.closes.length > 0);
  const other = await connect(await create()); other.socket.send(new Uint8Array([123, 125])); await other.until(() => other.closes.length > 0);
});
it('ignores forged seat attachments and revalidates durable connection authority on every event', async () => {
  const host = await create(), peer = await connect(host);
  await runInDurableObject(stub(host), (instance, state) => {
    const socket = state.getWebSockets()[0]!;
    const attachment = socket.deserializeAttachment(); socket.serializeAttachment({ ...attachment, seatId: 3, seatGeneration: 999 });
    instance.store.sql.exec('UPDATE room_seats SET generation = generation + 1 WHERE seat_id = 0');
  });
  peer.send({ type: 'ready', requestId: 1, ready: true }); await peer.until(() => peer.closes.length > 0);
  expect(await runInDurableObject(stub(host), instance => instance.store.seat(0)!.ready)).toBe(0);
});
it('isolates a throwing send and preserves the surviving connection authority', async () => {
  const host = await create(), guest = await join(host), hp = await connect(host), gp = await connect(guest);
  await runInDurableObject(stub(host), (instance, state) => {
    const row = instance.sockets.rows().find(r => r.seat_id === 1)!;
    const socket = state.getWebSockets().find(s => instance.sockets.id(s) === row.socket_id)!;
    socket.send = () => { throw Error('synthetic transport failure'); };
    expect(instance.sockets.send(row, { type: 'roster', snapshot: instance.store.snapshot() })).toBe(false);
    expect(instance.store.seat(1)!.connected).toBe(0); expect(instance.store.seat(0)!.connected).toBe(1);
  });
  await gp.until(() => gp.closes.includes(1013)); hp.send({ type: 'ready', requestId: 1, ready: true });
  expect(await hp.reply(1)).toMatchObject({ outcome: { kind: 'snapshot' } });
});
it('enforces separate durable signal60 and ACK240 bursts and30/120 per second refill', async () => {
  const host = await create(), peer = await connect(host);
  await runInDurableObject(stub(host), instance => {
    const row = instance.sockets.rows().find(r => r.seat_id === 0)!;
    for (let i = 0; i < 60; i++) expect(instance.sockets.takeRate(row, false)).toBe(true);
    expect(instance.sockets.takeRate(row, false)).toBe(false);
    for (let i = 0; i < 240; i++) expect(instance.sockets.takeRate(row, true)).toBe(true);
    expect(instance.sockets.takeRate(row, true)).toBe(false);
    instance.store.sql.exec('UPDATE room_socket_rates SET signal_tokens = 0, ack_tokens = 0, signal_at = ?, ack_at = ?', Date.now() - 1000, Date.now() - 1000);
    for (let i = 0; i < 30; i++) expect(instance.sockets.takeRate(row, false)).toBe(true);
    expect(instance.sockets.takeRate(row, false)).toBe(false);
    for (let i = 0; i < 120; i++) expect(instance.sockets.takeRate(row, true)).toBe(true);
    expect(instance.sockets.takeRate(row, true)).toBe(false);
  });
  expect(peer.closes).toEqual([]);
});
it('bounds pending auth hashing to one attempt and cancels it on a second first-message', async () => {
  const host = await create(), t = await ticket(host), response = await upgrade(host); expect(response.status).toBe(101);
  const peer = new Peer(response.webSocket!);
  await runInDurableObject(stub(host), async (instance, state) => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const original = crypto.subtle.digest.bind(crypto.subtle); let hashes = 0;
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => { hashes++; await gate; return original(...args); });
    try {
      const socket = state.getWebSockets()[0]!, frame = JSON.stringify({ type: 'auth', ticket: t.ticket, connectionId: t.connectionId });
      const one = instance.sockets.message(socket, frame), two = instance.sockets.message(socket, frame);
      expect(hashes).toBe(1); release(); await Promise.all([one, two]);
      expect(instance.store.seat(0)!.connected).toBe(0);
    } finally { release(); spy.mockRestore(); }
  });
  await peer.until(() => peer.closes.length > 0); expect(peer.messages).toEqual([]);
});

it('refuses delivery when SQLite authority was revoked before an awaited operation returned', async () => {
  const host = await create(), guest = await join(host); await connect(host); const peer = await connect(guest);
  await runInDurableObject(stub(host), instance => {
    const row = instance.sockets.rows().find(r => r.seat_id === 1)!;
    instance.store.revokeSeat(1);
    expect(instance.sockets.send(row, { type: 'error', error: { code: 'internal', retryable: true } })).toBe(false);
  });
  await peer.until(() => peer.closes.length > 0);
  expect(peer.messages.some(m => m.payload.type === 'error')).toBe(false);
});

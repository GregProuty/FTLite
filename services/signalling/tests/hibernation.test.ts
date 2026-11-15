import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { connect, create, Peer, stub, ticket, upgrade } from './socket-helpers';
import { setup, links, signal } from './signal-helpers';

it('reconstructs authenticated sockets and partially consumed pair readiness without restoring tickets', async () => {
  const { host, hp, gp } = await setup(), { h } = await links(hp, gp);
  hp.send({ type: 'link-ready', requestId: 2, attemptId: h.attemptId }); await hp.reply(2);
  await evictDurableObject(stub(host), { webSockets: 'hibernate' });
  gp.send({ type: 'link-ready', requestId: 1, attemptId: h.attemptId });
  expect(await gp.reply(1)).toMatchObject({ outcome: { kind: 'void' } });
  expect(await runInDurableObject(stub(host), instance => instance.signals.allGuestsReady())).toBe(true);
  hp.send({ type: 'signal', requestId: 3, signal: signal(h) }); expect(await hp.reply(3)).toMatchObject({ outcome: { kind: 'void' } });
  expect(hp.messages.map(m => m.sequence)).toEqual(hp.messages.map((_, i) => i + 1));
  expect(await runInDurableObject(stub(host), (_, state) => state.storage.sql.exec('SELECT consumed FROM room_tickets ORDER BY seat_id').toArray())).toEqual([{ consumed: 1 }, { consumed: 1 }]);
});
it('keeps the 64-message credit boundary across eviction; future/duplicate ACK never erase unsent credit', async () => {
  const host = await create(), peer = await connect(host);
  const fill = (count: number) => runInDurableObject(stub(host), instance => {
    const row = instance.sockets.rows().find(r => r.seat_id === 0)!;
    for (let i = 0; i < count; i++) instance.sockets.send(row, { type: 'roster', snapshot: instance.store.snapshot() });
  });
  await fill(60); await peer.until(() => peer.messages.length === 62);
  peer.send({ type: 'ack', sequence: 9999 }); peer.send({ type: 'ack', sequence: 1 }); peer.send({ type: 'ack', sequence: 1 });
  await expect.poll(() => runInDurableObject(stub(host), (_, state) => state.storage.sql.exec('SELECT COUNT(*) AS count FROM room_credits').one().count)).toBe(61);
  await evictDurableObject(stub(host), { webSockets: 'hibernate' });
  expect(await runInDurableObject(stub(host), (_, state) => state.storage.sql.exec('SELECT COUNT(*) AS count FROM room_credits').one())).toEqual({ count: 61 });
  await fill(3); await peer.until(() => peer.messages.length === 65); expect(peer.closes).toEqual([]);
  await fill(1); await peer.until(() => peer.closes.includes(1013));
});
it.each(['signal', 'ack'] as const)('preserves exhausted %s quota across eviction', async field => {
  const host = await create(), peer = await connect(host);
  peer.send({ type: 'ready', requestId: 1, ready: true }); await peer.reply(1);
  await runInDurableObject(stub(host), (_, state) => {
    state.storage.sql.exec(`UPDATE room_socket_rates SET ${field}_tokens = 0, ${field}_at = ?`, Date.now() + 60000);
  });
  await evictDurableObject(stub(host), { webSockets: 'hibernate' });
  peer.send(field === 'ack' ? { type: 'ack', sequence: 1 } : { type: 'ready', requestId: 2, ready: false });
  await peer.until(() => peer.closes.includes(1013));
});
it('expired first-message deadline survives eviction and refuses valid ticket on delayed event', async () => {
  const host = await create(), t = await ticket(host), response = await upgrade(host); expect(response.status).toBe(101);
  const peer = new Peer(response.webSocket!);
  await runInDurableObject(stub(host), (_, state) => { state.storage.sql.exec('UPDATE room_connections SET auth_deadline = ?', Date.now() - 1); });
  await evictDurableObject(stub(host), { webSockets: 'hibernate' });
  peer.send({ type: 'auth', ticket: t.ticket, connectionId: t.connectionId }); await peer.until(() => peer.closes.length > 0);
  expect(peer.messages).toEqual([]);
});

it('never restores a consumed socket ticket after authenticated eviction', async () => {
  const host = await create(), t = await ticket(host), response = await upgrade(host); expect(response.status).toBe(101);
  const peer = new Peer(response.webSocket!); peer.send({ type: 'auth', ticket: t.ticket, connectionId: t.connectionId });
  await peer.until(() => peer.messages.some(m => m.payload.type === 'authenticated'));
  await evictDurableObject(stub(host), { webSockets: 'hibernate' });
  const replayResponse = await upgrade(host); expect(replayResponse.status).toBe(101); const replay = new Peer(replayResponse.webSocket!);
  replay.send({ type: 'auth', ticket: t.ticket, connectionId: t.connectionId }); await replay.until(() => replay.closes.length > 0);
  expect(replay.messages).toEqual([]); peer.send({ type: 'ready', requestId: 1, ready: true });
  expect(await peer.reply(1)).toMatchObject({ outcome: { kind: 'snapshot' } });
});
it('persists the candidate budget and current attempt identity after hibernation', async () => {
  const { host, hp, gp } = await setup(), { h } = await links(hp, gp);
  await runInDurableObject(stub(host), instance => { instance.store.sql.exec('UPDATE room_attempts SET host_candidates = 64, guest_candidates = 64'); });
  await evictDurableObject(stub(host), { webSockets: 'hibernate' });
  const original = signal(h), { kind, description, ...stamp } = original as Extract<typeof original, { kind: 'description' }>;
  hp.send({ type: 'signal', requestId: 2, signal: { ...stamp, kind: 'candidate', candidate: null } });
  expect(await hp.reply(2)).toMatchObject({ outcome: { kind: 'error', error: { code: 'capacity' } } });
});

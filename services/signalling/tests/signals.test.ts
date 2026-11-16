import { runInDurableObject } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import { parseClientFrame, type LinkIssued, type SeatSession } from '../../../src/shared/roomSession';
import type { RtcSignal } from '../../../src/shared/rtcSession';
import { connect, create, join, request, compatibility, stub, type Peer } from './socket-helpers';
import { setup, links, signal } from './signal-helpers';
it('issues inverted distinct native tickets with guest generation on BOTH unequal endpoints and forwards original signal', async () => {
  const { host, hp, gp } = await setup(), { h, g } = await links(hp, gp);
  expect(host.seatGeneration).toBe(2);
  expect(h.identity.seatGeneration).toBe(1); expect(g.identity.seatGeneration).toBe(1);
  expect(h.localTicket).not.toBe(h.expectedRemoteTicket);
  expect(h.localTicket).toBe(g.expectedRemoteTicket); expect(g.localTicket).toBe(h.expectedRemoteTicket);
  const original = signal(h); hp.send({ type: 'signal', requestId: 2, signal: original });
  expect(await hp.reply(2)).toMatchObject({ outcome: { kind: 'void' } });
  await gp.until(() => gp.messages.some(m => m.payload.type === 'signal'));
  expect(gp.messages.find(m => m.payload.type === 'signal')!.payload).toEqual({ type: 'signal', signal: original });
  const rows = await runInDurableObject(stub(host), (_, state) => state.storage.sql.exec('SELECT * FROM room_attempts').toArray());
  expect(JSON.stringify(rows)).not.toContain(h.localTicket); expect(JSON.stringify(rows)).not.toContain(g.localTicket); expect(JSON.stringify(rows)).not.toContain('opaque-sdp');
});
it('requires host and both link-ready endpoint bits; replacement closes the old pair', async () => {
  const { host, hp, gp } = await setup();
  gp.send({ type: 'link-request', requestId: 1, guestSeatId: 1 }); expect(await gp.reply(1)).toMatchObject({ outcome: { kind: 'error', error: { code: 'forbidden' } } });
  const { h } = await links(hp, gp);
  hp.send({ type: 'link-ready', requestId: 2, attemptId: h.attemptId }); await hp.reply(2);
  expect(await runInDurableObject(stub(host), (_, state) => state.storage.sql.exec('SELECT host_ready, guest_ready FROM room_attempts WHERE live = 1').one())).toEqual({ host_ready: 1, guest_ready: 0 });
  gp.send({ type: 'link-ready', requestId: 2, attemptId: h.attemptId }); await gp.reply(2);
  await hp.until(() => hp.messages.some(m => m.payload.type === 'link-state' && m.payload.state === 'ready'));
  await links(hp, gp, 3);
  expect(hp.messages.some(m => m.payload.type === 'link-state' && m.payload.attemptId === h.attemptId && m.payload.state === 'closed')).toBe(true);
  hp.send({ type: 'signal', requestId: 4, signal: signal(h) }); expect(await hp.reply(4)).toMatchObject({ outcome: { kind: 'error' } });
});
it.each(['from', 'to', 'roomId', 'attemptId', 'seatGeneration', 'hostGeneration', 'direction'] as const)('rejects spoofed pair %s', async field => {
  const { hp, gp } = await setup(), { h } = await links(hp, gp);
  const bad = signal(h);
  if (field === 'direction' && bad.kind === 'description') bad.description.type = 'answer';
  else if (field === 'hostGeneration' || field === 'seatGeneration') bad[field]++;
  else if (field !== 'direction') bad[field] = 'f'.repeat(32);
  hp.send({ type: 'signal', requestId: 2, signal: bad }); expect(await hp.reply(2)).toMatchObject({ outcome: { kind: 'error' } });
  expect(gp.messages.filter(m => m.payload.type === 'signal')).toHaveLength(0);
});
it.each(['host', 'guest'] as const)('invalidates routes when %s socket generation is replaced', async endpoint => {
  const { host, guest, hp, gp } = await setup(), { h } = await links(hp, gp), seat = endpoint === 'host' ? host : guest;
  const response = await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility }, { Authorization: `Bearer ${seat.seatToken}` }); await response.json();
  const remaining = endpoint === 'host' ? gp : hp;
  await remaining.until(() => remaining.messages.some(m => m.payload.type === 'link-state' && m.payload.state === 'closed'));
  expect(await runInDurableObject(stub(host), (_, state) => state.storage.sql.exec('SELECT live FROM room_attempts WHERE attempt_id = ?', h.attemptId).one())).toEqual({ live: 0 });
});
it('expires an unready route on event checks even with a delayed alarm', async () => {
  const { host, hp, gp } = await setup(), { h } = await links(hp, gp);
  await runInDurableObject(stub(host), (_, state) => state.storage.sql.exec('UPDATE room_attempts SET expires_at = ?', Date.now() - 1));
  hp.send({ type: 'signal', requestId: 2, signal: signal(h) }); expect(await hp.reply(2)).toMatchObject({ outcome: { kind: 'error' } });
});

it('allows exactly128 mixed-direction candidates across an attempt, including end markers', async () => {
  const { host, hp, gp } = await setup(), { h, g } = await links(hp, gp);
  for (let i = 0; i < 128; i++) {
    if (i % 20 === 0) await runInDurableObject(stub(host), (_, state) => { state.storage.sql.exec('UPDATE room_socket_rates SET signal_tokens = 60, ack_tokens = 240'); });
    const peer = i % 2 === 0 ? hp : gp, original = signal(i % 2 === 0 ? h : g);
    const { kind, description, ...stamp } = original as Extract<RtcSignal, { kind: 'description' }>;
    const requestId = i + 2;
    peer.send({ type: 'signal', requestId, signal: { ...stamp, kind: 'candidate', candidate: null } });
    expect(await peer.reply(requestId)).toMatchObject({ outcome: { kind: 'void' } }); hp.ack(); gp.ack();
  }
  const { kind, description, ...stamp } = signal(h) as Extract<RtcSignal, { kind: 'description' }>;
  hp.send({ type: 'signal', requestId: 131, signal: { ...stamp, kind: 'candidate', candidate: null } });
  expect(await hp.reply(131)).toMatchObject({ outcome: { kind: 'error', error: { code: 'capacity' } } });
});
it('accepts64KiB SDP unchanged and rejects the next UTF8 byte', async () => {
  const { hp, gp } = await setup(), { h } = await links(hp, gp);
  const original = signal(h) as Extract<RtcSignal, { kind: 'description' }>;
  original.description.sdp = 'a'.repeat(65534) + '\u00e9';
  expect(new TextEncoder().encode(original.description.sdp).byteLength).toBe(65536);
  hp.send({ type: 'signal', requestId: 2, signal: original }); expect(await hp.reply(2)).toMatchObject({ outcome: { kind: 'void' } });
  await gp.until(() => gp.messages.some(m => m.payload.type === 'signal'));
  expect(gp.messages.find(m => m.payload.type === 'signal')!.payload).toEqual({ type: 'signal', signal: original });
  original.description.sdp += 'a'; hp.send({ type: 'signal', requestId: 3, signal: original }); await hp.until(() => hp.closes.length > 0);
});
it('isolates a slow receiver at256KiB byte credits and cancels its route', async () => {
  const { host, hp, gp } = await setup(), { h } = await links(hp, gp);
  const original = signal(h) as Extract<RtcSignal, { kind: 'description' }>;
  original.description.sdp = 'a'.repeat(65536);
  for (let requestId = 2; requestId <= 4; requestId++) { hp.send({ type: 'signal', requestId, signal: original }); expect(await hp.reply(requestId)).toMatchObject({ outcome: { kind: 'void' } }); }
  hp.send({ type: 'signal', requestId: 5, signal: original }); expect(await hp.reply(5)).toMatchObject({ outcome: { kind: 'error' } });
  await gp.until(() => gp.closes.includes(1013)); expect(hp.closes).toEqual([]);
  expect(await runInDurableObject(stub(host), (_, state) => state.storage.sql.exec('SELECT live FROM room_attempts').one())).toEqual({ live: 0 });
});


it('caps retained attempt metadata at128 and cleans expired rows before admitting another', async () => {
  const { host, hp, gp } = await setup();
  for (let requestId = 1; requestId <= 128; requestId++) {
    if (requestId % 20 === 0) await runInDurableObject(stub(host), instance => { instance.store.sql.exec('UPDATE room_socket_rates SET signal_tokens = 60, ack_tokens = 240'); });
    await links(hp, gp, requestId); hp.ack(); gp.ack();
  }
  hp.send({ type: 'link-request', requestId: 129, guestSeatId: 1 });
  expect(await hp.reply(129)).toMatchObject({ outcome: { kind: 'error', error: { code: 'capacity' } } }); hp.ack(); gp.ack();
  expect(await runInDurableObject(stub(host), instance => instance.signals.rows().length)).toBe(128);
  await runInDurableObject(stub(host), instance => { instance.store.sql.exec('UPDATE room_attempts SET expires_at = ? WHERE live = 0', Date.now() - 1); });
  await links(hp, gp, 130);
  expect(await runInDurableObject(stub(host), instance => instance.signals.rows().length)).toBe(2);
});
it('supports three host pairs and refuses cross-guest signalling', async () => {
  const host = await create(), guests = await Promise.all([join(host), join(host), join(host)]), hp = await connect(host);
  const peers = []; for (const guest of guests) peers.push(await connect(guest));
  for (let i = 0; i < 3; i++) {
    hp.send({ type: 'link-request', requestId: i + 1, guestSeatId: guests[i]!.seatId });
    expect(await hp.reply(i + 1)).toMatchObject({ outcome: { kind: 'attempt' } });
  }
  expect(await runInDurableObject(stub(host), instance => instance.signals.rows().filter(a => a.live).length)).toBe(3);
  const link = (peers[0]!.messages.find(m => m.payload.type === 'link-issued')!.payload as { link: LinkIssued }).link;
  const bad = signal(link); const other = (peers[1]!.messages.find(m => m.payload.type === 'link-issued')!.payload as { link: LinkIssued }).link;
  bad.to = other.identity.localConnectionId;
  peers[0]!.send({ type: 'signal', requestId: 1, signal: bad }); expect(await peers[0]!.reply(1)).toMatchObject({ outcome: { kind: 'error' } });
  peers[1]!.send({ type: 'signal', requestId: 1, signal: signal(link) }); expect(await peers[1]!.reply(1)).toMatchObject({ outcome: { kind: 'error' } });
});
it('keeps fully ready routes after setup expiry and rejects past host generation', async () => {
  const { host, hp, gp } = await setup(), { h } = await links(hp, gp);
  hp.send({ type: 'link-ready', requestId: 2, attemptId: h.attemptId }); await hp.reply(2);
  gp.send({ type: 'link-ready', requestId: 1, attemptId: h.attemptId }); await gp.reply(1);
  await runInDurableObject(stub(host), instance => { instance.store.sql.exec('UPDATE room_attempts SET expires_at = ?', Date.now() - 1); });
  hp.send({ type: 'signal', requestId: 3, signal: signal(h) }); expect(await hp.reply(3)).toMatchObject({ outcome: { kind: 'void' } });
  await runInDurableObject(stub(host), instance => { instance.store.sql.exec('UPDATE room_meta SET host_generation = 2'); });
  hp.send({ type: 'signal', requestId: 4, signal: signal(h) }); expect(await hp.reply(4)).toMatchObject({ outcome: { kind: 'error' } });
});
it('cancels link issuance if an endpoint retires while ticket hashes are pending', async () => {
  const { host, hp, gp } = await setup();
  await runInDurableObject(stub(host), async instance => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const original = crypto.subtle.digest.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => { await gate; return original(...args); });
    try {
      const sender = instance.sockets.rows().find(r => r.seat_id === 0)!;
      instance.store.sql.exec('UPDATE room_connections SET last_request = 1 WHERE seat_id = 0');
      const pending = instance.signals.issue(sender, 1), checked = expect(pending).rejects.toThrow('stale-connection');
      const seat = instance.store.seat(1)!;
      instance.auth.join(compatibility, seat.token_hash!, seat.token_hash!); instance.sockets.retireSeat(seat);
      release(); await checked; expect(instance.signals.rows()).toEqual([]);
    } finally { release(); spy.mockRestore(); }
  });
  expect(hp.messages.some(m => m.payload.type === 'link-issued')).toBe(false);
  expect(gp.messages.some(m => m.payload.type === 'link-issued')).toBe(false);
});

it('keeps accepted link issuance alive across an unrelated later readiness request', async () => {
  const { host, hp, gp } = await setup();
  await runInDurableObject(stub(host), async instance => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const original = crypto.subtle.digest.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => { await gate; return original(...args); });
    try {
      const sender = instance.sockets.rows().find(r => r.seat_id === 0)!;
      instance.store.sql.exec('UPDATE room_connections SET last_request = 1 WHERE seat_id = 0');
      const pending = instance.signals.issue(sender, 1);
      await instance.sockets.message(instance.sockets.socket(sender.socket_id)!, JSON.stringify({ type: 'ready', requestId: 2, ready: true }));
      release(); expect(await pending).toMatchObject({ kind: 'attempt' });
    } finally { release(); spy.mockRestore(); }
  });
  await hp.until(() => hp.messages.some(m => m.payload.type === 'link-issued'));
  await gp.until(() => gp.messages.some(m => m.payload.type === 'link-issued'));
});

it('cancels only the superseded pending request for the same pair without reusing tickets', async () => {
  const { host, hp, gp } = await setup();
  await runInDurableObject(stub(host), async instance => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const original = crypto.subtle.digest.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => { await gate; return original(...args); });
    try {
      const sender = instance.sockets.rows().find(r => r.seat_id === 0)!;
      const first = instance.signals.issue(sender, 1), rejected = expect(first).rejects.toThrow('conflict');
      const second = instance.signals.issue(sender, 1);
      release(); await rejected; expect(await second).toMatchObject({ kind: 'attempt' });
      expect(instance.signals.rows()).toHaveLength(1);
      expect(instance.store.sql.exec('SELECT * FROM room_link_pending').toArray()).toEqual([]);
    } finally { release(); spy.mockRestore(); }
  });
  await hp.until(() => hp.messages.some(m => m.payload.type === 'link-issued'));
  await gp.until(() => gp.messages.some(m => m.payload.type === 'link-issued'));
  expect(hp.messages.filter(m => m.payload.type === 'link-issued')).toHaveLength(1);
  expect(gp.messages.filter(m => m.payload.type === 'link-issued')).toHaveLength(1);
});
it.each(['overflow', 'throw'] as const)('never emits ready to the survivor after readiness delivery %s cancels the pair', async mode => {
  const { host, hp, gp } = await setup(), { h } = await links(hp, gp);
  gp.send({ type: 'link-ready', requestId: 1, attemptId: h.attemptId }); await gp.reply(1);
  await runInDurableObject(stub(host), instance => {
    const row = instance.sockets.rows().find(r => r.seat_id === 1)!;
    if (mode === 'throw') instance.sockets.socket(row.socket_id)!.send = () => { throw Error('synthetic readiness transport failure'); };
    else {
      const count = instance.store.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM room_credits WHERE socket_id = ?', row.socket_id).one().count;
      for (let i = count; i < 64; i++) expect(instance.sockets.send(row, { type: 'roster', snapshot: instance.store.snapshot() })).toBe(true);
    }
  });
  hp.send({ type: 'link-ready', requestId: 2, attemptId: h.attemptId }); await hp.reply(2);
  await gp.until(() => gp.closes.includes(1013));
  expect(hp.messages.filter(m => m.payload.type === 'link-state' && m.payload.attemptId === h.attemptId).map(m => (m.payload as { state: string }).state)).toEqual(['closed']);
  expect(await runInDurableObject(stub(host), instance => instance.signals.allGuestsReady())).toBe(false);
});
it('replies too-large for accepted maximum escaped SDP whose forwarded envelope exceeds the wire cap without harming the recipient', async () => {
  const { host, hp, gp } = await setup(), { h } = await links(hp, gp);
  const original = signal(h) as Extract<RtcSignal, { kind: 'description' }>;
  original.description.sdp = '';
  const frame = { type: 'signal', requestId: 2, signal: original };
  const remaining = 98304 - JSON.stringify(frame).length;
  original.description.sdp = '"'.repeat(Math.floor(remaining / 2)) + 'a'.repeat(remaining % 2);
  const text = JSON.stringify(frame);
  expect(new TextEncoder().encode(text).byteLength).toBe(98304);
  expect(new TextEncoder().encode(original.description.sdp).byteLength).toBeLessThanOrEqual(65536);
  expect(parseClientFrame(text)).toEqual(frame);
  expect(new TextEncoder().encode(JSON.stringify({ sequence: gp.messages.at(-1)!.sequence + 1, payload: { type: 'signal', signal: original } })).byteLength).toBe(98315);
  const credit = () => runInDurableObject(stub(host), instance => {
    const row = instance.sockets.rows().find(r => r.seat_id === 1)!;
    return { sequence: row.last_sent, credits: instance.store.sql.exec('SELECT sequence, bytes FROM room_credits WHERE socket_id = ? ORDER BY sequence', row.socket_id).toArray() };
  });
  const before = await credit();
  hp.socket.send(text);
  expect(await hp.reply(2)).toMatchObject({ outcome: { kind: 'error', error: { code: 'too-large', retryable: false } } });
  expect(await credit()).toEqual(before); expect(gp.closes).toEqual([]); expect(hp.closes).toEqual([]);
  expect(gp.messages.filter(m => m.payload.type === 'signal')).toEqual([]);
  hp.send({ type: 'signal', requestId: 3, signal: signal(h) }); expect(await hp.reply(3)).toMatchObject({ outcome: { kind: 'void' } });
  await gp.until(() => gp.messages.some(m => m.payload.type === 'signal'));
});

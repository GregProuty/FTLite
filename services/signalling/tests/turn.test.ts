import { env } from 'cloudflare:workers';
import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { http, HttpResponse } from 'msw';
import { expect, it, vi } from 'vitest';
import { connect, create, join, request, stub } from './socket-helpers';
import { started } from './lifecycle-helpers';
import { setup, links } from './signal-helpers';
import { tokenHash } from '../src/crypto';
import { directory, endpoint, error, identity, network, provider, synthetic, turn } from './turn-helpers';

it('intercepts outbound HTTP inside the Room runtime', async () => {
  const host = await create();
  network.use(http.post(endpoint, () => HttpResponse.json({ synthetic: true })));
  expect(await runInDurableObject(stub(host), async () => (await fetch(endpoint, { method: 'POST' })).json())).toEqual({ synthetic: true });
});
it('denies unhandled synthetic egress with the installed network error strategy', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(fetch('http://127.0.0.1:43219/unhandled-synthetic')).rejects.toThrow(/Cannot bypass|unhandled/i);
    expect(log.mock.calls.length).toBeGreaterThan(0);
  } finally { log.mockRestore(); }
});
it('documents workerd rejecting redirect:error and never follows provider redirects', async () => {
  expect(() => new Request('https://synthetic.invalid', { redirect: 'error' })).toThrow('Invalid redirect value');
  const host = await create(); await connect(host); let secondOrigin = 0;
  network.use(http.post(endpoint, () => new HttpResponse(null, { status: 302, headers: { Location: 'https://synthetic-redirect.invalid/receive' } })),
    http.all('https://synthetic-redirect.invalid/receive', () => { secondOrigin++; return HttpResponse.json(synthetic, { status: 201 }); }));
  await error(await turn(host), 'turn-unavailable', 503); expect(secondOrigin).toBe(0);
});

it('issues lobby host and guest credentials using only fixed provider policy and conservative expiry', async () => {
  const host = await create(), hp = await connect(host), guest = await join(host), gp = await connect(guest), calls = provider();
  const start = Date.now();
  for (const seat of [host, guest]) {
    const response = await turn(seat); expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json() as any;
    expect(body.iceServers).toEqual([synthetic.iceServers[0], { ...synthetic.iceServers[1], urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'] }]);
    expect(body.expiresAtEpochMs).toBeGreaterThanOrEqual(start + 3600000);
    expect(body.expiresAtEpochMs).toBeLessThanOrEqual(Date.now() + 3600000);
  }
  expect(calls()).toBe(2); hp.ack(); gp.ack();
});
it('allows acknowledged active host, denies retained and unacknowledged lifecycle before provider', async () => {
  const { host, hp } = await started(), calls = provider();
  const response = await turn(host); expect(response.status).toBe(200); await response.json();
  await runInDurableObject(stub(host), room => { room.store.sql.exec("UPDATE room_activation SET state = 'committed'"); });
  await error(await turn(host), 'unavailable', 503); expect(calls()).toBe(1);
  await runInDurableObject(stub(host), room => { room.store.sql.exec("UPDATE room_activation SET state = 'acknowledged'"); });
  hp.send({ type: 'host-release', requestId: 4 }); await hp.reply(4);
  await error(await turn(host), 'invalid-state', 409); expect(calls()).toBe(1);
});
it('allows a guest on its own current socket in an acknowledged active generation', async () => {
  const { host, guest, hp, gp } = await setup(), { h } = await links(hp, gp);
  hp.send({ type: 'link-ready', requestId: 2, attemptId: h.attemptId }); await hp.reply(2);
  gp.send({ type: 'link-ready', requestId: 1, attemptId: h.attemptId }); await gp.reply(1);
  hp.send({ type: 'ready', requestId: 3, ready: true }); await hp.reply(3);
  gp.send({ type: 'ready', requestId: 2, ready: true }); await gp.reply(2);
  const revision = await runInDurableObject(stub(host), room => room.store.snapshot().rosterRevision), initHash = await tokenHash('opaque-init');
  hp.send({ type: 'start-propose', requestId: 4, expectedRosterRevision: revision, initBase64: btoa('opaque-init'), initHash });
  const proposal = await hp.reply(4) as any;
  hp.send({ type: 'start-commit', requestId: 5, proposalId: proposal.outcome.proposalId, expectedRosterRevision: revision });
  expect(await hp.reply(5)).toMatchObject({ outcome: { kind: 'started' } });
  const calls = provider(); const response = await turn(guest); expect(response.status).toBe(200); await response.json(); expect(calls()).toBe(1);
});
it('denies a prepared lobby activation before quota or provider despite a live lobby socket', async () => {
  const host = await create(); await connect(host); const calls = provider();
  await runInDurableObject(stub(host), room => { room.store.sql.exec(`INSERT INTO room_activation VALUES (1, ?, ?, 1, 1, 'start', 'pending', ?, 0, 1, ?, ?, 'prepared', 0, ?)`, 'a'.repeat(32), room.store.meta()!.epoch, room.store.seat(0)!.connection_id!, room.store.meta()!.roster_revision, Date.now() + 30000, 'b'.repeat(32)); });
  await error(await turn(host), 'unavailable', 503); expect(calls()).toBe(0);
  expect(await runInDurableObject(stub(host), room => room.store.sql.exec('SELECT * FROM room_turn').toArray())).toEqual([]);
});
it('denies missing token, unknown token, unused socket, stale identities and unknown fields without provider', async () => {
  const host = await create(), calls = provider();
  await error(await request(`/v2/rooms/${host.snapshot.roomId}/turn`, {}), 'unauthorized', 401);
  await error(await turn(host, { connectionId: 'a'.repeat(32), seatGeneration: 1, hostGeneration: 1 }, 'z'.repeat(43)), 'unauthorized', 401);
  await error(await turn(host, { connectionId: 'a'.repeat(32), seatGeneration: 1, hostGeneration: 1 }), 'stale-connection', 409);
  await connect(host); const own = await identity(host);
  for (const [body, code] of [[{ ...own, hostGeneration: 2 }, 'stale-generation'], [{ ...own, seatGeneration: 2 }, 'stale-generation'], [{ ...own, connectionId: 'a'.repeat(32) }, 'stale-connection'], [{ ...own, url: 'https://127.0.0.1' }, 'invalid-request']] as const) await error(await turn(host, body), code, code === 'invalid-request' ? 400 : 409);
  expect(calls()).toBe(0);
});
it('denies a closing transport before its close event without consuming provider admission', async () => {
  const host = await create(); await connect(host); const calls = provider();
  await runInDurableObject(stub(host), async room => {
    const connection = room.sockets.rows().find(row => row.seat_id === 0)!;
    room.sockets.socket(connection.socket_id)!.close(1000);
    const result = room.turn.issueTurn({ connection, hostGeneration: 1, startedAt: Date.now() }).then(() => 'issued', error => (error as Error).message);
    const reserved = room.store.sql.exec('SELECT * FROM room_turn').toArray();
    expect(await result).toBe('stale-connection');
    expect(reserved).toEqual([]);
  });
  expect(calls()).toBe(0);
});
it('reserves failed attempts before provider and persists seat cooldown across hibernation and rejoin', async () => {
  const host = await create(); await connect(host); const calls = provider({ secretProviderError: 'DO-NOT-REFLECT' }, 500);
  await error(await turn(host), 'turn-unavailable', 503);
  await evictDurableObject(stub(host), { webSockets: 'hibernate' }); await evictDurableObject(directory());
  await error(await turn(host), 'rate-limited', 429);
  const response = await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility: host.snapshot.compatibility }, { Authorization: `Bearer ${host.seatToken}` });
  const rejoined = await response.json() as typeof host; await connect(rejoined);
  await error(await turn(rejoined), 'rate-limited', 429); expect(calls()).toBe(1);
});
it('permits the next attempt only after the persisted sixty-second window', async () => {
  const host = await create(); await connect(host); const calls = provider();
  expect((await turn(host)).status).toBe(200);
  await runInDurableObject(stub(host), room => { room.store.sql.exec('UPDATE room_turn SET attempted_at = ?', Date.now() - 60000); });
  expect((await turn(host)).status).toBe(200); expect(calls()).toBe(2);
});
it('admits one provider attempt when two requests race for the same seat', async () => {
  const host = await create(); await connect(host); const calls = provider();
  const results = await Promise.all([turn(host), turn(host)]);
  expect(results.map(response => response.status).sort()).toEqual([200, 429]);
  for (const response of results) await response.text(); expect(calls()).toBe(1);
});
it('atomically admits only one of two rooms racing the last daily issuance, including a failed provider result', async () => {
  const a = await create(), b = await create(); await connect(a); await connect(b); const calls = provider({}, 500);
  await runInDurableObject(directory(), (_, state) => { state.storage.sql.exec('INSERT INTO directory_turn VALUES (?, 999)', Math.floor(Date.now() / 86400000)); });
  const responses = await Promise.all([turn(a), turn(b)]); expect(responses.map(r => r.status).sort()).toEqual([429, 503]);
  for (const response of responses) await response.json(); expect(calls()).toBe(1);
  await evictDurableObject(directory());
  expect(await runInDurableObject(directory(), (_, state) => state.storage.sql.exec('SELECT attempts FROM directory_turn').one())).toEqual({ attempts: 1000 });
});
it('fails closed on Directory refusal without contacting provider', async () => {
  const host = await create(); await connect(host); const calls = provider();
  await runInDurableObject(directory(), (_, state) => { state.storage.sql.exec('UPDATE directory_rooms SET charged = 0 WHERE room_id = ?', host.snapshot.roomId); });
  await error(await turn(host), 'unavailable', 503); expect(calls()).toBe(0);
});
it('prunes expired daily counters during reconciliation without further issuance', async () => {
  await create();
  const day = Math.floor(Date.now() / 86400000);
  await runInDurableObject(directory(), (_, state) => {
    for (const d of [day - 2, day - 1, day]) state.storage.sql.exec('INSERT INTO directory_turn VALUES (?, 1)', d);
  });
  expect(await directory().reconcile()).toMatchObject({ ok: true });
  expect(await runInDurableObject(directory(), (_, state) => state.storage.sql.exec('SELECT day FROM directory_turn ORDER BY day').toArray())).toEqual([{ day: day - 1 }, { day }]);
});
it('starts a new UTC budget independently of an exhausted previous day', async () => {
  const host = await create(); await connect(host); const calls = provider(), day = Math.floor(Date.now() / 86400000);
  await runInDurableObject(directory(), (_, state) => { state.storage.sql.exec('INSERT INTO directory_turn VALUES (?, 1000)', day - 1); });
  const response = await turn(host); expect(response.status).toBe(200); await response.json(); expect(calls()).toBe(1);
});
it('reserves before an accounting await and fences replacement before contacting provider', async () => {
  const host = await create(); await connect(host); const calls = provider();
  await runInDurableObject(stub(host), async room => {
    const real = room.lifecycle.directory;
    Object.defineProperty(room.lifecycle, 'directory', { configurable: true, value: { reserveTurn: async (...args: Parameters<typeof real.reserveTurn>) => {
      const result = await real.reserveTurn(...args);
      room.store.sql.exec('UPDATE room_seats SET generation = generation + 1 WHERE seat_id = 0');
      return result;
    } } });
    try {
      const response = await room.fetch(new Request('https://room/turn', { method: 'POST', headers: { Authorization: `Bearer ${host.seatToken}` }, body: JSON.stringify({ connectionId: room.store.seat(0)!.connection_id, seatGeneration: 1, hostGeneration: 1 }) }));
      await error(response, 'stale-connection', 409);
    } finally { Object.defineProperty(room.lifecycle, 'directory', { value: real }); }
  });
  expect(calls()).toBe(0);
  expect(await runInDurableObject(directory(), (_, state) => state.storage.sql.exec('SELECT attempts FROM directory_turn').one())).toEqual({ attempts: 1 });
});
it('rechecks identity after the issuance promise before constructing the HTTP success', async () => {
  const host = await create(); await connect(host); provider();
  await runInDurableObject(stub(host), async room => {
    const real = room.turn.issueTurn.bind(room.turn);
    const issue = vi.spyOn(room.turn, 'issueTurn').mockImplementation(async observed => {
      const value = await real(observed);
      room.store.sql.exec('UPDATE room_seats SET generation = generation + 1 WHERE seat_id = 0');
      return value;
    });
    try {
      const response = await room.fetch(new Request('https://room/turn', { method: 'POST', headers: { Authorization: `Bearer ${host.seatToken}` }, body: JSON.stringify({ connectionId: room.store.seat(0)!.connection_id, seatGeneration: 1, hostGeneration: 1 }) }));
      await error(response, 'stale-connection', 409);
    } finally { issue.mockRestore(); }
  });
});
it.each(['rejoin', 'close', 'host-generation', 'retained', 'lease-expiry'] as const)('fences credentials when %s changes during provider await', async change => {
  const host = change === 'lease-expiry' ? (await started()).host : await create();
  if (change !== 'lease-expiry') await connect(host);
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
  network.use(http.post(endpoint, async () => { enter(); await held; return HttpResponse.json(synthetic, { status: 201 }); }));
  const pending = turn(host).then(async response => ({ status: response.status, text: await response.text() })); await entered;
  await runInDurableObject(stub(host), room => {
    if (change === 'rejoin') room.store.sql.exec('UPDATE room_seats SET generation = generation + 1 WHERE seat_id = 0');
    if (change === 'close') room.sockets.close(room.sockets.rows()[0]!.socket_id);
    if (change === 'host-generation') room.store.sql.exec('UPDATE room_meta SET host_generation = host_generation + 1');
    if (change === 'retained') room.store.fence(Date.now());
    if (change === 'lease-expiry') room.store.sql.exec('UPDATE room_lease SET expires_at = ?', Date.now() - 1);
  });
  release(); const response = await pending; expect(response.status).toBe(409); expect(response.text).not.toContain('synthetic-ephemeral');
});
it.each([
  ['non201', {}, 200], ['malformed', { iceServers: null }, 201], ['empty', { iceServers: [] }, 201],
  ['stun-only', { iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }] }, 201],
  ['port53-only', { iceServers: [{ urls: ['turn:turn.cloudflare.com:53'], username: 'u', credential: 'p' }] }, 201],
  ['missing-password', { iceServers: [{ urls: ['turn:turn.cloudflare.com:3478'] }] }, 201],
  ['too-many-servers', { iceServers: Array(9).fill(synthetic.iceServers[1]) }, 201],
  ['too-many-urls', { iceServers: [{ ...synthetic.iceServers[1], urls: Array(17).fill('turn:turn.cloudflare.com:3478') }] }, 201],
  ['large-username', { iceServers: [{ ...synthetic.iceServers[1], username: 'u'.repeat(513) }] }, 201],
  ['large-password', { iceServers: [{ ...synthetic.iceServers[1], credential: 'p'.repeat(513) }] }, 201],
  ['large-utf8-password', { iceServers: [{ ...synthetic.iceServers[1], credential: 'é'.repeat(257) }] }, 201],
] as const)('rejects provider %s with a fixed error', async (_, body, status) => {
  const host = await create(); await connect(host); const calls = provider(body, status);
  await error(await turn(host), 'turn-unavailable', 503); expect(calls()).toBe(1);
});
it.each(['https://127.0.0.1', 'turn:127.0.0.1:3478', 'turn:turn.cloudflare.com.attacker.test:3478', 'turn:user@turn.cloudflare.com:3478', 'turn://turn.cloudflare.com:3478', 'turn:turn.cloudflare.com:3478/path', 'turn:turn.cloudflare.com:3478?transport=udp&url=https://127.0.0.1', 'turn:turn.cloudflare.com:3478#evil', 'turn:%74urn.cloudflare.com:3478', 'turn:turn.cloudflare.com:0', 'turn:turn.cloudflare.com:65536', 'turn:turn.cloudflare.com:3478?transport=' + 'a'.repeat(2048)].map((url, index) => ({ url, index })))('rejects unsafe ICE URL case $index', async ({ url }) => {
  const host = await create(); await connect(host); provider({ iceServers: [{ urls: [url], username: 'u', credential: 'p' }] });
  await error(await turn(host), 'turn-unavailable', 503);
});
it('accepts the eight-server sixteen-URL and512-byte credential boundaries', async () => {
  const host = await create(); await connect(host);
  provider({ iceServers: Array.from({ length: 8 }, () => ({ urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u'.repeat(512), credential: 'é'.repeat(256) })) });
  const response = await turn(host); expect(response.status).toBe(200); expect((await response.json() as any).iceServers).toHaveLength(8);
});
it.each([16384, 16385])('enforces the streamed provider body limit at %i bytes without Content-Length', async bytes => {
  const host = await create(); await connect(host); const text = JSON.stringify(synthetic);
  network.use(http.post(endpoint, () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(text)); controller.enqueue(new TextEncoder().encode(' '.repeat(bytes - text.length))); controller.close();
    } });
    return new HttpResponse(stream, { status: 201 });
  }));
  const response = await turn(host); expect(response.status).toBe(bytes === 16384 ? 200 : 503); await response.text();
});
it('covers stalled provider response bytes with the same five-second deadline', async () => {
  const host = await create(); await connect(host); let cancelled = false;
  network.use(http.post(endpoint, () => new HttpResponse(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; } }), { status: 201 })));
  const begin = Date.now(); await error(await turn(host), 'turn-unavailable', 503);
  expect(Date.now() - begin).toBeLessThan(6000); expect(Date.now() - begin).toBeGreaterThanOrEqual(4900); await expect.poll(() => cancelled, { timeout: 1000 }).toBe(true);
}, 8000);
it('aborts a stalled provider at five seconds without refunding its quota', async () => {
  // MSW 2.14.7 RequestHandler.run's abort listener returns the promise from
  // runScheduledCleanups (RequestHandler.ts:358-360,535). Workerd warns that it
  // ignores that return value; our listener below returns void. Keep the upstream
  // diagnostic visible while asserting real abort/deadline/quota behavior.
  const host = await create(); await connect(host); let aborted = false;
  network.use(http.post(endpoint, async ({ request: outgoing }) => {
    await new Promise<void>(resolve => outgoing.signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true }));
    return HttpResponse.json(synthetic, { status: 201 });
  }));
  const begin = Date.now(); await error(await turn(host), 'turn-unavailable', 503);
  expect(Date.now() - begin).toBeGreaterThanOrEqual(4900); expect(Date.now() - begin).toBeLessThan(6000); expect(aborted).toBe(true);
  await error(await turn(host), 'rate-limited', 429);
}, 8000);

import { env } from 'cloudflare:workers';
import { listDurableObjectIds, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { compatibility, create, request } from './helpers';
import worker from '../src/index';

it('creates a durable host and joins the lowest free seat with exact opaque compatibility', async () => {
  const host = await create();
  expect(host).toMatchObject({ seatId: 0, seatGeneration: 1, snapshot: { capacity: 4, hostGeneration: 1, phase: 'lobby' } });
  expect(host.seatToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const response = await request(`/v2/rooms/${host.snapshot.joinCode.toLowerCase()}/join`, { compatibility });
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toMatchObject({ seatId: 1, seatGeneration: 1, snapshot: { rosterRevision: 2 } });
});

it('rejects forged seats, incompatible joins and unknown room IDs before Room allocation', async () => {
  const before = await listDurableObjectIds(env.ROOMS);
  expect((await request(`/v2/rooms/${'f'.repeat(32)}/socket-ticket`, {}, { Authorization: `Bearer ${'t'.repeat(43)}` })).status).toBe(404);
  expect(await listDurableObjectIds(env.ROOMS)).toHaveLength(before.length);
  const host = await create();
  expect((await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility, seatId: 0 })).status).toBe(400);
  expect((await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility: { ...compatibility, simVersion: 36 } })).status).toBe(409);
  expect((await request(`/v2/rooms/${host.snapshot.roomId}/socket-ticket`)).status).toBe(401);
});

it('fails closed without trusted IP or salt and does not use forwarded headers', async () => {
  const before = await listDurableObjectIds(env.ROOMS);
  const beforeDirectory = await listDurableObjectIds(env.DIRECTORY);
  for (const [headers, overrides] of [
    [{ 'CF-Connecting-IP': '', 'X-Forwarded-For': '192.0.2.2' }, {}],
    [{ 'CF-Connecting-IP': 'not-an-ip' }, {}], [{}, { IP_HASH_SALT: '' }],
  ] as const) {
    expect((await request('/v2/rooms', { compatibility, capacity: 4 }, headers, overrides)).status).toBe(503);
  }
  expect(await listDurableObjectIds(env.ROOMS)).toHaveLength(before.length);
  expect(await listDurableObjectIds(env.DIRECTORY)).toHaveLength(beforeDirectory.length);
});

it('allows native/null/configured origins while rejecting other origins and query credentials', async () => {
  for (const origin of ['null', 'https://allowed.example']) {
    const response = await request('/v2/rooms', { compatibility, capacity: 1 }, { Origin: origin }, { ALLOWED_ORIGINS: 'https://allowed.example' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
  }
  expect((await request('/v2/rooms', { compatibility, capacity: 1 }, { Origin: 'https://evil.example' })).status).toBe(403);
  expect((await request(`/v2/rooms/${'f'.repeat(32)}/socket-ticket?token=secret`)).status).toBe(400);
});

it('enforces streamed small-body caps, exact JSON keys, and redacted failures', async () => {
  expect((await request('/v2/rooms', { compatibility, capacity: 0 })).status).toBe(400);
  expect((await request('/v2/rooms', { compatibility, capacity: 5 })).status).toBe(400);
  const response = await request('/v2/rooms', { private: 'secret'.repeat(2000) });
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ error: { code: 'too-large', retryable: false } });
  expect((await request('/internal/initialize')).status).toBe(404);
});

it('charges five creates and twenty joins per IP per minute without refunding failed joins', async () => {
  const host = await create();
  for (let i = 1; i < 5; i++) expect((await request('/v2/rooms', { compatibility, capacity: 1 })).status).toBe(200);
  expect((await request('/v2/rooms', { compatibility, capacity: 1 })).status).toBe(429);
  for (let i = 0; i < 20; i++) expect((await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility: { ...compatibility, simVersion: 36 } })).status).toBe(409);
  expect((await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility })).status).toBe(429);
});

it('does not allocate or expose secrets when Directory accounting is unavailable', async () => {
  const before = await listDurableObjectIds(env.ROOMS);
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('global'));
  await runInDurableObject(directory, (_, state) => state.storage.sql.exec('DROP TABLE directory_rooms'));
  const response = await request('/v2/rooms', { compatibility, capacity: 1 });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: { code: 'unavailable', retryable: true } });
  expect(await listDurableObjectIds(env.ROOMS)).toHaveLength(before.length);
  // Restore the deliberate fault so subsequent cases exercise healthy accounting.
  await runInDurableObject(directory, (_, { storage }) => storage.sql.exec(`CREATE TABLE directory_rooms (
    room_id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, reservation TEXT NOT NULL, epoch TEXT NOT NULL,
    generation INTEGER NOT NULL, phase TEXT NOT NULL, charged INTEGER NOT NULL, committed INTEGER NOT NULL, deadline INTEGER NOT NULL)`));
});

it('cancels an unread unauthorized body without waiting for an untrusted cancel promise', async () => {
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { canceled = true; return new Promise(() => {}); } });
  const response = await worker.fetch(new Request(`https://service/v2/rooms/${'f'.repeat(32)}/socket-ticket`, { method: 'POST', body: stream }),
    { ...env, IP_HASH_SALT: 'synthetic-runtime-test-salt' });
  expect(response.status).toBe(401);
  expect(canceled).toBe(true);
});

it('times out a stalled HTTP body at five seconds and releases the reader for later admission', async () => {
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { canceled = true; } });
  const req = new Request('https://service/v2/rooms', { method: 'POST', body: stream, headers: { 'CF-Connecting-IP': '192.0.2.1' } });
  const response = await worker.fetch(req, { ...env, IP_HASH_SALT: 'synthetic-runtime-test-salt' });
  expect(response.status).toBe(408);
  expect(canceled).toBe(true);
  expect(req.body!.locked).toBe(false);
  expect((await request('/v2/rooms', { compatibility, capacity: 1 })).status).toBe(200);
}, 10000);

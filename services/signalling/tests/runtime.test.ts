import { env } from 'cloudflare:workers';
import { evictDurableObject, runInDurableObject, SELF, listDurableObjectIds } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { initializeServiceSchema } from '../src/storage';

it('initializes a singleton schema row idempotently through the shared storage initializer', async () => {
  const stub = env.PROBE.get(env.PROBE.newUniqueId());
  await runInDurableObject(stub, (_, { storage }) => {
    initializeServiceSchema(storage);
    initializeServiceSchema(storage);
    expect(storage.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'service_schema'").toArray())
      .toEqual([{ name: 'service_schema' }]);
    expect(storage.sql.exec('SELECT * FROM service_schema').toArray()).toEqual([{ singleton: 1, version: 1 }]);
  });
});

it('rejects an unsupported durable schema without replacing its stored version', async () => {
  const stub = env.PROBE.get(env.PROBE.newUniqueId());
  await runInDurableObject(stub, (_, { storage }) => {
    storage.sql.exec('CREATE TABLE service_schema (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), version INTEGER NOT NULL)');
    storage.sql.exec('INSERT INTO service_schema VALUES (1, 2)');
    expect(() => initializeServiceSchema(storage)).toThrow('unsupported-schema');
    expect(storage.sql.exec('SELECT * FROM service_schema').toArray()).toEqual([{ singleton: 1, version: 2 }]);
  });
});

it('fails closed on public and internal routes without allocating a Room or Directory', async () => {
  for (const path of ['/v2/rooms', '/v2/rooms/ABCD0123/join', '/v2/rooms/' + 'a'.repeat(32) + '/socket-ticket', '/internal/initialize', '/unknown']) {
    const response = await SELF.fetch('https://service' + path, { method: 'POST', body: '{}' });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toHaveProperty('error.code');
  }
  expect(await listDurableObjectIds(env.ROOMS)).toHaveLength(0);
  expect(await listDurableObjectIds(env.DIRECTORY)).toHaveLength(0);
});

it.each(['ROOMS', 'DIRECTORY'] as const)('initializes only durable schema state in %s, preserving it across eviction', async binding => {
  const stub = env[binding].get(env[binding].newUniqueId());
  const response = await stub.fetch('https://internal/');
  expect(response.status).toBe(503);
  // Eviction drains requests, including response bodies held by the caller.
  expect(await response.json()).toEqual({ error: { code: 'unavailable', retryable: true } });
  const read = () => runInDurableObject(stub, (_, state) => state.storage.sql.exec('SELECT * FROM service_schema').toArray());
  expect(await read()).toEqual([{ singleton: 1, version: 1 }]);
  await evictDurableObject(stub);
  expect(await read()).toEqual([{ singleton: 1, version: 1 }]);
});

it('rolls back synchronous SQLite transactions and retains committed rows through real eviction', async () => {
  const stub = env.PROBE.get(env.PROBE.newUniqueId());
  const before = await runInDurableObject(stub, (instance, state) => {
    state.storage.sql.exec('CREATE TABLE proof (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
    state.storage.transactionSync(() => state.storage.sql.exec("INSERT INTO proof VALUES (1, 'committed')"));
    expect(() => state.storage.transactionSync(() => {
      state.storage.sql.exec("UPDATE proof SET value = 'rolled back' WHERE id = 1");
      state.storage.sql.exec("INSERT INTO proof VALUES (2, 'rolled back')");
      throw new Error('rollback probe');
    })).toThrow('rollback probe');
    return instance.marker;
  });
  await evictDurableObject(stub);
  const after = await runInDurableObject(stub, (instance, state) => ({
    marker: instance.marker, rows: state.storage.sql.exec('SELECT * FROM proof').toArray(),
  }));
  expect(after.marker).not.toBe(before);
  expect(after.rows).toEqual([{ id: 1, value: 'committed' }]);
});

it('keeps an accepted hibernating socket, its attachment and SQL state across reconstruction', async () => {
  const stub = env.PROBE.get(env.PROBE.newUniqueId());
  const response = await stub.fetch('https://probe/socket', { headers: { Upgrade: 'websocket' } });
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  socket.accept();
  const exchange = () => new Promise<Record<string, unknown>>((resolve) => {
    socket.addEventListener('message', event => resolve(JSON.parse(event.data as string)), { once: true });
    socket.send('read');
  });
  try {
    const before = await exchange();
    expect(before).toMatchObject({ attachment: { id: 'attachment-proof' }, value: 41, sockets: 1 });
    await evictDurableObject(stub, { webSockets: 'hibernate' });
    const after = await exchange();
    expect(after.marker).not.toBe(before.marker);
    expect(after).toMatchObject({ attachment: { id: 'attachment-proof' }, value: 41, sockets: 1 });
  } finally { socket.close(1000); }
});

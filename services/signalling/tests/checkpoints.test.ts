import { runInDurableObject, evictDurableObject } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import { started } from './lifecycle-helpers';
import { stub } from './socket-helpers';
import { checkpointRequest, dispatch, getCheckpoint, header } from './checkpoint-helpers';

it('stores exactly262144 raw bytes, rejects +1, and returns metadata only to reserved tokens after reconstruction', async () => {
  const { host } = await started(), bytes = new Uint8Array(262144).fill(73), put = await checkpointRequest(host, bytes);
  expect((await dispatch(put.request())).status).toBe(204);
  const big = await checkpointRequest(host, new Uint8Array(262145), { checkpointSequence: 2 });
  const oversized = await dispatch(big.request()); expect(oversized.status).toBe(413); await oversized.json();
  await evictDurableObject(stub(host));
  const result = await getCheckpoint(host); expect(result.status).toBe(200); expect(result.headers.get('X-FTL-Checkpoint')).toBe(header(put.metadata));
  expect(new Uint8Array(await result.arrayBuffer())).toEqual(bytes);
  expect((await getCheckpoint(host, 'z'.repeat(43))).status).toBe(401);
});
it('keeps old committed bytes on bad hash, conflicts, and orders by sequence rather than tick', async () => {
  const { host } = await started(), first = await checkpointRequest(host);
  expect((await dispatch(first.request())).status).toBe(204); expect((await dispatch(first.request())).status).toBe(204);
  const conflict = await checkpointRequest(host, new Uint8Array([9])); expect((await dispatch(conflict.request())).status).toBe(409);
  const bad = await checkpointRequest(host, new Uint8Array([8]), { checkpointSequence: 2, payloadSha256: 'a'.repeat(64) });
  expect((await dispatch(bad.request())).status).toBe(400);
  expect(new Uint8Array(await (await getCheckpoint(host)).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  const earlier = await checkpointRequest(host, new Uint8Array([4]), { checkpointSequence: 2, capturedTick: 1 });
  expect((await dispatch(earlier.request())).status).toBe(204);
  expect((await dispatch(first.request())).status).toBe(409);
});
it('rejects authentication and oversized metadata before consuming a checkpoint body', async () => {
  const { host } = await started(), put = await checkpointRequest(host);
  for (const headers of [{ ...put.headers, Authorization: `Bearer ${'z'.repeat(43)}` }, { ...put.headers, 'X-FTL-Checkpoint': 'a'.repeat(4097) }]) {
    let pulls = 0;
    await runInDurableObject(stub(host), async room => {
      const body = new ReadableStream<Uint8Array>({ pull() { pulls++; } }, { highWaterMark: 0 });
      const result = await room.fetch(new Request('https://room/checkpoint', { method: 'PUT', headers, body }));
      expect([400, 401, 413]).toContain(result.status);
      expect(pulls).toBe(0);
    });
  }
});
it('fences an upload if host release occurs during its hash and leaves old committed bytes', async () => {
  const { host } = await started(), first = await checkpointRequest(host);
  expect((await dispatch(first.request())).status).toBe(204);
  const next = await checkpointRequest(host, new Uint8Array([9]), { checkpointSequence: 2 });
  await runInDurableObject(stub(host), async room => {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(r => { release = r; }), seen = new Promise<void>(r => { entered = r; });
    const original = crypto.subtle.digest.bind(crypto.subtle); let count = 0;
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => { if (++count === 2) { entered(); await gate; } return original(...args); });
    try {
      const pending = room.fetch(new Request('https://room/checkpoint', next.request())); await seen;
      room.store.fence(Date.now()); release(); expect((await pending).status).toBe(409);
    } finally { release(); spy.mockRestore(); }
  });
  expect(new Uint8Array(await (await getCheckpoint(host)).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
});
it('admits only two checkpoint bodies and releases admission after their five second deadline', async () => {
  const { host } = await started(), put = await checkpointRequest(host);
  await runInDurableObject(stub(host), async room => {
    const pending: Promise<Response>[] = [];
    let entered!: () => void, reads = 0; const seen = new Promise<void>(r => { entered = r; });
    const request = () => new Request('https://room/checkpoint', { method: 'PUT', headers: put.headers,
      body: new ReadableStream<Uint8Array>({ pull() { if (++reads === 2) entered(); } }, { highWaterMark: 0 }) });
    pending.push(room.fetch(request()), room.fetch(request())); await seen;
    expect((await room.fetch(request())).status).toBe(429);
    expect((await Promise.all(pending)).map(r => r.status)).toEqual([408, 408]);
    expect((await room.fetch(new Request('https://room/checkpoint', put.request()))).status).toBe(204);
  });
}, 10000);
it('permits a4096-byte metadata header and deletes retained bytes and token authority after seven days', async () => {
  const { host, hp } = await started(), put = await checkpointRequest(host);
  const json = JSON.stringify(put.metadata);
  put.headers['X-FTL-Checkpoint'] = btoa(json + ' '.repeat(3072 - json.length));
  expect(put.headers['X-FTL-Checkpoint'].length).toBe(4096);
  expect((await dispatch(put.request())).status).toBe(204);
  hp.send({ type: 'host-release', requestId: 4 }); await hp.reply(4);
  await runInDurableObject(stub(host), room => {
    const retained = room.store.meta()!;
    expect(retained.retain_until - Date.now()).toBeGreaterThan(604798000);
    expect(retained.retain_until - Date.now()).toBeLessThanOrEqual(604800000);
    room.store.sql.exec('UPDATE room_meta SET deadline = ?, retain_until = ?', Date.now() - 1, Date.now() - 1);
  });
  expect((await getCheckpoint(host)).status).toBe(404);
  expect(await runInDurableObject(stub(host), room => room.store.sql.exec('SELECT * FROM room_checkpoint').toArray())).toEqual([]);
});
it('rolls back an interrupted checkpoint commit to the previous bytes', async () => {
  const { host } = await started(), first = await checkpointRequest(host);
  expect((await dispatch(first.request())).status).toBe(204);
  const next = await checkpointRequest(host, new Uint8Array([9]), { checkpointSequence: 2 });
  await runInDurableObject(stub(host), async room => {
    const original = room.store.transaction.bind(room.store);
    const spy = vi.spyOn(room.store, 'transaction').mockImplementation(body => original(() => {
      const value = body();
      const row = room.store.sql.exec<{ metadata: string }>('SELECT metadata FROM room_checkpoint').toArray()[0];
      if (row && JSON.parse(row.metadata).checkpointSequence === 2) throw Error('synthetic-checkpoint-crash');
      return value;
    }));
    try {
      const response = await room.fetch(new Request('https://room/checkpoint', next.request()));
      expect(response.status).toBe(503); await response.json();
    } finally { spy.mockRestore(); }
  });
  await evictDurableObject(stub(host));
  expect(new Uint8Array(await (await getCheckpoint(host)).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
});

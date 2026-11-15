import { env } from 'cloudflare:workers';
import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { prepared, started } from './lifecycle-helpers';
import { checkpointRequest, dispatch, getCheckpoint } from './checkpoint-helpers';
import { stub, create, connect, join } from './socket-helpers';
import { links } from './signal-helpers';
import { tokenHash } from '../src/crypto';
import { unwrapDomain } from '../src/errors';
const directory = () => env.DIRECTORY.get(env.DIRECTORY.idFromName('global'));
async function account(roomId: string) { return runInDurableObject(directory(), (_, state) => state.storage.sql.exec('SELECT epoch, generation, phase, charged FROM directory_rooms WHERE room_id = ?', roomId).one()); }

it.each(['prepare', 'reserve', 'commit', 'ack'] as const)('recovers crash after %s with one exact outcome and no early grant', async boundary => {
  const { host, hp, proposalId, revision } = await prepared();
  await runInDurableObject(stub(host), async room => {
    const real = room.lifecycle.directory;
    const wrapped = {
      reserveActivation: async (...args: Parameters<typeof real.reserveActivation>) => {
        if (boundary === 'prepare') throw Error('synthetic-interruption');
        const value = await real.reserveActivation(...args);
        if (boundary === 'reserve') throw Error('synthetic-interruption');
        return value;
      },
      commitActivation: async (...args: Parameters<typeof real.commitActivation>) => {
        if (boundary === 'commit') throw Error('synthetic-interruption');
        const value = await real.commitActivation(...args);
        if (boundary === 'ack') throw Error('synthetic-interruption');
        return value;
      },
    };
    Object.defineProperty(room.lifecycle, 'directory', { value: wrapped, configurable: true });
    try {
      await expect(room.lifecycle.request(room.sockets.rows().find(r => r.seat_id === 0)!, { type: 'start-commit', requestId: 3, proposalId, expectedRosterRevision: revision })).rejects.toThrow('synthetic-interruption');
      expect(room.store.activation()?.state).toBe(boundary === 'prepare' || boundary === 'reserve' ? 'prepared' : 'committed');
      if (boundary === 'commit' || boundary === 'ack') {
        await expect(room.lifecycle.request(room.sockets.rows().find(r => r.seat_id === 0)!, { type: 'lease-renew', requestId: 4, nonce: 'd'.repeat(32) })).rejects.toThrow('unavailable');
      }
    } finally { Object.defineProperty(room.lifecycle, 'directory', { value: real }); }
  });
  expect(hp.messages.some(m => m.payload.type === 'started')).toBe(false);
  await evictDurableObject(stub(host));
  hp.send({ type: 'start-commit', requestId: 3, proposalId, expectedRosterRevision: revision });
  expect(await hp.reply(3)).toMatchObject({ outcome: { kind: 'started' } });
  hp.send({ type: 'start-commit', requestId: 4, proposalId, expectedRosterRevision: revision });
  expect((await hp.reply(4) as any).outcome).toEqual((await hp.reply(3) as any).outcome);
  expect(await account(host.snapshot.roomId)).toMatchObject({ charged: 1, generation: 1, phase: 'active' });
  expect(await runInDurableObject(stub(host), room => room.store.activation()?.state)).toBe('acknowledged');
});
it.each(['reserve', 'ack'] as const)('fences delayed successful %s beyond the useful deadline without granting or erasing mapping', async boundary => {
  const { host, hp, proposalId, revision } = await prepared();
  await runInDurableObject(stub(host), async room => {
    const real = room.lifecycle.directory;
    Object.defineProperty(room.lifecycle, 'directory', { configurable: true, value: {
      reserveActivation: async (...args: Parameters<typeof real.reserveActivation>) => {
        const value = await real.reserveActivation(...args);
        if (boundary === 'reserve') room.store.sql.exec('UPDATE room_meta SET deadline = ?', Date.now() - 1);
        return value;
      },
      commitActivation: async (...args: Parameters<typeof real.commitActivation>) => {
        const value = await real.commitActivation(...args);
        if (boundary === 'ack') room.store.sql.exec('UPDATE room_lease SET expires_at = ?', Date.now() - 1);
        return value;
      },
    } });
    try { await expect(room.lifecycle.request(room.sockets.rows().find(r => r.seat_id === 0)!, { type: 'start-commit', requestId: 3, proposalId, expectedRosterRevision: revision })).rejects.toThrow(boundary === 'reserve' ? 'invalid-state' : 'lease-expired'); }
    finally { Object.defineProperty(room.lifecycle, 'directory', { value: real }); }
  });
  expect(hp.messages.some(m => m.payload.type === 'started')).toBe(false);
  await runInDurableObject(directory(), (_, state) => { state.storage.sql.exec('UPDATE directory_rooms SET deadline = 0 WHERE room_id = ?', host.snapshot.roomId); });
  unwrapDomain(await directory().reconcile());
  expect(await account(host.snapshot.roomId)).toMatchObject({ charged: 0 });
  expect(unwrapDomain(await directory().resolveRoom(host.snapshot.roomId))).toEqual({ roomId: host.snapshot.roomId });
});
async function lost() {
  const value = await started(), put = await checkpointRequest(value.host);
  expect((await dispatch(put.request())).status).toBe(204);
  value.hp.send({ type: 'host-release', requestId: 4 }); expect(await value.hp.reply(4)).toMatchObject({ outcome: { kind: 'void' } });
  return value;
}
async function fillCharged(target: number) {
  await runInDurableObject(directory(), (_, state) => {
    const template = state.storage.sql.exec<{ reservation: string }>('SELECT reservation FROM directory_rooms LIMIT 1').one();
    const existing = state.storage.sql.exec<{ n: number }>('SELECT COALESCE(SUM(charged),0) AS n FROM directory_rooms').one().n;
    state.storage.transactionSync(() => {
      for (let i = existing; i < target; i++) state.storage.sql.exec('INSERT INTO directory_rooms VALUES (?, ?, ?, ?, 1, ?, 1, 1, ?)',
        i.toString(16).padStart(32, '0'), i.toString().padStart(8, '0'), template.reservation, (i + 1000).toString(16).padStart(32, '0'), 'active', Date.now() + 86400000);
    });
  });
}
it('refuses retained rehost at100 charged rooms without losing its checkpoint', async () => {
  const { host, hp } = await lost(); await fillCharged(100);
  hp.send({ type: 'rehost-claim', requestId: 5, expectedHostGeneration: 1, nonce: 'e'.repeat(32) });
  expect(await hp.reply(5)).toMatchObject({ outcome: { kind: 'error', error: { code: 'capacity' } } });
  expect(await account(host.snapshot.roomId)).toMatchObject({ phase: 'lost', charged: 0, generation: 1 });
  expect((await getCheckpoint(host)).status).toBe(200);
});
it('admits exactly one of two retained rehosts racing the last charged slot', async () => {
  const a = await lost(), b = await lost(); await fillCharged(99);
  a.hp.send({ type: 'rehost-claim', requestId: 5, expectedHostGeneration: 1, nonce: 'e'.repeat(32) });
  b.hp.send({ type: 'rehost-claim', requestId: 5, expectedHostGeneration: 1, nonce: 'f'.repeat(32) });
  const outcomes = await Promise.all([a.hp.reply(5), b.hp.reply(5)]);
  expect(outcomes.map(x => (x as any).outcome.kind).sort()).toEqual(['error', 'lease']);
  expect(outcomes.find(x => (x as any).outcome.kind === 'error')).toMatchObject({ outcome: { error: { code: 'capacity' } } });
  expect(await runInDurableObject(directory(), (_, state) => state.storage.sql.exec('SELECT SUM(charged) AS n FROM directory_rooms').one())).toEqual({ n: 100 });
});
it('ignores old loss and expiry receipts after a new generation and releases each epoch once', async () => {
  const { host, hp } = await lost();
  const old = await runInDurableObject(stub(host), room => room.store.meta()!);
  hp.send({ type: 'rehost-claim', requestId: 5, expectedHostGeneration: 1, nonce: 'e'.repeat(32) });
  expect(await hp.reply(5)).toMatchObject({ outcome: { kind: 'lease', lease: { hostGeneration: 2, nonce: 'e'.repeat(32) } } });
  const current = await account(host.snapshot.roomId);
  for (let n = 0; n < 2; n++) {
    unwrapDomain(await directory().releaseFenced(old.room_id, { kind: 'fenced', epoch: old.epoch, generation: 1, phase: 'lost', retainUntilEpochMs: old.retain_until }));
    unwrapDomain(await directory().releaseFenced(old.room_id, { kind: 'absent', epoch: old.epoch }));
  }
  expect(await account(host.snapshot.roomId)).toEqual(current);
  expect(await runInDurableObject(stub(host), room => room.store.snapshot())).toMatchObject({ phase: 'active', hostGeneration: 2 });
  const put = await checkpointRequest(host, new Uint8Array([9]), { hostGeneration: 2, checkpointSequence: 1, capturedTick: 0 });
  expect((await dispatch(put.request())).status).toBe(204);
});
it.each(['before-reserve', 'lost-reserve', 'lost-fence-ack'] as const)('fences expired rehost after %s durably before a fresh claim, burning its generation', async boundary => {
  const { host, hp } = await lost();
  const operation = await runInDurableObject(stub(host), async room => {
    const real = room.lifecycle.directory;
    Object.defineProperty(room.lifecycle, 'directory', { configurable: true, value: {
      releaseFenced: (...args: Parameters<typeof real.releaseFenced>) => real.releaseFenced(...args),
      fenceActivation: (...args: any[]) => (real as any).fenceActivation(...args),
      reserveActivation: async (...args: Parameters<typeof real.reserveActivation>) => {
        if (boundary !== 'before-reserve') await real.reserveActivation(...args);
        throw Error('synthetic-reserve-loss');
      },
    } });
    try {
      await expect(room.lifecycle.request(room.sockets.rows().find(r => r.seat_id === 0)!, { type: 'rehost-claim', requestId: 5, expectedHostGeneration: 1, nonce: 'e'.repeat(32) })).rejects.toThrow('synthetic-reserve-loss');
      const op = room.store.activation()!;
      room.store.sql.exec('UPDATE room_activation SET expires_at = ?', Date.now() - 1); room.store.expire();
      expect(room.store.activation()?.state).toBe('fenced');
      return op;
    } finally { Object.defineProperty(room.lifecycle, 'directory', { value: real }); }
  });
  if (boundary === 'lost-fence-ack') await runInDurableObject(stub(host), async room => {
    const real = room.lifecycle.directory;
    Object.defineProperty(room.lifecycle, 'directory', { configurable: true, value: {
      releaseFenced: (...args: Parameters<typeof real.releaseFenced>) => real.releaseFenced(...args),
      fenceActivation: async (...args: any[]) => { await (real as any).fenceActivation(...args); throw Error('synthetic-fence-ack-loss'); },
    } });
    try { await expect(room.lifecycle.recover()).rejects.toThrow('synthetic-fence-ack-loss'); }
    finally { Object.defineProperty(room.lifecycle, 'directory', { value: real }); }
  });
  await evictDurableObject(stub(host));
  await runInDurableObject(stub(host), room => room.alarm());
  expect(await runInDurableObject(stub(host), room => room.store.snapshot())).toMatchObject({ hostGeneration: 2, phase: 'lost' });
  expect(await account(host.snapshot.roomId)).toMatchObject({ epoch: operation.operation_id, generation: 2, charged: 0, phase: 'lost' });
  // A reserve that arrives after its terminal fence cannot resurrect the operation.
  expect(await directory().reserveActivation(host.snapshot.roomId, operation.previous_epoch, operation.operation_id, 1, 2)).toMatchObject({ ok: false, error: { code: 'conflict' } });
  hp.send({ type: 'rehost-claim', requestId: 5, expectedHostGeneration: 2, nonce: 'f'.repeat(32) });
  expect(await hp.reply(5)).toMatchObject({ outcome: { kind: 'lease', lease: { hostGeneration: 3 } } });
  const newer = await account(host.snapshot.roomId);
  expect(await (directory() as any).fenceActivation(host.snapshot.roomId, operation.previous_epoch, operation.operation_id, 1, 2, 'lost', Date.now() + 604800000)).toMatchObject({ ok: false });
  expect(await account(host.snapshot.roomId)).toEqual(newer);
});
it('keeps a durable short retry when accounting fails after authority is fenced', async () => {
  const { host } = await started();
  await runInDurableObject(stub(host), async room => {
    const real = room.lifecycle.directory;
    Object.defineProperty(room.lifecycle, 'directory', { configurable: true, value: {
      releaseFenced: () => { throw Error('synthetic-accounting-loss'); },
      fenceActivation: () => { throw Error('synthetic-accounting-loss'); },
    } });
    try {
      await expect(room.lifecycle.request(room.sockets.rows().find(r => r.seat_id === 0)!, { type: 'host-release', requestId: 4 })).rejects.toThrow('synthetic-accounting-loss');
      await room.store.schedule();
      expect((await room.store.storage.getAlarm())! - Date.now()).toBeLessThanOrEqual(5000);
      expect(room.store.snapshot().phase).toBe('lost');
    } finally { Object.defineProperty(room.lifecycle, 'directory', { value: real }); }
  });
  expect(await account(host.snapshot.roomId)).toMatchObject({ charged: 1 });
  await evictDurableObject(stub(host)); await runInDurableObject(stub(host), room => room.alarm());
  expect(await account(host.snapshot.roomId)).toMatchObject({ charged: 0 });
});
it('returns the original rehost grant for an exact retry after renewal', async () => {
  const { hp } = await lost();
  hp.send({ type: 'rehost-claim', requestId: 5, expectedHostGeneration: 1, nonce: 'e'.repeat(32) });
  const first = (await hp.reply(5) as any).outcome;
  hp.send({ type: 'lease-renew', requestId: 6, nonce: 'd'.repeat(32) }); expect(await hp.reply(6)).toMatchObject({ outcome: { kind: 'lease' } });
  hp.send({ type: 'rehost-claim', requestId: 7, expectedHostGeneration: 1, nonce: 'e'.repeat(32) });
  expect((await hp.reply(7) as any).outcome).toEqual(first);
});
it('keeps the original twenty-four-hour run deadline through rehost', async () => {
  const { host, hp } = await started();
  const deadline = await runInDurableObject(stub(host), room => room.store.meta()!.deadline);
  expect(deadline - Date.now()).toBeGreaterThan(86398000); expect(deadline - Date.now()).toBeLessThanOrEqual(86400000);
  expect((await dispatch((await checkpointRequest(host)).request())).status).toBe(204);
  hp.send({ type: 'host-release', requestId: 4 }); await hp.reply(4);
  hp.send({ type: 'rehost-claim', requestId: 5, expectedHostGeneration: 1, nonce: 'e'.repeat(32) }); expect(await hp.reply(5)).toMatchObject({ outcome: { kind: 'lease' } });
  expect(await runInDurableObject(stub(host), room => room.store.meta()!.deadline)).toBe(deadline);
});
it('retains an exact activation tuple when an earlier capacity refusal arrives around a later real reservation', async () => {
  const { host, hp } = await lost(); await fillCharged(100);
  await runInDurableObject(stub(host), async room => {
    const real = room.lifecycle.directory;
    let releaseA!: () => void, releaseB!: () => void, enteredA!: () => void, enteredB!: () => void, calls = 0;
    const gateA = new Promise<void>(r => { releaseA = r; }), gateB = new Promise<void>(r => { releaseB = r; });
    const seenA = new Promise<void>(r => { enteredA = r; }), seenB = new Promise<void>(r => { enteredB = r; });
    Object.defineProperty(room.lifecycle, 'directory', { configurable: true, value: {
      fenceActivation: (...args: Parameters<typeof real.fenceActivation>) => real.fenceActivation(...args),
      commitActivation: (...args: Parameters<typeof real.commitActivation>) => real.commitActivation(...args),
      reserveActivation: async (...args: Parameters<typeof real.reserveActivation>) => {
        const call = ++calls, value = await real.reserveActivation(...args);
        if (call === 1) { expect(value).toMatchObject({ ok: false, error: { code: 'capacity' } }); enteredA(); await gateA; }
        else { expect(value.ok).toBe(true); enteredB(); await gateB; }
        return value;
      },
    } });
    const sender = room.sockets.rows().find(r => r.seat_id === 0)!;
    const claim = { type: 'rehost-claim' as const, requestId: 5, expectedHostGeneration: 1, nonce: 'e'.repeat(32) };
    const first = room.lifecycle.request(sender, claim), refused = expect(first).rejects.toThrow('capacity');
    let second: Promise<unknown> | undefined;
    try {
      await seenA;
      await runInDurableObject(directory(), (_, state) => { state.storage.sql.exec('DELETE FROM directory_rooms WHERE room_id = ?', '0'.repeat(32)); });
      second = room.lifecycle.request(sender, { ...claim, requestId: 6 }).then(value => value, error => ({ error: String(error) }));
      await seenB;
      const operationId = room.store.activation()!.operation_id;
      releaseA(); await refused;
      expect(room.store.activation()?.operation_id).toBe(operationId);
      releaseB(); expect(await second).toMatchObject({ kind: 'lease', lease: { hostGeneration: 2 } });
    } finally { releaseA(); releaseB(); await second; Object.defineProperty(room.lifecycle, 'directory', { value: real }); }
  });
  expect(await account(host.snapshot.roomId)).toMatchObject({ charged: 1, generation: 2 });
  await evictDurableObject(stub(host));
  hp.send({ type: 'host-release', requestId: 5 }); expect(await hp.reply(5)).toMatchObject({ outcome: { kind: 'void' } });
  expect(await account(host.snapshot.roomId)).toMatchObject({ charged: 0, generation: 2 });
  hp.send({ type: 'rehost-claim', requestId: 6, expectedHostGeneration: 2, nonce: 'f'.repeat(32) });
  expect(await hp.reply(6)).toMatchObject({ outcome: { kind: 'lease', lease: { hostGeneration: 3 } } });
});
it('fences an unacknowledged start when a required ready route is replaced during Directory acknowledgement', async () => {
  const host = await create(2), guest = await join(host), hp = await connect(host), gp = await connect(guest), { h } = await links(hp, gp);
  hp.send({ type: 'link-ready', requestId: 2, attemptId: h.attemptId }); await hp.reply(2);
  gp.send({ type: 'link-ready', requestId: 1, attemptId: h.attemptId }); await gp.reply(1);
  hp.send({ type: 'ready', requestId: 3, ready: true }); await hp.reply(3);
  gp.send({ type: 'ready', requestId: 2, ready: true }); await gp.reply(2);
  const revision = await runInDurableObject(stub(host), room => room.store.snapshot().rosterRevision);
  hp.send({ type: 'start-propose', requestId: 4, expectedRosterRevision: revision, initBase64: btoa('opaque'), initHash: await tokenHash('opaque') });
  const proposalId = (await hp.reply(4) as any).outcome.proposalId;
  await runInDurableObject(stub(host), async room => {
    const real = room.lifecycle.directory;
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(r => { release = r; }), seen = new Promise<void>(r => { entered = r; });
    Object.defineProperty(room.lifecycle, 'directory', { configurable: true, value: {
      reserveActivation: (...args: Parameters<typeof real.reserveActivation>) => real.reserveActivation(...args),
      commitActivation: async (...args: Parameters<typeof real.commitActivation>) => { const value = await real.commitActivation(...args); entered(); await gate; return value; },
    } });
    const sender = room.sockets.rows().find(r => r.seat_id === 0)!;
    const pending = room.lifecycle.request(sender, { type: 'start-commit', requestId: 5, proposalId, expectedRosterRevision: revision });
    const rejected = expect(pending).rejects.toThrow('invalid-state');
    try {
      await seen;
      expect(await room.signals.issue(sender, 1)).toMatchObject({ kind: 'attempt' });
      expect(room.store.snapshot().rosterRevision).toBe(revision);
      expect(room.signals.allGuestsReady()).toBe(false);
      release(); await rejected;
      expect(room.store.activation()?.state).toBe('fenced');
      expect(room.store.snapshot().phase).toBe('lost');
    } finally { release(); Object.defineProperty(room.lifecycle, 'directory', { value: real }); }
  });
  expect(hp.messages.some(m => m.payload.type === 'started')).toBe(false);
  expect(gp.messages.some(m => m.payload.type === 'started')).toBe(false);
  await runInDurableObject(stub(host), room => room.alarm());
  expect(await account(host.snapshot.roomId)).toMatchObject({ charged: 0 });
});

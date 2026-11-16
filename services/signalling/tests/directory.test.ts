import { env } from 'cloudflare:workers';
import { runInDurableObject, evictDurableObject } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import { compatibility } from './helpers';
import { unwrapDomain, type DomainResult } from '../src/errors';
const call = async <T>(result: PromiseLike<DomainResult<T>>): Promise<T> => unwrapDomain(await result);

const directory = () => env.DIRECTORY.get(env.DIRECTORY.newUniqueId());
const ip = (n: number) => n.toString(16).padStart(64, '0');

it('atomically reserves the hundredth room and refuses concurrent over-allocation', async () => {
  const d = directory();
  const results = await Promise.allSettled(Array.from({ length: 101 }, (_, n) => call(d.reserveRoom(compatibility, 4, ip(n)))));
  expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(100);
  expect(results.filter(x => x.status === 'rejected')).toHaveLength(1);
  const reservations = results.flatMap(x => x.status === 'fulfilled' ? [x.value] : []);
  expect(new Set(reservations.map(x => x.joinCode)).size).toBe(100);
  expect(await call(d.resolveCode(reservations[0]!.joinCode))).toBeNull();
  await evictDurableObject(d);
  await expect(async () => await call(d.reserveRoom(compatibility, 1, ip(200)))).rejects.toThrow('capacity');
});

it('enforces the thousand stored room limit independently of active charges', async () => {
  const d = directory();
  await call(d.reserveRoom(compatibility, 1, ip(0)));
  await runInDurableObject(d, (_, { storage }) => {
    const first = storage.sql.exec<{ reservation: string }>('SELECT reservation FROM directory_rooms').one();
    storage.transactionSync(() => {
      storage.sql.exec("UPDATE directory_rooms SET phase = 'ended', charged = 0, committed = 1, deadline = ?", Date.now() + 100000);
      for (let n = 1; n < 1000; n++) storage.sql.exec('INSERT INTO directory_rooms (room_id, code, reservation, epoch, generation, phase, charged, committed, deadline) VALUES (?, ?, ?, ?, 1, ?, 0, 1, ?)',
        n.toString(16).padStart(32, '0'), n.toString().padStart(8, '0'), first.reservation, ip(n).slice(0, 32), 'ended', Date.now() + 100000);
    });
  });
  await expect(async () => await call(d.reserveRoom(compatibility, 1, ip(2)))).rejects.toThrow('capacity');
});

it('bounds live IP metadata at ten thousand and removes expired IP keys', async () => {
  const d = directory();
  await call(d.reserveJoin(ip(0)));
  await runInDurableObject(d, (_, { storage }) => storage.transactionSync(() => {
    for (let n = 1; n < 10000; n++) storage.sql.exec('INSERT INTO directory_ip VALUES (?, ?, 0, 0, 0, ?)', ip(n), Date.now(), Date.now() + 120000);
  }));
  await expect(async () => await call(d.reserveJoin(ip(10001)))).rejects.toThrow('capacity');
  await runInDurableObject(d, (_, { storage }) => storage.sql.exec('UPDATE directory_ip SET expires_at = 0'));
  await call(d.reserveJoin(ip(10001)));
  expect(await runInDurableObject(d, (_, { storage }) => storage.sql.exec('SELECT COUNT(*) AS n FROM directory_ip').one())).toEqual({ n: 1 });
});

it('never releases failed initialization until an exact epoch expiry receipt is obtained', async () => {
  const d = directory();
  const r = await call(d.reserveRoom(compatibility, 4, ip(1)));
  expect(await call(d.resolveRoom(r.roomId))).toBeNull();
  await expect(async () => await call(d.commitRoom(r.roomId, 'f'.repeat(32)))).rejects.toThrow('conflict');
  await runInDurableObject(d, (_, { storage }) => storage.sql.exec('UPDATE directory_rooms SET deadline = 0'));
  await call(d.reconcile());
  expect(await runInDurableObject(d, (_, { storage }) => storage.sql.exec('SELECT COUNT(*) AS n FROM directory_rooms').one())).toEqual({ n: 0 });
});

it('repeats exact initialization and commit but rejects changed initial data or host hash', async () => {
  const d = directory();
  const r = await call(d.reserveRoom(compatibility, 4, ip(1)));
  const room = env.ROOMS.get(env.ROOMS.idFromName(r.roomId));
  const snapshot = await call(room.initialize(r, 'a'.repeat(64)));
  expect(await call(room.initialize(r, 'a'.repeat(64)))).toEqual(snapshot);
  await expect(async () => await call(room.initialize(r, 'b'.repeat(64)))).rejects.toThrow('conflict');
  await expect(async () => await call(room.initialize({ ...r, capacity: 3 }, 'a'.repeat(64)))).rejects.toThrow('conflict');
  await call(d.commitRoom(r.roomId, r.chargeEpoch));
  await call(d.commitRoom(r.roomId, r.chargeEpoch));
  expect(await call(d.resolveCode(r.joinCode))).toEqual({ roomId: r.roomId });
});

it('keeps a confirmed private lobby charged after an interrupted public commit', async () => {
  const d = directory();
  const r = await call(d.reserveRoom(compatibility, 4, ip(1)));
  const room = env.ROOMS.get(env.ROOMS.idFromName(r.roomId));
  await call(room.initialize(r, 'a'.repeat(64)));
  await call(room.confirmCreation(r.chargeEpoch));
  await runInDurableObject(d, (_, { storage }) => storage.sql.exec('UPDATE directory_rooms SET deadline = 0'));
  await call(d.reconcile());
  expect(await call(d.resolveRoom(r.roomId))).toBeNull();
  expect(await runInDurableObject(d, (_, { storage }) => storage.sql.exec('SELECT charged FROM directory_rooms').one())).toEqual({ charged: 1 });
  await call(d.commitRoom(r.roomId, r.chargeEpoch));
  expect(await call(d.resolveRoom(r.roomId))).toEqual({ roomId: r.roomId });
});

it('retries a real join-code collision during concurrent reservations without overwriting a mapping', async () => {
  const d = directory();
  const reservations = await runInDurableObject(d, async instance => {
    const random = crypto.getRandomValues.bind(crypto);
    let codes = 0;
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation(array => {
      if (array instanceof Uint8Array && array.length === 8) { array.fill(codes++ < 2 ? 0 : 1); return array; }
      return random(array);
    });
    try { return await Promise.all([call(instance.reserveRoom(compatibility, 2, ip(1))), call(instance.reserveRoom(compatibility, 2, ip(2)))]); }
    finally { spy.mockRestore(); }
  });
  expect(reservations.map(r => r.joinCode).sort()).toEqual(['00000000', '11111111']);
  expect(reservations[0]!.roomId).not.toBe(reservations[1]!.roomId);
});

it('fences an expired unconfirmed initialization before releasing its charge', async () => {
  const d = directory();
  const r = await call(d.reserveRoom(compatibility, 2, ip(1)));
  const room = env.ROOMS.get(env.ROOMS.idFromName(r.roomId));
  await call(room.initialize(r, 'a'.repeat(64)));
  await runInDurableObject(room, (_, { storage }) => storage.sql.exec('UPDATE room_meta SET deadline = ?', Date.now() - 1));
  await runInDurableObject(d, (_, { storage }) => storage.sql.exec('UPDATE directory_rooms SET deadline = 0'));
  await call(d.reconcile());
  expect(await call(d.resolveCode(r.joinCode))).toBeNull();
  expect(await runInDurableObject(d, (_, { storage }) => storage.sql.exec('SELECT charged, committed FROM directory_rooms').one())).toEqual({ charged: 0, committed: 0 });
  await expect(async () => await call(room.confirmCreation(r.chargeEpoch))).rejects.toThrow('conflict');
});

it('retains failed accounting and ignores receipts for an older epoch', async () => {
  const d = directory();
  const r = await call(d.reserveRoom(compatibility, 2, ip(1)));
  const room = env.ROOMS.get(env.ROOMS.idFromName(r.roomId));
  await call(room.initialize(r, 'a'.repeat(64)));
  await call(d.commitRoom(r.roomId, r.chargeEpoch));
  await runInDurableObject(d, (_, { storage }) => storage.sql.exec('UPDATE directory_rooms SET epoch = ?, deadline = 0', 'e'.repeat(32)));
  await call(d.releaseFenced(r.roomId, { kind: 'absent', epoch: r.chargeEpoch }));
  await call(d.reconcile());
  expect(await runInDurableObject(d, (_, { storage }) => storage.sql.exec('SELECT charged, epoch FROM directory_rooms').one())).toEqual({ charged: 1, epoch: 'e'.repeat(32) });
  await runInDurableObject(room, (_, { storage }) => storage.sql.exec('DROP TABLE room_meta'));
  await call(d.reconcile());
  expect(await runInDurableObject(d, (_, { storage }) => storage.sql.exec('SELECT charged FROM directory_rooms').one())).toEqual({ charged: 1 });
});

it('expires committed lobbies into reserved-token retention and deletes only after Room fences retention', async () => {
  const d = directory();
  const r = await call(d.reserveRoom(compatibility, 2, ip(1)));
  const room = env.ROOMS.get(env.ROOMS.idFromName(r.roomId));
  await call(room.initialize(r, 'a'.repeat(64)));
  await call(d.commitRoom(r.roomId, r.chargeEpoch));
  await runInDurableObject(room, (_, { storage }) => storage.sql.exec('UPDATE room_meta SET deadline = ?', Date.now() - 1));
  await runInDurableObject(d, (_, { storage }) => storage.sql.exec('UPDATE directory_rooms SET deadline = 0'));
  await call(d.reconcile());
  expect(await call(d.resolveCode(r.joinCode))).toEqual({ roomId: r.roomId });
  expect(await runInDurableObject(d, (_, { storage }) => storage.sql.exec('SELECT charged, phase FROM directory_rooms').one())).toEqual({ charged: 0, phase: 'ended' });
  await runInDurableObject(room, (_, { storage }) => storage.sql.exec('UPDATE room_meta SET deadline = 0'));
  await runInDurableObject(d, (_, { storage }) => storage.sql.exec('UPDATE directory_rooms SET deadline = 0'));
  await call(d.reconcile());
  expect(await call(d.resolveRoom(r.roomId))).toBeNull();
  expect(await runInDurableObject(room, (_, { storage }) => storage.sql.exec('SELECT COUNT(*) AS n FROM room_seats').one())).toEqual({ n: 0 });
});

it('rejects activation of absent mappings and keeps TURN unavailable until its provider task', async () => {
  const d = directory();
  await expect(async () => await call(d.reserveActivation('a'.repeat(32), 'b'.repeat(32), 'c'.repeat(32), 1, 2))).rejects.toThrow('not-found');
  await expect(async () => await call(d.commitActivation('a'.repeat(32), 'b'.repeat(32), 'c'.repeat(32), 2, Date.now() + 1000))).rejects.toThrow('conflict');
  await expect(async () => await call(d.reserveTurn({ roomId: 'a'.repeat(32), seatId: 0, seatGeneration: 1, connectionId: 'c'.repeat(32) }))).rejects.toThrow('unavailable');
});

it('bounds socket upgrades independently of joins and resets a minute window without retaining raw IPs', async () => {
  const d = directory();
  for (let n = 0; n < 20; n++) {
    await call(d.reserveSocketUpgrade(ip(7)));
    await call(d.reserveJoin(ip(7)));
  }
  expect(await d.reserveSocketUpgrade(ip(7))).toEqual({ ok: false, error: { code: 'rate-limited', retryable: true } });
  expect(await d.reserveJoin(ip(7))).toEqual({ ok: false, error: { code: 'rate-limited', retryable: true } });
  expect(await d.reserveJoin('192.0.2.7')).toEqual({ ok: false, error: { code: 'unavailable', retryable: true } });
  await runInDurableObject(d, (_, { storage }) => storage.sql.exec('UPDATE directory_ip SET window_start = ?', Date.now() - 60000));
  await call(d.reserveSocketUpgrade(ip(7)));
  expect(await runInDurableObject(d, (_, { storage }) => storage.sql.exec('SELECT creates, joins, upgrades FROM directory_ip').one())).toEqual({ creates: 0, joins: 0, upgrades: 1 });
});

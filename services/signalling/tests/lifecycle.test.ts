import { runInDurableObject, evictDurableObject } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import { connect, create, join, stub, compatibility } from './socket-helpers';
import { tokenHash } from '../src/crypto';
import { prepared, started } from './lifecycle-helpers';
import { links } from './signal-helpers';

it('requires ready connected linked occupied seats and the exact roster revision', async () => {
  const host = await create(), hp = await connect(host), hash = await tokenHash('x');
  hp.send({ type: 'start-propose', requestId: 1, expectedRosterRevision: 2, initBase64: btoa('x'), initHash: hash });
  expect(await hp.reply(1)).toMatchObject({ outcome: { kind: 'error', error: { code: 'invalid-state' } } });
  const guest = await join(host), gp = await connect(guest);
  hp.send({ type: 'ready', requestId: 2, ready: true }); await hp.reply(2);
  gp.send({ type: 'ready', requestId: 1, ready: true }); await gp.reply(1);
  const revision = await runInDurableObject(stub(host), room => room.store.snapshot().rosterRevision);
  for (const [id, rev] of [[3, revision - 1], [4, revision]]) {
    hp.send({ type: 'start-propose', requestId: id, expectedRosterRevision: rev, initBase64: btoa('x'), initHash: hash });
    expect(await hp.reply(id!)).toMatchObject({ outcome: { kind: 'error' } });
  }
});
it('freezes one init and first lease for concurrent exact commits and rejects a competing proposal', async () => {
  const { host, hp, revision, proposalId, initHash } = await prepared();
  hp.send({ type: 'start-commit', requestId: 3, proposalId, expectedRosterRevision: revision });
  hp.send({ type: 'start-commit', requestId: 4, proposalId, expectedRosterRevision: revision });
  const a = await hp.reply(3), b = await hp.reply(4);
  expect(a).toMatchObject({ outcome: { kind: 'started', initHash } });
  expect((a as any).outcome).toEqual((b as any).outcome);
  const lease = (a as any).outcome.lease;
  expect(lease.expiresAtEpochMs - Date.now()).toBeGreaterThan(13000);
  expect(lease.expiresAtEpochMs - Date.now()).toBeLessThanOrEqual(15000);
  hp.send({ type: 'start-commit', requestId: 5, proposalId: 'f'.repeat(32), expectedRosterRevision: revision });
  expect(await hp.reply(5)).toMatchObject({ outcome: { kind: 'error' } });
  await evictDurableObject(stub(host));
  expect(await runInDurableObject(stub(host), room => room.store.snapshot().phase)).toBe('active');
});
it('invalidates a proposal on roster change', async () => {
  const { host, hp, revision, proposalId } = await prepared();
  hp.send({ type: 'ready', requestId: 3, ready: false }); await hp.reply(3);
  hp.send({ type: 'start-commit', requestId: 4, proposalId, expectedRosterRevision: revision });
  expect(await hp.reply(4)).toMatchObject({ outcome: { kind: 'error' } });
});
it('expires a proposal at thirty seconds without relying on an alarm', async () => {
  const { host, hp, revision, proposalId } = await prepared();
  await runInDurableObject(stub(host), room => {
    const proposal = room.store.proposal()!;
    expect(proposal.expires_at - Date.now()).toBeGreaterThan(28000);
    expect(proposal.expires_at - Date.now()).toBeLessThanOrEqual(30000);
    room.store.sql.exec('UPDATE room_proposal SET expires_at = ?', Date.now() - 1);
  });
  hp.send({ type: 'start-commit', requestId: 3, proposalId, expectedRosterRevision: revision });
  expect(await hp.reply(3)).toMatchObject({ outcome: { kind: 'error', error: { code: 'conflict' } } });
});
it('accepts opaque65536-byte init with verified SHA256 and rejects mismatched bytes', async () => {
  const host = await create(1), hp = await connect(host); hp.send({ type: 'ready', requestId: 1, ready: true }); await hp.reply(1);
  const revision = await runInDurableObject(stub(host), room => room.store.snapshot().rosterRevision);
  const init = 'x'.repeat(65536), initHash = await tokenHash(init);
  hp.send({ type: 'start-propose', requestId: 2, expectedRosterRevision: revision, initBase64: btoa(init), initHash: '0'.repeat(64) });
  expect(await hp.reply(2)).toMatchObject({ outcome: { kind: 'error', error: { code: 'hash-mismatch' } } });
  hp.send({ type: 'start-propose', requestId: 3, expectedRosterRevision: revision, initBase64: btoa(init), initHash });
  const proposed = await hp.reply(3); expect(proposed).toMatchObject({ outcome: { kind: 'proposal' } });
  hp.send({ type: 'start-commit', requestId: 4, proposalId: (proposed as any).outcome.proposalId, expectedRosterRevision: revision });
  expect(await hp.reply(4)).toMatchObject({ outcome: { kind: 'started', initBase64: btoa(init), initHash } });
});
it('starts linked ready humans and emits host-departed plus route closure when the lease expires', async () => {
  const host = await create(2), guest = await join(host), hp = await connect(host), gp = await connect(guest), { h } = await links(hp, gp);
  hp.send({ type: 'link-ready', requestId: 2, attemptId: h.attemptId }); await hp.reply(2);
  gp.send({ type: 'link-ready', requestId: 1, attemptId: h.attemptId }); await gp.reply(1);
  hp.send({ type: 'ready', requestId: 3, ready: true }); await hp.reply(3);
  gp.send({ type: 'ready', requestId: 2, ready: true }); await gp.reply(2);
  const revision = await runInDurableObject(stub(host), room => room.store.snapshot().rosterRevision);
  hp.send({ type: 'start-propose', requestId: 4, expectedRosterRevision: revision, initBase64: btoa('opaque'), initHash: await tokenHash('opaque') });
  const proposal = await hp.reply(4); expect(proposal).toMatchObject({ outcome: { kind: 'proposal' } });
  hp.send({ type: 'start-commit', requestId: 5, proposalId: (proposal as any).outcome.proposalId, expectedRosterRevision: revision });
  expect(await hp.reply(5)).toMatchObject({ outcome: { kind: 'started' } });
  await runInDurableObject(stub(host), async room => { room.store.sql.exec('UPDATE room_lease SET expires_at = ?', Date.now() - 1); await room.alarm(); });
  await gp.until(() => gp.messages.some(m => m.payload.type === 'host-departed'));
  expect(gp.messages.some(m => m.payload.type === 'link-state' && m.payload.state === 'closed')).toBe(true);
  expect(await runInDurableObject(stub(host), room => room.store.snapshot().phase)).toBe('lost');
});
it('fences authority immediately when the current host disconnects', async () => {
  const { host, hp } = await started(); hp.socket.close(1000);
  await expect.poll(() => runInDurableObject(stub(host), room => room.store.snapshot().phase)).toBe('lost');
});
it('does not let an earlier proposal hash completion overwrite a later proposal operation', async () => {
  const { host, hp, revision } = await prepared(); hp.ack();
  const aHash = await tokenHash('a'), bHash = await tokenHash('b');
  await runInDurableObject(stub(host), async room => {
    let release!: () => void, entered!: () => void; const gate = new Promise<void>(r => { release = r; }), seen = new Promise<void>(r => { entered = r; });
    const original = crypto.subtle.digest.bind(crypto.subtle); let calls = 0;
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => { if (++calls === 1) { entered(); await gate; } return original(...args); });
    try {
      const sender = room.sockets.rows().find(r => r.seat_id === 0)!;
      const first = room.lifecycle.request(sender, { type: 'start-propose', requestId: 3, expectedRosterRevision: revision, initBase64: btoa('a'), initHash: aHash });
      const rejected = expect(first).rejects.toThrow('conflict');
      await seen;
      const second = await room.lifecycle.request(sender, { type: 'start-propose', requestId: 4, expectedRosterRevision: revision, initBase64: btoa('b'), initHash: bHash });
      expect(second.kind).toBe('proposal'); release(); await rejected;
      expect(room.store.proposal()?.init_hash).toBe(bHash);
    } finally { release(); spy.mockRestore(); }
  });
});
it('rechecks current connection after hashing init', async () => {
  const host = await create(1), hp = await connect(host); hp.send({ type: 'ready', requestId: 1, ready: true }); await hp.reply(1);
  const initHash = await tokenHash('x');
  await runInDurableObject(stub(host), async room => {
    let release!: () => void; const gate = new Promise<void>(r => { release = r; });
    const original = crypto.subtle.digest.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => { await gate; return original(...args); });
    try {
      const sender = room.sockets.rows().find(r => r.seat_id === 0)!;
      const pending = room.lifecycleRequest!(sender, { type: 'start-propose', requestId: 2, expectedRosterRevision: room.store.snapshot().rosterRevision, initBase64: btoa('x'), initHash });
      const checked = expect(pending).rejects.toThrow('stale-connection');
      const seat = room.store.seat(0)!; room.auth.join(compatibility, seat.token_hash!, seat.token_hash!); room.sockets.retireSeat(seat);
      release(); await checked;
    } finally { release(); spy.mockRestore(); }
  });
});
it('renews idempotently, fences expired leases, and rejects rehost without a checkpoint', async () => {
  const { host, hp } = await started();
  hp.send({ type: 'lease-renew', requestId: 4, nonce: 'a'.repeat(32) });
  const a = await hp.reply(4); expect(a).toMatchObject({ outcome: { kind: 'lease', lease: { nonce: 'a'.repeat(32) } } });
  hp.send({ type: 'lease-renew', requestId: 5, nonce: 'a'.repeat(32) }); expect((await hp.reply(5) as any).outcome).toEqual((a as any).outcome);
  await runInDurableObject(stub(host), room => { room.store.sql.exec('UPDATE room_lease SET expires_at = ?', Date.now() - 1); });
  hp.send({ type: 'lease-renew', requestId: 6, nonce: 'b'.repeat(32) }); expect(await hp.reply(6)).toMatchObject({ outcome: { kind: 'error' } });
  hp.send({ type: 'rehost-claim', requestId: 7, expectedHostGeneration: 1, nonce: 'c'.repeat(32) });
  expect(await hp.reply(7)).toMatchObject({ outcome: { kind: 'error', error: { code: 'no-checkpoint' } } });
  expect(await runInDurableObject(stub(host), room => room.store.snapshot().phase)).toBe('lost');
});

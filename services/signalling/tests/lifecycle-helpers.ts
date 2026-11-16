import { runInDurableObject } from 'cloudflare:test';
import { expect } from 'vitest';
import { tokenHash } from '../src/crypto';
import { connect, create, stub } from './socket-helpers';
export async function prepared() {
  const host = await create(1), hp = await connect(host);
  hp.send({ type: 'ready', requestId: 1, ready: true }); await hp.reply(1);
  const revision = await runInDurableObject(stub(host), room => room.store.snapshot().rosterRevision);
  const initHash = await tokenHash('opaque-init');
  hp.send({ type: 'start-propose', requestId: 2, expectedRosterRevision: revision, initBase64: btoa('opaque-init'), initHash });
  const reply = await hp.reply(2);
  expect(reply).toMatchObject({ outcome: { kind: 'proposal' } });
  const proposalId = (reply as { outcome: { proposalId: string } }).outcome.proposalId;
  return { host, hp, revision, proposalId, initHash };
}
export async function started() {
  const value = await prepared();
  value.hp.send({ type: 'start-commit', requestId: 3, proposalId: value.proposalId, expectedRosterRevision: value.revision });
  const reply = await value.hp.reply(3); expect(reply).toMatchObject({ outcome: { kind: 'started' } });
  return { ...value, start: (reply as { outcome: import('../../../src/shared/roomSession').CommittedStart }).outcome };
}

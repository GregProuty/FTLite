import { expect, it } from 'vitest';
import { createLedger } from '../src/renderer/src/authority/ledger';
import { encodeMessage, decodeMessage } from '../src/renderer/src/net/codec';
import type { CommandEnvelope, CommandResult } from '../src/renderer/src/net/contracts';
import { checkpointRig } from './helpers/checkpointRig';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { makeState, LAYOUT, placeDebris, quiet, room } from './helpers/sim';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { removeDebris } from '../src/renderer/src/sim/debris';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { createLoopbackHarness } from '../src/renderer/src/net/loopback';
import { runReplay } from '../src/renderer/src/authority/replay';
import type { AuthorityMessage, LifecyclePause, ClientMessage } from '../src/renderer/src/net/contracts';
import { ownTestCleanup } from './helpers/simLifetime';
import { validateCheckpoint } from '../src/renderer/src/authority/checkpoint';

const envelope = (sequence = 1, requestedTick = 0, player = 0): CommandEnvelope => ({ runId: 'durable', id: { player, sequence }, requestedTick, command: { kind: 'stand' } });
const remote = (ledger: ReturnType<typeof createLedger>, e: CommandEnvelope, tick: number, recovery?: Set<number>) => ledger.admit(e, tick, recovery, 'receive-time');
function remoteRig(players = 1) {
  const h = checkpointRig(players); h.detach(); h.authority.attach(h.pair.authorityLink, [0], { admissionPolicy: 'receive-time' }); h.drain(); return h;
}
it.each([1, 120])('admits an observed command %i ticks later while strict rejects it', age => {
  expect(remote(createLedger([0]), envelope(), age)).toEqual({ status: 'queued' });
  expect(createLedger([0]).admit(envelope(), age)).toMatchObject({ result: { reason: 'stale-tick' } });
});
it('retains the high-water terminal rejection when a full pending batch completes later', () => {
  const l = createLedger([0]);
  for (let i = 1; i <= 256; i++) remote(l, envelope(i, i), i);
  remote(l, envelope(257, 257), 257);
  for (let i = 1; i <= 256; i++) l.finish({ id: envelope(i).id, tick: i, status: 'applied' });
  const checkpoint = l.export(), restored = createLedger([0]);
  expect(() => restored.restore(checkpoint)).not.toThrow();
  expect(remote(restored, envelope(257, 257), 999)).toMatchObject({ result: { reason: 'over-capacity' } });
});

function fixture(setup: (state: ReturnType<typeof makeState>) => void = () => {}) {
  const state = makeState(1); quiet(state); setup(state);
  let now = 0, lifecycle!: (control: LifecyclePause) => void;
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ });
  const pair = transport.connectLocal(), output: AuthorityMessage[] = [];
  pair.clientLink.onMessage((_, bytes) => output.push(decodeMessage(bytes) as AuthorityMessage));
  const init = { runId: 'durable', layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 1, playerCount: 1, characters: [0], unlocked: [], quirk: state.run.quirk };
  const authority = createFixtureAuthority({ init, contentDigest: init.contentDigest, resolveLayout: () => LAYOUT, clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, bindLifecyclePause(cb) { lifecycle = cb; }, onCrash(r) { throw Error(r.error); } }, state);
  authority.attach(pair.authorityLink, [0], { admissionPolicy: 'receive-time' }); transport.drain();
  ownTestCleanup(() => { pair.host.close('done'); pair.client.close('done'); });
  return { state, authority, output, init, pause() { lifecycle({ paused: true, reason: 'focus' }); },
    send(message: ClientMessage) { pair.clientLink.send('reliable-ordered', encodeMessage(message)); transport.drain(); },
    pump(time = now) { now = time; authority.pump(); transport.drain(); } };
}
it('resumes after sixteen ordinary admissions, trusted pause and terminal command N', () => {
  const h = fixture();
  for (let sequence = 1; sequence <= 16; sequence++) h.send({ kind: 'command', envelope: envelope(sequence) });
  h.pump(); h.pause(); h.pump();
  h.send({ kind: 'command', envelope: envelope(17) });
  h.send({ kind: 'command', envelope: { ...envelope(18), command: { kind: 'setPaused', paused: false } } }); h.pump();
  h.send({ kind: 'command', envelope: envelope(17) }); h.pump();
  const cp = h.authority.checkpoint([]);
  expect(cp.phase).toBe('running'); expect(cp.admissionCounts).toEqual([16]); expect(cp.commandHighWater).toEqual([18]);
  const results = h.output.filter(m => m.kind === 'result').map(m => m.result);
  expect(results.slice(0, 3)).toMatchObject([
    { id: { sequence: 17 }, reason: 'over-capacity', admission: { expectedSequence: 18, disposition: 'terminal' } },
    { id: { sequence: 18 }, status: 'applied', admission: { expectedSequence: 19, disposition: 'terminal' } },
    { id: { sequence: 17 }, reason: 'over-capacity', admission: { expectedSequence: 19, disposition: 'terminal' } }
  ]);
  const replay = h.authority.replay(), actual = runReplay(LAYOUT, replay, h.init.contentDigest, undefined, { retainFrames: true });
  expect(actual.frames).toEqual(replay.frames); expect(actual.checkpoint).toEqual(cp);
});
it.each([false, true])('delayed fire preserves charging and stable target identity (removed=%s)', removed => {
  let station = 0;
  const h = fixture(s => { station = s.derived.stationOfKind[StationKind.Weapons]!; placeDebris(s, room(s, 'A'), 600, 1, 99); sitDown(s, 0, station); });
  const command = { kind: 'fire' as const, station, weapon: { selector: 0, expectedWeaponId: 1 }, target: { kind: 'object' as const, stableId: 99 } };
  h.pump(17); h.state.weapons.charge = 0.9999;
  if (removed) { removeDebris(h.state, 0); placeDebris(h.state, room(h.state, 'A'), 600, 1, 100); }
  h.send({ kind: 'command', envelope: { ...envelope(), command } }); h.pump(34);
  expect(h.output.filter(m => m.kind === 'result').at(-1)!.result).toMatchObject(removed ? { tick: 1, status: 'rejected', reason: 'stale-target' } : { tick: 1, status: 'applied' });
  expect(h.state.telemetry.shots).toBe(removed ? 0 : 1);
});
it.each([[121, 0], [0, 1]])('terminally rejects out-of-window input at %i observed %i', (tick, observed) => {
  const l = createLedger([0]);
  expect(remote(l, envelope(1, observed), tick)).toMatchObject({ result: { reason: 'stale-tick', admission: { expectedSequence: 2, disposition: 'terminal' } } });
  expect(l.highWater()[0]).toBe(1);
});
it('consumes over-capacity IDs, preserves cached outcomes and keeps gameplay counts exhausted', () => {
  const l = createLedger([0]);
  for (let i = 1; i <= 16; i++) { expect(remote(l, envelope(i), 0).status).toBe('queued'); l.finish({ id: envelope(i).id, tick: 0, status: 'noop' }); }
  expect(remote(l, envelope(17), 0)).toMatchObject({ result: { reason: 'over-capacity', admission: { expectedSequence: 18, disposition: 'terminal' } } });
  const resume = { ...envelope(18), command: { kind: 'setPaused' as const, paused: false } };
  expect(remote(l, resume, 0, new Set()).status).toBe('queued'); l.finish({ id: resume.id, tick: 0, status: 'applied' });
  expect(remote(l, envelope(17), 999)).toMatchObject({ status: 'duplicate', result: { reason: 'over-capacity', admission: { expectedSequence: 19, disposition: 'terminal' } } });
  expect(remote(l, { ...envelope(17), requestedTick: 1 }, 0)).toMatchObject({ result: { reason: 'conflicting-duplicate' } });
  expect(l.export().admissionCounts[0]).toBe(16);
});
it('terminally consumes pending-capacity rejection without allocating pending work', () => {
  const l = createLedger([0]);
  for (let i = 1; i <= 256; i++) expect(remote(l, envelope(i, i), i).status).toBe('queued');
  expect(remote(l, envelope(257, 257), 257)).toMatchObject({ result: { reason: 'over-capacity', admission: { expectedSequence: 258, disposition: 'terminal' } } });
  l.finish({ id: envelope().id, tick: 1, status: 'noop' });
  expect(remote(l, envelope(258, 258), 258).status).toBe('queued');
});
it('does not consume gaps, malformed or foreign ownership', () => {
  const l = createLedger([0]);
  expect(remote(l, envelope(2), 0)).toMatchObject({ result: { reason: 'expected-sequence', admission: { expectedSequence: 1, disposition: 'retryable' } } });
  expect(remote(l, envelope(1, 0, 1), 0)).toMatchObject({ result: { reason: 'unowned' } });
  expect(remote(l, { ...envelope(), command: { kind: 'bad' } } as unknown as CommandEnvelope, 0)).toMatchObject({ result: { reason: 'malformed' } });
  expect(l.highWater()).toEqual([0, 0, 0, 0]);
});
it('executes delayed input at the next tick and retains the original for retry', () => {
  const h = remoteRig(); h.pump(17); h.send({ kind: 'command', envelope: envelope() }); h.pump(34);
  const results = () => h.output.filter(m => m.kind === 'result').map(m => m.result);
  expect(results().at(-1)).toMatchObject({ tick: 1, status: 'rejected', reason: 'invalid-seat', admission: { expectedSequence: 2, disposition: 'terminal' } });
  h.send({ kind: 'command', envelope: envelope() }); h.pump();
  expect(results().at(-1)).toEqual(results()[0]);
  expect(h.authority.checkpoint([]).recentResults[0]!.envelope.requestedTick).toBe(0);
});
it('does not reveal a different seat stream or consume wrong-run commands', () => {
  const h = remoteRig(2);
  h.send({ kind: 'command', envelope: { ...envelope(), runId: 'foreign' } });
  h.send({ kind: 'command', envelope: envelope(1, 0, 1) }); h.pump();
  expect(h.output.filter(m => m.kind === 'result').map(m => m.result)).toMatchObject([
    { reason: 'wrong-run', admission: { expectedSequence: 1, disposition: 'retryable' } },
    { reason: 'unowned', admission: { expectedSequence: 1, disposition: 'retryable' } }
  ]);
  expect(h.authority.checkpoint([]).commandHighWater).toEqual([0, 0]);
});
it('validates optional result admission metadata without changing strict results', () => {
  const result: CommandResult = { id: envelope().id, tick: 0, status: 'noop', admission: { expectedSequence: 2, disposition: 'terminal' } };
  expect(decodeMessage(encodeMessage({ kind: 'result', runId: 'durable', result }))).toMatchObject({ result });
  expect(() => encodeMessage({ kind: 'result', runId: 'durable', result: { ...result, admission: { expectedSequence: 0, disposition: 'terminal' } } })).toThrow();
});
it('preserves receive-time binding options when starting a new core', () => {
  const h = remoteRig(); h.authority.start(h.init); h.drain(); h.pump(17);
  h.send({ kind: 'command', envelope: envelope() }); h.pump(34);
  expect(h.output.filter(m => m.kind === 'result').at(-1)!.result).toMatchObject({ reason: 'invalid-seat', admission: { expectedSequence: 2 } });
  expect(h.authority.replay().version).toBe(3);
});
it('closes a conflicting receive-time stream after recording the cached admission', () => {
  const h = remoteRig(), closed: string[] = []; h.pair.clientLink.onClose(reason => closed.push(reason));
  h.send({ kind: 'command', envelope: envelope() }); h.pump();
  h.send({ kind: 'command', envelope: { ...envelope(), requestedTick: 1 } }); h.pump();
  expect(closed).toEqual(['conflicting-duplicate']);
  const replay = h.authority.replay(), cp = h.authority.checkpoint([]);
  expect(cp.commandHighWater).toEqual([1]); expect(cp.recentResults[0]!.result.reason).toBe('unavailable');
  expect(runReplay(LAYOUT, replay, h.init.contentDigest).checkpoint).toEqual(cp);
});
it('bounds remote link ingress and discards unadmitted bytes on overflow', () => {
  const h = remoteRig(), closed: string[] = []; h.pair.clientLink.onClose(reason => closed.push(reason));
  for (let sequence = 1; sequence <= 257; sequence++) h.send({ kind: 'command', envelope: envelope(sequence) });
  h.pump(); expect(closed).toEqual(['ingress-overflow']);
  const cp = h.authority.checkpoint([]); expect(cp.commandHighWater).toEqual([0]); expect(cp.recentResults).toEqual([]);
  expect(runReplay(LAYOUT, h.authority.replay(), h.init.contentDigest).checkpoint).toEqual(cp);
});
it.each([{ expectedSequence: 999, disposition: 'retryable' as const }, undefined])('rejects persisted admission metadata transactionally (%j)', admission => {
  const source = createLedger([0]), target = createLedger([0]);
  for (let sequence = 1; sequence <= 2; sequence++) {
    source.admit(envelope(sequence), 0); source.finish({ id: envelope(sequence).id, tick: 0, status: 'noop' });
  }
  const invalid = source.export(); invalid.recentResults[1]!.result.admission = admission;
  target.admit(envelope(), 0); target.finish({ id: envelope().id, tick: 0, status: 'applied' });
  target.admit(envelope(2, 1), 1);
  expect(() => target.restore(invalid)).toThrow(/admission/);
  expect(target.admit(envelope(), 2)).toEqual({ status: 'duplicate', result: { id: envelope().id, tick: 0, status: 'applied' } });
  expect(target.admit(envelope(2, 1), 2)).toEqual({ status: 'duplicate', result: { id: envelope(2).id, tick: 1, status: 'already-processed' } });
  target.finish({ id: envelope(2).id, tick: 1, status: 'applied' });
  expect(target.export()).toMatchObject({ admissionTick: 1, admissionCounts: [1, 0, 0, 0], commandHighWater: [2, 0, 0, 0] });
  expect(target.export().recentResults.every(entry => !Object.hasOwn(entry.result, 'admission'))).toBe(true);
});
it('rejects response metadata in a checkpoint v2 cache', () => {
  const h = checkpointRig(); h.send({ kind: 'command', envelope: envelope() }); h.pump(17);
  const checkpoint = h.authority.checkpoint([]);
  checkpoint.recentResults[0]!.result.admission = { expectedSequence: 999, disposition: 'retryable' };
  expect(() => validateCheckpoint(LAYOUT, checkpoint, h.init.contentDigest)).toThrow(/admission/);
});
it('keeps healthy remote checkpoints metadata-free and strict restored retries unchanged', () => {
  const h = checkpointRig(); h.detach(); const detachRemote = h.authority.attach(h.pair.authorityLink, [0], { admissionPolicy: 'receive-time' });
  h.send({ kind: 'command', envelope: envelope() }); h.pump(17);
  expect(h.output.filter(m => m.kind === 'result').at(-1)!.result).toHaveProperty('admission');
  const checkpoint = h.authority.checkpoint([]), semantic = checkpoint.recentResults[0]!.result;
  expect(semantic).not.toHaveProperty('admission'); expect(checkpoint.checkpointVersion).toBe(2);
  detachRemote(); h.restore(checkpoint); h.send({ kind: 'command', envelope: envelope() }); h.pump();
  expect(h.output.filter(m => m.kind === 'result').at(-1)!.result).toEqual(semantic);
  expect(h.authority.checkpoint([]).recentResults).toEqual(checkpoint.recentResults);
});

import { expect, it } from 'vitest';
import { checkpointRig } from './helpers/checkpointRig';
import { runReplay, parseReplay } from '../src/renderer/src/authority/replay';
import { LAYOUT } from './helpers/sim';
it('replays rejected admissions, duplicates, held and ordered pause boundaries exactly', () => {
  const h = checkpointRig();
  const send = (sequence: number, requestedTick: number, command: any = { kind: 'stand' }) => h.send({ kind: 'command', envelope: { runId: h.init.runId, id: { player: 0, sequence }, requestedTick, command } });
  send(1, 99); send(1, 99); send(1, 0); send(2, 0, { kind: 'setPaused', paused: true }); h.pump();
  send(3, 0, { kind: 'setPaused', paused: false }); h.pump();
  h.send({ kind: 'held', frame: { runId: h.init.runId, player: 0, tick: 0, sequence: 4, held: { moveX: 1, moveY: 0, interactHeld: true } } }); h.pump(17); h.pump(34);
  const replay = h.authority.replay(), expected = h.authority.checkpoint([]);
  const actual = runReplay(LAYOUT, replay, h.init.contentDigest);
  expect(actual.checkpoint).toEqual(expected);
  expect(actual.results.map(r => r.reason)).toContain('stale-tick');
  expect(actual.results.map(r => r.reason)).toContain('conflicting-duplicate');
});
it('rejects v1 and corrupt replay before creating a runner', () => {
  expect(() => parseReplay(LAYOUT, { version: 1, intents: [] }, __GAMEPLAY_CONTENT_DIGEST__)).toThrow(/unsupported replay format/);
  const h = checkpointRig(); h.pump(17); const replay = h.authority.replay();
  (replay.frames[0] as any).unknown = true;
  expect(() => parseReplay(LAYOUT, replay, __GAMEPLAY_CONTENT_DIGEST__)).toThrow();
});
it('keeps auxiliary payloads out of replay while accounting for event and receive cursor gaps', () => {
  const h = checkpointRig();
  h.send({ kind: 'callout', runId: h.init.runId, player: 0, sequence: 1, calloutKind: 'contextual' }); h.pump();
  h.send({ kind: 'callout', runId: h.init.runId, player: 0, sequence: 1, calloutKind: 'contextual' }); h.pump();
  const replay = h.authority.replay(); expect(JSON.stringify(replay)).not.toContain('callout');
  expect(runReplay(LAYOUT, replay, h.init.contentDigest).checkpoint).toEqual(h.authority.checkpoint([]));
});
it('validates frame tick continuity and detach ownership before execution', () => {
  const h = checkpointRig(); h.pump(17); const replay = h.authority.replay();
  replay.frames[0]!.tick = 10;
  expect(() => parseReplay(LAYOUT, replay, h.init.contentDigest)).toThrow();
});
import { encodeMessage, decodeMessage } from '../src/renderer/src/net/codec';
import type { AuthorityMessage, CommandEnvelope } from '../src/renderer/src/net/contracts';
it('replays link reassignment and pending cached rejection through the same ledger', () => {
  const h = checkpointRig(), command: CommandEnvelope = { runId: h.init.runId, id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'stand' } };
  h.send({ kind: 'command', envelope: command }); h.pump(); h.detach();
  const pair = h.transport.connectLocal(), output: AuthorityMessage[] = [];
  pair.clientLink.onMessage((_, bytes) => output.push(decodeMessage(bytes) as AuthorityMessage));
  h.authority.attach(pair.authorityLink, [0]); h.drain();
  pair.clientLink.send('reliable-ordered', encodeMessage({ kind: 'command', envelope: command })); h.drain(); h.pump(17);
  expect(output.filter(m => m.kind === 'result').at(-1)!.result.reason).toBe('unavailable');
  expect(runReplay(LAYOUT, h.authority.replay(), h.init.contentDigest).checkpoint).toEqual(h.authority.checkpoint([]));
  pair.host.close('done'); pair.client.close('done');
});
it('supports sampled long-run tracing without retaining another complete journal', () => {
  const h = checkpointRig(); h.pump(34); const replay = h.authority.replay(), boundaries: string[] = [], ticks: number[] = [];
  const result = runReplay(LAYOUT, replay, h.init.contentDigest, state => ticks.push(state.tick), { retainTrace: false, onFrame: frame => boundaries.push(frame.action.kind) });
  expect(boundaries).toEqual(replay.frames.map(frame => frame.action.kind)); expect(ticks).toEqual([1, 2]);
  expect(result.frames).toEqual([]); expect(result.hashes).toEqual([]); expect(result.results).toEqual([]); expect(result.events).toEqual([]);
  expect(result.checkpoint.snapshot).toEqual(h.authority.checkpoint([]).snapshot);
  expect(runReplay(LAYOUT, replay, h.init.contentDigest, undefined, { retainFrames: true }).frames).toEqual(replay.frames);
});
it.each(['held', 'command', 'callout'] as const)('preserves the receive cursor when detaching undrained %s ingress', kind => {
  const h = checkpointRig();
  if (kind === 'held') h.send({ kind, frame: { runId: h.init.runId, player: 0, tick: 0, sequence: 1, held: { moveX: 1, moveY: 0, interactHeld: true } } });
  else if (kind === 'command') h.send({ kind, envelope: { runId: h.init.runId, id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'stand' } } });
  else h.send({ kind, runId: h.init.runId, player: 0, sequence: 1, calloutKind: 'contextual' });
  h.detach();
  const replay = h.authority.replay(), checkpoint = h.authority.checkpoint([]);
  expect(checkpoint.receiveOrder).toBe(1); expect(checkpoint.commandHighWater).toEqual([0]);
  expect(JSON.stringify(replay)).not.toContain('callout');
  expect(runReplay(LAYOUT, replay, h.init.contentDigest).checkpoint).toEqual(checkpoint);
});
it('replays earlier undrained ingress from another binding after recording a detach cursor', () => {
  const h = checkpointRig(2), pair = h.transport.connectLocal(); h.authority.attach(pair.authorityLink, [1]);
  try {
    for (const [sequence, requestedTick] of [[1, 99], [2, 0]]) pair.clientLink.send('reliable-ordered', encodeMessage({ kind: 'command', envelope: {
      runId: h.init.runId, id: { player: 1, sequence: sequence! }, requestedTick: requestedTick!, command: { kind: 'setPaused', paused: false }
    } }));
    h.drain();
    h.send({ kind: 'callout', runId: h.init.runId, player: 0, sequence: 1, calloutKind: 'contextual' });
    h.send({ kind: 'held', frame: { runId: h.init.runId, player: 0, tick: 0, sequence: 1, held: { moveX: 1, moveY: 0, interactHeld: true } } });
    h.detach(); h.pump();
    const replay = h.authority.replay(), checkpoint = h.authority.checkpoint([]);
    expect(checkpoint.receiveOrder).toBe(4); expect(checkpoint.commandHighWater).toEqual([0, 2]);
    const actual = runReplay(LAYOUT, replay, h.init.contentDigest);
    expect(actual.checkpoint).toEqual(checkpoint);
    expect(actual.results.map(result => [result.id.sequence, result.status, result.reason])).toEqual([[1, 'rejected', 'stale-tick'], [2, 'applied', undefined]]);
  } finally { pair.host.close('done'); pair.client.close('done'); }
});

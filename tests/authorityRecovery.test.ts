import { expect, it } from 'vitest';
import { createLoopbackHarness, type LoopbackOptions } from '../src/renderer/src/net/loopback';
import { createClientRun } from '../src/renderer/src/clientControl/clientRun';
import { pauseActions, translateTick } from '../src/renderer/src/clientControl/cardController';
import { NEUTRAL_FRAME } from '../src/renderer/src/clientControl/inputFrame';
import { decodeMessage, encodeMessage } from '../src/renderer/src/net/codec';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { LAYOUT, makeState } from './helpers/sim';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { Position } from '../src/renderer/src/sim/components';
import { hashState } from '../src/renderer/src/sim/hash';
import { saveSnapshot } from '../src/renderer/src/sim/snapshot';
import type { AuthorityMessage, ClientMessage } from '../src/renderer/src/net/contracts';

function rig(options: LoopbackOptions = {}) {
  const state = makeState(1), runId = 'recovery', contentDigest = __GAMEPLAY_CONTENT_DIGEST__;
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest }, options);
  const pair = transport.connectLocal();
  const client = createClientRun(pair.clientLink, [0], { runId, resolveLayout: () => LAYOUT });
  let now = 0;
  const authority = createFixtureAuthority({ clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, contentDigest,
    resolveLayout: () => LAYOUT, onCrash(record) { throw Error(record.error); },
    init: { runId, layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION, contentDigest, seed: 1, playerCount: 1, characters: [], unlocked: [] }
  }, state);
  const detach = authority.attach(pair.authorityLink, [0]); transport.drain();
  return { state, client, pair, transport, authority, detach,
    send(message: ClientMessage) { pair.clientLink.send(message.kind === 'held' ? 'unreliable-latest' : 'reliable-ordered', encodeMessage(message)); },
    pump(at = now) { now = at; transport.drain(); authority.pump(); transport.drain(); },
    dispose() { authority.dispose(); client.dispose(); pair.host.close('done'); pair.client.close('done'); }
  };
}

it('delivers the initial completed state even when every latest packet is dropped', () => {
  const h = rig({ impairment: ({ kind }) => ({ drop: kind === 'unreliable-latest' }) });
  expect(h.client.state()?.tick).toBe(0);
  expect(h.client.publication()?.phase).toBe('running'); h.dispose();
});

it('recovers a lost running tick at pause and publishes resume without another tick', () => {
  let drop = false;
  const h = rig({ impairment: ({ kind }) => ({ drop: drop && kind === 'unreliable-latest' }) });
  drop = true; h.pump(17); expect(h.client.state()!.tick).toBe(0);
  h.send({ kind: 'command', envelope: { runId: 'recovery', id: { player: 0, sequence: 1 }, requestedTick: 1, command: { kind: 'setPaused', paused: true } } });
  h.pump(); expect(h.client.publication()).toMatchObject({ tick: 1, phase: 'paused' });
  expect(h.client.takeEvents().map(event => event.payload.kind)).toEqual(['pause']);
  h.client.send(pauseActions(h.client.ui, 0, 1, false)); h.pump();
  expect(h.client.publication()).toMatchObject({ tick: 1, phase: 'running' });
  expect(h.client.takeEvents().map(event => event.payload)).toEqual([{ kind: 'pause', paused: false, owner: null, reason: 'resume' }]);
  h.dispose();
});

it('releases the ended record once after losing the final latest update', () => {
  let drop = false;
  const h = rig({ impairment: ({ kind }) => ({ drop: drop && kind === 'unreliable-latest' }) });
  const delivered: AuthorityMessage[] = [];
  h.pair.clientLink.onMessage((_, bytes) => delivered.push(decodeMessage(bytes) as AuthorityMessage));
  drop = true; h.state.hull = 0; h.pump(17);
  expect(h.client.publication()).toMatchObject({ tick: 1, phase: 'ended' });
  expect(h.client.takeEvents().filter(event => event.payload.kind === 'ended')).toHaveLength(1);
  for (const message of delivered.filter(message => message.kind === 'event' || message.kind === 'state')) h.pair.authorityLink.send('reliable-ordered', encodeMessage(message));
  h.pump(1000); expect(h.client.takeEvents()).toEqual([]); expect(h.client.state()!.tick).toBe(1); h.dispose();
});

it('ignores a delayed initial reliable publication after a newer running state', () => {
  const h = rig({ impairment: ({ kind }) => ({ delayDrains: kind === 'reliable-ordered' ? 5 : 0 }) });
  h.pump(17); expect(h.client.state()!.tick).toBe(1);
  const publication = h.client.publication();
  for (let i = 0; i < 6; i++) h.transport.drain();
  expect(h.client.publication()).toBe(publication); expect(h.client.state()!.tick).toBe(1); h.dispose();
});

it('continues all three producer streams on same-run replacement and rejects detached old packets', () => {
  const h = rig(), oldHeld: ClientMessage = { kind: 'held', frame: { runId: 'recovery', player: 0, tick: 0, sequence: 100, held: { moveX: 0, moveY: 0, interactHeld: false } } };
  h.send(oldHeld);
  h.send({ kind: 'callout', runId: 'recovery', player: 0, sequence: 70, calloutKind: 'contextual' });
  h.client.send(pauseActions(h.client.ui, 0, 0, true)); h.pump();
  h.client.send(pauseActions(h.client.ui, 0, 0, false)); h.pump(); h.client.takeEvents();
  // Leave the old pair open with both queued and subsequently sent packets.
  h.send({ ...oldHeld, frame: { ...oldHeld.frame, sequence: 999, held: { moveX: -1, moveY: 0, interactHeld: false } } });
  h.detach(); h.client.dispose();
  const pair = h.transport.connectLocal(), replacement = createClientRun(pair.clientLink, [0], { runId: 'recovery', resolveLayout: () => LAYOUT });
  h.authority.attach(pair.authorityLink, [0]); h.transport.drain();
  const x = Position.x[h.state.crew[0]!]!;
  replacement.send(translateTick(replacement.state()!, replacement.ui, [{ ...NEUTRAL_FRAME, moveX: 1 }], 0));
  replacement.callout(0); replacement.send(pauseActions(replacement.ui, 0, 0, false));
  h.send({ kind: 'callout', runId: 'recovery', player: 0, sequence: 999, calloutKind: 'contextual' });
  h.send({ kind: 'command', envelope: { runId: 'recovery', id: { player: 0, sequence: 4 }, requestedTick: 0, command: { kind: 'setPaused', paused: true } } });
  h.pump(17);
  expect.soft(Position.x[h.state.crew[0]!]).toBeGreaterThan(x);
  expect.soft(replacement.takeResults()).toContainEqual({ id: { player: 0, sequence: 3 }, tick: 0, status: 'applied' });
  expect.soft(replacement.takeEvents().filter(event => event.payload.kind === 'callout')).toHaveLength(1);
  // Replay already admitted IDs through the new link: no repeated pause/callout or stale movement.
  pair.clientLink.send('unreliable-latest', encodeMessage({ ...oldHeld, frame: { ...oldHeld.frame, tick: 1, held: { moveX: -1, moveY: 0, interactHeld: false } } }));
  pair.clientLink.send('reliable-ordered', encodeMessage({ kind: 'callout', runId: 'recovery', player: 0, sequence: 70, calloutKind: 'contextual' }));
  pair.clientLink.send('reliable-ordered', encodeMessage({ kind: 'command', envelope: { runId: 'recovery', id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'setPaused', paused: true } } }));
  const moved = Position.x[h.state.crew[0]!]!; h.pump(34);
  expect(Position.x[h.state.crew[0]!]).toBeGreaterThan(moved);
  expect(replacement.publication()?.phase).toBe('running'); expect(replacement.takeEvents()).toEqual([]);
  replacement.dispose(); pair.host.close('done'); pair.client.close('done'); h.dispose();
});

it.each(['formatVersion', 'simVersion'] as const)('rejects an incompatible second %s before mutating its replica', (field) => {
  const h = rig(), publication = h.client.publication(), replica = h.client.state()!, before = hashState(replica);
  const closed: string[] = []; h.pair.clientLink.onClose(reason => closed.push(reason));
  h.state.hull -= 1;
  const snapshot = saveSnapshot(h.state); snapshot.header[field] += 1;
  h.pair.authorityLink.send('reliable-ordered', encodeMessage({ kind: 'state', state: { ...publication!, publicationSequence: 2, snapshot, hash: hashState(h.state) } }));
  h.transport.drain();
  expect(h.client.publication()).toBe(publication); expect(hashState(replica)).toBe(before);
  expect(closed).toEqual(['state-version']); h.dispose();
});

it('never rewinds producer counters when a publication trails locally queued input', () => {
  const h = rig(), sent: ClientMessage[] = [];
  h.pair.authorityLink.onMessage((_, bytes) => sent.push(decodeMessage(bytes) as ClientMessage));
  const produce = () => {
    h.client.send(translateTick(h.client.state()!, h.client.ui, [{ ...NEUTRAL_FRAME, moveX: 1 }], 0));
    h.client.send(pauseActions(h.client.ui, 0, 0, false)); h.client.callout(0);
  };
  produce(); produce();
  h.authority.publishCompletedState(); h.transport.drain(); // All authoritative watermarks are still zero.
  produce(); h.pump(17);
  expect(sent.filter(message => message.kind === 'held').map(message => message.frame.sequence)).toEqual([2, 3]);
  expect(sent.filter(message => message.kind === 'command').map(message => message.envelope.id.sequence)).toEqual([1, 2, 3]);
  expect(sent.filter(message => message.kind === 'callout').map(message => message.sequence)).toEqual([1, 2, 3]);
  expect(h.client.takeResults().every(result => result.status === 'applied')).toBe(true); h.dispose();
});

it('preserves exhaustion of every producer stream instead of wrapping replacement counters', () => {
  const h = rig(), closed: string[] = [], sent: ClientMessage[] = [];
  h.pair.clientLink.onClose(reason => closed.push(reason));
  h.pair.authorityLink.onMessage((_, bytes) => sent.push(decodeMessage(bytes) as ClientMessage));
  h.pair.authorityLink.send('reliable-ordered', encodeMessage({ kind: 'state', state: {
    ...h.client.publication()!, publicationSequence: 2, commandHighWater: [Number.MAX_SAFE_INTEGER],
    heldHighWater: [Number.MAX_SAFE_INTEGER], auxiliaryHighWater: [Number.MAX_SAFE_INTEGER]
  } })); h.transport.drain();
  expect(() => pauseActions(h.client.ui, 0, 0, false)).toThrow('input sequence exhausted');
  expect(() => translateTick(h.client.state()!, h.client.ui, [NEUTRAL_FRAME], 0)).toThrow('input sequence exhausted');
  h.client.callout(0); h.transport.drain();
  expect(closed).toEqual(['auxiliary-sequence-exhausted']); expect(sent).toEqual([]); h.dispose();
});

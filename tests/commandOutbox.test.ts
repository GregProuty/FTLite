import { describe, expect, it } from 'vitest';
import { createCommandOutbox } from '../src/renderer/src/clientControl/commandOutbox';
import { createCardUi, pauseActions, reconcileUi, translateTick } from '../src/renderer/src/clientControl/cardController';
import { NEUTRAL_FRAME } from '../src/renderer/src/clientControl/inputFrame';
import type { CommandEnvelope, CommandResult } from '../src/renderer/src/net/contracts';
import { makeState, placeDebris, quiet, setEvent } from './helpers/sim';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { createClientRun } from '../src/renderer/src/clientControl/clientRun';
import { createLoopbackHarness } from '../src/renderer/src/net/loopback';
import { encodeMessage, decodeMessage } from '../src/renderer/src/net/codec';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { LAYOUT } from './helpers/sim';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';

const command = (sequence: number, player = 0): CommandEnvelope => ({ runId: 'run', id: { player, sequence }, requestedTick: 42, command: { kind: 'moveTo', tile: 17 } });
const result = (sequence: number, expectedSequence: number, disposition: 'terminal' | 'retryable' = 'terminal', player = 0): CommandResult => ({ id: { player, sequence }, tick: 7, status: 'rejected', reason: disposition === 'terminal' ? 'over-capacity' : 'expected-sequence', admission: { expectedSequence, disposition } });

describe('bounded semantic command outbox', () => {
  it('reserves a control slot and drains each new command only once', () => {
    const box = createCommandOutbox(0, 1);
    for (let n = 1; n <= 255; n++) box.enqueue(command(n));
    expect(box.canAllocate(false)).toBe(false); expect(box.canAllocate(true)).toBe(true);
    box.enqueue({ ...command(256), command: { kind: 'setPaused', paused: true } });
    expect(box.size()).toBe(256); expect(box.canAllocate(true)).toBe(false);
    expect(() => box.enqueue(command(257))).toThrow();
    expect(box.takeSendable()).toHaveLength(256); expect(box.takeSendable()).toEqual([]);
    expect(box.ack(result(256, 257))).toBe('ready');
    expect(box.size()).toBe(0); box.enqueue(command(257));
    expect(box.takeSendable().map(e => e.id.sequence)).toEqual([257]);
  });

  it('blocks higher IDs at a gap and retries detached, unchanged retained data', () => {
    const box = createCommandOutbox(0, 1), first = command(1);
    box.enqueue(first); box.enqueue(command(2)); box.enqueue(command(3));
    first.command = { kind: 'stand' }; first.requestedTick = 99;
    const sent = box.takeSendable(); sent[0]!.command = { kind: 'stand' }; sent[0]!.id.sequence = 999;
    expect(box.ack(result(3, 1, 'retryable'))).toBe('ready');
    expect(box.takeSendable()).toEqual([command(1)]); expect(box.takeSendable()).toEqual([]);
    box.enqueue(command(4)); expect(box.takeSendable()).toEqual([]);
    expect(box.reconcile(2)).toBe('ready');
    expect(box.takeSendable().map(e => e.id.sequence)).toEqual([2, 3, 4]);
    expect(box.ack(result(1, 2))).toBe('ready');
    expect(box.reconcile(2)).toBe('ready'); expect(box.size()).toBe(3);
    expect(box.ack(result(4, 1, 'retryable'))).toBe('ready');
    expect(box.takeSendable()).toEqual([]); // stale metadata cannot rewind a generation
  });

  it('requires resynchronization for a missing retained command and stays stopped until reset', () => {
    const box = createCommandOutbox(0, 5);
    expect(box.reconcile(4)).toBe('ready'); // old publication before this generation
    expect(box.ack(result(7, 5, 'retryable'))).toBe('resync-required');
    expect(box.canAllocate(true)).toBe(false); expect(box.takeSendable()).toEqual([]);
    expect(box.reconcile(6)).toBe('resync-required');
    box.reset(9); box.enqueue(command(9));
    expect(box.takeSendable()).toEqual([command(9)]); expect(box.canAllocate(false)).toBe(true);
    expect(() => box.enqueue(command(11))).toThrow();
  });

  it('keeps seats independent and rejects invalid sequence/capacity inputs without mutation', () => {
    const first = createCommandOutbox(0, 1), second = createCommandOutbox(1, 1);
    first.enqueue(command(1)); second.enqueue(command(1, 1));
    expect(first.ack(result(1, 2, 'terminal', 1))).toBe('ready'); expect(first.size()).toBe(1);
    second.ack(result(1, 2, 'terminal', 1)); expect(second.size()).toBe(0);
    for (const bad of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => first.reconcile(bad)).toThrow(); expect(() => first.reset(bad)).toThrow();
      expect(() => first.ack(result(1, bad))).toThrow();
      expect(() => createCommandOutbox(0, bad)).toThrow();
    }
    expect(first.size()).toBe(1);
    expect(() => createCommandOutbox(-1, 1)).toThrow(); expect(() => createCommandOutbox(0, 1, 0)).toThrow();
    expect(() => first.canAllocate(false, -1)).toThrow();
    expect(() => first.enqueue(command(2, 1))).toThrow();
  });
});

function clientRig() {
  const owner = makeState(2); setEvent(owner, 0);
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ });
  const pair = transport.connectLocal();
  const client = createClientRun(pair.clientLink, [0], { runId: 'run', resolveLayout: () => LAYOUT, admissionPolicy: 'receive-time' });
  const received: ReturnType<typeof decodeMessage>[] = [];
  pair.authorityLink.onMessage((_channel, bytes) => received.push(decodeMessage(bytes)));
  const authority = createFixtureAuthority({ clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, resolveLayout: () => LAYOUT,
    contentDigest: __GAMEPLAY_CONTENT_DIGEST__, onCrash(record) { throw new Error(record.error); },
    init: { runId: 'run', layoutId: LAYOUT.id, layoutHash: owner.derived.layoutHash, simVersion: SIM_VERSION,
      contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 1, playerCount: 2, characters: [], unlocked: [] } }, owner);
  return { client, received, transport, authority,
    start(seed = false) {
      if (seed) {
        const previous = transport.connectLocal();
        authority.attach(previous.authorityLink, [0], { admissionPolicy: 'receive-time' });
        previous.clientLink.send('reliable-ordered', encodeMessage({ kind: 'command', envelope: { ...command(1), command: { kind: 'setPaused', paused: true } } }));
        transport.drain(); authority.pump(); transport.drain(); previous.client.close('producer-replacement');
      }
      authority.attach(pair.authorityLink, [0], { admissionPolicy: 'receive-time' }); transport.drain();
    },
    reply(reply: CommandResult) {
      pair.authorityLink.send('reliable-ordered', encodeMessage({ kind: 'result', runId: 'run', result: reply }));
      transport.drain(); transport.drain(); // outbound retry is deliberately deferred to the next drain
    },
    dispose() { client.dispose(); authority.dispose(); pair.host.close('test-end'); pair.client.close('test-end'); }
  };
}

describe('receive-time client opt in', () => {
  it('waits for full synchronization and seeds the command producer from its watermark', () => {
    const h = clientRig();
    try {
      expect(h.client.commandStatus(0)).toMatchObject({ state: 'waiting-state', pending: 0, canAllocate: false, canControl: false });
      h.client.send({ held: [], commands: [command(1)] }); h.client.callout(0); h.transport.drain();
      expect(h.received).toEqual([]);
      // Admit before attachment so the first state starts this producer at 2.
      h.start(true);
      expect(h.client.commandStatus(0)).toMatchObject({ state: 'ready', pending: 0, canAllocate: true, canControl: true });
      expect(h.client.ui.players[0]!.nextSequence).toBe(2);
      const actions = translateTick(h.client.state()!, h.client.ui, [{ ...NEUTRAL_FRAME, confirmPresses: 1 }], 0, [0], h.client.commandBudget);
      h.client.send(actions); h.transport.drain();
      expect(h.received.filter(m => m.kind === 'command')).toHaveLength(1);
      expect(h.client.commandStatus(0).pending).toBe(1);
      h.client.send({ held: [], commands: [] }); h.transport.drain();
      expect(h.received.filter(m => m.kind === 'command')).toHaveLength(1);
      h.authority.pump(); h.authority.publishCompletedState(); h.transport.drain();
      expect(h.client.commandStatus(0).pending).toBe(0);
      expect(h.client.ui.players[0]!.pendingVote).not.toBeNull(); // admission watermark is not execution
      h.reply(result(2, 3));
      expect(h.client.commandStatus(0).pending).toBe(0);
      expect(h.client.commandStatus(1).canAllocate).toBe(false);
    } finally { h.dispose(); }
  });

  it('preserves a retryable optimistic vote, retries once, and exposes producer resync', () => {
    const h = clientRig();
    try {
      h.start();
      const actions = translateTick(h.client.state()!, h.client.ui, [{ ...NEUTRAL_FRAME, confirmPresses: 1 }], 0, [0], h.client.commandBudget);
      h.client.send(actions); h.transport.drain();
      h.reply(result(1, 1, 'retryable'));
      expect(h.received.filter(m => m.kind === 'command')).toHaveLength(2);
      expect(h.client.ui.players[0]!.pendingVoteSequence).toBe(1); expect(h.client.ui.players[0]!.pendingVote).not.toBeNull();
      h.client.send({ held: [], commands: [] }); h.transport.drain();
      expect(h.received.filter(m => m.kind === 'command')).toHaveLength(2);
      h.reply(result(1, 2));
      expect(h.client.ui.players[0]!.pendingVote).toBeNull();
      h.reply(result(2, 2, 'retryable'));
      expect(h.client.commandStatus(0)).toMatchObject({ state: 'resync-required', canAllocate: false, canControl: false });
      h.received.length = 0;
      h.client.send({ held: [{ runId: 'run', player: 0, tick: 1, sequence: 2, held: { moveX: 1, moveY: 0, interactHeld: false } }], commands: [] });
      h.transport.drain(); expect(h.received.filter(m => m.kind === 'held')).toHaveLength(1);
    } finally { h.dispose(); }
  });
});

/** Actual authority time advances while the tick-zero input waits in transport. */
function delayedVoteRig() {
  const owner = makeState(2); quiet(owner); setEvent(owner, 4);
  let now = 0, delayResults = false;
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ }, {
    impairment: packet => delayResults && packet.kind === 'reliable-ordered' && packet.peer === pair.authorityLink.peer ? { delayDrains: 4 } : {}
  });
  const pair = transport.connectLocal();
  const client = createClientRun(pair.clientLink, [0], { runId: 'delayed-vote', resolveLayout: () => LAYOUT, admissionPolicy: 'receive-time' });
  const authority = createFixtureAuthority({ clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, resolveLayout: () => LAYOUT,
    contentDigest: __GAMEPLAY_CONTENT_DIGEST__, onCrash(record) { throw new Error(record.error); },
    init: { runId: 'delayed-vote', layoutId: LAYOUT.id, layoutHash: owner.derived.layoutHash, simVersion: SIM_VERSION,
      contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 1, playerCount: 2, characters: [], unlocked: [] } }, owner);
  authority.attach(pair.authorityLink, [0], { admissionPolicy: 'receive-time' }); transport.drain();
  return { owner, client, transport,
    press() {
      const actions = translateTick(client.state()!, client.ui, [{ ...NEUTRAL_FRAME, confirmPresses: 1 }], client.state()!.tick, [0], client.commandBudget);
      client.send(actions); return actions.commands[0]!;
    },
    pause(paused: boolean) { client.send(pauseActions(client.ui, 0, client.state()!.tick, paused, client.commandBudget)); },
    pump(time = now) { now = time; authority.pump(); },
    delayResults() { delayResults = true; },
    observe(cb: (message: ReturnType<typeof decodeMessage>) => void) { return pair.clientLink.onMessage((_channel, bytes) => cb(decodeMessage(bytes))); },
    dispose() { client.dispose(); authority.dispose(); pair.host.close('test-end'); pair.client.close('test-end'); }
  };
}

describe('receive-time vote execution evidence', () => {
  for (const order of ['result-first', 'state-first'] as const) it(`preserves delayed paused votes and retires only with execution result plus state (${order})`, () => {
    const h = delayedVoteRig();
    try {
      expect(h.press().command).toMatchObject({ kind: 'vote', choice: 0 }); h.pause(true);
      h.pump(100); expect(h.owner.tick).toBe(6); // no client delivery yet
      h.transport.drain(); h.pump(); h.transport.drain();
      expect(h.client.publication()).toMatchObject({ tick: 6, phase: 'paused', commandHighWater: [2, 0] });
      expect(h.owner.run.vote[0]).toBe(-1);
      expect(h.client.ui.players[0]!.pendingVote?.choice).toBe(0);
      expect(h.press().command).toMatchObject({ kind: 'vote', choice: 1 });
      expect(h.client.ui.players[0]!.pendingVoteSequence).toBe(3);
      h.pause(false); h.transport.drain(); h.pump(); h.transport.drain();
      expect(h.client.publication()).toMatchObject({ tick: 6, phase: 'running' });
      expect(h.owner.run.vote[0]).toBe(-1); expect(h.client.ui.players[0]!.pendingVote?.choice).toBe(1);

      const observed: { sequence: number; publicationTick: number; pending: number | null }[] = [];
      h.observe(message => {
        if (message.kind === 'result' && [1, 3].includes(message.result.id.sequence) && message.result.status === 'applied')
          observed.push({ sequence: message.result.id.sequence, publicationTick: h.client.publication()!.tick, pending: h.client.ui.players[0]!.pendingVote?.choice ?? null });
      });
      if (order === 'state-first') h.delayResults();
      h.pump(117); h.transport.drain();
      expect(h.owner.run.vote[0]).toBe(1); expect(h.client.state()!.run.vote[0]).toBe(1);
      if (order === 'state-first') {
        expect(observed).toEqual([]); expect(h.client.publication()!.tick).toBe(7);
        expect(h.client.ui.players[0]!.pendingVote?.choice).toBe(1);
        for (let n = 0; n < 4; n++) h.transport.drain();
        expect(observed).toEqual([{ sequence: 1, publicationTick: 7, pending: 1 }, { sequence: 3, publicationTick: 7, pending: null }]);
      } else {
        // Both result callbacks precede the tick-7 state. The old vote cannot
        // retire the newest ID; the matching applied result alone cannot either.
        expect(observed).toEqual([{ sequence: 1, publicationTick: 6, pending: 1 }, { sequence: 3, publicationTick: 6, pending: 1 }]);
      }
      expect(h.client.ui.players[0]!.pendingVote).toBeNull();
    } finally { h.dispose(); }
  });

  it('ignores delayed execution results when a newer optimistic vote is pending', () => {
    const h = delayedVoteRig();
    try {
      expect(h.press().command).toMatchObject({ kind: 'vote', choice: 0 });
      h.transport.drain(); h.delayResults(); h.pump(17); h.transport.drain();
      expect(h.client.publication()!.tick).toBe(1); expect(h.client.state()!.run.vote[0]).toBe(0);
      expect(h.client.ui.players[0]!.pendingVote?.choice).toBe(0);
      expect(h.press().command).toMatchObject({ kind: 'vote', choice: 1 });
      expect(h.client.ui.players[0]!.pendingVoteSequence).toBe(2);
      for (let n = 0; n < 4; n++) h.transport.drain();
      expect(h.client.takeResults()).toContainEqual(expect.objectContaining({ id: { player: 0, sequence: 1 }, status: 'applied' }));
      expect(h.client.ui.players[0]!.pendingVote?.choice).toBe(1); expect(h.client.ui.players[0]!.pendingVoteSequence).toBe(2);
    } finally { h.dispose(); }
  });
});

describe('controller command budget', () => {
  it('denies ordinary commands before ID allocation while retaining the reserved pause slot', () => {
    const view = makeState(1); setEvent(view, 0);
    const ui = createCardUi('run'); reconcileUi(view, ui, 'run', [255]);
    const box = createCommandOutbox(0, 1);
    for (let n = 1; n <= 255; n++) box.enqueue(command(n));
    const budget = (_player: number, control: boolean, staged = 0) => box.canAllocate(control, staged);
    const denied = translateTick(view, ui, [{ ...NEUTRAL_FRAME, confirmPresses: 1, moveX: 1 }], 0, undefined, budget);
    expect(denied.commands).toEqual([]); expect(denied.blocked).toEqual([{ player: 0, reason: 'capacity' }]);
    expect(denied.held[0]!.held.moveX).toBe(1); expect(ui.players[0]!.nextSequence).toBe(256);
    expect(ui.players[0]!.pendingVote).toBeNull(); expect(ui.players[0]!.pendingVoteSequence).toBe(0);
    const pause = pauseActions(ui, 0, 0, true, budget); expect(pause.commands[0]!.id.sequence).toBe(256);
    box.enqueue(pause.commands[0]!);
    expect(pauseActions(ui, 0, 0, false, budget).blocked).toEqual([{ player: 0, reason: 'capacity' }]);
    expect(ui.players[0]!.nextSequence).toBe(257);
    box.ack(result(256, 257));
    const allowed = translateTick(view, ui, [{ ...NEUTRAL_FRAME, confirmPresses: 1 }], 1, undefined, budget);
    expect(allowed.commands[0]!.id.sequence).toBe(257); expect(ui.players[0]!.pendingVoteSequence).toBe(257);
  });

  it('counts move-plus-Confirm commands staged in one batch, with contiguous IDs', () => {
    const view = makeState(1); placeDebris(view, 0, 10000, 1, 99);
    const weapons = view.derived.stationOfKind[StationKind.Weapons]!; sitDown(view, 0, weapons);
    const ui = createCardUi('run'); reconcileUi(view, ui, 'run', [254]);
    const box = createCommandOutbox(0, 1);
    for (let n = 1; n <= 254; n++) box.enqueue(command(n));
    const actions = translateTick(view, ui, [{ ...NEUTRAL_FRAME, moveX: 1, confirmPresses: 1 }], 0, undefined,
      (_player, control, staged) => box.canAllocate(control, staged));
    expect(actions.commands.map(e => [e.id.sequence, e.command.kind])).toEqual([[255, 'selectWeapon']]);
    expect(actions.blocked).toEqual([{ player: 0, reason: 'capacity' }]);
    expect(ui.players[0]!.nextSequence).toBe(256);
    box.enqueue(actions.commands[0]!); expect(pauseActions(ui, 0, 0, true, (_p, c, s) => box.canAllocate(c, s)).commands[0]!.id.sequence).toBe(256);
  });
});

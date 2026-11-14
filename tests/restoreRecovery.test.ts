import { expect, it } from 'vitest';
import { createClientRun } from '../src/renderer/src/clientControl/clientRun';
import { pauseActions, stickEdge, Dir } from '../src/renderer/src/clientControl/cardController';
import { createHeadlessRunner } from '../src/renderer/src/headless/runner';
import { runReplay } from '../src/renderer/src/authority/replay';
import { createAuthority } from '../src/renderer/src/authority/authority';
import { createLedger } from '../src/renderer/src/authority/ledger';
import { encodeMessage } from '../src/renderer/src/net/codec';
import type { Command, CommandEnvelope, Link } from '../src/renderer/src/net/contracts';
import { hashState } from '../src/renderer/src/sim/hash';
import { checkpointRig } from './helpers/checkpointRig';
import { ownTestCleanup } from './helpers/simLifetime';
import { LAYOUT } from './helpers/sim';

const command = (sequence: number, action: Command = { kind: 'setPaused', paused: false }, requestedTick = 0): CommandEnvelope =>
  ({ runId: 'durable', id: { player: 0, sequence }, requestedTick, command: action });
const lastResult = (h: ReturnType<typeof checkpointRig>) => h.output.filter(m => m.kind === 'result').at(-1)!.result;

it('rejects older restore with an attached advanced client without changing the usable live run', () => {
  const h = checkpointRig(), client = createClientRun(h.pair.clientLink, [0], { runId: h.init.runId, resolveLayout: () => LAYOUT });
  ownTestCleanup(() => client.dispose());
  h.pump(17); const old = h.authority.checkpoint([]);
  client.send(pauseActions(client.ui, 0, 1, true)); h.drain(); h.pump();
  const before = h.authority.checkpoint([]), producer = structuredClone(client.ui);
  expect(() => h.authority.restore(old)).toThrow(/detach/i);
  expect(h.authority.checkpoint([])).toEqual(before); expect(client.ui).toEqual(producer);
  client.send(pauseActions(client.ui, 0, 1, false)); h.drain(); h.pump(); h.pump(34);
  expect(client.publication()!.phase).toBe('running'); expect(client.state()!.tick).toBe(2);
  expect(client.takeResults().map(r => r.status)).toEqual(['applied', 'applied']);
});

it('fresh client sessions resume an older checkpoint with coherent command, held and repeat memory', () => {
  const h = checkpointRig(), old = createClientRun(h.pair.clientLink, [0], { runId: h.init.runId, resolveLayout: () => LAYOUT });
  ownTestCleanup(() => old.dispose()); h.pump(17);
  const cp = h.authority.checkpoint([]);
  old.send(pauseActions(old.ui, 0, 1, true)); h.drain(); h.pump();
  old.ui.players[0]!.lastTick = 100; old.ui.players[0]!.heldSequence = 100;
  // Retire reliable commands still in transit as well as results waiting at the old client.
  old.send(pauseActions(old.ui, 0, 1, false)); h.drain(); // undrained authority ingress
  old.send(pauseActions(old.ui, 0, 1, true)); // undelivered reliable transport packet
  h.detach(); old.dispose(); h.pair.host.close('restore'); h.pair.client.close('restore');
  h.authority.restore(cp);
  const pair = h.transport.connectLocal(), fresh = createClientRun(pair.clientLink, [0], { runId: h.init.runId, resolveLayout: () => LAYOUT });
  ownTestCleanup(() => { fresh.dispose(); pair.host.close('done'); pair.client.close('done'); });
  h.authority.attach(pair.authorityLink, [0]); h.drain();
  expect(fresh.ui.players[0]!.nextSequence).toBe(1); expect(fresh.ui.players[0]!.heldSequence).toBe(0);
  expect(stickEdge(fresh.ui, 0, 1, 0, 1)).toBe(Dir.Right);
  fresh.send(pauseActions(fresh.ui, 0, 1, false)); h.drain(); h.pump(); h.pump(34);
  expect(fresh.publication()!.phase).toBe('running'); expect(fresh.state()!.tick).toBe(2);
  expect(fresh.takeResults()).toEqual([{ id: { player: 0, sequence: 1 }, tick: 1, status: 'applied' }]);
});

it.each(['controls', 'sealed-gameplay'] as const)('resumes a saturated %s checkpoint without replenishing gameplay budget, including replay', kind => {
  const h = checkpointRig();
  for (let i = 1; i <= 16; i++) h.send({ kind: 'command', envelope: command(i, kind === 'controls' ? { kind: 'setPaused', paused: false } : { kind: 'stand' }) });
  const cp = h.authority.checkpoint([]);
  expect(cp.phase).toBe('running'); expect(cp.admissionCounts).toEqual([16]);
  if (kind === 'sealed-gameplay') expect(cp.recentResults.every(e => e.result.reason === 'unavailable')).toBe(true);
  h.restore(cp);
  h.send({ kind: 'command', envelope: command(17) }); h.pump();
  expect(lastResult(h).status).toBe('applied');
  expect(h.authority.checkpoint([])).toMatchObject({ phase: 'running', admissionCounts: [16], commandHighWater: [17] });
  h.send({ kind: 'command', envelope: command(18, { kind: 'stand' }) }); h.pump();
  expect(lastResult(h).reason).toBe('over-capacity');
  const replay = h.authority.replay(), expected = h.authority.checkpoint([]);
  expect(runReplay(LAYOUT, replay, h.init.contentDigest).checkpoint).toEqual(expected);
  // The recovery resumes the clock, which eventually opens the next ordinary tick budget.
  h.pump(17); h.send({ kind: 'command', envelope: command(18, { kind: 'stand' }, 1) }); h.pump(34);
  expect(lastResult(h).reason).not.toBe('over-capacity'); expect(h.authority.checkpoint([]).snapshot.header.tick).toBe(2);
});

it('repeated restore cannot admit a seventeenth gameplay action in the original tick', () => {
  const h = checkpointRig();
  for (let i = 1; i <= 16; i++) h.send({ kind: 'command', envelope: command(i, { kind: 'stand' }) });
  let cp = h.authority.checkpoint([]);
  for (let attempt = 0; attempt < 3; attempt++) {
    h.restore(cp); const next = cp.commandHighWater[0]! + 1;
    h.send({ kind: 'command', envelope: command(next) }); h.pump(); expect(lastResult(h).status).toBe('applied');
    h.send({ kind: 'command', envelope: command(next + 1, { kind: 'stand' }) }); h.pump();
    expect(lastResult(h).reason).toBe('over-capacity'); cp = h.authority.checkpoint([]);
    expect(cp.admissionCounts).toEqual([16]); expect(cp.snapshot.header.tick).toBe(0);
  }
});

it('recovery retains identity, tick, ownership and duplicate checks and admits one resume per player per drain', () => {
  const h = checkpointRig(2);
  for (let i = 1; i <= 16; i++) h.send({ kind: 'command', envelope: command(i) });
  h.restore(h.authority.checkpoint([])); h.output.length = 0;
  const send = (e: CommandEnvelope) => h.send({ kind: 'command', envelope: e });
  send({ ...command(17), id: { player: 1, sequence: 1 } });
  send({ ...command(17), runId: 'other' }); send(command(18));
  send(command(17, { kind: 'setPaused', paused: true }));
  send(command(17, { kind: 'setPaused', paused: false }, 99));
  send(command(17)); // different tick from cached stale result
  send(command(18)); send(command(18)); send(command(19));
  h.pump();
  expect(h.output.filter(m => m.kind === 'result').map(m => [m.result.id.sequence, m.result.status, m.result.reason])).toEqual([
    [1, 'rejected', 'unowned'], [17, 'rejected', 'wrong-run'], [18, 'rejected', 'expected-sequence'],
    [17, 'rejected', 'over-capacity'], [17, 'rejected', 'stale-tick'], [17, 'rejected', 'conflicting-duplicate'],
    [18, 'already-processed', undefined], [19, 'rejected', 'over-capacity'], [18, 'applied', undefined]
  ]);
  send(command(18)); send(command(19)); h.pump();
  expect(h.output.filter(m => m.kind === 'result').slice(-2).map(m => [m.result.status, m.result.reason])).toEqual([
    ['applied', undefined], ['rejected', 'over-capacity']
  ]);
  expect(h.authority.checkpoint([]).admissionCounts).toEqual([16, 0]);
  expect(runReplay(LAYOUT, h.authority.replay(), h.init.contentDigest).checkpoint).toEqual(h.authority.checkpoint([]));
});

it('headless restore retires old views and producers, resets absent memory and drops old ingress and reliable results', () => {
  let authorityLink!: Link, captured!: ReturnType<typeof createAuthority>;
  const runner = createHeadlessRunner({ layout: LAYOUT, playerCount: 1, seed: 7, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, runId: 'durable' }, deps => {
    const authority = captured = createAuthority(deps);
    return { ...authority, attach(link, players) { authorityLink = link; return authority.attach(link, players); } };
  });
  try {
    const cp = runner.checkpoint(); cp.botControllers = [];
    for (let t = 0; t < 20; t++) runner.advanceBots();
    const oldView = runner.view(), oldBot = runner.botControllers[0]!, oldUi = runner.ui;
    runner.setPaused(true);
    // Queue an old reliable rejection that would clear this sequence's optimistic vote if leaked.
    const retiredLink = authorityLink, closed: string[] = [];
    retiredLink.onClose(reason => closed.push(reason));
    retiredLink.send('reliable-ordered', encodeMessage({ kind: 'result', runId: 'durable', result: { id: { player: 0, sequence: 1 }, tick: 20, status: 'rejected', reason: 'unavailable' } }));
    expect(retiredLink.stats().bufferedBytes).toBeGreaterThan(0);
    runner.restore(cp);
    expect(closed).toEqual(['restore']); expect(retiredLink.stats().bufferedBytes).toBe(0); expect(authorityLink).not.toBe(retiredLink);
    expect(() => hashState(oldView)).toThrow(/disposed/);
    expect(oldBot.decide(21)).toEqual({ held: [], commands: [] }); expect(runner.ui).not.toBe(oldUi);
    expect(runner.ui.players[0]).toMatchObject({ nextSequence: 1, heldSequence: 0, lastTick: -1 });
    expect(stickEdge(runner.ui, 0, 1, 0, 0)).toBe(Dir.Right);
    runner.setPaused(false); runner.advance([]);
    expect(runner.view().tick).toBe(1); expect(captured.checkpoint([]).phase).toBe('running');
  } finally { runner.dispose(); }
});

it('recovery cannot bypass the 256 pending limit even with a paused allowance', () => {
  // Injected ledger capacity exercise; the shipped game still has four players.
  const ledger = createLedger(Array.from({ length: 16 }, (_, p) => p), 16), recovered = new Set<number>();
  for (let player = 0; player < 16; player++) for (let sequence = 1; sequence <= 16; sequence++) {
    expect(ledger.admit({ ...command(sequence, { kind: 'stand' }), id: { player, sequence } }, 0).status).toBe('queued');
  }
  expect(ledger.admit(command(17), 0, recovered)).toMatchObject({ status: 'rejected', result: { reason: 'over-capacity' } });
  expect(ledger.highWater()[0]).toBe(16);
  ledger.finish({ id: { player: 1, sequence: 1 }, tick: 0, status: 'noop' });
  expect(ledger.admit(command(17), 0, recovered).status).toBe('queued');
  expect(ledger.admit(command(18), 0, recovered)).toMatchObject({ status: 'rejected', result: { reason: 'over-capacity' } });
});

it('a completed control drain renews only resume recovery when another player kept the authority paused', () => {
  const h = checkpointRig(2);
  for (let i = 1; i <= 16; i++) h.send({ kind: 'command', envelope: command(i) });
  h.restore(h.authority.checkpoint([]));
  const other = h.transport.connectLocal(); h.authority.attach(other.authorityLink, [1]);
  ownTestCleanup(() => { other.host.close('done'); other.client.close('done'); });
  h.send({ kind: 'command', envelope: command(17) });
  other.clientLink.send('reliable-ordered', encodeMessage({ kind: 'command', envelope: { ...command(1, { kind: 'setPaused', paused: true }), id: { player: 1, sequence: 1 } } }));
  h.drain(); h.pump();
  expect(h.authority.checkpoint([])).toMatchObject({ phase: 'paused', admissionCounts: [16, 1] });
  h.send({ kind: 'command', envelope: command(18) }); h.pump(); expect(lastResult(h).status).toBe('applied');
  h.send({ kind: 'command', envelope: command(19, { kind: 'stand' }) }); h.pump(); expect(lastResult(h).reason).toBe('over-capacity');
  const checkpoint = h.authority.checkpoint([]);
  expect(checkpoint).toMatchObject({ phase: 'running', admissionCounts: [16, 1], commandHighWater: [18, 1] });
  expect(runReplay(LAYOUT, h.authority.replay(), h.init.contentDigest).checkpoint).toEqual(checkpoint);
});

it('the owned headless lifecycle resumes a saturated checkpoint through its fresh client', () => {
  const runner = createHeadlessRunner({ layout: LAYOUT, playerCount: 1, seed: 7, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ });
  try {
    for (let i = 0; i < 16; i++) runner.setPaused(false);
    const cp = runner.checkpoint(); expect(cp.admissionCounts).toEqual([16]);
    runner.restore(cp); runner.setPaused(false);
    expect(runner.checkpoint()).toMatchObject({ phase: 'running', commandHighWater: [17], admissionCounts: [16] });
    runner.advance([]); expect(runner.view().tick).toBe(1);
  } finally { runner.dispose(); }
});

it('headless checkpoint memory retains repeat timing but resets unsent command and held sequences to the ledger', () => {
  const runner = createHeadlessRunner({ layout: LAYOUT, playerCount: 1, seed: 7, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ });
  try {
    for (let t = 0; t < 10; t++) runner.advance([]);
    const producer = runner.ui.players[0]!;
    stickEdge(runner.ui, 0, 1, 0, 10); producer.nextSequence = 99; producer.heldSequence = 99;
    const cp = runner.checkpoint();
    // Establish a newer producer clock, then restore the checkpoint's repeat phase.
    for (let t = 0; t < 10; t++) runner.advance([]);
    producer.lastTick = 20;
    runner.restore(cp);
    expect(runner.ui.players[0]).toMatchObject({ nextSequence: 1, heldSequence: 10, heldDir: Dir.Right, repeat: 8, lastTick: 10 });
    const repeat = structuredClone(runner.ui);
    expect(stickEdge(repeat, 0, 1, 0, 11)).toBe(Dir.None);
    expect(stickEdge(repeat, 0, 1, 0, 18)).toBe(Dir.Right);
    runner.setPaused(false); runner.advance([]); expect(runner.view().tick).toBe(11);
    expect(runner.checkpoint().heldHighWater).toEqual([11]);
  } finally { runner.dispose(); }
});

it.each(['snapshot', 'bots', 'ownership'] as const)('invalid headless %s restore preserves current producers and usable run', kind => {
  const runner = createHeadlessRunner({ layout: LAYOUT, playerCount: 1, seed: 7, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ });
  const other = createHeadlessRunner({ layout: LAYOUT, playerCount: 2, seed: 7, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ });
  try {
    runner.advanceBots(); const before = runner.checkpoint(), view = runner.view(), ui = runner.ui, bot = runner.botControllers[0];
    const bad = kind === 'ownership' ? other.checkpoint() : structuredClone(before);
    if (kind === 'snapshot') bad.snapshot.header.tick = -1;
    if (kind === 'bots') bad.botControllers[0]!.players[0]!.lastTick = 100;
    expect(() => runner.restore(bad)).toThrow(); expect(runner.view()).toBe(view); expect(runner.ui).toBe(ui); expect(runner.botControllers[0]).toBe(bot);
    expect(runner.checkpoint()).toEqual(before); runner.advanceBots(); expect(runner.view().tick).toBe(2);
  } finally { runner.dispose(); other.dispose(); }
});

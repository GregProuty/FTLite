import { expect, it } from 'vitest';
import { createSectorProducers } from '../src/network/modes/sectorProducers';
import { sectorMode } from '../src/network/modes/sector';
import { createAuthority, type AttachOptions, type Checkpoint } from '../src/renderer/src/authority/authority';
import { createLoopbackHarness } from '../src/renderer/src/net/loopback';
import { createClientRun } from '../src/renderer/src/clientControl/clientRun';
import { encodeMessage } from '../src/renderer/src/net/codec';
import type { LifecyclePause } from '../src/renderer/src/net/contracts';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { LAYOUT, makeState, wake, quiet, placeEnemy } from './helpers/sim';
import { saveSnapshot } from '../src/renderer/src/sim/snapshot';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { targetRef, ENEMY_WEAPONS_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { ownTestCleanup } from './helpers/simLifetime';

const digest = __GAMEPLAY_CONTENT_DIGEST__;
const init = (playerCount: number) => ({ runId: 'sector-producers', layoutId: LAYOUT.id, layoutHash: deriveLayout(LAYOUT).layoutHash,
  simVersion: SIM_VERSION, contentDigest: digest, seed: 17, playerCount, characters: [0, 1, 2, 3], unlocked: [] });
function harness(count = 1, restored?: Checkpoint) {
  let now = 0, control!: (value: LifecyclePause) => void;
  let producers!: ReturnType<typeof createSectorProducers>;
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: digest });
  const authority = createAuthority({ clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, contentDigest: digest,
    resolveLayout: () => LAYOUT, onCrash(record) { throw Error(record.error); },
    bindLifecyclePause(request) { control = request; }, botControllers: () => producers.controllers(),
    beforeControls() { producers.beforeControls(); }, beforeTick(tick) { producers.beforeTick(tick); } });
  producers = createSectorProducers({ authority, runId: init(count).runId, playerCount: count, contentDigest: digest,
    resolveLayout: () => LAYOUT, restoredControllers: restored?.botControllers });
  if (restored) authority.restore(restored); else authority.start(init(count));
  ownTestCleanup(() => { producers.dispose(); authority.dispose(); });
  return { authority, producers, transport,
    pump() { authority.pump(); transport.drain(); },
    tick() { now += 1000 / 60; authority.pump(); transport.drain(); },
    pause(paused: boolean) { control({ paused, reason: 'test' }); authority.pump(); transport.drain(); },
    checkpoint() { return authority.checkpoint(producers.controllers()); },
    human(players: number[], options: AttachOptions = { admissionPolicy: 'receive-time' }) {
      const pair = transport.connectLocal(), client = createClientRun(pair.clientLink, players, { runId: init(count).runId,
        contentDigest: digest, resolveLayout: () => LAYOUT, admissionPolicy: 'receive-time' });
      const off = producers.attachHuman(pair.authorityLink, players, options);
      ownTestCleanup(() => { off(); client.dispose(); pair.host.close('test'); pair.client.close('test'); });
      return { ...pair, client, off };
    }
  };
}

it('gives every vacant seat exactly one bot through published-state strict input', () => {
  const h = harness(4);
  for (let i = 0; i < 12; i++) h.tick();
  const cp = h.checkpoint();
  expect(cp.heldHighWater).toEqual([12, 12, 12, 12]);
  expect(cp.botControllers.map((ui, p) => ui.players[p]!.botDecisionTick)).toEqual([11, 11, 11, 11]);
  const admissions = h.authority.replay().frames.filter(f => f.action.kind === 'admission');
  expect(admissions.length).toBeGreaterThan(0);
  for (const frame of admissions) if (frame.action.kind === 'admission')
    expect(frame.action.entries.every(entry => entry.admissionPolicy === undefined)).toBe(true);
});
it('retires an entire multi-seat human binding when seat 2 is replaced and restores bot 0', () => {
  const h = harness(3), first = h.human([0, 2]); h.tick();
  expect(h.checkpoint().heldHighWater).toEqual([0, 1, 0]);
  const replacement = h.human([2]); h.tick();
  expect(first.host.links).toHaveLength(0);
  expect(h.checkpoint().heldHighWater).toEqual([1, 2, 0]);
  first.off(); first.clientLink.close('stale-close'); h.tick();
  expect(h.checkpoint().heldHighWater).toEqual([2, 3, 0]);
  expect(replacement.host.links).toHaveLength(1);
});

it('suppresses only sparse human seats 0 and 2 and resumes each bot after loss', () => {
  const h = harness(4), zero = h.human([0]), two = h.human([2]);
  h.tick();
  expect(h.checkpoint().heldHighWater).toEqual([0, 1, 0, 1]);
  expect(two.client.publication()!.snapshot.header.playerCount).toBe(4);
  zero.off(); h.tick();
  expect(h.checkpoint().heldHighWater).toEqual([1, 2, 0, 2]);
  two.clientLink.close('lost'); h.tick();
  expect(h.checkpoint().heldHighWater).toEqual([2, 3, 1, 3]);
});

it('settles an admitted pending command and clears held movement before bot takeover', () => {
  const h = harness(), human = h.human([0]); h.pump();
  human.clientLink.send('reliable-ordered', encodeMessage({ kind: 'command', envelope: { runId: init(1).runId,
    id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'stand' } } }));
  human.clientLink.send('unreliable-latest', encodeMessage({ kind: 'held', frame: { runId: init(1).runId, player: 0,
    tick: 0, sequence: 7, held: { moveX: 1, moveY: 0, interactHeld: false } } }));
  h.transport.drain(); h.pump();
  human.off(); h.pump();
  const cp = h.checkpoint();
  expect(cp.recentResults).toContainEqual(expect.objectContaining({ result: expect.objectContaining({
    id: { player: 0, sequence: 1 }, status: 'rejected', reason: 'unavailable' }) }));
  expect(cp.held).toEqual([{ moveX: 0, moveY: 0, interactHeld: false }]);
  expect(cp.botControllers[0]!.players[0]!.nextSequence).toBe(2);
  h.tick(); expect(h.checkpoint().heldHighWater).toEqual([8]);
});

it('hands human to bot to human with current watermarks and ignores stale detach closures', () => {
  const h = harness(), first = h.human([0]); h.pump();
  first.client.callout(0); h.transport.drain(); h.pump();
  first.off(); h.tick();
  const before = h.checkpoint(), second = h.human([0]); h.pump();
  expect(second.client.ui.players[0]!.nextSequence).toBe(before.commandHighWater[0]! + 1);
  expect(second.client.ui.players[0]!.heldSequence).toBe(before.heldHighWater[0]);
  first.off(); first.authorityLink.close('late-old-close'); h.tick();
  expect(h.checkpoint().heldHighWater).toEqual(before.heldHighWater);
  expect(second.client.publication()!.phase).toBe('running');
});

it('coalesces replacement and close callbacks while paused without advancing simulation', () => {
  const h = harness(); h.pause(true);
  const first = h.human([0]), second = h.human([0]); first.off();
  h.pump();
  expect(first.host.links).toHaveLength(0);
  expect(second.client.publication()).toMatchObject({ phase: 'paused', tick: 0 });
  second.off(); h.pump();
  const cp = h.checkpoint(); expect(cp.paused).toBe(true); expect(cp.snapshot.header.tick).toBe(0);
  expect(cp.botControllers[0]!.players[0]!.botDecisionTick).toBeUndefined();
});

it('queues replacements requested during a synchronous initial publication outside its journal frame', () => {
  const h = harness(), pair = h.transport.connectLocal();
  ownTestCleanup(() => pair.host.close('test'));
  let replaced = false;
  const first = h.human([0], { admissionPolicy: 'receive-time', publicationSink() {
    if (!replaced) { replaced = true; h.producers.attachHuman(pair.authorityLink, [0], { admissionPolicy: 'receive-time' }); }
  } });
  h.pump(); h.pump(); first.off(); h.tick();
  expect(replaced).toBe(true);
  expect(h.checkpoint().heldHighWater).toEqual([0]);
  expect(pair.host.links).toHaveLength(1);
});

it('restores actual controller cursor/repeat memory and reconciles abandoned sequences before continuing', () => {
  const initial = harness(2).checkpoint(), fight = makeState(2, 17);
  wake(fight); quiet(fight); placeEnemy(fight);
  fight.enemy.nextShotTick = fight.enemy.departTick = fight.enemy.nextArrivalTick = fight.boarders.nextArrivalTick = 1e9;
  fight.run.jumpCharge = 0; fight.weapons.torpedoStock = fight.weapons.torpedoLoaded = 0;
  sitDown(fight, 1, fight.derived.stationOfKind[StationKind.Weapons]!);
  fight.weapons.charge = 1; fight.weapons.target = targetRef(fight, ENEMY_WEAPONS_SLOT);
  initial.snapshot = saveSnapshot(fight, digest);
  const a = harness(2, initial); a.pause(false);
  for (let t = 0; t < 3; t++) a.tick();
  a.pause(true); const checkpoint = a.checkpoint(), saved = structuredClone(checkpoint.botControllers);
  expect(saved[1]!.players[1]!.repeat).toBeGreaterThan(0);
  expect(saved[1]!.players[1]!.lastTick).toBe(2);
  for (const ui of checkpoint.botControllers) for (const player of ui.players) { player.nextSequence = 9999; player.heldSequence = 9999; }
  const b = harness(2, checkpoint); b.pump();
  for (let p = 0; p < 2; p++) {
    const actual = b.producers.controllers()[p]!.players[p]!;
    expect(actual).toMatchObject({ ...saved[p]!.players[p], nextSequence: checkpoint.commandHighWater[p]! + 1, heldSequence: checkpoint.heldHighWater[p] });
    expect(b.producers.controllers()[p]!.stations).toEqual(saved[p]!.stations);
  }
  a.pause(false); b.pause(false);
  for (let t = 0; t < 60; t++) {
    a.tick(); b.tick();
    const ca = a.checkpoint(), cb = b.checkpoint();
    expect(cb.snapshot.values).toEqual(ca.snapshot.values);
    expect(cb.commandHighWater).toEqual(ca.commandHighWater);
  }
});

it('captures live sector controllers in initial and periodic crash baselines and regular mode checkpoints', () => {
  const h = harness(2);
  expect(h.authority.replay().checkpoint.botControllers.map(ui => ui.players.map(p => p.nextSequence))).toEqual([[1, 1], [1, 1]]);
  for (let t = 0; t < 301; t++) h.tick();
  const baseline = h.authority.replay().checkpoint;
  expect(baseline.snapshot.header.tick).toBe(300);
  expect(baseline.botControllers.map((ui, p) => ui.players[p]!.botDecisionTick)).toEqual([299, 299]);
  let now = 0; const callbacks = new Set<() => void>();
  const host = sectorMode.createHost({ contentDigest: digest, clock: { nowMs: () => now }, onCrash() {},
    scheduler: { schedule: (_, cb) => { callbacks.add(cb); return () => { callbacks.delete(cb); }; } } });
  ownTestCleanup(() => host.dispose());
  host.start(new TextEncoder().encode(JSON.stringify(init(2))));
  now = 100; for (const cb of [...callbacks]) { callbacks.delete(cb); cb(); }
  const cp = JSON.parse(new TextDecoder().decode(host.checkpoint())) as Checkpoint;
  expect(cp.botControllers.map((ui, p) => ui.players[p]!.botDecisionTick)).toEqual([5, 5]);
});

it('closes queued human links on disposal without ever binding or producing', () => {
  const h = harness(), human = h.human([0]);
  h.producers.dispose(); h.producers.dispose(); h.pump();
  expect(human.host.links).toHaveLength(0);
  expect(human.client.publication()).toBeNull();
});

it('coalesces superseded pending links immediately while binding only at the safe boundary', () => {
  const h = harness();
  let previous = h.human([0]);
  for (let i = 0; i < 20; i++) {
    const next = h.human([0]);
    expect(previous.host.links).toHaveLength(0);
    expect(next.client.publication()).toBeNull();
    previous.off(); previous = next;
  }
  h.pump(); expect(previous.client.publication()!.phase).toBe('running');
});

it('retires a bot candidate if another publication observer disposes the manager during binding', () => {
  const h = harness(2); let publications = 0;
  h.human([0], { admissionPolicy: 'receive-time', publicationSink() {
    if (++publications === 2) h.producers.dispose();
  } });
  h.pump();
  const replacement = h.transport.connectLocal();
  ownTestCleanup(() => replacement.host.close('test'));
  expect(() => h.authority.attach(replacement.authorityLink, [1])).not.toThrow();
});

it('releases every sector producer when initial publication faults the authority', () => {
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: digest });
  const first = transport.connectLocal(), second = transport.connectLocal();
  let pump = () => {}, crashes = 0;
  const host = sectorMode.createHost({ contentDigest: digest, clock: { nowMs: () => 0 },
    scheduler: { schedule: (_, callback) => { pump = callback; return () => {}; } }, onCrash() { crashes++; } });
  ownTestCleanup(() => { host.dispose(); first.host.close('test'); second.host.close('test'); });
  host.start(new TextEncoder().encode(JSON.stringify(init(2))));
  host.attach({ ...first.authorityLink, peer: first.authorityLink.peer, caps: first.authorityLink.caps,
    stats: () => first.authorityLink.stats(), onClose: cb => first.authorityLink.onClose(cb), onMessage: cb => first.authorityLink.onMessage(cb),
    close: reason => first.authorityLink.close(reason), send() { throw Error('publication failed'); } }, [0], 'receive-time');
  host.attach(second.authorityLink, [1], 'receive-time');
  pump();
  expect(crashes).toBe(1);
  expect(first.host.links).toHaveLength(0);
  expect(second.host.links).toHaveLength(0);
});

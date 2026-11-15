import { describe, expect, it } from 'vitest';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { LAYOUT, makeState } from './helpers/sim';
import { createLoopbackHarness } from '../src/renderer/src/net/loopback';
import { encodeMessage, decodeMessage } from '../src/renderer/src/net/codec';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { createTickDriver } from '../src/renderer/src/authority/tickDriver';
import { createLeaseGate } from '../src/network/session/leaseGate';
import type { LeaseRenewalRequest } from '../src/shared/sessionLease';
import type { AuthorityDeps, AttachOptions } from '../src/renderer/src/authority/authority';
import type { PublishedState } from '../src/renderer/src/net/contracts';
import { runReplay, parseReplay } from '../src/renderer/src/authority/replay';
import { createClientRun } from '../src/renderer/src/clientControl/clientRun';
import { createBotClient } from '../src/renderer/src/clientControl/botClient';

function rig(hooks: Partial<AuthorityDeps> = {}, publicationSink?: (state: PublishedState) => void, notificationSink?: AttachOptions['notificationSink']) {
  let now = 0, nonce = 0, request!: LeaseRenewalRequest;
  const state = makeState(1), messages: any[] = [];
  const gate = createLeaseGate({ identity: { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 1, hostSeatId: 0, utilityEpoch: 'c'.repeat(32) },
    clock: { nowMs: () => now, epochMs: () => 100000 + now }, scheduler: { schedule: () => () => {} },
    nonce: () => (++nonce).toString(16).padStart(32, '0'), onRenew: r => { request = r; } });
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ });
  const pair = transport.connectLocal(); pair.clientLink.onMessage((_, bytes) => messages.push(decodeMessage(bytes)));
  const authority = createFixtureAuthority({ clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} },
    contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout: () => LAYOUT, onCrash(r) { throw Error(r.error); }, ...hooks, sessionGate: gate,
    init: { runId: 'lease', layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 1, playerCount: 1, characters: [], unlocked: [] }
  }, state);
  authority.attach(pair.authorityLink, [0], { admissionPolicy: 'receive-time', publicationSink, notificationSink }); transport.drain();
  return { authority, state, gate, messages, pair, transport, at(t: number) { now = t; },
    grant() { gate.renewNow(); gate.accept(request, { roomId: request.roomId, hostGeneration: 1, hostSeatId: 0, nonce: request.nonce, expiresAtEpochMs: 100000 + now + 15000 }); },
    pump() { authority.pump(); transport.drain(); },
    send(sequence: number, command: any = { kind: 'stand' }) { pair.clientLink.send('reliable-ordered', encodeMessage({ kind: 'command', envelope: { runId: 'lease', id: { player: 0, sequence }, requestedTick: state.tick, command } })); transport.drain(); },
    held() { pair.clientLink.send('unreliable-latest', encodeMessage({ kind: 'held', frame: { runId: 'lease', player: 0, sequence: 1, tick: state.tick, held: { moveX: 1, moveY: 0, interactHeld: true } } })); transport.drain(); },
    dispose() { authority.dispose(); gate.dispose(); pair.host.close('done'); pair.client.close('done'); }
  };
}

describe('authority utility lease enforcement', () => {
  it('discards an earlier queued trusted Resume before executing the fence pause and replays that settlement', () => {
    let lifecycle!: (control: { paused: boolean; reason: string }) => void;
    const publications: PublishedState[] = [];
    const h = rig({ bindLifecyclePause(callback) { lifecycle = callback; } }, state => publications.push(state));
    h.grant(); h.authority.completeBootstrap(); publications.length = 0;
    lifecycle({ paused: false, reason: 'queued-trusted-resume' }); h.gate.invalidate('service-fenced'); h.pump();
    const cp = h.authority.checkpoint([]);
    expect(cp).toMatchObject({ phase: 'paused', pauseReason: 'session-fenced', controlRevision: 2 });
    expect(publications.every(state => state.phase === 'paused')).toBe(true);
    const replay = h.authority.replay(); expect(replay.version).toBe(4);
    expect(replay.frames).toContainEqual(expect.objectContaining({ action: { kind: 'seal', discardLifecycleResumes: true } }));
    expect(runReplay(LAYOUT, replay, __GAMEPLAY_CONTENT_DIGEST__).checkpoint).toEqual(cp);
    for (const version of [2, 3]) expect(() => parseReplay(LAYOUT, { ...replay, version }, __GAMEPLAY_CONTENT_DIGEST__)).toThrow();
    for (const patch of [{ discardLifecycleResumes: false }, { discardLifecycleResumes: 1 }, { discardLifecycleResumes: 'true' }, { extra: true }]) {
      const bad = structuredClone(replay), seal = bad.frames.find(f => f.action.kind === 'seal' && 'discardLifecycleResumes' in f.action)!;
      Object.assign(seal.action, patch); expect(() => parseReplay(LAYOUT, bad, __GAMEPLAY_CONTENT_DIGEST__)).toThrow();
    }
    const noResume = structuredClone(replay);
    noResume.frames = noResume.frames.filter(frame => frame.action.kind !== 'lifecycle' || frame.action.control.reason !== 'queued-trusted-resume');
    expect(() => runReplay(LAYOUT, noResume, __GAMEPLAY_CONTENT_DIGEST__)).toThrow(/action divergence/);
    lifecycle({ paused: false, reason: 'closed-resume' }); h.pump(); expect(h.authority.checkpoint([]).controlRevision).toBe(2);
    h.dispose();
  });
  it('keeps bootstrap paused when permission expires between its initial check and control application', () => {
    const h = rig(); h.grant();
    const check = h.gate.check;
    h.gate.check = () => { const sampled = check(); h.at(12000); return sampled; };
    h.authority.completeBootstrap();
    const cp = h.authority.checkpoint([]);
    expect(cp).toMatchObject({ phase: 'paused', pauseReason: 'session-fenced', controlRevision: 1 });
    expect(cp.snapshot.header.tick).toBe(0);
    expect(runReplay(LAYOUT, h.authority.replay(), __GAMEPLAY_CONTENT_DIGEST__).checkpoint).toEqual(cp);
    h.dispose();
  });
  it('records a fence from the final control callback without publishing Resume', () => {
    const publications: PublishedState[] = [];
    const h = rig({}, state => publications.push(state), message => {
      if (message.kind === 'result' && message.result.status === 'applied') h.gate.invalidate('service-fenced');
    });
    h.grant(); h.authority.completeBootstrap(); publications.length = 0;
    h.send(1, { kind: 'setPaused', paused: false }); h.pump();
    expect(publications.every(state => state.phase === 'paused')).toBe(true);
    const replay = h.authority.replay();
    expect(replay.frames).toContainEqual(expect.objectContaining({ action: { kind: 'controls', processedCount: 1, fenced: true } }));
    expect(runReplay(LAYOUT, replay, __GAMEPLAY_CONTENT_DIGEST__).checkpoint).toEqual(h.authority.checkpoint([])); h.dispose();
  });
  it.each(['invalidate', 'expire', 'reentrant-ingress'])('settles the remaining player controls when a result callback closes permission: %s', closure => {
    const outcomes: any[] = [], publications: PublishedState[] = [];
    const h = rig({}, state => publications.push(state), message => {
      if (message.kind !== 'result') return;
      outcomes.push(message.result);
      if (message.result.id.sequence !== 1 || message.result.status !== 'applied') return;
      if (closure === 'expire') h.at(12000); else h.gate.invalidate('service-fenced');
      if (closure === 'reentrant-ingress') h.send(3);
    });
    h.grant(); h.authority.completeBootstrap(); publications.length = 0;
    h.send(1, { kind: 'setPaused', paused: false }); h.send(2, { kind: 'setPaused', paused: false }); h.pump();
    expect(outcomes.find(r => r.id.sequence === 2)).toMatchObject({ status: 'rejected', reason: 'unavailable' });
    expect(publications.every(state => state.phase === 'paused')).toBe(true);
    const cp = h.authority.checkpoint([]);
    expect(cp.controlRevision).toBe(3); // bootstrap, first valid control, trusted fence pause
    expect(cp.phase).toBe('paused'); expect(cp.commandHighWater).toEqual([2]); expect(cp.snapshot.header.tick).toBe(0);
    const replay = h.authority.replay(); expect(replay.version).toBe(4);
    expect(replay.frames).toContainEqual(expect.objectContaining({ action: { kind: 'controls', processedCount: 1, fenced: true } }));
    expect(runReplay(LAYOUT, replay, __GAMEPLAY_CONTENT_DIGEST__).checkpoint).toEqual(cp);
    for (const version of [2, 3]) expect(() => parseReplay(LAYOUT, { ...replay, version }, __GAMEPLAY_CONTENT_DIGEST__)).toThrow();
    for (const extra of [{ processedCount: -1 }, { processedCount: 1.5 }, { processedCount: 99 }, { fenced: false }, { extra: 1 }]) {
      const bad = structuredClone(replay), frame = bad.frames.find(f => f.action.kind === 'controls' && 'fenced' in f.action)!;
      Object.assign(frame.action, extra); expect(() => runReplay(LAYOUT, bad, __GAMEPLAY_CONTENT_DIGEST__)).toThrow();
    }
    h.dispose();
  });
  it('rejects actual bot decisions queued before expiry without advancing bot held or command watermarks', () => {
    const h = rig(), client = createClientRun(h.pair.clientLink, [0], { runId: 'lease', resolveLayout: () => LAYOUT });
    const bot = createBotClient(0, client);
    try {
      h.grant(); h.authority.completeBootstrap(); h.authority.publishCompletedState(); h.transport.drain();
      client.send(bot.decide(0)); h.transport.drain(); h.at(17); h.pump();
      // A published unresolved event makes the real bot issue a vote command,
      // so this covers command admission as well as its ordinary held frame.
      h.state.run.event = 0; h.state.run.eventChoice = -1; h.state.run.vote.fill(-1);
      h.authority.publishCompletedState(); h.transport.drain();
      const before = h.authority.checkpoint([]); expect(before.heldHighWater[0]).toBeGreaterThan(0);
      const queued = bot.decide(h.state.tick); expect(queued.held).toHaveLength(1); expect(queued.commands.length).toBeGreaterThan(0); client.send(queued); h.transport.drain();
      h.at(12000); h.pump(); const after = h.authority.checkpoint([]);
      expect(after.snapshot.header.tick).toBe(before.snapshot.header.tick);
      expect(after.commandHighWater).toEqual(before.commandHighWater); expect(after.heldHighWater).toEqual(before.heldHighWater);
      expect(after.held).toEqual([{ moveX: 0, moveY: 0, interactHeld: false }]); expect(after.phase).toBe('paused');
    } finally { client.dispose(); h.dispose(); }
  });
  it('starts paused, rejects closed ingress and requires a useful grant for bootstrap', () => {
    const h = rig(); h.send(1, { kind: 'setPaused', paused: false }); h.at(5000); h.pump();
    expect(h.state.tick).toBe(0); expect(h.authority.checkpoint([]).commandHighWater).toEqual([0]);
    expect(() => h.authority.completeBootstrap()).toThrow(); h.grant(); h.authority.completeBootstrap(); h.at(5017); h.pump();
    expect(h.state.tick).toBe(1); expect(() => h.authority.completeBootstrap()).toThrow(); h.dispose();
  });
  it('settles admitted work, rejects queued Resume and neutralizes held state when expired', () => {
    const h = rig(); h.grant(); h.authority.completeBootstrap(); h.held(); h.send(1); h.pump();
    h.send(2, { kind: 'setPaused', paused: false }); h.at(12000); h.pump();
    const after = h.authority.checkpoint([]);
    expect(after.snapshot.header.tick).toBe(0); expect(after.commandHighWater).toEqual([1]);
    expect(after.held.every(v => v.moveX === 0 && v.moveY === 0 && !v.interactHeld)).toBe(true);
    expect(after.phase).toBe('paused'); expect(h.messages).toContainEqual(expect.objectContaining({ kind: 'result', result: expect.objectContaining({ id: { player: 0, sequence: 1 }, reason: 'unavailable' }) }));
    const replay = h.authority.replay(); expect(replay.frames.some(f => f.action.kind === 'lifecycle')).toBe(true);
    expect(() => runReplay(LAYOUT, replay, __GAMEPLAY_CONTENT_DIGEST__)).not.toThrow();
    h.dispose();
  });
  it('checks after a swallowed producer failure before consuming a catch-up tick', () => {
    let count = 0;
    const h = rig({ beforeTick() { if (++count === 3) { h.at(12000); throw Error('producer'); } } });
    h.grant(); h.authority.completeBootstrap(); h.at(5000); h.pump(); expect(h.state.tick).toBe(2);
    h.grant(); h.pump(); expect(h.state.tick).toBe(2); expect(h.authority.checkpoint([]).phase).toBe('paused');
    h.send(1, { kind: 'setPaused', paused: false }); h.pump(); expect(h.state.tick).toBe(2);
    h.at(12017); h.pump(); expect(h.state.tick).toBe(3); h.dispose();
  });
  it('preserves every tick of an ordinary five-second stall under a valid lease', () => {
    const h = rig(); h.grant(); h.authority.completeBootstrap(); h.at(5000); h.pump(); h.pump(); h.pump();
    expect(h.state.tick).toBe(300); h.dispose();
  });
  it('does not let player Resume bypass the initial checkpoint bootstrap latch', () => {
    const h = rig(); h.grant(); h.send(1, { kind: 'setPaused', paused: false }); h.at(100); h.pump();
    expect(h.state.tick).toBe(0); expect(h.authority.checkpoint([]).commandHighWater).toEqual([0]); h.dispose();
  });
  it('fails closed when a gate throws outside the swallowed producer callbacks', () => {
    let fail = false;
    const h = rig(); h.grant(); h.authority.completeBootstrap();
    const check = h.gate.check; h.gate.check = () => { if (fail) throw Error('clock'); return check(); };
    fail = true; h.at(100); h.pump(); expect(h.state.tick).toBe(0); expect(h.authority.checkpoint([]).phase).toBe('paused'); h.dispose();
  });
  it('defers reentrant fence cleanup until the completed tick and rejects deferred Resume', () => {
    let fenced = false;
    const h = rig({ beforeTick() { h.send(1, { kind: 'setPaused', paused: false }); } }, publication => {
      if (publication.tick !== 1 || fenced) return;
      fenced = true; h.gate.invalidate('service-fenced'); h.send(2);
    });
    h.grant(); h.authority.completeBootstrap(); h.at(100); h.pump();
    const cp = h.authority.checkpoint([]); expect(cp.snapshot.header.tick).toBe(1); expect(cp.phase).toBe('paused'); expect(cp.commandHighWater).toEqual([1]);
    expect(h.messages).toContainEqual(expect.objectContaining({ kind: 'result', result: expect.objectContaining({ id: { player: 0, sequence: 1 }, reason: 'unavailable' }) }));
    expect(() => runReplay(LAYOUT, h.authority.replay(), __GAMEPLAY_CONTENT_DIGEST__)).not.toThrow(); h.dispose();
  });
  it('does not consume the next tick when admission settlement closes permission', () => {
    const h = rig({ beforeTick() { h.send(1); } }, undefined, message => {
      if (message.kind === 'result' && message.result.status === 'already-processed') h.gate.invalidate('service-fenced');
    });
    h.grant(); h.authority.completeBootstrap();
    h.send(1); h.pump();
    h.at(100); h.pump();
    const cp = h.authority.checkpoint([]); expect(cp.phase).toBe('paused'); expect(cp.snapshot.header.tick).toBe(0); h.dispose();
  });
  it('continues trusted pause cleanup while closed without reopening gameplay', () => {
    let pause!: (control: { paused: boolean; reason: string }) => void;
    const h = rig({ bindLifecyclePause(callback) { pause = callback; } });
    h.pump(); pause({ paused: true, reason: 'suspend' }); h.pump();
    expect(h.authority.checkpoint([]).pauseReason).toBe('suspend');
    pause({ paused: false, reason: 'resume' }); h.pump(); expect(h.state.tick).toBe(0); h.dispose();
  });
});

it('tick preflight preserves the next ordinal; fenced reset alone discards debt', () => {
  let now = 0, allowed = true; const ticks: number[] = [];
  const driver = createTickDriver({ nowMs: () => now }, { schedule: () => () => {} }, tick => { ticks.push(tick); allowed = false; }, () => allowed);
  now = 5000; driver.pump(); expect(ticks).toEqual([0]); expect(driver.lagTicks()).toBe(299);
  driver.resetPausedEpoch(); expect(driver.lagTicks()).toBe(0); allowed = true; driver.pump(); expect(ticks).toEqual([0]);
  driver.setPaused(false); now = 5017; driver.pump(); expect(ticks).toEqual([0, 1]); driver.dispose();
});

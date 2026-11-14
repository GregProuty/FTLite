import { expect, it } from 'vitest';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { LAYOUT, makeState } from './helpers/sim';
import { ownTestCleanup } from './helpers/simLifetime';
import { createAuthority, type CrashRecord } from '../src/renderer/src/authority/authority';
import { validateCheckpoint } from '../src/renderer/src/authority/checkpoint';
import { runReplay } from '../src/renderer/src/authority/replay';
import { createLoopbackHarness } from '../src/renderer/src/net/loopback';
import { decodeMessage, encodeMessage } from '../src/renderer/src/net/codec';
import type { AuthorityMessage, ClientMessage, CommandEnvelope, Link } from '../src/renderer/src/net/contracts';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';

function rig(attachInitially = true) {
  const state = makeState(1), crashes: CrashRecord[] = [], closes: string[] = [], releases: string[] = [];
  const init = { runId: 'disconnect', seed: 1, playerCount: 1, characters: [], unlocked: [], contentDigest: __GAMEPLAY_CONTENT_DIGEST__, layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION };
  let now = 0, delayed = false, overflow: AuthorityMessage['kind'] | undefined, throwAfterOverflow = false;
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: init.contentDigest }, {
    impairment: ({ peer }) => ({ delayDrains: delayed && peer === pair.authorityLink.peer ? 1_000_000 : 0 })
  });
  const pair = transport.connectLocal();
  pair.clientLink.onClose(reason => closes.push(reason));
  // Keep the real byte queue, close notification, and capacity enforcement. Only
  // choose which authority send exhausts the queue, without thousands of pumps.
  const link: Link = {
    peer: pair.authorityLink.peer, caps: pair.authorityLink.caps,
    stats: () => pair.authorityLink.stats(), close: reason => pair.authorityLink.close(reason),
    onMessage(cb) { const off = pair.authorityLink.onMessage(cb); return () => { releases.push('message'); off(); }; },
    onClose(cb) { const off = pair.authorityLink.onClose(cb); return () => { releases.push('close'); off(); }; },
    send(kind, bytes) {
      if (overflow === decodeMessage(bytes).kind) {
        overflow = undefined; delayed = true;
        while (pair.authorityLink.stats().bufferedBytes < 1_048_576) {
          const size = Math.min(65_536, 1_048_576 - pair.authorityLink.stats().bufferedBytes);
          pair.authorityLink.send('reliable-ordered', new Uint8Array(size));
        }
        pair.authorityLink.send(kind, bytes);
        if (throwAfterOverflow) throw new Error('transport failed after close');
      } else pair.authorityLink.send(kind, bytes);
    }
  };
  const authority = createFixtureAuthority({ init, contentDigest: init.contentDigest, resolveLayout: () => LAYOUT, clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, onCrash: record => crashes.push(record) }, state);
  const attach = () => authority.attach(link, [0]);
  const detach = attachInitially ? attach() : () => {}; transport.drain();
  ownTestCleanup(() => { pair.host.close('done'); pair.client.close('done'); });
  const send = (message: ClientMessage) => { pair.clientLink.send('reliable-ordered', encodeMessage(message)); transport.drain(); };
  return { init, state, authority, transport, pair, attach, detach, crashes, closes, releases, send,
    command(sequence: number, command: CommandEnvelope['command'] = { kind: 'stand' }, requestedTick = state.tick) {
      send({ kind: 'command', envelope: { runId: init.runId, id: { player: 0, sequence }, requestedTick, command } });
    },
    held() { send({ kind: 'held', frame: { runId: init.runId, player: 0, tick: state.tick, sequence: 1, held: { moveX: 1, moveY: 0, interactHeld: true } } }); },
    overflow(kind: AuthorityMessage['kind'], fault = false) { overflow = kind; throwAfterOverflow = fault; },
    pump(time = now) { now = time; authority.pump(); transport.drain(); }
  };
}

function expectDetached(h: ReturnType<typeof rig>) {
  expect(h.crashes).toEqual([]);
  expect(h.closes).toEqual(['reliable-overflow']);
  expect(h.releases).toEqual(['message', 'close']);
  const replay = h.authority.replay();
  expect(replay.frames.filter(frame => frame.action.kind === 'detach')).toHaveLength(1);
  const checkpoint = h.authority.captureCheckpoint(); // Must have no orphan ledger entries before sealing.
  expect(checkpoint.held).toEqual([{ moveX: 0, moveY: 0, interactHeld: false }]);
  h.pair.authorityLink.close('again'); h.detach(); h.detach();
  expect(h.authority.replay()).toEqual(replay);
  expect(h.releases).toEqual(['message', 'close']);
  expect(runReplay(LAYOUT, replay, h.init.contentDigest).checkpoint).toEqual(checkpoint);
  return checkpoint;
}

it('finishes admission before detaching pending controls and later captured ingress on reliable overflow', () => {
  const h = rig(); h.held(); h.pump();
  h.command(1); h.command(2, { kind: 'setPaused', paused: true });
  h.command(3, { kind: 'stand' }, 99); // Rejection triggers the synchronous close.
  h.command(4); h.command(5, { kind: 'setPaused', paused: false });
  h.overflow('result'); h.pump();
  const cp = expectDetached(h);
  expect(cp.phase).toBe('running'); expect(cp.controlRevision).toBe(0);
  expect(cp.commandHighWater).toEqual([5]);
  expect(cp.recentResults.map(entry => [entry.result.id.sequence, entry.result.reason]).sort((a, b) => Number(a[0]) - Number(b[0])))
    .toEqual([[1, 'unavailable'], [2, 'unavailable'], [3, 'stale-tick'], [4, 'unavailable'], [5, 'unavailable']]);
  h.pump(17); expect(h.authority.captureCheckpoint().controlRevision).toBe(0);
});

it.each(['result', 'event', 'state'] as const)('detaches after the entire controls frame when its %s send overflows', kind => {
  const h = rig(); h.held(); h.pump();
  h.command(1); h.command(2, { kind: 'setPaused', paused: false }); h.command(3, { kind: 'setPaused', paused: false });
  h.overflow(kind); h.pump();
  const cp = expectDetached(h);
  expect(cp.controlRevision).toBe(2);
  expect(cp.recentResults.find(entry => entry.result.id.sequence === 1)?.result.reason).toBe('unavailable');
  expect(cp.recentResults.filter(entry => entry.result.status === 'applied').map(entry => entry.result.id.sequence)).toEqual([2, 3]);
  const frames = h.authority.replay().frames, index = frames.findIndex(frame => frame.action.kind === 'detach');
  expect(frames[index - 1]?.action.kind).toBe('controls');
  expect(frames[index - 1]?.after).toMatchObject({ phase: 'running', controlRevision: 2 });
});

it('finishes all frozen tick results before detaching and clears held input for subsequent ticks', () => {
  const h = rig(); h.held(); h.command(1); h.command(2);
  h.overflow('result'); h.pump(17);
  const cp = expectDetached(h);
  expect(cp.snapshot.header.tick).toBe(1); expect(cp.recentResults).toHaveLength(2);
  expect(cp.recentResults.every(entry => entry.result.reason !== 'unavailable')).toBe(true);
  h.pump(34);
  const tick = h.authority.replay().frames.at(-1)!;
  expect(tick.action.kind === 'tick' && tick.action.input.held).toEqual([{ moveX: 0, moveY: 0, interactHeld: false }]);
  expect(runReplay(LAYOUT, h.authority.replay(), h.init.contentDigest).checkpoint).toEqual(h.authority.captureCheckpoint());
});

it('flushes a queued detach even if the sending frame faults before completion', () => {
  const h = rig(); h.held(); h.pump(); h.command(1); h.command(2, { kind: 'stand' }, 99);
  h.overflow('result', true); h.pump();
  expect(h.crashes).toHaveLength(1); expect(h.crashes[0]!.error).toContain('transport failed after close');
  expect(h.releases).toEqual(['message', 'close']);
  const frames = h.authority.replay().frames;
  expect(frames.filter(frame => frame.action.kind === 'detach')).toHaveLength(1);
  expect(frames.find(frame => frame.action.kind === 'admission' && !frame.after)).toBeDefined();
  h.detach(); expect(h.authority.replay().frames).toEqual(frames);
});

it.each(['controls', 'tick'] as const)('finishes abandoned %s batch entries as unavailable when close is followed by a fault', boundary => {
  const h = rig(), command: CommandEnvelope['command'] = boundary === 'controls' ? { kind: 'setPaused', paused: false } : { kind: 'stand' };
  h.command(1, command); h.command(2, command);
  h.overflow('result', true); h.pump(boundary === 'tick' ? 17 : 0);
  expect(h.crashes).toHaveLength(1);
  const pair = h.transport.connectLocal(), output: AuthorityMessage[] = [];
  pair.clientLink.onMessage((_, bytes) => output.push(decodeMessage(bytes) as AuthorityMessage));
  h.authority.attach(pair.authorityLink, [0]);
  ownTestCleanup(() => { pair.host.close('done'); pair.client.close('done'); });
  pair.clientLink.send('reliable-ordered', encodeMessage({ kind: 'command', envelope: { runId: h.init.runId, id: { player: 0, sequence: 2 }, requestedTick: 0, command } }));
  h.transport.drain(); h.pump();
  expect(output.filter(message => message.kind === 'result').map(message => message.result))
    .toEqual([{ id: { player: 0, sequence: 2 }, tick: boundary === 'tick' ? 1 : 0, status: 'rejected', reason: 'unavailable' }]);
});

it.each(['admission', 'controls', 'seal'] as const)('unwinds a fault in checkpoint %s immediately and retains last-good recovery', boundary => {
  const h = rig(); h.held(); h.pump();
  const prefix = h.authority.replay(), completed = h.authority.captureCheckpoint();
  const command: CommandEnvelope['command'] = boundary === 'controls' ? { kind: 'setPaused', paused: false } : { kind: 'stand' };
  h.command(1, command); h.command(2, command, boundary === 'admission' ? 99 : 0);
  h.overflow('result', true);
  expect(() => h.authority.checkpoint([])).toThrow('transport failed after close');
  // Cleanup cannot depend on another pump, checkpoint attempt, or owner retry.
  expect(h.releases).toEqual(['message', 'close']);
  expect(h.closes).toEqual(['reliable-overflow']);
  expect(h.crashes).toHaveLength(1);
  const crash = h.crashes[0]!, after = h.authority.replay();
  expect(crash.checkpoint).toEqual(prefix.checkpoint);
  expect(crash.snapshotAfterFault).not.toBeNull();
  expect(crash.frames.find(frame => frame.action.kind === boundary && !frame.after)).toBeDefined();
  expect(crash.frames.filter(frame => frame.action.kind === 'detach')).toHaveLength(1);
  h.detach(); h.detach(); h.pair.authorityLink.close('again');
  expect(() => h.authority.checkpoint([])).toThrow(/fault/);
  expect(h.authority.replay()).toEqual(after);
  expect(h.releases).toEqual(['message', 'close']);
  expect(runReplay(LAYOUT, { ...prefix, frames: crash.frames.slice(0, prefix.frames.length) }, h.init.contentDigest).checkpoint).toEqual(completed);
  const pair = h.transport.connectLocal(), output: AuthorityMessage[] = [];
  pair.clientLink.onMessage((_, bytes) => output.push(decodeMessage(bytes) as AuthorityMessage));
  h.authority.attach(pair.authorityLink, [0]);
  ownTestCleanup(() => { pair.host.close('done'); pair.client.close('done'); });
  for (const sequence of [1, 2]) pair.clientLink.send('reliable-ordered', encodeMessage({ kind: 'command', envelope: {
    runId: h.init.runId, id: { player: 0, sequence }, requestedTick: boundary === 'admission' && sequence === 2 ? 99 : 0, command
  } }));
  h.transport.drain(); h.pump();
  expect(output.filter(message => message.kind === 'result').map(message => [message.result.status, message.result.reason]))
    .toEqual(boundary === 'controls' ? [['applied', undefined], ['rejected', 'unavailable']] : [['rejected', 'unavailable'], ['rejected', boundary === 'admission' ? 'stale-tick' : 'unavailable']]);
  const recovered = createAuthority({ contentDigest: h.init.contentDigest, resolveLayout: () => LAYOUT, clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash: record => { throw new Error(record.error); } });
  ownTestCleanup(() => recovered.dispose());
  recovered.restore(crash.checkpoint);
  expect(recovered.checkpoint([])).toMatchObject({ phase: 'paused', pauseReason: 'restore', snapshot: prefix.checkpoint.snapshot });
});

it('unwinds an initial attach publication fault before returning and releases ownership', () => {
  const h = rig(false), prefix = h.authority.replay();
  h.overflow('state', true);
  expect(() => h.attach()).toThrow('transport failed after close');
  expect(h.releases).toEqual(['message', 'close']);
  expect(h.closes).toEqual(['reliable-overflow']);
  expect(h.crashes).toHaveLength(1);
  const crash = h.crashes[0]!, after = h.authority.replay();
  expect(crash.checkpoint).toEqual(prefix.checkpoint);
  expect(crash.frames.find(frame => frame.action.kind === 'publish')?.after).toBeUndefined();
  expect(crash.frames.filter(frame => frame.action.kind === 'detach')).toHaveLength(1);
  expect(() => h.authority.checkpoint([])).toThrow(/fault/);
  h.pair.authorityLink.close('again'); expect(h.authority.replay()).toEqual(after);
  expect(runReplay(LAYOUT, { ...prefix, frames: crash.frames.filter(frame => frame.after) }, h.init.contentDigest).checkpoint).toEqual(prefix.checkpoint);
  const pair = h.transport.connectLocal();
  const off = h.authority.attach(pair.authorityLink, [0]); // The failed attach no longer owns the seat.
  off(); off(); pair.host.close('done'); pair.client.close('done');
  expect(h.releases).toEqual(['message', 'close']);
});

it('rejects faulted checkpoints without sealing partial state and resumes the last-good crash checkpoint', () => {
  const h = rig(); h.pump(17);
  const completed = h.authority.captureCheckpoint();
  // A failure inside stepCommands after a canonical write leaves well-shaped,
  // serializable partial state, rather than relying on snapshot validation.
  const clear = h.state.scratch.doorToggles.clear;
  h.state.scratch.doorToggles.clear = () => { h.state.hull--; throw new Error('injected partial tick'); };
  try { h.pump(34); } finally { h.state.scratch.doorToggles.clear = clear; }
  expect(h.crashes).toHaveLength(1);
  const crash = h.crashes[0]!;
  expect(crash.snapshotAfterFault).not.toBeNull(); expect(crash.snapshotAfterFault).not.toEqual(completed.snapshot);
  const before = h.authority.replay();
  expect(() => h.authority.checkpoint([])).toThrow(/fault|error/);
  expect(h.authority.replay()).toEqual(before);
  expect(runReplay(LAYOUT, { ...before, frames: before.frames.filter(frame => frame.after) }, h.init.contentDigest).checkpoint).toEqual(completed);
  h.detach(); h.pair.host.close('restore'); h.pair.client.close('restore'); h.authority.dispose();
  let now = 0;
  const recovered = createAuthority({ contentDigest: h.init.contentDigest, resolveLayout: () => LAYOUT, clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, onCrash: record => { throw new Error(record.error); } });
  ownTestCleanup(() => recovered.dispose());
  recovered.restore(crash.checkpoint);
  const pair = h.transport.connectLocal(), off = recovered.attach(pair.authorityLink, [0]); h.transport.drain();
  ownTestCleanup(() => { off(); pair.host.close('done'); pair.client.close('done'); });
  expect(recovered.checkpoint([]).phase).toBe('paused');
  pair.clientLink.send('reliable-ordered', encodeMessage({ kind: 'command', envelope: { runId: h.init.runId, id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'setPaused', paused: false } } }));
  h.transport.drain(); recovered.pump(); now = 17; recovered.pump();
  expect(recovered.checkpoint([]).snapshot).toEqual(completed.snapshot);
});

it('rejects a well-shaped external error-phase checkpoint', () => {
  const h = rig(), cp = h.authority.checkpoint([]); cp.phase = 'error';
  expect(() => validateCheckpoint(LAYOUT, cp, h.init.contentDigest)).toThrow();
});

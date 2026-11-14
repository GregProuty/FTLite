import { expect, it } from 'vitest';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { makeState, LAYOUT } from './helpers/sim';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import type { CrashRecord } from '../src/renderer/src/authority/authority';
import { runReplay } from '../src/renderer/src/authority/replay';
it('crash record carries complete init, a 300-tick checkpoint, publication cursor and the faulting semantic frame', () => {
  const state = makeState(1, 11, [0], { quirk: 2, unlocked: ['first-run'] }); let now = 0, crash: CrashRecord | undefined;
  const init = { runId: 'crash-v2', seed: 11, playerCount: 1, characters: [0], unlocked: ['first-run'], quirk: 2, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION };
  const core = createFixtureAuthority({ init, contentDigest: init.contentDigest, resolveLayout: () => LAYOUT, clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, onCrash(record) { crash = record; } }, state);
  for (let t = 1; t <= 305; t++) { now = t * 1000 / 60; core.pump(); }
  const completed = core.captureCheckpoint();
  (state as unknown as { rooms: null }).rooms = null; now = 306 * 1000 / 60; core.pump();
  expect(crash!.init).toEqual(init); expect(crash!.checkpoint.snapshot.header.tick).toBe(300); expect(crash!.ticks).toHaveLength(6);
  expect(crash!.lastPublishedSequence).toBe(305); expect(crash!.error).not.toBe('');
  const frames = crash!.frames.filter(frame => frame.after);
  const replay = { version: 2, init: crash!.init, initial: crash!.checkpoint.snapshot, checkpoint: crash!.checkpoint, frames };
  expect(runReplay(LAYOUT, replay, init.contentDigest).checkpoint).toEqual(completed);
  expect(crash!.frames.at(-1)!.action.kind).toBe('tick'); expect(crash!.frames.at(-1)!.after).toBeUndefined();
});
import { createLoopbackHarness } from '../src/renderer/src/net/loopback';
import { decodeMessage, encodeMessage } from '../src/renderer/src/net/codec';
import type { AuthorityMessage } from '../src/renderer/src/net/contracts';
it('acknowledges a deferred terminal control before emitting completion', () => {
  const state = makeState(1); state.hull = 0;
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ }), pair = transport.connectLocal();
  let now = 0; const output: AuthorityMessage[] = [];
  pair.clientLink.onMessage((_, bytes) => output.push(decodeMessage(bytes) as AuthorityMessage));
  const init = { runId: 'terminal-order', seed: 1, playerCount: 1, characters: [], unlocked: [], contentDigest: __GAMEPLAY_CONTENT_DIGEST__, layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION };
  const core = createFixtureAuthority({ init, contentDigest: init.contentDigest, resolveLayout: () => LAYOUT, clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, onCrash(r) { throw Error(r.error); }, beforeTick() {
    pair.clientLink.send('reliable-ordered', encodeMessage({ kind: 'command', envelope: { runId: init.runId, id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'setPaused', paused: true } } })); transport.drain();
  } }, state);
  core.attach(pair.authorityLink, [0]); transport.drain(); now = 17; core.pump(); transport.drain();
  const result = output.findIndex(m => m.kind === 'result'), ended = output.findIndex(m => m.kind === 'event' && m.event.payload.kind === 'ended');
  expect(result).toBeGreaterThan(-1); expect(result).toBeLessThan(ended);
  pair.host.close('done'); pair.client.close('done');
});

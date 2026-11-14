import { describe, expect, it } from 'vitest';
import { createHeadlessRunner } from '../src/renderer/src/headless/runner';
import { createFixtureRunner } from './helpers/authorityFixture';
import { NEUTRAL_FRAME } from '../src/renderer/src/clientControl/inputFrame';
import { Position } from '../src/renderer/src/sim/components';
import { hashState } from '../src/renderer/src/sim/hash';
import { LAYOUT, makeState, seatNavigator, run, intents, setEvent } from './helpers/sim';
import { navRows } from '../src/renderer/src/sim/run';
import { createSession } from '../src/renderer/src/app/session';
import type { SourceSample } from '../src/renderer/src/input/deviceManager';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { createLoopbackHarness } from '../src/renderer/src/net/loopback';
import { encodeMessage, decodeMessage } from '../src/renderer/src/net/codec';
import type { AuthorityMessage, ClientMessage } from '../src/renderer/src/net/contracts';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { stepCommands } from '../src/renderer/src/sim/step';
import type { CrashRecord } from '../src/renderer/src/authority/authority';
import fc from 'fast-check';
import { saveSnapshot, loadSnapshot } from '../src/renderer/src/sim/snapshot';
import { createLocalRuntime } from '../src/renderer/src/app/localRuntime';

function rig(beforeTick?: (tick: number) => void, onCrash: (record: CrashRecord) => void = (r) => { throw new Error(r.error); }) {
  const state = makeState(2), transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ });
  const pair = transport.connectLocal(); let now = 0;
  const messages: AuthorityMessage[] = [];
  pair.clientLink.onMessage((_, bytes) => messages.push(decodeMessage(bytes) as AuthorityMessage));
  const authority = createFixtureAuthority({ clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout: () => LAYOUT,
    onCrash, beforeControls: () => transport.drain(), beforeTick: (tick) => { beforeTick?.(tick); transport.drain(); },
    init: { runId: 'test', layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 1, playerCount: 2, characters: [], unlocked: [] }
  }, state);
  authority.attach(pair.authorityLink, [0]); transport.drain();
  return { state, messages, authority, pair, send(message: ClientMessage) { pair.clientLink.send(message.kind === 'held' ? 'unreliable-latest' : 'reliable-ordered', encodeMessage(message)); },
    tick() { now += 1000 / 60; authority.pump(); transport.drain(); }, dispose() { authority.dispose(); pair.host.close('done'); pair.client.close('done'); } };
}

const init = { layout: LAYOUT, playerCount: 1, seed: 1, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ };
describe('copied headless authority', () => {
  it('moves through bytes and restores a single replica in place', () => {
    const runner = createHeadlessRunner(init), view = runner.view(), eid = view.crew[0]!;
    const x = Position.x[eid]!;
    runner.advance([{ ...NEUTRAL_FRAME, moveX: 1 }]);
    expect(runner.view()).toBe(view); expect(Position.x[eid]).toBeGreaterThan(x);
    runner.dispose();
  });
  it('fixture publication observes mid-run seating without mutating the owner through its replica', () => {
    const owner = makeState(1), runner = createFixtureRunner(owner);
    const hash = hashState(owner); runner.view().hull = 1;
    expect(hashState(owner)).toBe(hash);
    runner.advance([]);
    const nav = seatNavigator(owner, 0);
    runner.refresh();
    expect(runner.view().stations.occupant[nav]).toBe(0);
    runner.advance([{ ...NEUTRAL_FRAME, confirmPresses: 1 }]);
    expect(owner.tick).toBe(2);
    runner.dispose();
  });
  it('preserves raw diagonal axes through exactly one consumer normalization', () => {
    for (const axis of [0.8, 0.7071067811865476, 0.7071067811865475]) {
      const state = makeState(1), reference = makeState(1), runner = createFixtureRunner(state), eid = state.crew[0]!;
      runner.advance([{ ...NEUTRAL_FRAME, moveX: axis, moveY: axis }]);
      stepCommands(reference, { held: [{ moveX: axis, moveY: axis, interactHeld: false }], commands: [], legacyCardInput: [] });
      expect(Number.isFinite(Position.x[eid])).toBe(true);
      expect(hashState(runner.view())).toBe(hashState(state));
      expect(hashState(state)).toBe(hashState(reference));
      expect(hashState(state)).toBe('03ef835a'); // independently captured from e2be3c3's original raw step
      runner.dispose();
    }
  });
  it('ticks without a client, and admits a producer during the beforeTick opportunity', () => {
    const h = rig((tick) => { if (tick === 1) h.send({ kind: 'held', frame: { runId: 'test', player: 0, tick, sequence: 1, held: { moveX: 1, moveY: 0, interactHeld: false } } }); });
    const x = Position.x[h.state.crew[0]!]!; h.tick(); expect(h.state.tick).toBe(1); expect(Position.x[h.state.crew[0]!]).toBe(x);
    h.tick(); expect(Position.x[h.state.crew[0]!]).toBeGreaterThan(x); h.dispose();
  });
  it('rejects wrong-run, unowned, stale and future held frames without replacing admitted input', () => {
    const h = rig(), eid = h.state.crew[0]!;
    const held = (tick: number, sequence: number, moveX: number, runId = 'test', player = 0): ClientMessage => ({ kind: 'held', frame: { runId, player, tick, sequence, held: { moveX, moveY: 0, interactHeld: false } } });
    h.send(held(0, 3, 1)); h.tick(); const x = Position.x[eid]!;
    h.send(held(1, 2, -1)); h.tick(); expect(Position.x[eid]).toBeGreaterThan(x);
    for (const message of [held(0, 4, -1), held(99, 5, -1), held(3, 6, -1, 'old'), held(3, 7, -1, 'test', 1)]) { const before = Position.x[eid]!; h.send(message); h.tick(); expect(Position.x[eid]).toBeGreaterThan(before); }
    h.pair.clientLink.close('disconnect'); const before = Position.x[eid]; h.tick(); expect(Position.x[eid]).toBe(before); h.dispose();
  });
  it('wrong-run commands reject without consuming the new run sequence', () => {
    const h = rig(); h.send({ kind: 'command', envelope: { runId: 'old', id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'moveTo', tile: 0 } } }); h.tick();
    expect(h.messages).toContainEqual({ kind: 'result', runId: 'test', result: { id: { player: 0, sequence: 1 }, tick: 0, status: 'rejected', reason: 'wrong-run' } });
    const publication = h.messages.filter((m) => m.kind === 'state').at(-1)!;
    if (publication.kind === 'state') expect(publication.state.commandHighWater).toEqual([0, 0]); h.dispose();
  });
  it('publishes fixture mutations after perTick setup before the card press', () => {
    const state = makeState(1); run(state, 1);
    run(state, 1, () => {
      const nav = seatNavigator(state, 0); setEvent(state, 4);
      state.stations.cursor[nav] = navRows(state).findIndex((row) => row.select === 'choice' && row.index === 0);
      return intents({ confirmPressed: true });
    });
    expect([state.run.vote[0], state.run.eventChoice]).toEqual([0, -1]);
  });
  it('the live app advances without render frames, and draw receives only a copied replica', () => {
    let now = 0, samples: SourceSample[] = [], drawn: ReturnType<typeof makeState> | null = null;
    const session = createSession({ layout: LAYOUT, now: () => now, sampleDevices: () => samples, saveCrash: () => {}, hud: null,
      renderer: { reset() {}, recordPrev() {}, draw(view) { drawn = view; } } });
    const sample = (extra: Partial<SourceSample>) => { samples = [{ key: 'a', moveX: 0, moveY: 0, interact: false, confirm: false, cancel: false, any: true, ...extra }]; };
    sample({ interact: true }); session.pump(); sample({}); session.pump(); sample({ confirm: true }); session.pump();
    const view = session.state!, eid = view.crew[0]!, x = Position.x[eid]!;
    sample({ moveX: 1 }); now += 1000 / 60; session.pump();
    expect(view.tick).toBe(1); expect(Position.x[eid]).toBeGreaterThan(x); expect(drawn).toBeNull();
    view.hull = 0; now += 1000 / 60; session.pump();
    expect(view.hull).toBeGreaterThan(0); expect(session.phase).toBe('running');
    const tick = view.tick; session.frame(); session.frame(); expect(drawn).toBe(view); expect(view.tick).toBe(tick);
    session.dispose();
  });
  it('journals control ordering, their results, admission watermarks and the faulting frame', () => {
    let crash: CrashRecord | null = null;
    const h = rig(undefined, (record) => { crash = record; });
    const control = (sequence: number, paused: boolean): ClientMessage => ({ kind: 'command', envelope: { runId: 'test', id: { player: 0, sequence }, requestedTick: 0, command: { kind: 'setPaused', paused } } });
    h.send(control(1, true)); h.tick(); expect(h.state.tick).toBe(0);
    h.send(control(2, false)); h.tick(); expect(h.state.tick).toBe(0);
    h.send({ kind: 'command', envelope: { runId: 'test', id: { player: 0, sequence: 3 }, requestedTick: 0, command: { kind: 'moveTo', tile: 0 } } }); h.tick();
    (h.state as unknown as { rooms: null }).rooms = null; h.tick();
    expect(crash).not.toBeNull(); const journal = crash as unknown as CrashRecord;
    expect(journal.baselineHighWater).toEqual([0, 0]);
    expect(journal.ticks.map((tick) => tick.tick)).toEqual([0, 1]);
    expect(journal.ticks[0]!.controls.map((command) => command.id.sequence)).toEqual([1, 2]);
    expect(journal.ticks[0]!.results.map((result) => result.id.sequence)).toEqual([1, 2, 3]);
    expect(journal.ticks[1]!.results).toEqual([]);
    h.dispose();
  });
  it('valid hardware frames preserve snapshot continuation through the byte path', () => {
    const frame = fc.record({ moveX: fc.double({ min: -1, max: 1, noNaN: true }), moveY: fc.double({ min: -1, max: 1, noNaN: true }),
      interactHeld: fc.boolean(), interactPresses: fc.integer({ min: 0, max: 1 }), confirmPresses: fc.integer({ min: 0, max: 1 }), cancelPresses: fc.integer({ min: 0, max: 1 }) });
    fc.assert(fc.property(fc.array(frame, { minLength: 2, maxLength: 16 }), (frames) => {
      const owner = makeState(1), live = createFixtureRunner(owner), split = Math.floor(frames.length / 2);
      for (const input of frames.slice(0, split)) live.advance([input]);
      const restored = loadSnapshot(LAYOUT, saveSnapshot(owner)), resumed = createFixtureRunner(restored);
      for (const input of frames.slice(split)) { live.advance([input]); resumed.advance([input]); }
      expect(hashState(restored)).toBe(hashState(owner)); live.dispose(); resumed.dispose();
    }), { numRuns: 20 });
  });
  it('reconciles same-drain pause/resume to the authoritative pause-wins publication', () => {
    let samples: SourceSample[] = [];
    const session = createSession({ layout: LAYOUT, now: () => 0, sampleDevices: () => samples, saveCrash: () => {}, renderer: null, hud: null });
    const sample = (confirm: boolean, interact: boolean) => { samples = [{ key: 'a', moveX: 0, moveY: 0, interact, confirm, cancel: false, any: true }]; };
    sample(false, true); session.pump(); sample(false, false); session.pump(); sample(true, false); session.pump(); sample(false, false);
    session.pause(); session.resume(); session.pump();
    expect(session.phase).toBe('paused'); expect(session.state!.tick).toBe(0);
    session.resume(); session.pump(); expect(session.phase).toBe('running'); session.dispose();
  });
  it('notifies only new publications while delivering control-only publications at the same tick', () => {
    let count = 0;
    const runtime = createLocalRuntime({ layout: LAYOUT, playerCount: 1, seed: 1, characters: [0], unlocked: [], runId: 'notify', contentDigest: __GAMEPLAY_CONTENT_DIGEST__,
      clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, frames: () => [], onCrash: () => {}, onPublication: () => { count++; } });
    expect(count).toBe(1); runtime.pump(); runtime.pump(); expect(count).toBe(1);
    runtime.requestPause(true); runtime.pump(); expect(count).toBe(2); expect(runtime.publication()!.phase).toBe('paused');
    runtime.pump(); expect(count).toBe(2); runtime.dispose();
  });
  it.each(['ended', 'error'] as const)('keeps %s terminal and caches a rejected resume without replaying terminal effects', (phase) => {
    const crashes: CrashRecord[] = [], h = rig(undefined, (record) => crashes.push(record));
    if (phase === 'ended') h.state.hull = 0;
    else (h.state as unknown as { rooms: null }).rooms = null;
    h.tick();
    const endedBefore = h.messages.filter((message) => message.kind === 'event' && message.event.payload.kind === 'ended').length;
    const crashesBefore = crashes.length;
    const resume: ClientMessage = { kind: 'command', envelope: { runId: 'test', id: { player: 0, sequence: 1 }, requestedTick: h.state.tick, command: { kind: 'setPaused', paused: false } } };
    h.send(resume); h.tick(); h.send(resume); h.tick(); h.tick();
    const results = h.messages.filter((message) => message.kind === 'result');
    expect(results).toHaveLength(2);
    for (const message of results) expect(message).toMatchObject({ result: { id: { player: 0, sequence: 1 }, status: 'rejected', reason: 'unavailable' } });
    expect(h.messages.filter((message) => message.kind === 'event' && message.event.payload.kind === 'ended')).toHaveLength(endedBefore);
    expect(crashes).toHaveLength(crashesBefore);
    h.dispose();
  });
});

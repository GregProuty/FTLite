import { expect, it, vi } from 'vitest';
import { createLoopbackHarness } from '../src/renderer/src/net/loopback';
import { createClientRun } from '../src/renderer/src/clientControl/clientRun';
import { encodeMessage } from '../src/renderer/src/net/codec';
import { createFixtureAuthority, createFixtureRunner } from './helpers/authorityFixture';
import { LAYOUT, makeState } from './helpers/sim';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { saveSnapshot } from '../src/renderer/src/sim/snapshot';
import { hashState } from '../src/renderer/src/sim/hash';
import { Life, LifeState } from '../src/renderer/src/sim/components';
import type { AuthorityEvent, PublishedState } from '../src/renderer/src/net/contracts';
import { createSession } from '../src/renderer/src/app/session';
import { createSimState, type SimState } from '../src/renderer/src/sim/state';
import { decodeMessage } from '../src/renderer/src/net/codec';
import { downCrew } from '../src/renderer/src/sim/crew';
import type { SourceSample } from '../src/renderer/src/input/deviceManager';
import { bubbles, flashingKinds } from '../src/renderer/src/render/calloutModel';
import { calloutIcon } from '../src/renderer/src/events/callout';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { NEUTRAL_FRAME } from '../src/renderer/src/clientControl/inputFrame';

function rig() {
  const state = makeState(2), runId = 'events', contentDigest = __GAMEPLAY_CONTENT_DIGEST__;
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest });
  const pair = transport.connectLocal(), client = createClientRun(pair.clientLink, [0], { runId, resolveLayout: () => LAYOUT });
  let now = 0;
  const authority = createFixtureAuthority({ clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, contentDigest, resolveLayout: () => LAYOUT, onCrash(r) { throw Error(r.error); },
    init: { runId, layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION, contentDigest, seed: 1, playerCount: 2, characters: [], unlocked: [] } }, state);
  authority.attach(pair.authorityLink, [0]); transport.drain();
  return { state, client, pair, transport, authority,
    pump(at = now) { now = at; transport.drain(); authority.pump(); transport.drain(); },
    call(sequence: number, player = 0, run = runId) { pair.clientLink.send('reliable-ordered', encodeMessage({ kind: 'callout', runId: run, player, sequence, calloutKind: 'contextual' })); },
    dispose() { authority.dispose(); client.dispose(); pair.host.close('done'); pair.client.close('done'); }
  };
}
it('headless consumers drain ephemeral events throughout a long cue-producing run', () => {
  const state = makeState(1), runner = createFixtureRunner(state);
  for (let i = 0; i < 1100; i++) { state.telemetry.shots++; runner.advance([NEUTRAL_FRAME]); }
  expect(runner.view().tick).toBe(1100); runner.dispose();
});
it('resolves callouts once, validates ownership/run/sequence, allows Downed and excludes Dead without changing canonical state', () => {
  const h = rig(); Life.state[h.state.crew[0]!] = LifeState.Downed; h.authority.publishCompletedState(); h.transport.drain();
  const before = hashState(h.state);
  h.call(1, 1); h.call(1, 0, 'old'); h.call(1); h.call(1); h.pump();
  expect(hashState(h.state)).toBe(before);
  const events = h.client.takeEvents(); expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ runId: 'events', tick: 0, eventSequence: 1, payload: { kind: 'callout', player: 0, text: 'Help!', station: null } });
  Life.state[h.state.crew[0]!] = LifeState.Dead; h.call(2); h.pump(); expect(h.client.takeEvents()).toEqual([]); h.dispose();
});
it('buffers future events until matching state, deduplicates events, and drops old-run events', () => {
  const h = rig();
  const event: AuthorityEvent = { runId: 'events', eventSequence: 1, tick: 2, payload: { kind: 'cue', cue: 'shot' } };
  for (const value of [event, event, { ...event, runId: 'old', eventSequence: 2 }]) h.pair.authorityLink.send('reliable-ordered', encodeMessage({ kind: 'event', event: value }));
  h.transport.drain(); expect(h.client.takeEvents()).toEqual([]);
  h.pump(34); expect(h.client.takeEvents()).toEqual([event]); h.dispose();
});
it('does not replay startup ephemeral history', () => {
  const h = rig(); h.client.dispose();
  const client = createClientRun(h.pair.clientLink, [0], { runId: 'events', resolveLayout: () => LAYOUT });
  const publication: PublishedState = { ...h.client.publication()!, publicationSequence: 2, eventSequence: 4, snapshot: saveSnapshot(h.state) };
  h.pair.authorityLink.send('unreliable-latest', encodeMessage({ kind: 'state', state: publication }));
  h.pair.authorityLink.send('reliable-ordered', encodeMessage({ kind: 'event', event: { runId: 'events', eventSequence: 3, tick: 0, payload: { kind: 'cue', cue: 'shot' } } }));
  h.transport.drain(); expect(client.takeEvents()).toEqual([]); client.dispose(); h.dispose();
});
it('coalesces callout requests and preserves contextual power flashes and the exact three-second lifetime', () => {
  const h = rig(), station = h.state.derived.stationOfKind[StationKind.Navigation]!;
  sitDown(h.state, 0, station); h.state.stations.level[station] = 0;
  const before = hashState(h.state); h.call(1); h.call(3); h.call(2); h.pump();
  const events = h.client.takeEvents(); expect(events).toHaveLength(1);
  const payload = events[0]!.payload; if (payload.kind !== 'callout') throw Error('expected callout');
  expect(payload).toMatchObject({ text: 'Power to Navigation!', station: StationKind.Navigation });
  expect(hashState(h.state)).toBe(before);
  const callouts = [{ pid: payload.player, tick: events[0]!.tick, text: payload.text, icon: calloutIcon(payload.text), flash: payload.station }];
  expect(bubbles(h.state, callouts, 179)).toContainEqual({ pid: 0, text: payload.text, icon: 'icon.power' });
  expect(bubbles(h.state, callouts, 180)).toEqual([]); expect(flashingKinds(callouts, 179)).toEqual([StationKind.Navigation]); expect(flashingKinds(callouts, 180)).toEqual([]);
  h.dispose();
});
it('emits reliable cue and pause IDs from authority with no startup cue replay', () => {
  const h = rig(); expect(h.client.takeEvents()).toEqual([]);
  h.state.telemetry.shots++; h.state.telemetry.impacts++; h.pump(17);
  expect(h.client.takeEvents().map(e => [e.eventSequence, e.tick, e.payload])).toEqual([[1, 1, { kind: 'cue', cue: 'impact' }], [2, 1, { kind: 'cue', cue: 'shot' }]]);
  h.client.send({ held: [], commands: [{ runId: 'events', id: { player: 0, sequence: 1 }, requestedTick: 1, command: { kind: 'setPaused', paused: true } }] }); h.pump();
  expect(h.client.takeEvents()).toEqual([{ runId: 'events', eventSequence: 3, tick: 1, payload: { kind: 'pause', paused: true, owner: 0, reason: 'player' } }]); h.dispose();
});
it('bounds unavailable future event history and requests a reset by closing the link', () => {
  const h = rig(), closed = vi.fn(); h.pair.clientLink.onClose(closed);
  for (let sequence = 1; sequence <= 1025; sequence++) {
    h.pair.authorityLink.send('reliable-ordered', encodeMessage({ kind: 'event', event: { runId: 'events', eventSequence: sequence, tick: 9999, payload: { kind: 'cue', cue: 'shot' } } })); h.transport.drain();
  }
  expect(closed).toHaveBeenCalledWith('event-history-unavailable'); h.dispose();
});
it.each([false, true])('applies one completion despite duplicate delivery, failing storage and final latest loss=%s; rendering never advances authority', (dropFinalLatest) => {
  let now = 0, samples: SourceSample[] = [], owner: SimState | null = null;
  const saveProgress = vi.fn(() => { throw Error('storage full'); }), saveTelemetry = vi.fn(() => { throw Error('storage full'); }), cues: string[] = [];
  const session = createSession({ layout: LAYOUT, now: () => now, sampleDevices: () => samples, renderer: null, hud: null, saveCrash() { throw Error('unexpected crash'); }, saveProgress, saveTelemetry, playCue(cue) { cues.push(cue); }, authorityFactory(deps) {
    let core: ReturnType<typeof createFixtureAuthority>, attachment: Parameters<typeof core.attach>;
    return { attach(...args) { attachment = args; const link = args[0], send = link.send.bind(link); link.send = (channel, bytes) => { if (dropFinalLatest && owner?.ended && channel === 'unreliable-latest') return; send(channel, bytes); const message = decodeMessage(bytes); if (message.kind === 'event') send(channel, bytes); }; return () => {}; },
      start(init) { owner = createSimState(LAYOUT, init.playerCount, init.seed); core = createFixtureAuthority({ ...deps, init }, owner); core.attach(...attachment); }, pump() { core.pump(); }, dispose() { core.dispose(); } };
  } });
  const sample = (interact = false, confirm = false) => { samples = [{ key: 'a', moveX: 0, moveY: 0, interact, confirm, cancel: false, any: true }]; session.pump(); };
  sample(true); sample(); sample(false, true); sample();
  now = 5000; for (let i = 0; i < 5; i++) session.frame(); expect(session.state!.tick).toBe(0);
  // Multiple authority transitions are collected before a render; playback keeps global priority.
  owner!.telemetry.shots++; session.pump(); owner!.telemetry.impacts++; session.pump();
  downCrew(owner!, 0); session.pump(); session.frame();
  expect(session.phase).toBe('gameover'); expect(saveProgress).toHaveBeenCalledTimes(1); expect(saveTelemetry).toHaveBeenCalledTimes(1);
  expect(cues).toEqual(['impact', 'shot', 'defeat']);
  session.pump(); session.frame(); expect(saveProgress).toHaveBeenCalledTimes(1); expect(cues.filter(c => c === 'defeat')).toHaveLength(1);
  session.dispose();
});

import { expect, it } from 'vitest';
import { checkpointRig } from './helpers/checkpointRig';
import { LAYOUT } from './helpers/sim';
import { runReplay, parseReplay } from '../src/renderer/src/authority/replay';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { encodeMessage } from '../src/renderer/src/net/codec';

const moving: HeldInput = { moveX: 1, moveY: 0, interactHeld: true };
const neutral: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
it('replays explicit exit-capture settlement and retains terminal producer watermarks', async () => {
  const h = rig(); held(h, 1);
  h.send({ kind: 'command', envelope: { runId: h.init.runId, id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'stand' } } }); h.pump();
  const captured = await h.authority.requestCheckpoint('exit'); h.drain();
  expect(captured.checkpoint).toMatchObject({ phase: 'paused', commandHighWater: [1], heldHighWater: [1], held: [neutral] });
  expect(h.output.filter(m => m.kind === 'result').at(-1)!.result).toMatchObject({ id: { player: 0, sequence: 1 }, reason: 'unavailable' });
  const replay = h.authority.replay(), actual = runReplay(LAYOUT, replay, h.init.contentDigest, undefined, { retainFrames: true });
  expect(actual.frames).toEqual(replay.frames); expect(actual.checkpoint).toEqual(captured.checkpoint);
});
it.each([2, 3] as const)('preserves a pending trusted Resume across an ordinary legacy v%i seal', version => {
  const h = checkpointRig(), base = h.authority.replay();
  const frame = (action: unknown) => ({ tick: 0, eventSequenceBefore: 0, action, results: [], events: [] });
  const replay = { ...base, version, frames: [...base.frames,
    frame({ kind: 'lifecycle', order: 1, ordinal: 1, control: { paused: false, reason: 'trusted-resume' } }),
    frame({ kind: 'seal' }), frame({ kind: 'controls' })] };
  const result = runReplay(LAYOUT, replay, h.init.contentDigest);
  expect(result.checkpoint).toMatchObject({ phase: 'running', controlRevision: 1, lifecycleOrdinal: 1 });
});
it.each([2, 3] as const)('retains v%i playback when explicitly upgrading its unchanged action journal to v4', version => {
  const h = version === 2 ? checkpointRig() : rig();
  h.send({ kind: 'command', envelope: { runId: h.init.runId, id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'setPaused', paused: true } } }); h.pump();
  const legacy = h.authority.replay(); expect(legacy.version).toBe(version);
  const upgraded = { ...legacy, version: 4 as const };
  expect(runReplay(LAYOUT, upgraded, h.init.contentDigest)).toEqual(runReplay(LAYOUT, legacy, h.init.contentDigest));
  const controls = upgraded.frames.find(f => f.action.kind === 'controls')!;
  for (const action of [{ kind: 'controls', processedCount: 0 }, { kind: 'controls', fenced: true }]) {
    expect(() => parseReplay(LAYOUT, { ...upgraded, frames: [{ ...controls, action }] }, h.init.contentDigest)).toThrow(/control fence/);
  }
});
function rig() { const h = checkpointRig(); h.detach(); h.authority.attach(h.pair.authorityLink, [0], { admissionPolicy: 'receive-time' }); h.drain(); return h; }
function held(h: ReturnType<typeof rig>, sequence: number, value = moving, tick = 0) { h.send({ kind: 'held', frame: { runId: h.init.runId, player: 0, sequence, tick, held: value } }); }
it('expires remote held at 250ms and replays explicit watchdog effects without wall time', () => {
  const h = rig(); held(h, 1); h.pump(249);
  expect(h.authority.checkpoint([]).held).toEqual([moving]);
  h.pump(250); expect(h.authority.checkpoint([]).held).toEqual([neutral]);
  const replay = h.authority.replay(); expect(replay.version).toBe(3);
  expect(replay.frames.some(f => f.action.kind === 'watchdog')).toBe(true);
  const actual = runReplay(LAYOUT, replay, h.init.contentDigest, undefined, { retainFrames: true });
  expect(actual.checkpoint).toEqual(h.authority.checkpoint([]));
  expect(actual.frames).toEqual(replay.frames);
});
it('expires seats independently and never expires strict local producers', () => {
  const h = checkpointRig(3); h.detach(); h.authority.attach(h.pair.authorityLink, [0], { admissionPolicy: 'receive-time' });
  const remotePair = h.transport.connectLocal(), localPair = h.transport.connectLocal();
  h.authority.attach(remotePair.authorityLink, [1], { admissionPolicy: 'receive-time' }); h.authority.attach(localPair.authorityLink, [2]);
  try {
    held(h, 1); localPair.clientLink.send('reliable-ordered', encodeMessage({ kind: 'held', frame: { runId: h.init.runId, player: 2, tick: 0, sequence: 1, held: moving } })); h.drain(); h.pump(100);
    remotePair.clientLink.send('reliable-ordered', encodeMessage({ kind: 'held', frame: { runId: h.init.runId, player: 1, tick: 0, sequence: 1, held: moving } })); h.drain(); h.pump(250);
    expect(h.authority.checkpoint([]).held).toEqual([neutral, moving, moving]);
    h.pump(350); expect(h.authority.checkpoint([]).held).toEqual([neutral, neutral, moving]);
    const replay = h.authority.replay(), actual = runReplay(LAYOUT, replay, h.init.contentDigest, undefined, { retainFrames: true });
    expect(actual.frames).toEqual(replay.frames); expect(actual.checkpoint).toEqual(h.authority.checkpoint([]));
  } finally { remotePair.host.close('done'); remotePair.client.close('done'); localPair.host.close('done'); localPair.client.close('done'); }
});
it('uses the inclusive held tick age window and rejects older, duplicate and future frames', () => {
  const h = rig(); h.pump(2000); // 120 ticks, no held receipt yet
  held(h, 1); h.pump(); expect(h.authority.checkpoint([]).held).toEqual([moving]);
  h.pump(2017); held(h, 2, neutral); held(h, 3, neutral, 999); held(h, 1, neutral, 121); h.pump();
  expect(h.authority.checkpoint([]).held).toEqual([moving]); expect(h.authority.checkpoint([]).heldHighWater).toEqual([1]);
  held(h, 4, neutral, 121); h.pump(); expect(h.authority.checkpoint([]).held).toEqual([neutral]);
});
it('validates replay mapping and watchdog shapes before execution', () => {
  const h = rig(); held(h, 1); h.pump(250); const replay = h.authority.replay();
  const wrongTick = structuredClone(replay), admission = wrongTick.frames.find(f => f.action.kind === 'admission')!;
  if (admission.action.kind === 'admission') admission.action.entries[0]!.effectiveTick = 1;
  expect(() => parseReplay(LAYOUT, wrongTick, h.init.contentDigest)).toThrow(/effective tick/);
  const wrongPlayer = structuredClone(replay), watchdog = wrongPlayer.frames.find(f => f.action.kind === 'watchdog')!;
  if (watchdog.action.kind === 'watchdog') watchdog.action.players = [1];
  expect(() => parseReplay(LAYOUT, wrongPlayer, h.init.contentDigest)).toThrow(/watchdog/);
  const wrongExecution = structuredClone(replay), tick = wrongExecution.frames.find(f => f.action.kind === 'tick')!;
  if (tick.action.kind === 'tick') tick.action.input.commands = [{ runId: h.init.runId, id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'stand' } }];
  expect(() => runReplay(LAYOUT, wrongExecution, h.init.contentDigest)).toThrow(/action divergence/);
});
it('does not renew receipt time for duplicate/stale frames and permits a resumed producer', () => {
  const h = rig(); held(h, 1); h.pump(200); held(h, 1); held(h, 2, moving, 999); h.pump(250);
  expect(h.authority.checkpoint([]).held).toEqual([neutral]);
  held(h, 3, moving, 0); h.pump(); expect(h.authority.checkpoint([]).held).toEqual([moving]);
  held(h, 4, neutral, 0); h.pump(); expect(h.authority.checkpoint([]).held).toEqual([neutral]);
});
it('records original envelopes, binding policy and effective execution ticks', () => {
  const h = rig(); h.pump(17);
  h.send({ kind: 'command', envelope: { runId: h.init.runId, id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'stand' } } }); h.pump(34);
  const replay = h.authority.replay(); expect(replay.version).toBe(3);
  const admission = replay.frames.find(f => f.action.kind === 'admission')!;
  expect(admission.action).toMatchObject({ entries: [{ admissionPolicy: 'receive-time', effectiveTick: 1, message: { envelope: { requestedTick: 0 } } }] });
  const actual = runReplay(LAYOUT, replay, h.init.contentDigest, undefined, { retainFrames: true });
  expect(actual.frames).toEqual(replay.frames); expect(actual.checkpoint).toEqual(h.authority.checkpoint([]));
  const bad = structuredClone(replay); bad.version = 2;
  expect(() => parseReplay(LAYOUT, bad, h.init.contentDigest)).toThrow();
});
it('replays a watchdog transition after baseline rotation with unchanged checkpoint v2', () => {
  const h = rig(); h.pump(4984); h.pump(); h.pump();
  held(h, 1, moving, 299); h.pump(5000); h.pump(5234);
  const replay = h.authority.replay(), checkpoint = h.authority.checkpoint([]);
  expect(replay.initial.header.tick).toBe(300); expect(replay.checkpoint.checkpointVersion).toBe(2);
  expect(replay.checkpoint.held).toEqual([moving]); expect(checkpoint.held).toEqual([neutral]);
  const actual = runReplay(LAYOUT, replay, h.init.contentDigest, undefined, { retainFrames: true });
  expect(actual.checkpoint).toEqual(checkpoint); expect(actual.frames).toEqual(replay.frames);
});
it.each(['admission', 'watchdog', 'result'] as const)('rejects isolated v3 %s metadata in a v2 replay', kind => {
  const h = checkpointRig(), replay = h.authority.replay(), frame = replay.frames[0]!;
  expect(replay.version).toBe(2);
  if (kind === 'watchdog') frame.action = { kind: 'watchdog', players: [0] };
  else if (kind === 'result') frame.results = [{ id: { player: 0, sequence: 1 }, tick: 0, status: 'applied', admission: { expectedSequence: 2, disposition: 'terminal' } }];
  else frame.action = { kind: 'admission', entries: [{ binding: 1, players: [0], order: 1, admissionPolicy: 'receive-time', effectiveTick: 0,
    message: { kind: 'held', frame: { runId: h.init.runId, player: 0, tick: 0, sequence: 1, held: moving } } }] };
  expect(() => parseReplay(LAYOUT, replay, h.init.contentDigest)).toThrow();
});
it.each([2, 3] as const)('rejects response metadata in replay v%i checkpoint baselines before parsing or execution', version => {
  const h = checkpointRig();
  h.send({ kind: 'command', envelope: { runId: h.init.runId, id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'stand' } } }); h.pump(17);
  const checkpoint = h.authority.checkpoint([]);
  checkpoint.recentResults[0]!.result.admission = { expectedSequence: 999, disposition: 'retryable' };
  const replay = { version, init: checkpoint.init, initial: checkpoint.snapshot, checkpoint, frames: [] };
  expect(() => parseReplay(LAYOUT, replay, h.init.contentDigest)).toThrow(/admission/);
  expect(() => runReplay(LAYOUT, replay, h.init.contentDigest)).toThrow(/admission/);
});

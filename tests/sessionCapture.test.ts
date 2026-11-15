import { describe, expect, it } from 'vitest';
import { createAuthority, type AuthorityDeps, type Checkpoint } from '../src/renderer/src/authority/authority';
import { sectorMode } from '../src/network/modes/sector';
import { createUtilityHost } from '../src/network/utilityHost';
import { createModeRegistry } from '../src/network/modes/registry';
import { createLoopbackHarness } from '../src/renderer/src/net/loopback';
import { encodeMessage, decodeMessage } from '../src/renderer/src/net/codec';
import { runReplay } from '../src/renderer/src/authority/replay';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { LAYOUT } from './helpers/sim';
import type { AuthorityMessage, LifecyclePause } from '../src/renderer/src/net/contracts';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { makeState, wake } from './helpers/sim';
import { beaconIndex, reachable } from '../src/renderer/src/sim/run';
import { createHostRuntime } from '../src/network/hostRuntime';
import type { ModeDefinition } from '../src/network/modes/contracts';
import type { ModeCheckpoint } from '../src/shared/sessionCheckpoint';

const init = { runId: 'capture', seed: 7, playerCount: 1, characters: [0], unlocked: [], layoutId: LAYOUT.id,
  layoutHash: deriveLayout(LAYOUT).layoutHash, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ };
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
function rig(captures = true, extra: Partial<AuthorityDeps> = {}, onPublication?: (tick: number) => void) {
  let now = 0, control!: (value: LifecyclePause) => void;
  const candidates: { checkpoint: Checkpoint; cause: string }[] = [], output: AuthorityMessage[] = [];
  const authority = createAuthority({ clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, contentDigest: init.contentDigest,
    resolveLayout: () => LAYOUT, onCrash(r) { throw Error(r.error); }, bindLifecyclePause(cb) { control = cb; },
    ...(captures ? { onCheckpoint(checkpoint: Checkpoint, cause: string) { candidates.push({ checkpoint, cause }); } } : {}), ...extra });
  authority.start(init);
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: init.contentDigest });
  const pair = transport.connectLocal(); pair.clientLink.onMessage((_, data) => output.push(decodeMessage(data) as AuthorityMessage));
  authority.attach(pair.authorityLink, [0], { publicationSink(state) {
    // Input arrives synchronously during publication at each periodic boundary.
    if (state.tick === 300 || state.tick === 600) send(state.tick / 300, state.tick);
    onPublication?.(state.tick);
  } });
  function send(sequence: number, tick: number, command: any = { kind: 'stand' }) {
    pair.clientLink.send('reliable-ordered', encodeMessage({ kind: 'command', envelope: { runId: init.runId,
      id: { player: 0, sequence }, requestedTick: tick, command } })); transport.drain();
  }
  return { authority, candidates, output, send,
    pump(time = now) { now = time; authority.pump(); transport.drain(); },
    pause() { control({ paused: true, reason: 'capture-test' }); authority.pump(); transport.drain(); },
    dispose() { authority.dispose(); pair.host.close('done'); pair.client.close('done'); } };
}
describe('completed session captures', () => {
  it('fulfills a reentrant publication request only after the tick journal completes', async () => {
    let request: ReturnType<ReturnType<typeof rig>['authority']['requestCheckpoint']> | undefined;
    const h = rig(true, {}, tick => { if (tick === 1) request = h.authority.requestCheckpoint('safe-point'); });
    try {
      h.pump(17); expect(request).toBeDefined();
      const captured = await request!;
      expect(captured.checkpoint.snapshot.header.tick).toBe(1);
      expect(h.authority.replay().frames.find(f => f.action.kind === 'tick')!.after?.tick).toBe(1);
      expect(runReplay(LAYOUT, h.authority.replay(), init.contentDigest).checkpoint).toEqual(captured.checkpoint);
    } finally { h.dispose(); }
  });
  it('captures and replays a closed lease pause after pending commands settle', async () => {
    let allowed = true;
    const h = rig(true, { sessionGate: { check: () => ({ allowed, revision: allowed ? 1 : 2, reason: allowed ? null : 'lease-expired' }) } });
    try {
      h.authority.completeBootstrap(); h.send(1, 0); h.pump();
      allowed = false; h.pump();
      const cp = h.candidates.at(-1)!.checkpoint;
      expect(cp).toMatchObject({ phase: 'paused', pauseReason: 'session-fenced', commandHighWater: [1] });
      expect(cp.recentResults[0]!.result.reason).toBe('unavailable');
      expect(runReplay(LAYOUT, h.authority.replay(), init.contentDigest).checkpoint).toEqual(cp);
      const exit = await h.authority.requestCheckpoint('exit'); expect(exit.checkpoint.phase).toBe('paused');
    } finally { h.dispose(); }
  });
  it('captures the first completed visit change and ended boundary exactly once', () => {
    const state = makeState(1); wake(state); state.run.jumpCharge = 1;
    const destination = reachable(state)[0]!;
    state.run.jumpPending = beaconIndex(destination.column, destination.node); state.run.jumpPendingTick = 0;
    let now = 0; const captured: { cause: string; checkpoint: Checkpoint }[] = [];
    const authority = createFixtureAuthority({ init: { ...init, seed: 1 }, clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} },
      contentDigest: init.contentDigest, resolveLayout: () => LAYOUT, onCrash(r) { throw Error(r.error); },
      onCheckpoint(checkpoint, cause) { captured.push({ checkpoint, cause }); } }, state);
    try {
      now = 17; authority.pump();
      expect(captured.map(c => [c.cause, c.checkpoint.snapshot.header.tick])).toEqual([['initial', 0], ['safe-point', 1]]);
      state.hull = 0; now = 34; authority.pump();
      expect(captured.at(-1)).toMatchObject({ cause: 'safe-point', checkpoint: { phase: 'ended', snapshot: { header: { tick: 2 } } } });
      authority.pump(); expect(captured).toHaveLength(3);
    } finally { authority.dispose(); }
  });
  it('coalesces simultaneous requests by urgency and retains all waiters', async () => {
    const h = rig();
    try {
      const periodic = h.authority.requestCheckpoint('periodic'), safe = h.authority.requestCheckpoint('safe-point'), exit = h.authority.requestCheckpoint('exit');
      const values = await Promise.all([periodic, safe, exit]);
      expect(values.map(v => v.cause)).toEqual(['exit', 'exit', 'exit']);
      expect(values[0]!.checkpoint).toEqual(values[2]!.checkpoint);
      expect(h.candidates.map(c => c.cause)).toEqual(['initial', 'exit']);
    } finally { h.dispose(); }
  });
  it('counts in-progress waiters against capacity during a failing reentrant observer', async () => {
    const reentrant: Promise<unknown>[] = []; let inject = false;
    const h = rig(true, { onCheckpoint() {
      if (!inject) return; inject = false;
      for (let n = 0; n < 64; n++) reentrant.push(h.authority.requestCheckpoint('periodic').then(() => 'saved', () => 'rejected'));
      throw Error('delivery retry');
    } });
    try {
      inject = true;
      const first = h.authority.requestCheckpoint('safe-point'); await Promise.resolve();
      const results = await Promise.all(reentrant); await first;
      expect(results.filter(result => result === 'rejected')).toHaveLength(1);
    } finally { h.dispose(); }
  });
  it('retries a nonserializable running candidate at the next completed boundary', async () => {
    let invalid = false, settled = false;
    const h = rig(true, { botControllers() { if (invalid) throw Error('temporarily unavailable memory'); return []; } });
    try {
      invalid = true;
      const request = h.authority.requestCheckpoint('safe-point').then(value => { settled = true; return value; }, error => { settled = true; throw error; });
      // Observe rejection too so the RED run reports the assertion, not an unhandled promise.
      void request.catch(() => {});
      await Promise.resolve(); await Promise.resolve();
      expect(settled).toBe(false); expect(h.candidates).toHaveLength(1);
      invalid = false; h.pump(17);
      expect((await request).checkpoint.snapshot.header.tick).toBe(1);
    } finally { h.dispose(); }
  });
  it('rejects capture after a fault and retains the immutable last completed crash baseline', async () => {
    let crash: any, fail = false;
    const h = rig(true, { botControllers() { if (fail) throw Error('invalid bot memory'); return []; }, onCrash(r) { crash = r; } });
    try {
      for (let t = 1; t <= 300; t++) h.pump(t * 1000 / 60 + 0.001);
      const baseline = structuredClone(h.authority.replay().checkpoint);
      h.candidates.at(-1)!.checkpoint.commandHighWater[0] = 999;
      fail = true;
      for (let t = 301; t <= 600; t++) h.pump(t * 1000 / 60 + 0.001);
      expect(crash.checkpoint).toEqual(baseline);
      await expect(h.authority.requestCheckpoint('exit')).rejects.toThrow('capture unavailable');
      expect(h.candidates.filter(c => c.checkpoint.phase === 'error')).toEqual([]);
    } finally { h.dispose(); }
  });
  it('suppresses failed and retired mode notifications and retires pending requests on replacement', async () => {
    const observed: ModeCheckpoint[] = [], emitters: ((c: ModeCheckpoint) => void)[] = [];
    let finish!: (c: ModeCheckpoint) => void;
    const candidate: ModeCheckpoint = { capturedTick: 0, controlRevision: 0, cause: 'initial', bytes: new Uint8Array([1]) };
    const mode: ModeDefinition = { modeId: 'counter', simVersion: 1, schemaVersion: 1, createHost(deps) {
      emitters.push(c => deps.onCheckpoint?.(c));
      return { start(input) { deps.onCheckpoint?.(candidate); if (input[0] === 0) throw Error('failed startup'); }, restore() {}, completeBootstrap() {},
        checkpoint: () => new Uint8Array([1]), captureCheckpoint: () => new Promise(resolve => { finish = resolve; }),
        attach: () => () => {}, pause() {}, dispose() {} };
    } };
    const runtime = createHostRuntime(createModeRegistry([mode]), { contentDigest: init.contentDigest, clock: { nowMs: () => 0 },
      scheduler: { schedule: () => () => {} }, onCrash() {}, onCheckpoint(c) { observed.push(c); } }, { modeId: 'counter', simVersion: 1, schemaVersion: 1, hostGeneration: 1 });
    let id = 0; const start = (value: number) => runtime.handle({ kind: 'start', requestId: ++id, hostGeneration: 1, initBytes: new Uint8Array([value]) });
    try {
      expect(start(0).ok).toBe(false); expect(observed).toEqual([]);
      start(1); const pending = runtime.captureCheckpoint('periodic'); start(1);
      const rejected = expect(pending).rejects.toThrow('capture unavailable'); finish(candidate); await rejected;
      emitters[0]!(candidate); emitters[1]!(candidate); expect(observed).toHaveLength(2);
      runtime.dispose(); emitters[2]!(candidate); expect(observed).toHaveLength(2);
    } finally { runtime.dispose(); }
  });
  it('captures initial tick zero and periodic 300/600 without extra rejection of reentrant input', () => {
    const saved = rig(), plain = rig(false);
    try {
      expect(saved.candidates[0]).toMatchObject({ cause: 'initial', checkpoint: { snapshot: { header: { tick: 0 } } } });
      for (let t = 1; t <= 601; t++) { saved.pump(t * 1000 / 60 + 0.001); plain.pump(t * 1000 / 60 + 0.001); }
      expect(saved.candidates.filter(c => c.cause === 'periodic').map(c => c.checkpoint.snapshot.header.tick)).toEqual([300, 600]);
      expect(saved.output.filter(m => m.kind === 'result')).toEqual(plain.output.filter(m => m.kind === 'result'));
      expect(saved.output.filter(m => m.kind === 'result').some(m => m.kind === 'result' && m.result.reason === 'unavailable')).toBe(false);
      expect(saved.authority.checkpoint([])).toEqual(plain.authority.checkpoint([]));
    } finally { saved.dispose(); plain.dispose(); }
  });
  it('defers requested running capture with a pending ledger until execution, and replays paused settlement', async () => {
    const h = rig(), plain = rig(false);
    try {
      h.send(1, 0); h.pump();
      let resolved = false;
      const request = h.authority.requestCheckpoint('safe-point').then(cp => { resolved = true; return cp; });
      await Promise.resolve(); expect(resolved).toBe(false);
      h.pump(17); const captured = await request;
      plain.send(1, 0); plain.pump(); plain.pump(17);
      expect(captured.checkpoint.commandHighWater).toEqual([1]);
      expect(captured.checkpoint.snapshot.header.tick).toBe(1);
      expect(captured.checkpoint.recentResults).toEqual(plain.authority.checkpoint([]).recentResults);
      h.send(2, 1); h.pump(); h.pause();
      const paused = h.candidates.at(-1)!; expect(paused.cause).toBe('pause');
      expect(paused.checkpoint.recentResults.at(-1)!.result).toMatchObject({ status: 'rejected', reason: 'unavailable' });
      const replay = h.authority.replay();
      expect(runReplay(LAYOUT, replay, init.contentDigest).checkpoint).toEqual(paused.checkpoint);
      h.send(3, 1, { kind: 'setPaused', paused: true }); h.pump();
      expect(h.candidates.at(-1)).toMatchObject({ cause: 'paused-control', checkpoint: { controlRevision: 2 } });
      const exit = await h.authority.requestCheckpoint('exit'); expect(exit.cause).toBe('exit'); expect(exit.checkpoint.phase).toBe('paused');
    } finally { h.dispose(); plain.dispose(); }
  });
  it('captures the leased initial baseline before bootstrap and current real bot memory', async () => {
    let now = 0; const scheduled = new Set<() => void>(), candidates: any[] = [];
    const host = sectorMode.createHost({ contentDigest: init.contentDigest, clock: { nowMs: () => now },
      sessionGate: { check: () => ({ allowed: true, revision: 1, reason: null }) },
      scheduler: { schedule(_delay, cb) { scheduled.add(cb); return () => { scheduled.delete(cb); }; } },
      onCrash() { throw Error('crash'); }, onCheckpoint(c) { candidates.push(c); } });
    try {
      host.start(bytes(init)); expect(candidates[0]).toMatchObject({ cause: 'initial', capturedTick: 0 });
      expect(JSON.parse(new TextDecoder().decode(candidates[0].bytes)).phase).toBe('paused');
      host.completeBootstrap();
      for (let t = 1; t <= 300; t++) { now = t * 1000 / 60 + 0.001; for (const cb of [...scheduled]) { scheduled.delete(cb); cb(); } }
      const cp = candidates.find(c => c.cause === 'periodic'); expect(cp.capturedTick).toBe(300);
      expect(JSON.parse(new TextDecoder().decode(cp.bytes)).botControllers[0].players[0].botDecisionTick).toBe(299);
      const candidate = await host.captureCheckpoint('exit'); expect(candidate.bytes.byteLength).toBeLessThanOrEqual(262144);
    } finally { host.dispose(); }
  });
  it('bounds delivery, pins exit and uses the same increasing IDs for requests and notifications across replacement', async () => {
    const messages: any[] = [];
    let captured!: (message: any) => void;
    const received = new Promise<any>(resolve => { captured = resolve; });
    const owner = createUtilityHost(createModeRegistry([sectorMode]), { contentDigest: init.contentDigest,
      clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash() {} }, m => { messages.push(m); if ((m as any).kind === 'captured') captured(m); });
    let id = 0;
    const send = (kind: string, rest: object) => owner.receive({ kind, hostGeneration: 1, requestId: ++id, ...rest }, []);
    const start = () => owner.receive({ kind: 'command', command: { kind: 'start', hostGeneration: 1, requestId: ++id, initBytes: bytes(init) } }, []);
    try {
      owner.receive({ kind: 'initialize', protocolVersion: 2, modeId: 'sector', schemaVersion: 1, simVersion: SIM_VERSION,
        contentDigest: init.contentDigest, hostGeneration: 1 }, []);
      start(); const first = messages.find(m => m.kind === 'checkpoint').candidate;
      send('capture-checkpoint', { cause: 'exit' });
      const requested = (await received).candidate;
      expect(requested.captureId).toBeGreaterThan(first.captureId);
      for (let n = 0; n < 5; n++) start();
      expect(messages.filter(m => m.kind === 'checkpoint')).toHaveLength(1);
      send('ack-checkpoint', { captureId: first.captureId });
      expect(messages.filter(m => m.kind === 'checkpoint').at(-1).candidate).toEqual(requested);
      send('ack-checkpoint', { captureId: requested.captureId }); start();
      expect(messages.filter(m => m.kind === 'checkpoint').at(-1).candidate.captureId).toBeGreaterThan(requested.captureId);
    } finally { owner.dispose(); }
  });
});

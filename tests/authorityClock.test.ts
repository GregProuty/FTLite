import { describe, expect, it, vi } from 'vitest';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { LAYOUT, makeState } from './helpers/sim';
import { createLoopbackHarness } from '../src/renderer/src/net/loopback';
import { createClientRun } from '../src/renderer/src/clientControl/clientRun';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { createAuthority, type AuthorityDeps } from '../src/renderer/src/authority/authority';
import type { CommandEnvelope } from '../src/renderer/src/net/contracts';
import type { LifecyclePause } from '../src/renderer/src/net/contracts';
import type { CrashRecord } from '../src/renderer/src/authority/authority';
import { createTickDriver } from '../src/renderer/src/authority/tickDriver';
import { createInputTimeline } from '../src/renderer/src/app/inputTimeline';
import { createLocalRuntime } from '../src/renderer/src/app/localRuntime';
import { NEUTRAL_FRAME } from '../src/renderer/src/clientControl/inputFrame';
import { translateTick } from '../src/renderer/src/clientControl/cardController';
import { hashState } from '../src/renderer/src/sim/hash';
import { Position } from '../src/renderer/src/sim/components';
import * as heat from '../src/renderer/src/sim/heat';
import { decodeMessage } from '../src/renderer/src/net/codec';

function rig(hooks: Partial<AuthorityDeps> = {}) {
  let now = 0, sequence = 0, controls = 0;
  const state = makeState(1), deadlines: number[] = [], timers = new Map<number, { delay: number; cb: () => void }>();
  let timerId = 0;
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ });
  const pair = transport.connectLocal(), client = createClientRun(pair.clientLink, [0], { runId: 'clock', resolveLayout: () => LAYOUT });
  const authority = createFixtureAuthority({
    clock: { nowMs: () => now }, scheduler: { schedule(delay, cb) { const id = ++timerId; timers.set(id, { delay, cb }); return () => { timers.delete(id); }; } },
    contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout: () => LAYOUT, onCrash(record) { throw new Error(record.error); },
    ...hooks,
    beforeControls() { controls++; hooks.beforeControls?.(); transport.drain(); },
    beforeTick(tick, deadline) { deadlines.push(deadline); hooks.beforeTick?.(tick, deadline); transport.drain(); },
    init: { runId: 'clock', layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 1, playerCount: 1, characters: [], unlocked: [] }
  }, state);
  authority.attach(pair.authorityLink, [0]); transport.drain();
  return { state, deadlines, timers, client, authority, get controls() { return controls; },
    at(value: number) { now = value; }, pump() { authority.pump(); transport.drain(); },
    command(command: CommandEnvelope['command'], requestedTick = state.tick) { client.send({ held: [], commands: [{ runId: 'clock', id: { player: 0, sequence: ++sequence }, requestedTick, command }] }); },
    dispose() { authority.dispose(); client.dispose(); pair.host.close('done'); pair.client.close('done'); }
  };
}

describe('authority retained clock', () => {
  it('keeps fractional deadlines and yields identical gameplay across pump batch sizes', () => {
    const outcomes: string[] = [];
    for (const milliseconds of [1000 / 60, 1000 / 30, 55, 81.7]) {
      const h = rig({ beforeTick(tick) {
        h.client.send(translateTick(h.client.state()!, h.client.ui, [{ ...NEUTRAL_FRAME, moveX: tick % 2 ? 1 : 0, interactHeld: tick % 7 === 0 }], tick));
      } });
      for (let time = milliseconds; time < 5000; time += milliseconds) { h.at(time); h.pump(); }
      h.at(5000); h.pump(); expect(h.state.tick).toBe(300);
      outcomes.push(hashState(h.state)); h.dispose();
    }
    expect(new Set(outcomes).size).toBe(1);
    const h = rig(); h.at(1000 / 60 * 2.5); h.pump(); expect(h.state.tick).toBe(2);
    h.at(50); h.pump(); expect(h.state.tick).toBe(3); h.dispose();
  });
  it('delivers every timestamped edge once regardless of pump batching', () => {
    for (const milliseconds of [1000 / 60, 1000 / 30, 55, 81.7]) {
      const timeline = createInputTimeline(1), sent = [0, 0, 0], got = [0, 0, 0];
      for (let i = 0; i < 200; i++) {
        const frame = { ...NEUTRAL_FRAME, interactPresses: i % 5 === 0 ? 1 : 0, confirmPresses: i % 7 === 3 ? 1 + i % 2 : 0, cancelPresses: i % 11 === 4 ? 1 : 0 };
        sent[0]! += frame.interactPresses; sent[1]! += frame.confirmPresses; sent[2]! += frame.cancelPresses;
        timeline.sample(i * 1000 / 60, [frame]);
      }
      const h = rig({ beforeTick(_tick, deadline) { const f = timeline.consume(deadline)[0]!; got[0]! += f.interactPresses; got[1]! += f.confirmPresses; got[2]! += f.cancelPresses; } });
      for (let time = milliseconds; time < 4000; time += milliseconds) { h.at(time); h.pump(); }
      h.at(4000); h.pump(); expect(got).toEqual(sent); h.dispose();
    }
  });
  it('retains 5000ms as 120/120/60 ticks and yields immediate debt continuations', () => {
    const h = rig(); h.at(5000);
    h.pump(); expect(h.state.tick).toBe(120); expect([...h.timers.values()].map((t) => t.delay)).toEqual([0]);
    h.pump(); expect(h.state.tick).toBe(240); h.pump(); expect(h.state.tick).toBe(300); h.pump(); expect(h.state.tick).toBe(300);
    expect(h.deadlines[0]).toBeCloseTo(1000 / 60); expect(h.deadlines.at(-1)).toBe(5000); h.dispose(); expect(h.timers.size).toBe(0);
  });
  it('accrues before pause, retains old deadlines and excludes ten paused seconds', () => {
    const h = rig(); h.at(5005); h.command({ kind: 'setPaused', paused: true }); h.pump(); expect(h.state.tick).toBe(0);
    h.at(15005); h.pump(); expect(h.state.tick).toBe(0); h.command({ kind: 'setPaused', paused: false }); h.pump(); expect(h.state.tick).toBe(120);
    h.pump(); expect(h.state.tick).toBe(240); h.pump(); expect(h.state.tick).toBe(300); expect(h.deadlines.at(-1)).toBe(5000);
    h.at(15016); h.pump(); expect(h.state.tick).toBe(300); h.at(15017); h.pump(); expect(h.state.tick).toBe(301);
    expect(h.deadlines.at(-1)).toBeCloseTo(15000 + 1000 / 60); h.dispose();
  });
  it('runs beforeControls on zero-due and paused pumps without reentrant execution', () => {
    let nested = false;
    const h = rig({ beforeControls() { if (!nested) { nested = true; h.authority.pump(); } } });
    h.pump(); expect(h.controls).toBe(1); expect(h.state.tick).toBe(0);
    h.command({ kind: 'setPaused', paused: true }); h.pump(); h.pump(); expect(h.controls).toBe(3); expect(h.client.publication()!.phase).toBe('paused'); h.dispose();
  });
  it('pause wins one drain and stale control ticks consume their sequence without changing pause', () => {
    const h = rig(); h.command({ kind: 'setPaused', paused: true }); h.command({ kind: 'setPaused', paused: false }); h.pump();
    expect(h.client.publication()!.phase).toBe('paused'); h.command({ kind: 'setPaused', paused: false }, 1); h.pump(); expect(h.client.publication()!.phase).toBe('paused');
    h.command({ kind: 'setPaused', paused: false }); h.pump(); expect(h.client.publication()!.phase).toBe('running'); h.dispose();
  });
  it('a 500ms stall runs thirty ticks and backward time never creates extra ticks', () => {
    const h = rig(); h.at(500); h.pump(); expect(h.state.tick).toBe(30); h.at(-500); h.pump(); h.at(500); h.pump(); expect(h.state.tick).toBe(30); h.dispose();
  });
  it('uses independent lifecycle ordinals, journals mixed receive order and clears held repair', () => {
    let lifecycle: (control: LifecyclePause) => void = () => {}, crash: CrashRecord | null = null;
    const h = rig({ bindLifecyclePause(request) { lifecycle = request; }, onCrash(record) { crash = record; } });
    h.client.send(translateTick(h.client.state()!, h.client.ui, [{ ...NEUTRAL_FRAME, interactHeld: true }], 0));
    lifecycle({ paused: true, reason: 'blur' }); h.pump();
    expect(h.client.publication()).toMatchObject({ phase: 'paused', pauseOwner: null, pauseReason: 'blur', commandHighWater: [0], controlRevision: 1 });
    lifecycle({ paused: false, reason: 'focus' }); h.command({ kind: 'setPaused', paused: true }); h.pump();
    expect(h.client.publication()).toMatchObject({ phase: 'paused', pauseOwner: 0, pauseReason: 'player', commandHighWater: [1], controlRevision: 3 });
    lifecycle({ paused: false, reason: 'os-resume' }); h.pump();
    (h.state as unknown as { rooms: null }).rooms = null; h.at(17); h.pump();
    const journal = crash as unknown as CrashRecord;
    expect(journal.ticks[0]!.input.held[0]!.interactHeld).toBe(false);
    expect(journal.ticks[0]!.controls.map((control) => control.source === 'lifecycle' ? control.ordinal : control.envelope.id.sequence)).toEqual([1, 2, 1, 3]);
    expect(journal.ticks[0]!.controls.map((control) => control.source)).toEqual(['lifecycle', 'lifecycle', 'player', 'lifecycle']);
    h.dispose();
  });
  it('admits gameplay during beforeTick but defers controls and enqueues deliveries without stepping', () => {
    const h = rig({ beforeTick(tick) {
      if (tick !== 0) return;
      h.command({ kind: 'moveTo', tile: 0 }); h.command({ kind: 'setPaused', paused: true });
      h.authority.pump(); expect(h.state.tick).toBe(0);
    } });
    h.at(17); h.pump(); expect(h.state.tick).toBe(1);
    expect(h.client.takeResults()).toMatchObject([{ id: { sequence: 1 }, tick: 0, reason: 'unsupported' }]);
    h.pump(); expect(h.state.tick).toBe(1); expect(h.client.publication()!.phase).toBe('paused');
    expect(h.client.takeResults()).toMatchObject([{ id: { sequence: 2 }, tick: 1, status: 'applied' }]); h.dispose();
  });
  it.each(['ended', 'error'])('settles a deferred control if the intervening tick enters %s', (phase) => {
    const h = rig({ beforeTick() { h.command({ kind: 'setPaused', paused: true }); }, onCrash() {} });
    if (phase === 'ended') h.state.hull = 0;
    else (h.state as unknown as { rooms: null }).rooms = null;
    h.at(17); h.pump();
    expect(h.client.takeResults()).toMatchObject([{ id: { sequence: 1 }, status: 'rejected', reason: 'unavailable' }]); h.dispose();
  });
  it('runs the scheduled zero-due control hook and cancels the timer on disposal', () => {
    const h = rig(); h.command({ kind: 'setPaused', paused: true });
    const callback = [...h.timers.values()][0]!.cb; callback();
    expect(h.controls).toBe(1); expect(h.state.tick).toBe(0); h.pump(); expect(h.client.publication()!.phase).toBe('paused');
    h.dispose(); expect(h.timers.size).toBe(0); callback(); expect(h.controls).toBe(2);
  });
  it('keeps ticking with a failed producer and never repeats its previous one-shot', () => {
    const h = rig({ beforeTick(tick) {
      if (tick > 0) throw new Error('producer delayed');
      h.client.send(translateTick(h.client.state()!, h.client.ui, [{ ...NEUTRAL_FRAME, confirmPresses: 1 }], tick));
    } });
    h.at(500); h.pump(); expect(h.state.tick).toBe(30);
    expect(h.client.takeResults()).toMatchObject([{ id: { sequence: 1 }, tick: 0, status: 'applied' }]); h.dispose();
  });
  it('counts sixty hazard boundaries in all 300 ticks without any producer', () => {
    const heatStep = vi.spyOn(heat, 'heatStep'), h = rig();
    try {
      h.at(5000); h.pump(); expect(h.client.publication()!.lagTicks).toBe(180); h.pump(); h.pump();
      expect(h.state.tick).toBe(300); expect(heatStep).toHaveBeenCalledTimes(60); expect(h.client.publication()!.lagTicks).toBe(0);
    } finally { heatStep.mockRestore(); h.dispose(); }
  });
  it('bounds control-only crash history with a complete control checkpoint', () => {
    let lifecycle: (control: LifecyclePause) => void = () => {}, crash: CrashRecord | null = null;
    const h = rig({ bindLifecyclePause(request) { lifecycle = request; }, onCrash(record) { crash = record; } });
    for (let i = 0; i < 260; i++) { lifecycle({ paused: true, reason: 'blur' }); h.pump(); }
    lifecycle({ paused: false, reason: 'focus' }); h.pump();
    (h.state as unknown as { rooms: null }).rooms = null; h.at(17); h.pump();
    const journal = crash as unknown as CrashRecord;
    expect(journal.baselineControlRevision).toBe(256); expect(journal.baselineLifecycleOrdinal).toBe(256);
    expect(journal.ticks[0]!.controls).toHaveLength(5);
    expect(journal.baselineControlState).toMatchObject({ phase: 'paused', pauseOwner: null, pauseReason: 'blur', revision: 256 });
    h.dispose();
  });
  it('tick driver refuses reentrant pumps and retains fractional deadlines after pause', () => {
    let now = 0; const ticks: number[] = [], deadlines: number[] = [];
    const driver = createTickDriver({ nowMs: () => now }, { schedule: () => () => {} }, (tick, deadline) => { ticks.push(tick); deadlines.push(deadline); driver.pump(); });
    now = 5; driver.setPaused(true); now = 10005; driver.setPaused(false); now = 10017; driver.pump();
    expect(ticks).toEqual([0]); expect(deadlines[0]).toBeCloseTo(10000 + 1000 / 60); driver.dispose();
  });
  it('retains identical recorded commands and gameplay across regular/bursty pumps and 30/60/144Hz drawing', () => {
    function play(bursty: boolean, drawHz: number) {
      let now = 0;
      const input = createInputTimeline(1), actions: unknown[] = [], hashes: string[] = [];
      for (let tick = 0; tick < 120; tick++) input.sample(tick * 1000 / 60, [{ ...NEUTRAL_FRAME, moveX: tick % 20 < 10 ? 0.8 : -0.8, moveY: 0.8, confirmPresses: Number(tick % 17 === 0) }]);
      const runtime = createLocalRuntime({ layout: LAYOUT, playerCount: 1, seed: 19, characters: [0], unlocked: [], runId: 'parity', contentDigest: __GAMEPLAY_CONTENT_DIGEST__,
        clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} },
        frames(_tick, deadline) { return input.consume(deadline); }, onCrash(r) { throw new Error(r.error); },
        authorityFactory(deps) {
          const authority = createAuthority(deps); let off = () => {};
          return { ...authority, attach(link, players) {
            off = link.onMessage((_channel, bytes) => { const message = decodeMessage(bytes); if (message.kind === 'command') actions.push(message); });
            return authority.attach(link, players);
          }, dispose() { off(); authority.dispose(); } };
        },
        onPublication(view) { hashes.push(hashState(view)); }, draw() {} });
      let nextDraw = 0;
      for (now = bursty ? 500 : 1000 / 120; now <= 2000 + 1e-7; now += bursty ? 500 : 1000 / 120) {
        runtime.pump(); while (nextDraw <= now) { runtime.frame(); nextDraw += 1000 / drawHz; }
      }
      const result = { hash: hashState(runtime.state()!), actions, hashes }; runtime.dispose(); return result;
    }
    const reference = play(false, 60);
    for (const hz of [30, 60, 144]) { expect(play(true, hz)).toEqual(reference); expect(play(false, hz)).toEqual(reference); }
  });
  it('renders adjacent completed states and collapses interpolation on pause', () => {
    let now = 0, previousX = 0;
    const drawn: { alpha: number; previousX: number; currentX: number }[] = [];
    const runtime = createLocalRuntime({ layout: LAYOUT, playerCount: 1, seed: 1, characters: [0], unlocked: [], runId: 'interpolation', contentDigest: __GAMEPLAY_CONTENT_DIGEST__,
      clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, frames: () => [{ ...NEUTRAL_FRAME, moveX: 1 }], onCrash(r) { throw new Error(r.error); },
      recordPrev(view) { previousX = Position.x[view.crew[0]!]!; }, draw(view, alpha) { drawn.push({ alpha, previousX, currentX: Position.x[view.crew[0]!]! }); } });
    now = 1000 / 60; runtime.pump(); now = 25; runtime.frame(); expect(drawn.at(-1)!.alpha).toBeCloseTo(0.5);
    expect(drawn.at(-1)!.currentX).toBeGreaterThan(drawn.at(-1)!.previousX);
    runtime.requestLifecyclePause({ paused: true, reason: 'blur' }); runtime.pump(); runtime.frame();
    expect(drawn.at(-1)!.alpha).toBe(1); expect(drawn.at(-1)!.currentX).toBe(drawn.at(-1)!.previousX); runtime.dispose();
  });
});

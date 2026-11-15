import { describe, expect, it } from 'vitest';
import { createHostRuntime } from '../src/network/hostRuntime';
import { createModeRegistry } from '../src/network/modes/registry';
import { sectorMode } from '../src/network/modes/sector';
import type { ModeDefinition, ModeHostDeps } from '../src/network/modes/contracts';
import type { HostCommandInput } from '../src/shared/netSession';
import { createAuthority } from '../src/renderer/src/authority/authority';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { LAYOUT } from './helpers/sim';
import { ownTestCleanup } from './helpers/simLifetime';
import { portEndpoint } from './helpers/portEndpoint';
import { encodeMessage, decodeMessage } from '../src/renderer/src/net/codec';
import { createPortLink } from '../src/network/portLink';
import type { HostCommand } from '../src/shared/netSession';

const encode = (x: unknown) => new TextEncoder().encode(JSON.stringify(x));
const decode = (x: Uint8Array) => JSON.parse(new TextDecoder().decode(x));
function harness(mode = sectorMode) {
  let now = 0; const callbacks = new Set<() => void>();
  const deps: ModeHostDeps = { contentDigest: __GAMEPLAY_CONTENT_DIGEST__, clock: { nowMs: () => now },
    scheduler: { schedule: (_, cb) => { callbacks.add(cb); return () => { callbacks.delete(cb); }; } }, onCrash() {} };
  const runtime = createHostRuntime(createModeRegistry([mode]), deps, { modeId: mode.modeId, schemaVersion: mode.schemaVersion, simVersion: mode.simVersion, hostGeneration: 1 });
  ownTestCleanup(() => runtime.dispose());
  let id = 0;
  return { runtime, deps, callbacks, advance(t: number) { now = t; for (const cb of [...callbacks]) { callbacks.delete(cb); cb(); } },
    command(input: HostCommandInput, requestId = ++id, hostGeneration = 1) { return runtime.handle({ ...input, requestId, hostGeneration }); } };
}
const init = () => ({ runId: 'mode-test', layoutId: LAYOUT.id, layoutHash: deriveLayout(LAYOUT).layoutHash, simVersion: SIM_VERSION,
  contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 7, playerCount: 1, characters: [0], unlocked: [] });
const minimal: ModeDefinition = { modeId: 'counter', schemaVersion: 7, simVersion: 9, createHost() {
  let value = 0;
  return { start(bytes) { if (bytes.length !== 1) throw Error('invalid counter'); value = bytes[0]!; },
    restore(bytes) { if (bytes.length !== 1) throw Error('invalid counter'); value = bytes[0]!; }, checkpoint: () => new Uint8Array([value]),
    attach(_link, _players, policy) { if (policy !== 'receive-time') throw Error('wrong admission'); return () => {}; }, pause() { value++; }, dispose() {} };
} };
describe('mode host runtime', () => {
  it('rejects unknown/duplicate modes and wrong compatibility before construction', () => {
    let constructed = 0; const mode = { ...minimal, createHost() { constructed++; return minimal.createHost({} as ModeHostDeps); } };
    expect(() => createModeRegistry([mode, mode])).toThrow();
    const registry = createModeRegistry([mode]), deps = harness().deps;
    for (const identity of [{ modeId: 'missing', schemaVersion: 7, simVersion: 9 }, { modeId: 'counter', schemaVersion: 8, simVersion: 9 }, { modeId: 'counter', schemaVersion: 7, simVersion: 99 }])
      expect(() => createHostRuntime(registry, deps, { ...identity, hostGeneration: 1 })).toThrow();
    expect(() => createHostRuntime(registry, { ...deps, contentDigest: 'bad' }, { modeId: 'counter', schemaVersion: 7, simVersion: 9, hostGeneration: 1 })).toThrow();
    expect(constructed).toBe(0);
  });
  it.each([sectorMode, minimal])('runs start/checkpoint/pause/restore for mode $modeId using opaque bytes', mode => {
    const h = harness(mode), bytes = mode === minimal ? new Uint8Array([41]) : encode(init());
    expect(h.command({ kind: 'start', initBytes: bytes }).ok).toBe(true);
    const saved = h.command({ kind: 'checkpoint' }); expect(saved.ok).toBe(true);
    if (!saved.ok || !saved.checkpointBytes) throw Error('missing checkpoint');
    expect(h.command({ kind: 'pause', reason: 'suspend' }).ok).toBe(true);
    expect(h.command({ kind: 'restore', checkpointBytes: saved.checkpointBytes }).ok).toBe(true);
    const restored = h.command({ kind: 'checkpoint' }); expect(restored.ok).toBe(true);
    if (!restored.ok || !restored.checkpointBytes) throw Error('missing checkpoint');
    if (mode === minimal) expect(restored.checkpointBytes).toEqual(new Uint8Array([41]));
    else { expect(decode(restored.checkpointBytes).snapshot.values).toEqual(decode(saved.checkpointBytes).snapshot.values); expect(decode(restored.checkpointBytes).paused).toBe(true); }
  });
  it('matches direct sector authority canonical state at completed ticks', () => {
    const h = harness(), direct = createAuthority({ ...h.deps, resolveLayout: () => LAYOUT, onCrash() {} });
    ownTestCleanup(() => direct.dispose()); direct.start(init());
    expect(h.command({ kind: 'start', initBytes: encode(init()) }).ok).toBe(true);
    h.advance(1000 / 60 * 10 + 0.01); direct.pump();
    const saved = h.command({ kind: 'checkpoint' }); if (!saved.ok || !saved.checkpointBytes) throw Error('missing checkpoint');
    expect(decode(saved.checkpointBytes)).toEqual(direct.checkpoint([]));
  });
  it('rejects content/layout/oversized init and invalid restore while preserving the previous owner and ports', () => {
    const h = harness();
    for (const bad of [{ ...init(), contentDigest: 'a'.repeat(64) }, { ...init(), layoutId: 'unknown' }, { ...init(), playerCount: 99 }]) {
      expect(h.command({ kind: 'start', initBytes: encode(bad) }).ok).toBe(false); expect(h.callbacks.size).toBe(0);
    }
    expect(h.command({ kind: 'start', initBytes: new Uint8Array(262145) }).ok).toBe(false);
    h.command({ kind: 'start', initBytes: encode(init()) }); const p = portEndpoint(); h.runtime.attachPeer('human', [0], p.port);
    expect(h.command({ kind: 'restore', checkpointBytes: encode({ bad: true }) }).ok).toBe(false);
    expect(p.closed).toBe(false); expect(h.command({ kind: 'checkpoint' }).ok).toBe(true);
  });
  it('does not replay duplicate/old commands or accept stale host generations', () => {
    const h = harness(minimal); h.command({ kind: 'start', initBytes: new Uint8Array([4]) }, 1);
    h.command({ kind: 'pause', reason: 'one' }, 2);
    expect(h.command({ kind: 'pause', reason: 'two' }, 2).ok).toBe(false);
    expect(h.command({ kind: 'start', initBytes: new Uint8Array([99]) }, 1).ok).toBe(false);
    expect(h.command({ kind: 'pause', reason: 'stale' }, 999, 2).ok).toBe(false);
    const cp = h.command({ kind: 'checkpoint' }, 3); expect(cp.ok && cp.checkpointBytes).toEqual(new Uint8Array([5]));
  });
  it('closes rejected and replaced peer ports and prevents stale detach from removing replacement', () => {
    const h = harness(); const before = portEndpoint(); expect(() => h.runtime.attachPeer('peer', [0], before.port)).toThrow(); expect(before.closed).toBe(true);
    h.command({ kind: 'start', initBytes: encode(init()) }); const a = portEndpoint(), b = portEndpoint();
    const off = h.runtime.attachPeer('peer', [0], a.port); h.runtime.attachPeer('peer', [0], b.port); off();
    expect(a.closed).toBe(true); expect(b.closed).toBe(false);
    const bad = portEndpoint(); expect(() => h.runtime.attachPeer('other', [1], bad.port)).toThrow(); expect(bad.closed).toBe(true); expect(bad.listeners).toBe(0);
    h.runtime.dispose(); h.runtime.dispose(); expect(b.closed).toBe(true); expect(b.listeners).toBe(0); expect(h.callbacks.size).toBe(0);
  });
  it('admits delayed human commands over ports with receive-time result metadata', () => {
    const h = harness(); h.command({ kind: 'start', initBytes: encode(init()) });
    const p = portEndpoint(); h.runtime.attachPeer('human', [0], p.port); h.advance(100);
    p.receive({ version: 1, type: 'data', id: 1, kind: 'reliable-ordered', bytes: encodeMessage({ kind: 'command', envelope: {
      runId: 'mode-test', id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'setPaused', paused: true }
    } }) });
    h.advance(120);
    const messages = p.sent.filter((x: any) => x.type === 'data').map((x: any) => decodeMessage(x.bytes));
    expect(messages).toContainEqual(expect.objectContaining({ kind: 'result', result: expect.objectContaining({
      status: 'applied', admission: { expectedSequence: 2, disposition: 'terminal' }
    }) }));
  });
  it('keeps sector strict bindings strict while supporting per-seat latest streams', () => {
    const h = harness(), host = sectorMode.createHost(h.deps); ownTestCleanup(() => host.dispose()); host.start(encode(init()));
    const p = portEndpoint(), link = createPortLink(p.port, 'strict'); ownTestCleanup(() => link.close('done'));
    host.attach(link, [0], 'strict'); h.advance(100);
    p.receive({ version: 1, type: 'data', id: 1, kind: 'reliable-ordered', bytes: encodeMessage({ kind: 'command', envelope: {
      runId: 'mode-test', id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'stand' }
    } }) }); h.advance(120);
    const results = p.sent.filter((x: any) => x.type === 'data').map((x: any) => decodeMessage(x.bytes));
    expect(results).toContainEqual(expect.objectContaining({ kind: 'result', result: expect.objectContaining({ status: 'rejected', reason: 'stale-tick' }) }));
    const held = (player: number) => encodeMessage({ kind: 'held', frame: { runId: 'mode-test', player, tick: 0, sequence: 1, held: { moveX: 0, moveY: 0, interactHeld: false } } });
    expect(sectorMode.latestStreamKey!(held(0))).not.toBe(sectorMode.latestStreamKey!(held(1)));
  });
  it('retires ports on successful restore and rejects callbacks from the previous peer', () => {
    const h = harness(); h.command({ kind: 'start', initBytes: encode(init()) }); const p = portEndpoint(); h.runtime.attachPeer('peer', [0], p.port);
    const cp = h.command({ kind: 'checkpoint' }); if (!cp.ok || !cp.checkpointBytes) throw Error('checkpoint unavailable');
    expect(h.command({ kind: 'restore', checkpointBytes: cp.checkpointBytes }).ok).toBe(true);
    expect(p.closed).toBe(true); expect(p.listeners).toBe(0);
    const q = portEndpoint(); h.runtime.attachPeer('peer', [0], q.port);
    p.receive({ version: 1, type: 'close', reason: 'old' }); expect(q.closed).toBe(false);
  });
  it('bounds control input/output and returns typed errors without leaking exceptions', () => {
    const oversized: ModeDefinition = { ...minimal, createHost(deps) { return { ...minimal.createHost(deps), checkpoint: () => new Uint8Array(262145), pause() { throw Error('secret stack'); } }; } };
    const h = harness(oversized); h.command({ kind: 'start', initBytes: new Uint8Array([4]) });
    expect(h.command({ kind: 'checkpoint' })).toMatchObject({ ok: false, error: { code: 'checkpoint-too-large' } });
    expect(h.command({ kind: 'pause', reason: 'x'.repeat(129) })).toMatchObject({ ok: false, error: { code: 'invalid-command' } });
    expect(h.command({ kind: 'pause', reason: 'x' })).toMatchObject({ ok: false, error: { code: 'mode-error', message: 'mode-error' } });
    expect(h.runtime.handle({ kind: 'checkpoint', requestId: 9, hostGeneration: 1, extra: 1 } as HostCommand).ok).toBe(false);
    expect(h.command({ kind: 'checkpoint' }, 9)).toMatchObject({ ok: false, error: { code: 'stale-request' } });
  });
  it('cleans attachment that synchronously closes while publishing the initial state', () => {
    const h = harness(); h.command({ kind: 'start', initBytes: encode(init()) }); const p = portEndpoint();
    p.port.postMessage = () => { p.port.close(); };
    expect(() => h.runtime.attachPeer('peer', [0], p.port)).toThrow(); expect(p.listeners).toBe(0);
    const replacement = portEndpoint(); expect(() => h.runtime.attachPeer('peer', [0], replacement.port)).not.toThrow();
  });
  it('never invents a correlation ID for malformed unstamped commands', () => {
    const h = harness(minimal);
    for (const requestId of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(h.runtime.handle({ kind: 'checkpoint', requestId, hostGeneration: 1 } as HostCommand)).toEqual({
        requestId: null, hostGeneration: 1, ok: false, error: { code: 'invalid-command', message: 'invalid-command' }
      });
    }
    expect(h.command({ kind: 'start', initBytes: new Uint8Array([4]) }, 1).ok).toBe(true);
  });
  it('retires a candidate if its initialization synchronously disposes the runtime', () => {
    let live = 0;
    const mode: ModeDefinition = { ...minimal, createHost(deps) {
      const inner = minimal.createHost(deps); let owned = false;
      return { ...inner, start(bytes) { inner.start(bytes); owned = true; live++; deps.onCrash({ checkpoint: null, diagnostic: 'test-fault' }); },
        dispose() { if (owned) { owned = false; live--; } inner.dispose(); } };
    } };
    const h = harness(mode); h.deps.onCrash = () => h.runtime.dispose();
    expect(h.command({ kind: 'start', initBytes: new Uint8Array([4]) })).toMatchObject({ ok: false, error: { code: 'unavailable' } });
    expect(live).toBe(0);
  });
});

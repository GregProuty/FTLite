import { createAuthority, type Authority } from '../../renderer/src/authority/authority';
import { validateCheckpoint, validateRunInit } from '../../renderer/src/authority/checkpoint';
import type { Checkpoint, LifecyclePause, RunInit } from '../../renderer/src/net/contracts';
import { decodeMessage } from '../../renderer/src/net/codec';
import { SIM_VERSION } from '../../renderer/src/sim/tuning';
import { parseShip } from '../../renderer/src/sim/ship/schema';
import starter from '../../renderer/src/sim/ship/starter.json';
import skiff from '../../renderer/src/sim/ship/skiff.json';
import cutter from '../../renderer/src/sim/ship/cutter.json';
import { boundedHostBytes } from '../../shared/netSession';
import type { CaptureCause, ModeCheckpoint } from '../../shared/sessionCheckpoint';
import { validStreamAttachmentOptions } from '../../shared/hostProcessProtocol';
import { createSectorStreamBinding } from './sectorStream';
import { createSectorProducers } from './sectorProducers';
import type { ModeDefinition, ModeHost, ModeHostDeps, Unsubscribe } from './contracts';

const layouts = new Map([starter, skiff, cutter].map(json => { const layout = parseShip(json); return [layout.id, layout]; }));
function resolveLayout(id: string) { const layout = layouts.get(id); if (!layout) throw Error('unknown sector layout'); return layout; }
function decode(bytes: Uint8Array): unknown {
  if (!boundedHostBytes(bytes)) throw Error('sector payload exceeds limit');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function encode(value: unknown): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (!boundedHostBytes(bytes)) throw Error('sector payload exceeds limit');
  return bytes;
}
function createSectorHost(deps: ModeHostDeps): ModeHost {
  let authority: Authority | null = null, disposed = false, count = 0;
  let pause: ((control: LifecyclePause) => void) | undefined;
  let producers: ReturnType<typeof createSectorProducers> | undefined;
  const attached = new Set<Unsubscribe>();
  const streamDisposals = new Set<Unsubscribe>();
  const captures = new WeakMap<Checkpoint, ModeCheckpoint>();
  function candidate(checkpoint: Checkpoint, cause: CaptureCause): ModeCheckpoint {
    let value = captures.get(checkpoint);
    if (!value) {
      value = { capturedTick: checkpoint.snapshot.header.tick, controlRevision: checkpoint.controlRevision, cause, bytes: encode(checkpoint) };
      captures.set(checkpoint, value);
    }
    return value;
  }
  function replace(value: RunInit | Checkpoint, restore: boolean): void {
    if (disposed || attached.size) throw Error('detach producers before replacing sector');
    let nextPause: typeof pause;
    let nextProducers: ReturnType<typeof createSectorProducers>;
    const next = createAuthority({ ...deps, resolveLayout,
      onCheckpoint: deps.onCheckpoint ? (checkpoint, cause) => { deps.onCheckpoint!(candidate(checkpoint, cause)); } : undefined,
      botControllers: () => nextProducers.controllers(),
      beforeControls: () => nextProducers.beforeControls(), beforeTick: tick => nextProducers.beforeTick(tick),
      onCrash(record) { let checkpoint: Uint8Array | null = null; try { checkpoint = encode(record.checkpoint); } catch { /* retain diagnostics */ }
        try { nextProducers?.dispose(); } finally { deps.onCrash({ checkpoint, diagnostic: { ...record } }); } },
      bindLifecyclePause(request) { nextPause = request; return () => { if (nextPause === request) nextPause = undefined; }; }
    });
    const init = restore ? (value as Checkpoint).init : value as RunInit;
    nextProducers = createSectorProducers({ authority: next, runId: init.runId, playerCount: init.playerCount,
      contentDigest: deps.contentDigest, resolveLayout, restoredControllers: restore ? (value as Checkpoint).botControllers : undefined });
    try { if (restore) next.restore(value as Checkpoint); else next.start(init); }
    catch (error) { nextProducers.dispose(); next.dispose(); throw error; }
    const old = authority; authority = next; pause = nextPause;
    count = init.playerCount;
    producers?.dispose(); producers = nextProducers;
    old?.dispose();
  }
  return {
    completeBootstrap() { if (!authority || disposed) throw Error('sector unavailable'); authority.completeBootstrap(); },
    start(bytes) { const value = decode(bytes) as RunInit; const init = validateRunInit(resolveLayout(value?.layoutId), value, deps.contentDigest); replace(init, false); },
    restore(bytes) { const value = decode(bytes) as Checkpoint; const cp = validateCheckpoint(resolveLayout(value?.init?.layoutId), value, deps.contentDigest); replace(cp, true); },
    attach(link, players, policy, options) {
      if (disposed || !authority || !players.length || players.some(p => !Number.isInteger(p) || p < 0 || p >= count) || new Set(players).size !== players.length) throw Error('invalid sector ownership');
      if (!validStreamAttachmentOptions(options)) throw Error('invalid stream attachment');
      const stream = options?.streamed ? createSectorStreamBinding(link, { ...deps, resolveLayout, latestPayloadLimit: options.latestPayloadLimit! }) : undefined;
      let off: Unsubscribe;
      try { off = producers!.attachHuman(stream?.link ?? link, players, { admissionPolicy: policy, ...stream?.attachOptions }); }
      catch (error) { stream?.dispose(); throw error; }
      if (stream) streamDisposals.add(stream.dispose);
      const detach = () => { if (!attached.delete(detach)) return; try { off(); } finally { if (stream) { streamDisposals.delete(stream.dispose); stream.dispose(); } } };
      attached.add(detach); return detach;
    },
    checkpoint() { if (!authority || disposed) throw Error('sector unavailable'); return encode(authority.checkpoint(producers!.controllers())); },
    async captureCheckpoint(cause) {
      if (!authority || disposed) throw Error('sector unavailable');
      const captured = await authority.requestCheckpoint(cause);
      return candidate(captured.checkpoint, captured.cause);
    },
    pause(reason) { if (!authority || disposed || !reason.length || reason.length > 128) throw Error('sector unavailable'); pause?.({ paused: true, reason }); authority.pump(); },
    dispose() { if (disposed) return; disposed = true; try { producers?.dispose(); } finally { try { authority?.dispose(); } finally {
      authority = null; pause = undefined; attached.clear(); for (const release of streamDisposals) release(); streamDisposals.clear();
    } } }
  };
}
export const sectorMode: ModeDefinition = {
  modeId: 'sector', schemaVersion: 1, simVersion: SIM_VERSION, createHost: createSectorHost,
  latestStreamKey(bytes) { const message = decodeMessage(bytes); return message.kind === 'held' ? `held:${message.frame.player}` : 'state'; }
};

// The mode factory (engine refactor spec §6): defineEncounterMode turns one EncounterRules plus the mode's byte codecs,
// producers and stream publication adapter into a Net-3 ModeDefinition. Its ModeHost keeps the sector host's merged
// lifecycle: it refuses to replace itself while anything is attached, caches checkpoint candidates, encodes crash
// checkpoints, and exposes the synchronous checkpoint() hostRuntime calls and the async safe-point captureCheckpoint.
import { createEncounterAuthority, type Authority, type AttachOptions } from '../../renderer/src/authority/authority';
import type { CheckpointOf, EncounterRules, EncounterTypes, ResolveLayout } from '../../renderer/src/authority/rules';
import type { LifecyclePause } from '../../renderer/src/net/contracts';
import { boundedHostBytes } from '../../shared/netSession';
import type { CaptureCause, ModeCheckpoint } from '../../shared/sessionCheckpoint';
import { validStreamAttachmentOptions, type StreamAttachmentOptions } from '../../shared/hostProcessProtocol';
import type { AdmissionPolicy, Link, ModeDefinition, ModeHost, ModeHostDeps, Unsubscribe } from './contracts';
import { createSharedStateImage, type SharedStateImage } from './streamBinding';

/** A mode's producers: bots and local hooks, bound at the authority's completed-boundary hooks. */
export interface EncounterProducers<T extends EncounterTypes> {
  controllers(): Readonly<T['controllers']>;
  beforeControls(): void;
  beforeTick(tick: number): void;
  /** `origin` is the stream attachment's (H-2 spec §6): 'local' for the host's own renderer, 'remote' for a guest. */
  attachHuman(link: Link, players: readonly number[], options: AttachOptions<T['snapshot']>, origin?: 'local' | 'remote'): Unsubscribe;
  dispose(): void;
}
export interface ProducerOptions<T extends EncounterTypes> {
  authority: Authority<T>; init: T['init']; contentDigest: string; resolveLayout: ResolveLayout;
  /** Present on restore: the checkpoint's producer memory. */
  restoredControllers?: T['controllers'];
  /** The host's lifecycle pause, the one ModeHost.pause uses (H-2 spec §6: the duel's peer-lost pause). */
  pause(reason: string): void;
}
/** The mode's stream adapter for one streamed attachment: a link for the authority and its publication sinks. */
export interface StreamBinding<T extends EncounterTypes> { link: Link; attachOptions: AttachOptions<T['snapshot']>; dispose(): void }
export interface EncounterModeOptions<T extends EncounterTypes> {
  modeId: string; schemaVersion: number; simVersion: number;
  rules: EncounterRules<T>;
  resolveLayout: ResolveLayout;
  /** Byte codecs for the init and the checkpoint: decode validates, within Net-3's payload bounds. */
  codecs: {
    decodeInit(bytes: Uint8Array, contentDigest: string): T['init'];
    decodeCheckpoint(bytes: Uint8Array, contentDigest: string): CheckpointOf<T>;
    encodeCheckpoint(checkpoint: CheckpointOf<T>): Uint8Array;
  };
  /** Which player ids an attachment may own (default: distinct integers below the player count, at least one). */
  validPlayers?(players: readonly number[], playerCount: number): boolean;
  producers(options: ProducerOptions<T>): EncounterProducers<T>;
  /** `images`: the host's shared image store for its current authority (Perf-i spec §2.3). */
  publication(link: Link, options: ModeHostDeps & { resolveLayout: ResolveLayout; latestPayloadLimit: number; images?: SharedStateImage }): StreamBinding<T>;
  latestStreamKey?(bytes: Uint8Array): string;
}

/** JSON byte codecs over the rules' validators, bounded by Net-3's host payload limit. */
export function jsonModeCodecs<T extends EncounterTypes>(rules: EncounterRules<T>, resolveLayout: ResolveLayout, label: string = rules.modeId): EncounterModeOptions<T>['codecs'] {
  const decode = (bytes: Uint8Array): unknown => {
    if (!boundedHostBytes(bytes)) throw Error(`${label} payload exceeds limit`);
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  };
  return {
    decodeInit: (bytes, contentDigest) => rules.validateInit(decode(bytes), contentDigest, resolveLayout),
    decodeCheckpoint: (bytes, contentDigest) => rules.validateCheckpoint(decode(bytes), contentDigest, resolveLayout),
    encodeCheckpoint(checkpoint) {
      const bytes = new TextEncoder().encode(JSON.stringify(checkpoint));
      if (!boundedHostBytes(bytes)) throw Error(`${label} payload exceeds limit`);
      return bytes;
    }
  };
}

const distinctPlayers = (players: readonly number[], count: number): boolean =>
  players.length > 0 && !players.some(p => !Number.isInteger(p) || p < 0 || p >= count) && new Set(players).size === players.length;

export function defineEncounterMode<T extends EncounterTypes>(options: EncounterModeOptions<T>): ModeDefinition {
  // One identity: the core labels replays with rules.modeId, Net-3 routes hosts by options.modeId.
  if (options.modeId !== options.rules.modeId) throw new Error(`mode id ${options.modeId} does not match its rules (${options.rules.modeId})`);
  const { modeId: label, rules, resolveLayout, codecs } = options, validPlayers = options.validPlayers ?? distinctPlayers;
  function createHost(deps: ModeHostDeps): ModeHost {
    let authority: Authority<T> | null = null, disposed = false, count = 0;
    let pause: ((control: LifecyclePause) => void) | undefined;
    let producers: EncounterProducers<T> | undefined;
    const attached = new Set<Unsubscribe>();
    const streamDisposals = new Set<Unsubscribe>();
    const captures = new WeakMap<CheckpointOf<T>, ModeCheckpoint>();
    // One image store per authority (Perf-i spec §2.3): renewed with the authority, whose publication sequence keys it.
    let images = createSharedStateImage();
    function candidate(checkpoint: CheckpointOf<T>, cause: CaptureCause): ModeCheckpoint {
      let value = captures.get(checkpoint);
      if (!value) {
        value = { capturedTick: checkpoint.snapshot.header.tick, controlRevision: checkpoint.controlRevision, cause, bytes: codecs.encodeCheckpoint(checkpoint) };
        captures.set(checkpoint, value);
      }
      return value;
    }
    function replace(value: T['init'] | CheckpointOf<T>, restore: boolean): void {
      if (disposed || attached.size) throw Error(`detach producers before replacing ${label}`);
      let nextPause: typeof pause;
      let nextProducers: EncounterProducers<T>;
      const next = createEncounterAuthority(rules, { ...deps, resolveLayout,
        onCheckpoint: deps.onCheckpoint ? (checkpoint, cause) => { deps.onCheckpoint!(candidate(checkpoint, cause)); } : undefined,
        botControllers: () => nextProducers.controllers(),
        beforeControls: () => nextProducers.beforeControls(), beforeTick: tick => nextProducers.beforeTick(tick),
        onCrash(record) { let checkpoint: Uint8Array | null = null; try { checkpoint = codecs.encodeCheckpoint(record.checkpoint); } catch { /* retain diagnostics */ }
          try { nextProducers?.dispose(); } finally { deps.onCrash({ checkpoint, diagnostic: { ...record } }); } },
        bindLifecyclePause(request) { nextPause = request; return () => { if (nextPause === request) nextPause = undefined; }; }
      });
      const init: T['init'] = restore ? (value as CheckpointOf<T>).init : value as T['init'];
      nextProducers = options.producers({ authority: next, init, contentDigest: deps.contentDigest, resolveLayout,
        restoredControllers: restore ? (value as CheckpointOf<T>).botControllers : undefined,
        pause: (reason) => { if (!reason.length || reason.length > 128) throw Error(`${label} pause reason`); nextPause?.({ paused: true, reason }); } });
      try { if (restore) next.restore(value as CheckpointOf<T>); else next.start(init); }
      catch (error) { nextProducers.dispose(); next.dispose(); throw error; }
      const old = authority; authority = next; pause = nextPause; images = createSharedStateImage();
      count = init.playerCount;
      producers?.dispose(); producers = nextProducers;
      old?.dispose();
    }
    return {
      completeBootstrap() { if (!authority || disposed) throw Error(`${label} unavailable`); authority.completeBootstrap(); },
      start(bytes) { replace(codecs.decodeInit(bytes, deps.contentDigest), false); },
      restore(bytes) { replace(codecs.decodeCheckpoint(bytes, deps.contentDigest), true); },
      attach(link, players, policy: AdmissionPolicy, attachOptions?: StreamAttachmentOptions) {
        if (disposed || !authority || !validPlayers(players, count)) throw Error(`invalid ${label} ownership`);
        if (!validStreamAttachmentOptions(attachOptions)) throw Error('invalid stream attachment');
        const stream = attachOptions?.streamed ? options.publication(link, { ...deps, resolveLayout, latestPayloadLimit: attachOptions.latestPayloadLimit!, images }) : undefined;
        let off: Unsubscribe;
        try { off = producers!.attachHuman(stream?.link ?? link, players, { admissionPolicy: policy, ...stream?.attachOptions }, attachOptions?.origin); }
        catch (error) { stream?.dispose(); throw error; }
        if (stream) streamDisposals.add(stream.dispose);
        const detach = () => { if (!attached.delete(detach)) return; try { off(); } finally { if (stream) { streamDisposals.delete(stream.dispose); stream.dispose(); } } };
        attached.add(detach); return detach;
      },
      checkpoint() { if (!authority || disposed) throw Error(`${label} unavailable`); return codecs.encodeCheckpoint(authority.checkpoint(producers!.controllers())); },
      async captureCheckpoint(cause) {
        if (!authority || disposed) throw Error(`${label} unavailable`);
        const captured = await authority.requestCheckpoint(cause);
        return candidate(captured.checkpoint, captured.cause);
      },
      pause(reason) { if (!authority || disposed || !reason.length || reason.length > 128) throw Error(`${label} unavailable`); pause?.({ paused: true, reason }); authority.pump(); },
      dispose() { if (disposed) return; disposed = true; try { producers?.dispose(); } finally { try { authority?.dispose(); } finally {
        authority = null; pause = undefined; attached.clear(); for (const release of streamDisposals) release(); streamDisposals.clear();
      } } }
    };
  }
  return { modeId: options.modeId, schemaVersion: options.schemaVersion, simVersion: options.simVersion, createHost,
    ...(options.latestStreamKey ? { latestStreamKey: options.latestStreamKey } : {}) };
}

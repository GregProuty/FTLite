// The public authority (engine refactor spec §6): createEncounterAuthority runs any encounter through its rules;
// createAuthority is the sector instance. The merged Authority surface and deps are unchanged.
import type { AuthorityMessage, PublishedState, LifecyclePause, Link, MonotonicClock, Scheduler, Unsubscribe } from '../net/contracts';
import type { Replay } from '../sim/replay';
import type { SessionWorkGate } from '../../../shared/sessionLease';
import type { CaptureCause } from '../../../shared/sessionCheckpoint';
import type { AdmissionPolicy } from '../net/receivePolicy';
export type { AdmissionPolicy } from '../net/receivePolicy';
import type { Snapshot } from '../sim/snapshot';
export interface AttachOptions<S = Snapshot> {
  admissionPolicy?: AdmissionPolicy;
  /** Trusted mode adapter, before the ordinary local byte codec. Receives owned data. */
  publicationSink?(state: PublishedState<S>, reliable: boolean): void;
  notificationSink?(message: Extract<AuthorityMessage<S>, { kind: 'result' | 'event' }>, requiredPublicationSequence: number): void;
}
export type { Checkpoint } from './checkpoint';
import type { ShipLayout } from '../sim/ship/schema';
import { createEncounterCore, type CrashRecord } from './core';
import type { CheckpointOf, EncounterRules, EncounterTypes } from './rules';
import { sectorRules, type SectorTypes } from './sectorRules';
export type { CrashRecord, JournalTick } from './core';

export interface EncounterAuthorityDeps<T extends EncounterTypes> {
  onCheckpoint?(checkpoint: CheckpointOf<T>, cause: CaptureCause): void;
  sessionGate?: SessionWorkGate;
  clock: MonotonicClock; scheduler: Scheduler; contentDigest: string;
  resolveLayout(id: string): ShipLayout; onCrash(record: CrashRecord<T>): void;
  botControllers?(): Readonly<T['controllers']>;
  beforeControls?(): void; beforeTick?(nextTick: number, tickTimeMs: number): void;
  /** Trusted couch adapter only; never exposed on Link or assigned a player command ID.
   * The unsubscriber releases only its registration, preserving a newer replacement callback. */
  bindLifecyclePause?(request: (control: LifecyclePause) => void): void | Unsubscribe;
}
export type AuthorityDeps = EncounterAuthorityDeps<SectorTypes>;
/** Live Net-1a owner: closed held/command/contextual-callout ingress; durable restore belongs to Net-1b. */
export interface Authority1a<T extends EncounterTypes = SectorTypes> { attach(link: Link, players: readonly number[], options?: AttachOptions<T['snapshot']>): Unsubscribe; start(init: T['init']): void; pump(): void; dispose(): void }
export interface Authority<T extends EncounterTypes = SectorTypes> extends Authority1a<T> {
  requestCheckpoint(cause: CaptureCause): Promise<{ checkpoint: CheckpointOf<T>; cause: CaptureCause }>;
  completeBootstrap(): void;
  checkpoint(botControllers: Readonly<T['controllers']>): CheckpointOf<T>;
  /** Restore paused with no attached producers. Retire old client/transport queues,
   * then attach fresh producers synchronized from the restored publication. */
  restore(checkpoint: CheckpointOf<T>): void;
  replay(): Replay<T>;
}
export function createAuthority(deps: AuthorityDeps): Authority { return createEncounterAuthority(sectorRules, deps); }
export function createEncounterAuthority<T extends EncounterTypes>(rules: EncounterRules<T>, deps: EncounterAuthorityDeps<T>): Authority<T> {
  let core: ReturnType<typeof createEncounterCore<T>> | null = null, disposed = false;
  const attached = new Map<Link, { players: readonly number[]; options: AttachOptions<T['snapshot']>; off?: Unsubscribe }>();
  return {
    attach(link, players, options = {}) {
      if (disposed || attached.has(link)) throw new Error('authority unavailable');
      if (options.admissionPolicy !== undefined && options.admissionPolicy !== 'strict' && options.admissionPolicy !== 'receive-time') throw new Error('invalid admission policy');
      const entry = { players: [...players], options: { ...options }, off: core?.attach(link, players, options) }; attached.set(link, entry);
      return () => { entry.off?.(); attached.delete(link); };
    },
    start(value) {
      if (disposed) throw new Error('authority disposed');
      const init = rules.validateInit(value, deps.contentDigest, deps.resolveLayout);
      const next = createEncounterCore(rules, { ...deps, init }, rules.create(init, deps.resolveLayout));
      try {
        core?.dispose(); core = next;
        for (const [link, entry] of attached) entry.off = next.attach(link, entry.players, entry.options);
      } catch (error) {
        try { next.dispose(); } finally { core = null; }
        throw error;
      }
    },
    replay() { if (!core || disposed) throw new Error('authority unavailable'); return core.replay(); },
    requestCheckpoint(cause) { if (!core || disposed) return Promise.reject(Error('authority unavailable')); return core.requestCheckpoint(cause); },
    completeBootstrap() { if (!core || disposed) throw Error('authority unavailable'); core.completeBootstrap(); },
    checkpoint(botControllers) { if (!core || disposed) throw new Error('authority unavailable'); return core.checkpoint(botControllers); },
    restore(checkpoint) {
      if (disposed) throw new Error('authority disposed');
      if (attached.size) throw new Error('detach all producers before restore');
      const cp = rules.validateCheckpoint(checkpoint, deps.contentDigest, deps.resolveLayout);
      const next = createEncounterCore(rules, { ...deps, init: cp.init }, rules.restore(cp.snapshot, deps.resolveLayout, cp.modeMemory), cp, true);
      try {
        core?.dispose(); core = next;
      } catch (error) { try { next.dispose(); } finally { core = null; } throw error; }
    },
    pump() { core?.pump(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { core?.dispose(); } finally { core = null; attached.clear(); }
    }
  };
}

import type { LifecyclePause, Link, MonotonicClock, RunInit, Scheduler, Unsubscribe } from '../net/contracts';
import type { ReplayV2 } from '../sim/replay';
import { loadSnapshot } from '../sim/snapshot';
import type { CardUiState } from '../clientControl/cardController';
import { validateCheckpoint, validateRunInit, type Checkpoint } from './checkpoint';
export type { Checkpoint } from './checkpoint';
import { createSimState } from '../sim/state';
import type { ShipLayout } from '../sim/ship/schema';
import { deriveLayout } from '../sim/ship/derived';
import { SIM_VERSION } from '../sim/tuning';
import { createAuthorityCore, type CrashRecord } from './core';
export type { CrashRecord, JournalTick } from './core';

export interface AuthorityDeps {
  clock: MonotonicClock; scheduler: Scheduler; contentDigest: string;
  resolveLayout(id: string): ShipLayout; onCrash(record: CrashRecord): void;
  botControllers?(): readonly CardUiState[];
  beforeControls?(): void; beforeTick?(nextTick: number, tickTimeMs: number): void;
  /** Trusted couch adapter only; never exposed on Link or assigned a player command ID.
   * The unsubscriber releases only its registration, preserving a newer replacement callback. */
  bindLifecyclePause?(request: (control: LifecyclePause) => void): void | Unsubscribe;
}
/** Live Net-1a owner: closed held/command/contextual-callout ingress; durable restore belongs to Net-1b. */
export interface Authority1a { attach(link: Link, players: readonly number[]): Unsubscribe; start(init: RunInit): void; pump(): void; dispose(): void }
export interface Authority extends Authority1a {
  checkpoint(botControllers: readonly CardUiState[]): Checkpoint;
  restore(checkpoint: Checkpoint): void;
  replay(): ReplayV2;
}
export function createAuthority(deps: AuthorityDeps): Authority {
  let core: ReturnType<typeof createAuthorityCore> | null = null, disposed = false;
  const attached = new Map<Link, { players: readonly number[]; off?: Unsubscribe }>();
  return {
    attach(link, players) {
      if (disposed || attached.has(link)) throw new Error('authority unavailable');
      const entry = { players: [...players], off: core?.attach(link, players) }; attached.set(link, entry);
      return () => { entry.off?.(); attached.delete(link); };
    },
    start(init) {
      if (disposed) throw new Error('authority disposed');
      const layout = deps.resolveLayout(init.layoutId);
      init = validateRunInit(layout, init, deps.contentDigest);
      if (init.simVersion !== SIM_VERSION || init.contentDigest !== deps.contentDigest || init.layoutHash !== deriveLayout(layout).layoutHash || layout.id !== init.layoutId) throw new Error('incompatible run');
      const next = createAuthorityCore({ ...deps, init }, createSimState(layout, init.playerCount, init.seed, init.characters, { unlocked: init.unlocked, quirk: init.quirk }));
      try {
        core?.dispose(); core = next;
        for (const [link, entry] of attached) entry.off = next.attach(link, entry.players);
      } catch (error) {
        try { next.dispose(); } finally { core = null; }
        throw error;
      }
    },
    replay() { if (!core || disposed) throw new Error('authority unavailable'); return core.replay(); },
    checkpoint(botControllers) { if (!core || disposed) throw new Error('authority unavailable'); return core.checkpoint(botControllers); },
    restore(checkpoint) {
      if (disposed) throw new Error('authority disposed');
      const layout = deps.resolveLayout(checkpoint?.init?.layoutId);
      const cp = validateCheckpoint(layout, checkpoint, deps.contentDigest);
      for (const entry of attached.values()) if (entry.players.some(p => p >= cp.init.playerCount)) throw new Error('invalid restored ownership');
      if (core && cp.init.runId === core.cursors().runId) {
        const cursors = core.cursors();
        cp.publicationSequence = Math.max(cp.publicationSequence, cursors.publicationSequence);
        cp.eventSequence = Math.max(cp.eventSequence, cursors.eventSequence);
        cp.controlRevision = Math.max(cp.controlRevision, cursors.controlRevision);
      }
      const next = createAuthorityCore({ ...deps, init: cp.init }, loadSnapshot(layout, cp.snapshot, deps.contentDigest), cp, true);
      try {
        core?.dispose(); core = next;
        for (const [link, entry] of attached) entry.off = next.attach(link, entry.players);
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

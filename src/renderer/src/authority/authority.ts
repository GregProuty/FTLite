import type { LifecyclePause, Link, MonotonicClock, RunInit, Scheduler, Unsubscribe } from '../net/contracts';
import { createSimState } from '../sim/state';
import type { ShipLayout } from '../sim/ship/schema';
import { deriveLayout } from '../sim/ship/derived';
import { SIM_VERSION } from '../sim/tuning';
import { createAuthorityCore, type CrashRecord } from './core';
export type { CrashRecord, JournalTick } from './core';

export interface AuthorityDeps {
  clock: MonotonicClock; scheduler: Scheduler; contentDigest: string;
  resolveLayout(id: string): ShipLayout; onCrash(record: CrashRecord): void;
  beforeControls?(): void; beforeTick?(nextTick: number, tickTimeMs: number): void;
  /** Trusted couch adapter only; never exposed on Link or assigned a player command ID. */
  bindLifecyclePause?(request: (control: LifecyclePause) => void): void | Unsubscribe;
}
/** Live Net-1a owner: closed held/command/contextual-callout ingress; durable restore belongs to Net-1b. */
export interface Authority1a { attach(link: Link, players: readonly number[]): Unsubscribe; start(init: RunInit): void; pump(): void; dispose(): void }
export function createAuthority(deps: AuthorityDeps): Authority1a {
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
    pump() { core?.pump(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { core?.dispose(); } finally { core = null; attached.clear(); }
    }
  };
}

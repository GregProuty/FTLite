import type { Link, MonotonicClock, RunInit, Scheduler, Unsubscribe } from '../net/contracts';
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
}
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
      core?.dispose();
      core = createAuthorityCore({ ...deps, init }, createSimState(layout, init.playerCount, init.seed, init.characters, { unlocked: init.unlocked, quirk: init.quirk }));
      for (const [link, entry] of attached) entry.off = core.attach(link, entry.players);
    },
    pump() { core?.pump(); },
    dispose() { disposed = true; core?.dispose(); core = null; attached.clear(); }
  };
}

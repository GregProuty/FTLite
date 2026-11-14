import { createAuthority, type AuthorityDeps } from '../authority/authority';
import { createClientRun } from '../clientControl/clientRun';
import { translateTick } from '../clientControl/cardController';
import type { InputFrame } from '../clientControl/inputFrame';
import type { AuthorityEvent, MonotonicClock, PublishedState, Scheduler } from '../net/contracts';
import { createLoopbackHarness } from '../net/loopback';
import type { ShipLayout } from '../sim/ship/schema';
import { deriveLayout } from '../sim/ship/derived';
import type { SimState } from '../sim/state';
import { SIM_VERSION } from '../sim/tuning';

export interface LocalRuntimeDeps {
  layout: ShipLayout; playerCount: number; seed: number; characters: readonly number[]; unlocked: readonly string[];
  runId: string; contentDigest: string; clock: MonotonicClock; scheduler: Scheduler;
  frames(tick: number): readonly InputFrame[];
  beforeControls?(): void; recordPrev?(view: SimState): void; draw?(view: SimState): void;
  onPublication?(view: SimState, publication: PublishedState): void; onEvent?(event: AuthorityEvent): void;
  onCrash: AuthorityDeps['onCrash']; authorityFactory?: typeof createAuthority;
}
export function createLocalRuntime(deps: LocalRuntimeDeps) {
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: deps.contentDigest });
  const pair = transport.connectLocal(), owned = Array.from({ length: deps.playerCount }, (_, p) => p);
  const client = createClientRun(pair.clientLink, owned, { runId: deps.runId, resolveLayout: () => deps.layout });
  let disposed = false, notifiedSequence = 0;
  function receive(): void {
    transport.drain();
    const view = client.state(), publication = client.publication();
    if (view && publication && publication.publicationSequence > notifiedSequence) {
      notifiedSequence = publication.publicationSequence;
      deps.onPublication?.(view, publication);
    }
    for (const event of client.takeEvents()) deps.onEvent?.(event);
  }
  const authority = (deps.authorityFactory ?? createAuthority)({
    clock: deps.clock, contentDigest: deps.contentDigest, resolveLayout: () => deps.layout, onCrash: deps.onCrash,
    scheduler: { schedule: (delay, cb) => deps.scheduler.schedule(delay, () => { if (!disposed) { cb(); receive(); } }) },
    beforeControls() { deps.beforeControls?.(); receive(); },
    beforeTick(tick) { receive(); const view = client.state(); if (view) { deps.recordPrev?.(view); client.send(translateTick(view, client.ui, deps.frames(tick), tick)); } transport.drain(); }
  });
  authority.attach(pair.authorityLink, owned);
  authority.start({ runId: deps.runId, layoutId: deps.layout.id, layoutHash: deriveLayout(deps.layout).layoutHash, simVersion: SIM_VERSION, contentDigest: deps.contentDigest,
    seed: deps.seed, playerCount: deps.playerCount, characters: deps.characters, unlocked: deps.unlocked });
  receive();
  return {
    state: client.state, publication: client.publication,
    pump() { if (!disposed) { authority.pump(); receive(); } },
    frame() { const view = client.state(); if (!disposed && view) deps.draw?.(view); },
    requestPause(paused: boolean) {
      const view = client.state(), producer = client.ui.players[0]; if (!view || !producer || disposed) return;
      client.send({ held: [], legacyCardInput: [], commands: [{ runId: deps.runId, id: { player: 0, sequence: producer.nextSequence++ }, requestedTick: view.tick, command: { kind: 'setPaused', paused } }] });
    },
    dispose() { if (disposed) return; disposed = true; authority.dispose(); client.dispose(); pair.host.close('disposed'); pair.client.close('disposed'); }
  };
}

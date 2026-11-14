import { createAuthority, type AuthorityDeps } from '../authority/authority';
import { createClientRun } from '../clientControl/clientRun';
import { pauseActions, translateTick } from '../clientControl/cardController';
import type { InputFrame } from '../clientControl/inputFrame';
import type { AuthorityEvent, LifecyclePause, MonotonicClock, PublishedState, Scheduler } from '../net/contracts';
import { createLoopbackHarness } from '../net/loopback';
import type { ShipLayout } from '../sim/ship/schema';
import { deriveLayout } from '../sim/ship/derived';
import type { SimState } from '../sim/state';
import { SIM_VERSION } from '../sim/tuning';
import { TICK_HZ } from '../sim/tuning';
import { Seated } from '../sim/components';

export interface LocalRuntimeDeps {
  layout: ShipLayout; playerCount: number; seed: number; characters: readonly number[]; unlocked: readonly string[];
  runId: string; contentDigest: string; clock: MonotonicClock; scheduler: Scheduler;
  frames(tick: number, tickTimeMs: number): readonly InputFrame[];
  beforeControls?(): void; recordPrev?(view: SimState): void; draw?(view: SimState, alpha: number): void;
  onPublication?(view: SimState, publication: PublishedState): void; onEvent?(event: AuthorityEvent): void;
  onCrash: AuthorityDeps['onCrash']; authorityFactory?: typeof createAuthority;
}
export function createLocalRuntime(deps: LocalRuntimeDeps) {
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: deps.contentDigest });
  const pair = transport.connectLocal(), owned = Array.from({ length: deps.playerCount }, (_, p) => p);
  const client = createClientRun(pair.clientLink, owned, { runId: deps.runId, contentDigest: deps.contentDigest, resolveLayout: () => deps.layout });
  let disposed = false, notifiedSequence = 0;
  let requestLifecycle: ((control: LifecyclePause) => void) | null = null;
  let bracketTick: number | null = null, validBracket = false, lastSeats: number[] = [], lastArrival = -1, lastRevision = -1;
  function receive(): void {
    transport.drain();
    const view = client.state(), publication = client.publication();
    if (view && publication && publication.publicationSequence > notifiedSequence) {
      notifiedSequence = publication.publicationSequence;
      const seats = Array.from(view.crew, (eid) => Seated.station[eid]!);
      validBracket = bracketTick !== null && publication.tick === bracketTick + 1 && publication.phase === 'running'
        && publication.controlRevision === lastRevision && view.run.arrivalTick === lastArrival && seats.every((seat, p) => seat === lastSeats[p]);
      if (!validBracket) deps.recordPrev?.(view);
      lastSeats = seats; lastArrival = view.run.arrivalTick; lastRevision = publication.controlRevision;
      deps.onPublication?.(view, publication);
    }
    for (const event of client.takeEvents()) deps.onEvent?.(event);
  }
  let authority: ReturnType<typeof createAuthority> | undefined;
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    const errors: unknown[] = [];
    for (const cleanup of [() => authority?.dispose(), () => client.dispose(), () => pair.host.close('disposed'), () => pair.client.close('disposed')]) {
      try { cleanup(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw errors[0];
  }
  try {
  authority = (deps.authorityFactory ?? createAuthority)({
    clock: deps.clock, contentDigest: deps.contentDigest, resolveLayout: () => deps.layout, onCrash: deps.onCrash,
    scheduler: { schedule: (delay, cb) => deps.scheduler.schedule(delay, () => { if (!disposed) { cb(); receive(); } }) },
    bindLifecyclePause(request) { requestLifecycle = request; return () => { if (requestLifecycle === request) requestLifecycle = null; }; },
    beforeControls() { receive(); deps.beforeControls?.(); transport.drain(); },
    beforeTick(tick, deadline) { receive(); const view = client.state(); if (view) { bracketTick = view.tick; deps.recordPrev?.(view); client.send(translateTick(view, client.ui, deps.frames(tick, deadline), tick)); } transport.drain(); }
  });
  authority.attach(pair.authorityLink, owned);
  authority.start({ runId: deps.runId, layoutId: deps.layout.id, layoutHash: deriveLayout(deps.layout).layoutHash, simVersion: SIM_VERSION, contentDigest: deps.contentDigest,
    seed: deps.seed, playerCount: deps.playerCount, characters: deps.characters, unlocked: deps.unlocked });
  receive();
  } catch (error) {
    try { dispose(); } catch { /* preserve the startup error after attempting all cleanup */ }
    throw error;
  }
  return {
    state: client.state, ui: client.ui, publication: client.publication,
    callout: client.callout,
    pump() { if (!disposed) { authority!.pump(); receive(); } },
    frame() {
      const view = client.state(), publication = client.publication();
      if (!disposed && view && publication) {
        const alpha = validBracket && publication.lagTicks === 0 && publication.tickTimeMs !== null
          ? Math.max(0, Math.min(1, (deps.clock.nowMs() - publication.tickTimeMs) * TICK_HZ / 1000)) : 1;
        deps.draw?.(view, alpha);
      }
    },
    requestPause(paused: boolean, player = 0) {
      const view = client.state(); if (!view || disposed) return;
      client.send(pauseActions(client.ui, player, view.tick, paused));
    },
    requestLifecyclePause(control: LifecyclePause) { if (!disposed) requestLifecycle?.(control); },
    dispose
  };
}

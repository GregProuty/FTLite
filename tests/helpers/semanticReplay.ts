import { runReplay } from '../../src/renderer/src/authority/replay';
import type { ReplayV2, ReplayFrame } from '../../src/renderer/src/sim/replay';
import { DEFAULT_CHARACTERS } from '../../src/renderer/src/sim/characters';
import type { ShipLayout } from '../../src/renderer/src/sim/ship/schema';
import { loadSnapshot, type Snapshot } from './simLifetime';
import { hashState } from '../../src/renderer/src/sim/hash';
import type { TickInput } from '../../src/renderer/src/sim/commands';
import { SIM_VERSION, TICK_HZ } from '../../src/renderer/src/sim/tuning';
import { deriveLayout } from '../../src/renderer/src/sim/ship/derived';
import { createFixtureAuthority } from './authorityFixture';
import { createLoopbackHarness } from '../../src/renderer/src/net/loopback';
import { createClientRun } from '../../src/renderer/src/clientControl/clientRun';
import type { ClientActions } from '../../src/renderer/src/clientControl/cardController';
import type { SimState } from '../../src/renderer/src/sim/state';

/** Test-local semantic trace, not the deferred portable replay-v2 format. */
export interface SemanticTrace { version: 'net1a-test'; runId: string; seed: number; initial: Snapshot; ticks: TickInput[] }
export function semanticRunner(layout: ShipLayout, initial: Snapshot, seed: number, runId: string, contentDigest = __GAMEPLAY_CONTENT_DIGEST__) {
  const state = loadSnapshot(layout, initial, contentDigest);
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest });
  const pair = transport.connectLocal(), owned = state.crew.map((_, p) => p);
  const client = createClientRun(pair.clientLink, owned, { runId, contentDigest, resolveLayout: () => layout });
  let now = 0, ordinal = 0;
  const authority = createFixtureAuthority({ clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, contentDigest, resolveLayout: () => layout, onCrash(r) { throw Error(r.error); },
    init: { runId, seed, playerCount: state.playerCount, characters: [], unlocked: [], layoutId: layout.id, layoutHash: deriveLayout(layout).layoutHash, simVersion: SIM_VERSION, contentDigest } }, state);
  authority.attach(pair.authorityLink, owned); transport.drain();
  return { state, client,
    advance(actions: ClientActions) { client.send(actions); transport.drain(); now = ++ordinal * 1000 / TICK_HZ; authority.pump(); transport.drain(); client.takeEvents(); },
    dispose() { authority.dispose(); client.dispose(); pair.host.close('done'); pair.client.close('done'); }
  };
}
/** Representation-only adapter for pre-Net-1b test fixtures. Production accepts v2 only. */
export function portableSemanticTrace(layout: ShipLayout, trace: SemanticTrace, contentDigest = __GAMEPLAY_CONTENT_DIGEST__): ReplayV2 {
  const state = loadSnapshot(layout, trace.initial, contentDigest);
  const init = { runId: trace.runId, seed: trace.seed, playerCount: state.playerCount, characters: [...DEFAULT_CHARACTERS], unlocked: [],
    layoutId: layout.id, layoutHash: deriveLayout(layout).layoutHash, simVersion: SIM_VERSION, contentDigest };
  const core = createFixtureAuthority({ init, contentDigest, resolveLayout: () => layout, clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash(r) { throw Error(r.error); } }, state);
  const checkpoint = core.captureCheckpoint(), frames: ReplayFrame[] = [], players = state.crew.map((_, p) => p);
  let order = 0;
  const apply = (action: ReplayFrame['action']) => frames.push(core.replayFrame({ tick: state.tick, eventSequenceBefore: core.cursors().eventSequence, action, results: [], events: [] }));
  try {
    for (let t = 0; t < trace.ticks.length; t++) {
      const input = trace.ticks[t]!;
      apply({ kind: 'admission', entries: [
        ...input.held.map((held, player) => ({ binding: 1, players, order: ++order, message: { kind: 'held' as const, frame: { runId: init.runId, player, tick: state.tick, sequence: t + 1, held } } })),
        ...input.commands.map(envelope => ({ binding: 1, players, order: ++order, message: { kind: 'command' as const, envelope } }))
      ] });
      apply({ kind: 'tick', input, heldSequences: players.map(() => t + 1) });
    }
    return { version: 2, init, initial: checkpoint.snapshot, checkpoint, frames };
  } finally { core.dispose(); }
}
export function runSemanticReplay(layout: ShipLayout, trace: SemanticTrace | ReplayV2, every = 60, contentDigest = __GAMEPLAY_CONTENT_DIGEST__, observe?: (state: SimState) => void): { hashes: string[]; finalHash: string } {
  const replay = trace.version === 2 ? trace : portableSemanticTrace(layout, trace, contentDigest);
  const hashes: string[] = [];
  const result = runReplay(layout, replay, contentDigest, state => {
    if (state.tick % every === 0) { hashes.push(hashState(state)); observe?.(state); }
  });
  return { hashes, finalHash: result.hashes.at(-1) ?? hashState(loadSnapshot(layout, result.checkpoint.snapshot, contentDigest)) };
}

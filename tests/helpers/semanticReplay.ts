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
  const state = loadSnapshot(layout, initial);
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest });
  const pair = transport.connectLocal(), owned = state.crew.map((_, p) => p);
  const client = createClientRun(pair.clientLink, owned, { runId, resolveLayout: () => layout });
  let now = 0, ordinal = 0;
  const authority = createFixtureAuthority({ clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, contentDigest, resolveLayout: () => layout, onCrash(r) { throw Error(r.error); },
    init: { runId, seed, playerCount: state.playerCount, characters: [], unlocked: [], layoutId: layout.id, layoutHash: deriveLayout(layout).layoutHash, simVersion: SIM_VERSION, contentDigest } }, state);
  authority.attach(pair.authorityLink, owned); transport.drain();
  return { state, client,
    advance(actions: ClientActions) { client.send(actions); transport.drain(); now = ++ordinal * 1000 / TICK_HZ; authority.pump(); transport.drain(); client.takeEvents(); },
    dispose() { authority.dispose(); client.dispose(); pair.host.close('done'); pair.client.close('done'); }
  };
}
export function runSemanticReplay(layout: ShipLayout, trace: SemanticTrace, every = 60, contentDigest = __GAMEPLAY_CONTENT_DIGEST__, observe?: (state: SimState) => void): { hashes: string[]; finalHash: string } {
  const runner = semanticRunner(layout, trace.initial, trace.seed, trace.runId, contentDigest), hashes: string[] = [];
  try {
    for (let t = 0; t < trace.ticks.length; t++) {
      const input = trace.ticks[t]!;
      runner.advance({ held: input.held.map((held, player) => ({ runId: trace.runId, player, tick: runner.state.tick, sequence: t + 1, held })), commands: [...input.commands] });
      if ((t + 1) % every === 0) { hashes.push(hashState(runner.state)); observe?.(runner.state); }
    }
    return { hashes, finalHash: hashState(runner.state) };
  } finally { runner.dispose(); }
}

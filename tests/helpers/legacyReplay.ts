import type { ShipLayout } from '../../src/renderer/src/sim/ship/schema';
import { createSimState, disposeSimState } from './simLifetime';
import { saveSnapshot } from '../../src/renderer/src/sim/snapshot';
import { deriveLayout } from '../../src/renderer/src/sim/ship/derived';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { decodeIntent, type Replay } from '../../src/renderer/src/sim/replay';
import { translateTick } from '../../src/renderer/src/clientControl/cardController';
import { semanticRunner, type SemanticTrace } from './semanticReplay';
import { rawFrame } from './rawInput';
/** Convert historical fixture presses once; the resulting trace executes only semantic inputs. */
export function convertLegacyReplay(layout: ShipLayout, replay: Replay, contentDigest = __GAMEPLAY_CONTENT_DIGEST__): SemanticTrace {
  if (replay.layoutId !== layout.id) throw new Error(`replay is for layout ${replay.layoutId}, loaded ${layout.id}`);
  if (replay.simVersion !== SIM_VERSION) throw new Error(`replay is for sim version ${replay.simVersion}, running ${SIM_VERSION}`);
  if (replay.layoutHash !== deriveLayout(layout).layoutHash) throw new Error('replay layout hash does not match the loaded layout');
  const state = createSimState(layout, replay.playerCount, replay.seed);
  let initial: ReturnType<typeof saveSnapshot>;
  try { initial = saveSnapshot(state); } finally { disposeSimState(state); }
  const trace: SemanticTrace = { version: 'net1a-test', runId: 'golden', seed: replay.seed, initial, ticks: [] };
  const runner = semanticRunner(layout, initial, replay.seed, trace.runId, contentDigest);
  try {
    for (const row of replay.intents) {
      const actions = translateTick(runner.client.state()!, runner.client.ui, row.map(decodeIntent).map(rawFrame), runner.state.tick);
      trace.ticks.push({ held: actions.held.map(frame => ({ ...frame.held })), commands: structuredClone(actions.commands) });
      runner.advance(actions);
    }
  } finally { runner.dispose(); }
  return trace;
}

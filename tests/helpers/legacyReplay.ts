import type { ShipLayout } from '../../src/renderer/src/sim/ship/schema';
import { createSimState } from '../../src/renderer/src/sim/state';
import { hashState } from '../../src/renderer/src/sim/hash';
import { deriveLayout } from '../../src/renderer/src/sim/ship/derived';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { decodeIntent, type Replay } from '../../src/renderer/src/sim/replay';
import { createFixtureRunner } from './authorityFixture';
import { rawFrame } from './rawInput';
/** Headless replay. Hashes every `every` ticks localize a divergence; the final hash is the verdict (spec §10). */
export function runReplay(layout: ShipLayout, replay: Replay, every = 60, contentDigest = __GAMEPLAY_CONTENT_DIGEST__): { hashes: string[]; finalHash: string } {
  if (replay.layoutId !== layout.id) throw new Error(`replay is for layout ${replay.layoutId}, loaded ${layout.id}`);
  if (replay.simVersion !== SIM_VERSION) throw new Error(`replay is for sim version ${replay.simVersion}, running ${SIM_VERSION}`);
  if (replay.layoutHash !== deriveLayout(layout).layoutHash) throw new Error('replay layout hash does not match the loaded layout');
  const state = createSimState(layout, replay.playerCount, replay.seed);
  const runner = createFixtureRunner(state, contentDigest);
  const hashes: string[] = [];
  for (let t = 0; t < replay.intents.length; t++) {
    runner.advance(replay.intents[t]!.map(decodeIntent).map(rawFrame));
    if ((t + 1) % every === 0) hashes.push(hashState(state));
  }
  runner.dispose();
  return { hashes, finalHash: hashState(state) };
}

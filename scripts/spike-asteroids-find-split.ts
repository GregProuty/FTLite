// Re-finds tests/duelCheckpoint.test.ts's SPLIT after a gameplay change: per seed 1..10, the scripted duel's outcome and
// end tick, the first tick from 5000 on that ends with a missile in flight, a damaged crew room and a repair in progress
// (−1: none), and the end summary the test pins. Usage: npx tsx scripts/spike-asteroids-find-split.ts
// The duel helpers read the bundler-defined __GAMEPLAY_CONTENT_DIGEST__ at call time; tsx defines nothing, so it is
// supplied here before any duelInit (as vitest.config.ts does).
import { computeContentDigest } from '../build/contentDigest';
import { duelRules } from '../src/renderer/src/authority/duelRules';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { createDriver, duelCore, duelInit, stepScripted } from '../tests/helpers/duelAuthority';

(globalThis as Record<string, unknown>).__GAMEPLAY_CONTENT_DIGEST__ = computeContentDigest(process.cwd());
for (let seed = 1; seed <= 10; seed++) {
  const h = duelCore(duelInit(seed)), driver = createDriver(seed);
  let split = -1;
  try {
    while (h.state.duel.tactical.outcome === Outcome.Running) {
      stepScripted(h, driver);
      const d = h.state.duel, tick = duelRules.tick(h.state);
      if (split < 0 && tick >= 5000 && d.tactical.missiles.some((m) => m.active) && d.tactical.systems[0].rooms.some((r) => r > 0) && d.repair.some((r) => r > 0)) split = tick;
    }
    console.log(`seed ${seed}: outcome ${h.state.duel.tactical.outcome} at tick ${duelRules.tick(h.state)}, SPLIT ${split}, summary ${JSON.stringify(h.state.summary)}`);
  } finally { h.core.dispose(); }
}

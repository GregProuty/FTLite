import { describe, it, expect } from 'vitest';
import { tracedStep as step, beginGateTrace, assertGateTrace } from './helpers/gateTrace';
import { Life, LifeState, Health } from '../src/renderer/src/sim/components';
import { seconds } from './helpers/sim';
import { botIntent } from './helpers/bot';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState } from './helpers/simLifetime';
import { HEALTH_MAX } from '../src/renderer/src/sim/tuning';
import { DEFAULT_CHARACTERS } from '../src/renderer/src/sim/characters';

// Spec Demo-x-a section 4: gate-duo's loop on the Skiff (the calm start, then the sector run with the captain bot jumping from the Helm).
// Recorded 2026-11-12: min health 42.8 / 15.0 / 26.1, min hull 60 / 80 / 76, encounters 4 / 2 / 3, boardings 0. The floor 14 sits just under
// the observed minimum (seed 2), not at gate-duo's 25, which seed 2 misses. Traced: an enemy hit at 208 s sets Ops on fire; the healthier bot
// (52.6) fights it alone for 12 s down to 15.0 while the hurt one (19.0, below the bots' retreat health) keeps out on the Bridge.
// Demo-xiii (the bot gunner, the faster Pulse, enemy shots of 10 hull): min health 60.9 / 25.3 / 67.8, min hull 54 / 42 / 90; the floor raised 14 -> 25, just under seed 2's
// 25.3 (gate-duo's floor too). Seed 2's low point, traced: a Life Support fire (208 s) and an Ops hit (232 s) send both bots to fires and the Medbay, the
// enemy at 95 of 120 hull with nobody at the guns; at 244 s a shot lands in the Medbay while the captain heals there (42 to 25.3).
const SKIFF_FLOOR = 25;

describe('gate-skiff: two bots keep both crew alive on the Skiff for five minutes', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}`, { timeout: 60_000 }, () => {
      const s = createSimState(parseShip(skiff), 2, seed, DEFAULT_CHARACTERS);
      let minHealth = HEALTH_MAX, minHull = s.hull;
      beginGateTrace(s, `skiff:${seed}`);
      for (let t = 0; t < seconds(300) && !s.ended; t++) {
        step(s, [botIntent(s, 0), botIntent(s, 1)]);
        minHull = Math.min(minHull, s.hull);
        for (const eid of s.crew) if (Life.state[eid] === LifeState.Conscious) minHealth = Math.min(minHealth, Health.cur[eid]!);
      }
      assertGateTrace(s);
      const figures = `min health ${minHealth.toFixed(1)}, min hull ${minHull}, boardings ${s.telemetry.boardings}, encounters ${s.telemetry.encounters}`;
      expect(s.ended, `run ended at ${Math.floor(s.tick / 60)}s, reason ${s.endReason}; ${figures}`).toBe(0);
      expect(s.crew.filter((eid) => Life.state[eid] === LifeState.Conscious).length, figures).toBe(2);
      expect(s.telemetry.jumps, figures).toBeGreaterThanOrEqual(1);   // the captain bot flies from the Helm group
      expect(minHealth, figures).toBeGreaterThanOrEqual(SKIFF_FLOOR);
    });
  }
});

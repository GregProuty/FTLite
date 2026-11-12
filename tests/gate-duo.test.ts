import { describe, it, expect } from 'vitest';
import { step } from '../src/renderer/src/sim/step';
import { Life, LifeState, Health } from '../src/renderer/src/sim/components';
import { makeState, seconds } from './helpers/sim';
import { botIntent } from './helpers/bot';
import { HEALTH_MAX } from '../src/renderer/src/sim/tuning';
import { DEFAULT_CHARACTERS } from '../src/renderer/src/sim/characters';

// Spec Demo-i section 5: the duo gate. The survival gate's loop and metric verbatim, target minHealth >= 25 (baseline 0.0 / 0.1 / 0.1).
describe('demo gate: two bots keep both crew healthy for five minutes', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}`, () => {
      const s = makeState(2, seed, DEFAULT_CHARACTERS);
      let minHealth = HEALTH_MAX, minHull = s.hull;
      for (let t = 0; t < seconds(300) && !s.ended; t++) {
        step(s, [botIntent(s, 0), botIntent(s, 1)]);
        minHull = Math.min(minHull, s.hull);
        for (const eid of s.crew) if (Life.state[eid] === LifeState.Conscious) minHealth = Math.min(minHealth, Health.cur[eid]!);
      }
      const figures = `min health ${minHealth.toFixed(1)}, min hull ${minHull}, boardings ${s.telemetry.boardings}, encounters ${s.telemetry.encounters}`;
      expect(s.ended, `run ended at ${Math.floor(s.tick / 60)}s, reason ${s.endReason}; ${figures}`).toBe(0);
      expect(s.crew.filter((eid) => Life.state[eid] === LifeState.Conscious).length, figures).toBe(2);
      // seed 1 was the motivating case for the bot rule (two debris-started fires and one impact in 237-257 s; min health 0.1 before, 10.0 with a one-shot retreat, 28.8 with the stay-until-60 rule); every seed now clears the common 25 floor (spec Demo-ii section 10)
      expect(minHealth, figures).toBeGreaterThanOrEqual(25);
    });
  }
});

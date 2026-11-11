import { describe, it, expect } from 'vitest';
import { step } from '../src/renderer/src/sim/step';
import { botIntent } from '../src/renderer/src/sim/bot';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { DEFAULT_CHARACTERS } from '../src/renderer/src/sim/characters';
import { TICK_HZ, HEALTH_MAX } from '../src/renderer/src/sim/tuning';
import { makeState, quiet, seconds } from './helpers/sim';

describe('boarding gate: two bots clear a forced boarding at 1:00 with the ship otherwise quiet', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}`, () => {
      const s = makeState(2, seed, DEFAULT_CHARACTERS); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 60 * TICK_HZ;
      let minHealth = HEALTH_MAX;
      for (let t = 0; t < seconds(180) && !s.ended; t++) {
        step(s, [botIntent(s, 0), botIntent(s, 1)]);
        for (const eid of s.crew) if (Life.state[eid] === LifeState.Conscious) minHealth = Math.min(minHealth, Health.cur[eid]!);
      }
      const figures = `boardings ${s.telemetry.boardings}, killed ${s.telemetry.boardersKilled}, min health ${minHealth.toFixed(1)}`;
      expect(s.ended, figures).toBe(0);
      expect(s.telemetry.boardings, figures).toBeGreaterThanOrEqual(1);
      expect(s.telemetry.boardersKilled, figures).toBeGreaterThanOrEqual(2);
      expect(s.crew.filter((eid) => Life.state[eid] === LifeState.Conscious).length, figures).toBe(2);
    });
  }
});

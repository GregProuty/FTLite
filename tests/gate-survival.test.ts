import { describe, it, expect } from 'vitest';
import { step } from '../src/renderer/src/sim/step';
import { Life, LifeState, Position } from '../src/renderer/src/sim/components';
import { interactTarget, TargetKind } from '../src/renderer/src/sim/interact';
import { roomAt } from '../src/renderer/src/sim/grid';
import { makeState, seconds } from './helpers/sim';
import { botIntent } from './helpers/bot';

const FIVE_MINUTES = seconds(300);

describe('increment 1 gate: two bots survive five minutes', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}`, () => {
      const s = makeState(2, seed);
      let minHull = s.hull, impacts = 0, lastImpact = -1, maxHazards = 0, repairsSeen = false, fireRepairOutsideRoom = 0;
      for (let t = 0; t < FIVE_MINUTES && !s.ended; t++) {
        const intents = [botIntent(s, 0), botIntent(s, 1)];
        // Every fire-repair attempt must happen with the repairer inside the burning room.
        for (let p = 0; p < 2; p++) {
          const target = interactTarget(s, p);
          if (target.kind === TargetKind.Fire && intents[p]!.interactHeld) {
            const eid = s.crew[p]!;
            if (roomAt(s, Position.x[eid]!, Position.y[eid]!) !== target.index) fireRepairOutsideRoom++;
          }
        }
        step(s, intents);
        minHull = Math.min(minHull, s.hull);
        const newest = Math.max(...s.rooms.impactTick);
        if (newest !== lastImpact) { if (newest >= 0) impacts++; lastImpact = newest; }
        let active = 0;
        for (const f of s.rooms.fire) if (f > 0) active++;
        for (const b of s.breaches.active) if (b) active++;
        maxHazards = Math.max(maxHazards, active);
        if (Array.from(s.rooms.fireRepair).some((p) => p > 0) || Array.from(s.breaches.repair).some((p) => p > 0)) repairsSeen = true;
      }
      expect(s.ended, `run ended at ${Math.floor(s.tick / 60)}s, reason ${s.endReason}`).toBe(0);
      expect(fireRepairOutsideRoom).toBe(0);
      expect(impacts, `min hull ${minHull}`).toBeGreaterThan(0);
      expect(maxHazards).toBeGreaterThan(0);
      expect(repairsSeen).toBe(true);
      expect(s.crew.filter((eid) => Life.state[eid] === LifeState.Conscious).length).toBe(2);
    });
  }
});

import { describe, it, expect } from 'vitest';
import { stepAccumulator, MAX_TICKS_PER_FRAME } from '../src/renderer/src/app/loop';
import { DT } from '../src/renderer/src/sim/tuning';
import { hashState } from '../src/renderer/src/sim/hash';
import { step } from '../src/renderer/src/sim/step';
import { makeState, intents } from './helpers/sim';

describe('stepAccumulator', () => {
  it('yields one tick per DT and keeps the remainder', () => {
    const r = stepAccumulator(0, DT * 2.5);
    expect(r.ticks).toBe(2); expect(r.accumulator).toBeCloseTo(DT * 0.5, 9);
  });
  it('clamps a long frame and discards the backlog', () => {
    const r = stepAccumulator(0, 1.0);
    expect(r.ticks).toBe(MAX_TICKS_PER_FRAME); expect(r.accumulator).toBe(0);
  });
  it('property: batching ticks into different frame sizes gives identical sim results', () => {
    const script = Array.from({ length: 300 }, (_, t) => intents({ moveX: t % 2 ? 1 : 0, interactHeld: t % 7 === 0 }, { moveY: -1 }));
    const direct = makeState(2, 5);
    for (const i of script) step(direct, i);
    for (const frame of [DT, DT * 2, DT * 3.3, DT * 4.9]) {
      const s = makeState(2, 5);
      let acc = 0, t = 0;
      while (t < script.length) {
        const r = stepAccumulator(acc, frame); acc = r.accumulator;
        for (let k = 0; k < r.ticks && t < script.length; k++) step(s, script[t++]!);
      }
      expect(hashState(s)).toBe(hashState(direct));
    }
  });
});

import { describe, expect, it } from 'vitest';
import { createInputTimeline } from '../src/renderer/src/app/inputTimeline';
import { NEUTRAL_FRAME } from '../src/renderer/src/clientControl/inputFrame';

describe('timestamped input timeline', () => {
  it('never applies a new held state or edge to historical debt', () => {
    const input = createInputTimeline(1);
    input.sample(0, [{ ...NEUTRAL_FRAME, moveX: 0.8, moveY: 0.8, interactHeld: true }]);
    input.sample(5000, [{ ...NEUTRAL_FRAME, moveX: -1, confirmPresses: 1 }]);
    expect(input.consume(1000)[0]).toEqual({ ...NEUTRAL_FRAME, moveX: 0.8, moveY: 0.8, interactHeld: true });
    expect(input.consume(4999)[0]!.confirmPresses).toBe(0);
    expect(input.consume(5000)[0]).toEqual({ ...NEUTRAL_FRAME, moveX: -1, confirmPresses: 1 });
    expect(input.consume(5017)[0]!.confirmPresses).toBe(0);
  });
  it('delivers at most one queued edge per type/player/tick with copied samples', () => {
    const input = createInputTimeline(2), sample = { ...NEUTRAL_FRAME, confirmPresses: 3, interactPresses: 2, cancelPresses: 1 };
    input.sample(5, [sample, { ...NEUTRAL_FRAME, cancelPresses: 2 }]); sample.confirmPresses = 0;
    expect(input.consume(4)).toEqual([NEUTRAL_FRAME, NEUTRAL_FRAME]);
    expect(input.consume(5)).toEqual([{ ...NEUTRAL_FRAME, confirmPresses: 1, interactPresses: 1, cancelPresses: 1 }, { ...NEUTRAL_FRAME, cancelPresses: 1 }]);
    expect(input.consume(20)).toEqual([{ ...NEUTRAL_FRAME, confirmPresses: 1, interactPresses: 1 }, { ...NEUTRAL_FRAME, cancelPresses: 1 }]);
    expect(input.consume(40)[0]!.confirmPresses).toBe(1); expect(input.consume(60)).toEqual([NEUTRAL_FRAME, NEUTRAL_FRAME]);
  });
  it('neutralizes held repair and pending edges at the suspension timestamp', () => {
    const input = createInputTimeline(1);
    input.sample(0, [{ ...NEUTRAL_FRAME, interactHeld: true, confirmPresses: 2 }]); input.neutralize(500);
    expect(input.consume(400)[0]).toMatchObject({ interactHeld: true, confirmPresses: 1 });
    expect(input.consume(500)[0]).toEqual(NEUTRAL_FRAME);
    input.sample(10500, [{ ...NEUTRAL_FRAME, confirmPresses: 1 }]);
    expect(input.consume(501)[0]).toEqual(NEUTRAL_FRAME); expect(input.consume(10500)[0]!.confirmPresses).toBe(1);
    expect(input.consume(10517)[0]!.confirmPresses).toBe(0);
  });
});

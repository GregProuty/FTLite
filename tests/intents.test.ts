import { describe, it, expect } from 'vitest';
import { createIntentFeed, NEUTRAL_FRAME } from '../src/renderer/src/app/intents';

describe('intent feed', () => {
  it('copies held values into every tick of a batch and delivers an edge once', () => {
    const feed = createIntentFeed(1);
    feed.beginFrame([{ ...NEUTRAL_FRAME, moveX: 1, interactHeld: true, interactPresses: 1 }]);
    const t1 = feed.tick(), t2 = feed.tick(), t3 = feed.tick();
    expect(t1[0]!.interactPressed).toBe(true); expect(t2[0]!.interactPressed).toBe(false); expect(t3[0]!.interactPressed).toBe(false);
    expect(t1[0]!.moveX).toBe(1); expect(t3[0]!.moveX).toBe(1); expect(t3[0]!.interactHeld).toBe(true);
  });
  it('queues an edge from a frame that produced no tick until the next tick', () => {
    const feed = createIntentFeed(1);
    feed.beginFrame([{ ...NEUTRAL_FRAME, confirmPresses: 1 }]);   // no tick() this frame
    feed.beginFrame([{ ...NEUTRAL_FRAME }]);
    const t = feed.tick();
    expect(t[0]!.confirmPressed).toBe(true);
    expect(feed.tick()[0]!.confirmPressed).toBe(false);
  });
  it('a tap (press and release inside one frame) still delivers the pressed edge', () => {
    const feed = createIntentFeed(1);
    feed.beginFrame([{ ...NEUTRAL_FRAME, interactHeld: false, interactPresses: 1 }]);
    const t = feed.tick();
    expect(t[0]!.interactPressed).toBe(true); expect(t[0]!.interactHeld).toBe(false);
  });
  it('missing players are neutral', () => {
    const feed = createIntentFeed(2);
    feed.beginFrame([{ ...NEUTRAL_FRAME, moveY: 1 }]);
    const t = feed.tick();
    expect(t).toHaveLength(2); expect(t[1]!.moveY).toBe(0);
  });
  it('delivers N queued presses on N consecutive ticks', () => {
    const feed = createIntentFeed(1);
    feed.beginFrame([{ ...NEUTRAL_FRAME, confirmPresses: 2 }]);
    expect(feed.tick()[0]!.confirmPressed).toBe(true);
    expect(feed.tick()[0]!.confirmPressed).toBe(true);
    expect(feed.tick()[0]!.confirmPressed).toBe(false);
  });
  it('a press from a zero-tick frame plus a press in the next frame give two consecutive pressed ticks', () => {
    const feed = createIntentFeed(1);
    feed.beginFrame([{ ...NEUTRAL_FRAME, interactPresses: 1 }]);   // no tick this frame
    feed.beginFrame([{ ...NEUTRAL_FRAME, interactPresses: 1 }]);
    expect(feed.tick()[0]!.interactPressed).toBe(true);
    expect(feed.tick()[0]!.interactPressed).toBe(true);
    expect(feed.tick()[0]!.interactPressed).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { stickEdge, Dir } from '../src/renderer/src/sim/console';
import { STICK_REPEAT_TICKS } from '../src/renderer/src/sim/tuning';
import { makeState } from './helpers/sim';

describe('stickEdge', () => {
  it('fires once on crossing, then every STICK_REPEAT_TICKS while held', () => {
    const s = makeState(1);
    const fired: number[] = [];
    for (let t = 0; t < 3 * STICK_REPEAT_TICKS + 1; t++) if (stickEdge(s, 0, 0, 1) === Dir.Down) fired.push(t);
    expect(fired).toEqual([0, 8, 16, 24]);
  });
  it('nothing below the threshold, and releasing resets so the next push fires at once', () => {
    const s = makeState(1);
    expect(stickEdge(s, 0, 0.4, 0.3)).toBe(Dir.None);
    expect(stickEdge(s, 0, 1, 0)).toBe(Dir.Right);
    expect(stickEdge(s, 0, 0, 0)).toBe(Dir.None);
    expect(stickEdge(s, 0, 1, 0)).toBe(Dir.Right);
    expect(s.stick.heldDir[0]).toBe(Dir.Right); expect(s.stick.repeat[0]).toBe(STICK_REPEAT_TICKS);
  });
  it('dominant axis wins, ties go horizontal, a direction change fires immediately', () => {
    const s = makeState(1);
    expect(stickEdge(s, 0, -0.9, 0.6)).toBe(Dir.Left);
    expect(stickEdge(s, 0, 0.6, -0.9)).toBe(Dir.Up);       // change: immediate
    expect(stickEdge(s, 0, 0.6, -0.9)).toBe(Dir.None);     // held: waits for the repeat
    expect(stickEdge(s, 0, 0.7, 0.7)).toBe(Dir.Right);     // tie -> horizontal
  });
});

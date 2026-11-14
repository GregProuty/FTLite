import { describe, it, expect } from 'vitest';
import { stickEdge, Dir, createCardUiState } from '../src/renderer/src/clientControl/cardController';
import { STICK_REPEAT_TICKS } from '../src/renderer/src/sim/tuning';

describe('stickEdge', () => {
  it('fires once on crossing, then every STICK_REPEAT_TICKS while held', () => {
    const s = createCardUiState('test', 1);
    const fired: number[] = [];
    for (let t = 0; t < 3 * STICK_REPEAT_TICKS + 1; t++) if (stickEdge(s, 0, 0, 1) === Dir.Down) fired.push(t);
    expect(fired).toEqual([0, 8, 16, 24]);
  });
  it('nothing below the threshold, and releasing resets so the next push fires at once', () => {
    const s = createCardUiState('test', 1);
    expect(stickEdge(s, 0, 0.4, 0.3)).toBe(Dir.None);
    expect(stickEdge(s, 0, 1, 0)).toBe(Dir.Right);
    expect(stickEdge(s, 0, 0, 0)).toBe(Dir.None);
    expect(stickEdge(s, 0, 1, 0)).toBe(Dir.Right);
    expect(s.players[0]!.heldDir).toBe(Dir.Right); expect(s.players[0]!.repeat).toBe(STICK_REPEAT_TICKS);
  });
  it('dominant axis wins, ties go horizontal, a direction change fires immediately', () => {
    const s = createCardUiState('test', 1);
    expect(stickEdge(s, 0, -0.9, 0.6)).toBe(Dir.Left);
    expect(stickEdge(s, 0, 0.6, -0.9)).toBe(Dir.Up);       // change: immediate
    expect(stickEdge(s, 0, 0.6, -0.9)).toBe(Dir.None);     // held: waits for the repeat
    expect(stickEdge(s, 0, 0.7, 0.7)).toBe(Dir.Right);     // tie -> horizontal
  });
  it('fires at exactly 0.5 and publications cannot duplicate the same decision tick', () => {
    const ui = createCardUiState('test', 1);
    expect(stickEdge(ui, 0, 0, .49999999999999994, 0)).toBe(Dir.None);
    expect(stickEdge(ui, 0, 0, .5, 1)).toBe(Dir.Down);
    expect(stickEdge(ui, 0, 0, .5, 1)).toBe(Dir.None);
    expect(stickEdge(ui, 0, 0, .5, 8)).toBe(Dir.None);
    expect(stickEdge(ui, 0, 0, .5, 9)).toBe(Dir.Down);
  });
});

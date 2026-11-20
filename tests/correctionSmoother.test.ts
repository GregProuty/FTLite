// Net-4a §3.8: the correction smoother. A re-simulation moves P at once; the drawn bodies keep a visual offset (shown
// minus new) that decays linearly to zero over SMOOTH_MS. Pure: the caller passes the time.
import { describe, expect, it } from 'vitest';
import { createCorrectionSmoother, SMOOTH_MAX_U, SMOOTH_MS } from '../src/renderer/src/render/duel/correctionSmoother';
import type { PredictedBodies, PredictedBody } from '../src/renderer/src/clientControl/duelPredictor';

const b = (x: number, y: number, h: number): PredictedBody => ({ x, y, h });
const world = (ships: PredictedBody[], missiles: (PredictedBody | null)[] = ships.map(() => null)): PredictedBodies => ({ ships, missiles, crew: [] });

describe('correction smoother (Net-4a §3.8)', () => {
  it('pins the constants', () => { expect(SMOOTH_MS).toBe(100); expect(SMOOTH_MAX_U).toBe(200); });

  it('starts with no offsets', () => {
    const s = createCorrectionSmoother();
    expect(s.offsets(0)).toEqual({ ships: [], missiles: [] });
  });

  it('decays linearly: the whole offset at the shift, half at 50 ms, none at 100 ms', () => {
    const s = createCorrectionSmoother();
    s.shift(world([b(10, 20, 30), b(0, 0, 0)]), world([b(0, 0, 10), b(0, 0, 0)]), 1000);
    expect(s.offsets(1000).ships[0]).toEqual({ x: 10, y: 20, h: 20 });
    expect(s.offsets(1050).ships[0]).toEqual({ x: 5, y: 10, h: 10 });
    expect(s.offsets(1100).ships[0]).toBeNull();
    expect(s.offsets(1200).ships[0]).toBeNull();
    expect(s.offsets(1000).ships[1]).toBeNull();   // an unmoved body has no offset
  });

  it('a second correction inside 100 ms adds to what is still shown', () => {
    const s = createCorrectionSmoother();
    s.shift(world([b(10, 0, 0)]), world([b(0, 0, 0)]), 0);   // shown 10 ahead of P
    s.shift(world([b(0, 0, 0)]), world([b(-4, 0, 0)]), 50);  // at 50 ms 5 is still shown; P moves 4 more
    expect(s.offsets(50).ships[0]).toEqual({ x: 9, y: 0, h: 0 });
    expect(s.offsets(100).ships[0]!.x).toBeCloseTo(4.5);
    expect(s.offsets(150).ships[0]).toBeNull();
  });

  it('the heading offset wraps the short way: +250 to +2 is +8, so the offset is -8, not +248', () => {
    const s = createCorrectionSmoother();
    s.shift(world([b(0, 0, 250)]), world([b(0, 0, 2)]), 0);
    expect(s.offsets(0).ships[0]!.h).toBe(-8);
    s.clear();
    s.shift(world([b(0, 0, 2)]), world([b(0, 0, 250)]), 0);
    expect(s.offsets(0).ships[0]!.h).toBe(8);
  });

  it('skips a missile that appeared or ended, and smooths one that flew on', () => {
    const s = createCorrectionSmoother();
    s.shift(world([b(0, 0, 0), b(0, 0, 0)], [null, b(5, 5, 5)]), world([b(0, 0, 0), b(0, 0, 0)], [b(1, 1, 1), null]), 0);
    expect(s.offsets(0).missiles).toEqual([null, null]);
    s.shift(world([b(0, 0, 0), b(0, 0, 0)], [b(3, 0, 0), null]), world([b(0, 0, 0), b(0, 0, 0)], [b(1, 0, 0), null]), 10);
    expect(s.offsets(10).missiles[0]).toEqual({ x: 2, y: 0, h: 0 });
    // A missile that ends drops the offset it had (a later relaunch starts clean).
    s.shift(world([b(0, 0, 0), b(0, 0, 0)], [b(1, 0, 0), null]), world([b(0, 0, 0), b(0, 0, 0)], [null, null]), 20);
    expect(s.offsets(20).missiles[0]).toBeNull();
  });

  it(`jumps a body whose position offset exceeds ${SMOOTH_MAX_U} u (a respawn or teleport), and smooths the rest`, () => {
    const s = createCorrectionSmoother();
    s.shift(world([b(0, 0, 0), b(0, 0, 0)]), world([b(201, 0, 40), b(150, 0, 0)]), 0);
    const o = s.offsets(0);
    expect(o.ships[0]).toBeNull();
    expect(o.ships[1]).toEqual({ x: -150, y: 0, h: 0 });
  });

  it('rock jump brief §2: the draw-tick offset of a retarget (shown minus new) decays linearly over SMOOTH_MS, adds to what is still shown, and clears', () => {
    const s = createCorrectionSmoother(), none = world([]);
    expect(s.tickOffset(0)).toBe(0);
    s.shift(none, none, 1000, 3);   // P moved 3 ticks back: the rocks keep showing 3 ticks ahead of it
    expect(s.tickOffset(1000)).toBe(3);
    expect(s.tickOffset(1050)).toBe(1.5);
    expect(s.tickOffset(1100)).toBe(0);
    s.shift(none, none, 2000, -3); s.shift(none, none, 2050, 1);   // at 50 ms −1.5 is still shown, then 1 more tick back
    expect(s.tickOffset(2050)).toBe(-0.5);
    s.shift(none, none, 2060, 0);   // a correction that leaves the tick keeps the decaying offset
    expect(s.tickOffset(2060)).toBeCloseTo(-0.45, 12);
    s.clear();
    expect(s.tickOffset(2060)).toBe(0);
  });
  it('clear() drops every offset', () => {
    const s = createCorrectionSmoother();
    s.shift(world([b(10, 0, 0)], [b(1, 0, 0)]), world([b(0, 0, 0)], [b(0, 0, 0)]), 0);
    s.clear();
    expect(s.offsets(0)).toEqual({ ships: [], missiles: [] });
  });
});

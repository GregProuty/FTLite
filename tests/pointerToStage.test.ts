// UI round spec §2.1: a window point to stage px through the renderer's fit (the canvas below the session strip).
import { describe, expect, it } from 'vitest';
import { pointerToStage } from '../src/renderer/src/app/duel/pointerToStage';

describe('pointerToStage', () => {
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 30, width: 2560, height: 1080 }) };
  it('maps a wide window to the wide stage at the smooth scale', () => {
    const a = pointerToStage(canvas, 2560, 1110); expect(a.x).toBeCloseTo(1707, 0); expect(a.y).toBeCloseTo(720, 0);
    const b = pointerToStage(canvas, 1280, 570); expect(b.x).toBeCloseTo(853.5, 0); expect(b.y).toBeCloseTo(360, 0);
  });
  it('is the identity at the reference window', () => {
    const ref = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) };
    expect(pointerToStage(ref, 100, 200)).toEqual({ x: 100, y: 200 });
  });
});

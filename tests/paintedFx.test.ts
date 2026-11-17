import { describe, it, expect } from 'vitest';
import { TILE_PX } from '../src/shared/resolution';
import { flameGlow, tileTongues, TONGUES_PER_TILE } from '../src/renderer/src/render/painted/flameModel';
import { BLAST_RADIUS, blastHash, blastProgress, burstPoints, PAINTED_TIMING } from '../src/renderer/src/render/painted/blastShapes';
import { addBlast, BLAST_CAP, blastFrame, liveBlasts, type Blast } from '../src/renderer/src/render/blastModel';
import { ease, easeOut, mix, shade } from '../src/renderer/src/render/painted/ink';

describe('painted fire (art spike)', () => {
  it('a fixed number of tongues per tile, inside the tile, back to front, flame-shaped', () => {
    for (const t of [0, 0.37, 5.2]) {
      const q = tileTongues(41, 3, 2, t);
      expect(q).toHaveLength(TONGUES_PER_TILE);
      for (const g of q) {
        expect(g.x).toBeGreaterThan(3 * TILE_PX); expect(g.x).toBeLessThan(4 * TILE_PX);
        expect(g.y).toBeGreaterThan(2 * TILE_PX); expect(g.y).toBeLessThan(3 * TILE_PX);
        expect(g.h).toBeGreaterThan(g.r);   // taller than wide
      }
      expect(q.map((g) => g.y)).toEqual([...q.map((g) => g.y)].sort((a, b) => a - b));
    }
  });
  it('flickers on the clock, deterministically, and holds when the clock holds', () => {
    expect(tileTongues(7, 1, 1, 1.25)).toEqual(tileTongues(7, 1, 1, 1.25));
    expect(tileTongues(7, 1, 1, 1.25)).not.toEqual(tileTongues(7, 1, 1, 1.4));
    for (let t = 0; t < 10; t += 0.13) { const a = flameGlow(9, t); expect(a).toBeGreaterThanOrEqual(0.55); expect(a).toBeLessThanOrEqual(1); }
  });
});

describe('painted blasts (art spike)', () => {
  const b: Blast = { kind: 'room', x: 100, y: 60, start: 2 };
  it('run on the blast clock: progress 0 at start to 1 at the last frame, held while the clock holds', () => {
    expect(blastProgress(b, 2)).toBe(0);
    expect(blastProgress(b, 2 + PAINTED_TIMING.room.frames / 60)).toBe(1);
    expect(blastProgress(b, 1)).toBe(0);
    expect(blastProgress(b, 2.3)).toBeCloseTo(0.3 * 60 / PAINTED_TIMING.room.frames, 6);
  });
  it('the shared live list removes a painted blast after its last frame and keeps the cap', () => {
    const end = 2 + PAINTED_TIMING.room.frames / 60;
    expect(liveBlasts([b], end - 0.01, PAINTED_TIMING)).toHaveLength(1);
    expect(liveBlasts([b], end + 0.001, PAINTED_TIMING)).toHaveLength(0);
    expect(blastFrame(b, 2.5, PAINTED_TIMING)).toBe(30);
    let list: Blast[] = [];
    for (let k = 0; k < BLAST_CAP + 2; k++) list = addBlast(list, { ...b, start: k });
    expect(list).toHaveLength(BLAST_CAP);
  });
  it('a starburst: 2 x spikes points, spikes out near the radius, valleys in, stable per blast', () => {
    const p = burstPoints(b, 100, 60, BLAST_RADIUS.room, 11, 0.6, 0, 1);
    expect(p).toHaveLength(44);
    const r = (k: number): number => Math.hypot(p[2 * k]! - 100, p[2 * k + 1]! - 60);
    for (let k = 0; k < 22; k += 2) { expect(r(k)).toBeGreaterThan(BLAST_RADIUS.room * 0.75); expect(r(k)).toBeLessThan(BLAST_RADIUS.room * 1.25); expect(r(k + 1)).toBeLessThan(r(k)); }
    expect(burstPoints(b, 100, 60, 30, 7, 0.6, 0, 1)).toEqual(burstPoints(b, 100, 60, 30, 7, 0.6, 0, 1));
    expect(blastHash(b, 3)).not.toBe(blastHash({ ...b, start: 3 }, 3));
  });
});

describe('painted colour helpers (art spike)', () => {
  it('shade, mix and the easings', () => {
    expect(shade(0xff8040, 0.5)).toBe(0x804020);
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect([ease(-1), ease(0.5), ease(2)]).toEqual([0, 0.5, 1]);
    expect(easeOut(0)).toBe(0); expect(easeOut(1)).toBe(1); expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });
});

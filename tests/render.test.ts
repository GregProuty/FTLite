import { describe, it, expect } from 'vitest';
import { computeLetterbox } from '../src/renderer/src/render/letterbox';
import { syncCache } from '../src/renderer/src/render/cache';

describe('letterbox', () => {
  it('picks the largest integer scale that fits and centres', () => {
    expect(computeLetterbox(1920, 1080, 960, 540)).toEqual({ scale: 2, offsetX: 0, offsetY: 0 });
    expect(computeLetterbox(2000, 1200, 960, 540)).toEqual({ scale: 2, offsetX: 40, offsetY: 60 });
    expect(computeLetterbox(900, 500, 960, 540)).toEqual({ scale: 1, offsetX: -30, offsetY: -20 });
  });
});

describe('syncCache', () => {
  it('creates entries for new ids and destroys stale ones (recycled slot between frames)', () => {
    const cache = new Map<number, { id: number; dead: boolean }>();
    const destroyed: number[] = [];
    const create = (id: number) => ({ id, dead: false });
    const destroy = (o: { id: number; dead: boolean }) => { o.dead = true; destroyed.push(o.id); };
    syncCache(cache, [1, 2, 3], create, destroy);
    expect([...cache.keys()]).toEqual([1, 2, 3]);
    syncCache(cache, [1, 3, 4], create, destroy);   // 2 removed, 4 reuses a slot but has a new StableId
    expect(destroyed).toEqual([2]);
    expect(cache.has(2)).toBe(false); expect(cache.get(4)!.dead).toBe(false);
  });
});

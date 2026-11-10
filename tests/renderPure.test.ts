import { describe, it, expect } from 'vitest';
import { sliceGrid } from '../src/renderer/src/render/sheet';
import { pickVariant, wallKind, floorVariant, wallVariant } from '../src/renderer/src/render/tilePick';

describe('sliceGrid', () => {
  it('returns row-major frames covering the image', () => {
    const r = sliceGrid(48, 32, 16, 16);
    expect(r).toHaveLength(6);
    expect(r[0]).toEqual({ x: 0, y: 0, w: 16, h: 16 });
    expect(r[2]).toEqual({ x: 32, y: 0, w: 16, h: 16 });
    expect(r[3]).toEqual({ x: 0, y: 16, w: 16, h: 16 });
    expect(r[5]).toEqual({ x: 32, y: 16, w: 16, h: 16 });
  });
  it('handles tall frames and rejects a grid that does not divide the image', () => {
    expect(sliceGrid(80, 32, 16, 32)).toHaveLength(5);
    expect(() => sliceGrid(50, 32, 16, 16)).toThrow(/divide/);
  });
});

describe('pickVariant', () => {
  it('is deterministic, in range, and spreads over consecutive indices', () => {
    const picks = Array.from({ length: 64 }, (_, i) => pickVariant(i, 4));
    expect(picks).toEqual(Array.from({ length: 64 }, (_, i) => pickVariant(i, 4)));
    for (const p of picks) { expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThan(4); }
    expect(new Set(picks).size).toBe(4);
    expect(picks).not.toEqual(Array.from({ length: 64 }, (_, i) => i % 4));   // the low bits of a multiplicative hash are the index itself; the high bits must be used
    expect(pickVariant(123, 1)).toBe(0);
  });
  it('floorVariant and wallVariant derive from pickVariant', () => {
    expect(floorVariant(2)).toBe(pickVariant(2, 4));
    expect(['wall.plain', 'wall.vent', 'wall.pipes', 'wall.screen']).toContain(wallVariant(17));
    expect(wallVariant(17)).toBe(wallVariant(17));
  });
});

describe('wallKind (spec §2 geometry)', () => {
  const rows = [
    '#####',
    '#AA##',
    '#AA#B',
    '##+##',
    '#III#',
    '#####'
  ];
  it('is tall when the tile above is void, wall or out of bounds', () => {
    expect(wallKind(rows, 0, 0)).toBe('tall');     // out of bounds above
    expect(wallKind(rows, 0, 2)).toBe('tall');     // wall above
    expect(wallKind(rows, 3, 1)).toBe('tall');     // wall above (row 0)
  });
  it('is flat when a floor is directly above (never cover floor)', () => {
    expect(wallKind(rows, 1, 3)).toBe('flat');     // A above
    expect(wallKind(rows, 2, 5)).toBe('flat');     // I above
    expect(wallKind(rows, 4, 3)).toBe('flat');     // B above
  });
  it('treats a door tile above as floor', () => {
    expect(wallKind(['#+#', '###'], 1, 1)).toBe('flat');
  });
});

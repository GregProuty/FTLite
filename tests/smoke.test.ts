import { describe, it, expect } from 'vitest';
import { INTERNAL_W, INTERNAL_H, TILE_PX } from '../src/shared/resolution';

describe('scaffold', () => {
  it('exposes the internal resolution and tile size', () => {
    expect(INTERNAL_W).toBe(960);
    expect(INTERNAL_H).toBe(540);
    expect(TILE_PX).toBe(32);
  });
});

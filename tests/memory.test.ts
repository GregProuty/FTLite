import { describe, it, expect } from 'vitest';
import { createRenderMemory } from '../src/renderer/src/render/memory';

describe('RenderMemory', () => {
  it('starts empty and reset() clears everything so a second run sees nothing from the first', () => {
    const m = createRenderMemory();
    expect(m.damaged.size).toBe(0); expect(m.doorProgress).toBeNull();
    m.damaged.add(31); m.facing.set(1, 'ne'); m.prev.set(1, { x: 2, y: 3 }); m.lastDrawn.set(1, { x: 2.5, y: 3 }); m.doorProgress = [0.5, 1];
    m.reset();
    expect(m.damaged.size).toBe(0); expect(m.facing.size).toBe(0); expect(m.prev.size).toBe(0); expect(m.lastDrawn.size).toBe(0); expect(m.doorProgress).toBeNull();
    m.damaged.add(7);
    expect([...m.damaged]).toEqual([7]);   // the same object keeps working after reset
  });
});

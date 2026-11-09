import { describe, it, expect } from 'vitest';
import { createWorld, createEntityIndex, addEntity, removeEntity, entityExists, addComponent, query } from 'bitecs';
import { makeState } from './helpers/sim';
import { flatten } from '../src/renderer/src/sim/flatten';
import { hashState } from '../src/renderer/src/sim/hash';

// Spec §11 spike: record how bitECS 0.4.0 recycles ids. Our sim never relies on raw ids across removal
// (StableId is ours), so this test documents behaviour rather than gating on it.
describe('bitecs 0.4.0 behaviour (spike)', () => {
  it('recycles removed entity ids and reports them non-existent until re-added', () => {
    const world = createWorld(createEntityIndex());
    const C = { v: [] as number[] };
    const ids = [addEntity(world), addEntity(world), addEntity(world)];
    for (const id of ids) { addComponent(world, id, C); C.v[id] = id * 10; }
    removeEntity(world, ids[1]!);
    expect(entityExists(world, ids[1]!)).toBe(false);
    const again = addEntity(world);
    // Record the result in docs/spikes.md: is `again` === ids[1] (immediate recycling)?
    console.log(`bitecs recycled id: ${again === ids[1]}`);
    expect(query(world, [C]).length).toBe(2);
  });
  it('measures snapshot size and hash time for the record (spec §11 spike criterion)', () => {
    const s = makeState(4, 1);
    const bytes = flatten(s).byteLength;
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) hashState(s);
    const perHashMs = (performance.now() - t0) / 1000;
    console.log(`snapshot ${bytes} bytes, hashState ${perHashMs.toFixed(4)} ms`);
    expect(bytes).toBeLessThan(4096);
    expect(perHashMs).toBeLessThan(1);   // well under a 16 ms frame
  });
});

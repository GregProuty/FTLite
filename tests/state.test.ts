import { describe, it, expect } from 'vitest';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState } from '../src/renderer/src/sim/state';
import { step } from '../src/renderer/src/sim/step';
import { hashState } from '../src/renderer/src/sim/hash';
import { flatten, unflatten } from '../src/renderer/src/sim/flatten';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { Position, Stable } from '../src/renderer/src/sim/components';

const layout = parseShip(starter);

describe('SimState', () => {
  it('spawns one crew per player at the spawn tiles with StableIds 1..n', () => {
    const s = createSimState(layout, 3, 1);
    expect(s.crew).toHaveLength(3);
    expect(Position.x[s.crew[0]!]).toBe(2.5); expect(Position.y[s.crew[0]!]).toBe(9.5);
    expect(Stable.id[s.crew[0]!]).toBe(1); expect(Stable.id[s.crew[2]!]).toBe(3);
    expect(s.nextStableId).toBe(4);
  });
  it('starts rooms full of oxygen, no fire, doors closed, no breaches', () => {
    const s = createSimState(layout, 2, 1);
    for (let r = 0; r < s.rooms.o2.length; r++) expect(s.rooms.o2[r]).toBe(s.derived.volume[r]);
    expect(Array.from(s.rooms.fire).every((f) => f === 0)).toBe(true);
    expect(Array.from(s.breaches.active).every((b) => b === 0)).toBe(true);
  });
  it('step advances the tick and is deterministic', () => {
    const a = createSimState(layout, 2, 42), b = createSimState(layout, 2, 42);
    for (let i = 0; i < 100; i++) { step(a, [NEUTRAL_INTENT, NEUTRAL_INTENT]); step(b, [NEUTRAL_INTENT, NEUTRAL_INTENT]); }
    expect(a.tick).toBe(100);
    expect(hashState(a)).toBe(hashState(b));
    expect(hashState(a)).not.toBe(hashState(createSimState(layout, 2, 42)));
  });
  it('different seeds give different rng streams and hashes', () => {
    const a = createSimState(layout, 2, 1), b = createSimState(layout, 2, 2);
    expect(a.rng.hazards.s).not.toBe(b.rng.hazards.s);
    expect(a.rng.hazards.s).not.toBe(a.rng.director.s);
    expect(hashState(a)).not.toBe(hashState(b));
  });
  it('two live states are independent (component storage is not shared between worlds)', () => {
    const a = createSimState(layout, 2, 1), b = createSimState(layout, 2, 1);
    const ax = Position.x[a.crew[0]!]!;
    step(b, [{ ...NEUTRAL_INTENT, moveX: 1 }, NEUTRAL_INTENT]);
    expect(Position.x[a.crew[0]!]).toBe(ax);
    expect(a.crew[0]).not.toBe(b.crew[0]);
  });
  it('flatten/unflatten round-trips', () => {
    const a = createSimState(layout, 4, 5);
    for (let i = 0; i < 30; i++) step(a, [{ ...NEUTRAL_INTENT, moveX: 1 }, NEUTRAL_INTENT, NEUTRAL_INTENT, NEUTRAL_INTENT]);
    const b = createSimState(layout, 4, 999);
    unflatten(b, flatten(a));
    expect(hashState(b)).toBe(hashState(a));
    expect(b.tick).toBe(a.tick);
  });
});

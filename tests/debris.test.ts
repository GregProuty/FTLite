import { describe, it, expect } from 'vitest';
import { warnedTargets, nextTarget } from '../src/renderer/src/sim/debrisTargets';
import { DEBRIS_SLOTS } from '../src/renderer/src/sim/tuning';
import { makeState, placeDebris, room } from './helpers/sim';

describe('debris slots and target order', () => {
  it('a fresh state has empty slots, no impacts and no charge', () => {
    const s = makeState(1);
    expect(s.debris.active).toHaveLength(DEBRIS_SLOTS);
    expect(Array.from(s.debris.active).every((a) => a === 0)).toBe(true);
    expect(Array.from(s.rooms.impactTick).every((t) => t === -1)).toBe(true);
    expect(s.weapons.charge).toBe(0);
  });
  it('warnedTargets lists warned active slots in ascending stableId, not slot order', () => {
    const s = makeState(1), A = room(s, 'A');
    placeDebris(s, A, 600, 1, 30);          // slot 0, id 30
    placeDebris(s, A, 600, 1, 10);          // slot 1, id 10
    placeDebris(s, A, 600, 0, 20);          // slot 2, id 20, unwarned
    expect(warnedTargets(s)).toEqual([1, 0]);
  });
  it('nextTarget picks the smallest stableId above the given one, wraps, excludes a slot and returns -1 when empty', () => {
    const s = makeState(1), A = room(s, 'A');
    placeDebris(s, A, 600, 1, 10); placeDebris(s, A, 600, 1, 20); placeDebris(s, A, 600, 1, 30);
    expect(nextTarget(s, 20)).toBe(2);
    expect(nextTarget(s, 30)).toBe(0);
    expect(nextTarget(s, 20, 2)).toBe(0);                 // 30 excluded: wraps to 10
    s.debris.warned.fill(0);
    expect(nextTarget(s, 10)).toBe(-1);
  });
});

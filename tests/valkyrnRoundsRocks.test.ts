// Merge of asteroids-ii into the Valkyrn line (spike ii §8 as-built; Valkyrn spec §12): a gun round sweeps the live rock
// pool as it stands when stepRounds runs (rocks move, break and go), and a round that meets a rock is absorbed: it ends,
// and the rock takes no push, no wear and no event. A gone seeded rock no longer stops a round; a piece born this tick is
// not in the way (as the laser's firstBlocker).
import { describe, expect, it } from 'vitest';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { placeRound, stepRounds } from '../src/renderer/src/sim/tactical/gun';
import { rockAt, RockKind, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { beginRockTick } from '../src/renderer/src/sim/tactical/rocks';
import { mover } from './helpers/rockArena';

/** A Valkyrn state with every rock removed, the Hunter parked far off, a fresh tick's masks. */
function field() {
  const st = createTacticalState(5, 2, ShipClass.Valkyrn);
  st.rocks.fill(0);
  Object.assign(st.ships[0], { x: 0, y: -2500, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: 2600, y: 2600, vx: 0, vy: 0 });
  beginRockTick(st);
  return st;
}

describe('gun rounds and the billiard rocks (merge)', () => {
  it('a round meeting a moving rock at its current position is absorbed; the rock is untouched', () => {
    const st = field();
    mover(st, 100, 200, -2500, -30, 0, 20, 2);
    const before = Array.from(st.rocks.subarray(100 * ROCK_STRIDE, 101 * ROCK_STRIDE));
    const r = placeRound(st, { x: 170, y: -2500, vx: 700, vy: 0, age: 0, owner: 0 });
    st.events = []; stepRounds(st);
    expect(r.active).toBe(false);
    expect(Array.from(st.rocks.subarray(100 * ROCK_STRIDE, 101 * ROCK_STRIDE))).toEqual(before);
    expect(st.events).toEqual([]);
    expect(st.rockHits).toBe(0);
  });
  it('the sweep reads the rock where it now is, not where the seed put it', () => {
    const st = field();
    mover(st, 100, 400, -2500, 0, 0, 20, 2);   // a rock that has moved off the round's line ...
    const miss = placeRound(st, { x: 150, y: -2400, vx: 700, vy: 0, age: 0, owner: 0 });
    st.events = []; stepRounds(st);
    expect(miss.active).toBe(true);
    st.rocks[100 * ROCK_STRIDE + 2] = -2400;   // ... and onto it
    stepRounds(st);
    expect(miss.active).toBe(true);   // still short of it (150 + 2 · 700 / 60 ≈ 173)
    for (let k = 0; k < 20 && miss.active; k++) stepRounds(st);
    expect(miss.active).toBe(false);
    expect(miss.age).toBe(0);
    expect(rockAt(st, 100).hp).toBe(2);
  });
  it('a gone seeded rock no longer stops a round; a piece born this tick is not in the way', () => {
    const st = createTacticalState(5, 2, ShipClass.Valkyrn), a = st.map.asteroids[0]!;
    Object.assign(st.ships[1], { x: 2600, y: 2600 });
    st.rocks[0] = RockKind.Gone;
    const r = placeRound(st, { x: a.x - a.r - 5, y: a.y, vx: 700, vy: 0, age: 0, owner: 0 });
    stepRounds(st);
    expect(r.active).toBe(true);
    const born = field();
    mover(born, 100, 200, -2500, 0, 0, 20, 2); born.rockBorn[100] = 1;
    const p = placeRound(born, { x: 150, y: -2500, vx: 700, vy: 0, age: 0, owner: 0 });
    stepRounds(born);
    expect(p.active).toBe(true);
  });
});

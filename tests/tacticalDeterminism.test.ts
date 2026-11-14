import { describe, expect, it } from 'vitest';
import { createTacticalState, type Axes, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { stepFlight } from '../src/renderer/src/sim/tactical/physics';
import { hashTactical } from '../src/renderer/src/sim/tactical/hash';
import { predictPath } from '../src/renderer/src/sim/tactical/predict';
import { PLANET_RADIUS, SHIP_RADIUS } from '../src/renderer/src/sim/tactical/tuning';

/** A fixed input script: both ships turn, thrust, coast and reverse on different beats. */
function script(t: number): Axes[] {
  return [
    { turn: t % 240 < 60 ? 1 : t % 240 < 90 ? -1 : 0, thrust: t % 300 < 150 ? 1 : t % 300 < 180 ? -1 : 0 },
    { turn: t % 200 < 40 ? -1 : 0, thrust: t % 180 < 120 ? 1 : 0 }
  ];
}
function run(seed: number, ticks: number): TacticalState {
  const st = createTacticalState(seed);
  for (let t = 0; t < ticks; t++) stepFlight(st, script(t));
  return st;
}

describe('tactical determinism (spec §4)', () => {
  it('the same seed and inputs give the same hash', () => {
    expect(hashTactical(run(11, 1800))).toBe(hashTactical(run(11, 1800)));
  });
  it('a different seed gives a different hash', () => {
    expect(hashTactical(run(11, 600))).not.toBe(hashTactical(run(12, 600)));
  });
  it('a different input gives a different hash', () => {
    const a = createTacticalState(11), b = createTacticalState(11);
    stepFlight(a, [{ turn: 1, thrust: 0 }, { turn: 0, thrust: 0 }]);
    stepFlight(b, [{ turn: 0, thrust: 0 }, { turn: 0, thrust: 0 }]);
    expect(hashTactical(a)).not.toBe(hashTactical(b));
  });
});

describe('predictPath (spec §10b)', () => {
  it('matches the real flight tick for tick while nothing is hit, and leaves the state untouched', () => {
    const st = createTacticalState(11), before = hashTactical(st), axes = { turn: 1, thrust: 1 };
    const path = predictPath(st, 0, axes, 120, 1);
    expect(hashTactical(st)).toBe(before);
    for (let t = 0; t < 120; t++) {
      stepFlight(st, [axes, { turn: 0, thrust: 0 }]);
      expect(path[t]!.x).toBe(st.ships[0].x);
      expect(path[t]!.y).toBe(st.ships[0].y);
    }
  });
  it('samples every n ticks and stops at the planet', () => {
    const st = createTacticalState(11);
    Object.assign(st.ships[0], { x: 0, y: -400, vx: 0, vy: 200, heading: 128, headingAcc: 0 });
    const path = predictPath(st, 0, { turn: 0, thrust: 1 }, 600, 10);
    const last = path[path.length - 1]!;
    expect(path.length).toBeLessThan(60);
    expect(Math.sqrt(last.x * last.x + last.y * last.y)).toBeLessThan(PLANET_RADIUS + SHIP_RADIUS);
  });
});

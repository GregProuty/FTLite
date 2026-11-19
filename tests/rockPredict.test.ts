// Asteroids-iii §6.3: Helm's predicted path meets rocks where they will be (a rail on its rail, a free rock in a straight
// line); the scripted pilot's hazard check and the Hunter's threat check sweep the ship's velocity relative to each rock;
// the predicted rock path (§7.2) follows the sim's own motion.
import { describe, expect, it } from 'vitest';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { hazardAway } from '../src/renderer/src/sim/duel/scripted';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { threatAhead } from '../src/renderer/src/sim/tactical/hunter';
import { predictFlight, predictRock, rockAhead, touchesSolid } from '../src/renderer/src/sim/tactical/predict';
import { circularVelocity, railPos } from '../src/renderer/src/sim/tactical/rails';
import { moveFreeSlot } from '../src/renderer/src/sim/tactical/rockContacts';
import { rockAt, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';
import { NO_AXES } from '../src/renderer/src/sim/tactical/state';
import type { FlightTuning } from '../src/renderer/src/sim/tactical/tuning';
import { arena, mover, rail } from './helpers/rockArena';

const STILL: FlightTuning = { gravity: false, edge: false, drag: 0, stabilise: 0 };

describe('rocks ahead (spec §6.3)', () => {
  it('rockAhead: a rail at railPos(tick + n), a free rock along its velocity', () => {
    const st = arena(), o = { x: 0, y: 0, vx: 0, vy: 0 }, ref = { x: 0, y: 0, vx: 0, vy: 0 };
    rail(st, 3, 0, 1700, 20); mover(st, 4, 100, 100, 30, -6, 10);
    rockAhead(st, 3, 90, o);
    railPos(0, 1700, 0, 0, st.tick, st.tick + 90, false, ref);
    expect([o.x, o.y]).toEqual([ref.x, ref.y]);
    rockAhead(st, 4, 60, o);
    expect(o.x).toBeCloseTo(130, 9); expect(o.y).toBeCloseTo(94, 9);
  });
  it('the Helm\'s path meets a rail that will reach it, though it is clear of the rock now', () => {
    const st = arena(), a = { ...st.ships[0] };
    rail(st, 3, a.x - 45, a.y, 10);   // 45 behind along the orbit: it moves +x at about 31.6 u/s
    expect(touchesSolid(st, a.x, a.y, 20)).toBe(false);
    const c = predictFlight(st, 0, NO_AXES, 60, 4, STILL).contact;
    expect(c).not.toBeNull();
    expect(c!.tick).toBeGreaterThan(20); expect(c!.tick).toBeLessThan(40);
  });
  it('the scripted pilot ignores a co-orbiting rock ahead and steers off a crossing one', () => {
    const d = createDuel(DUEL_LAYOUT, 3);
    try {
      const t = d.tactical, [vx, vy] = circularVelocity(0, -1700);
      t.rocks.fill(0);
      Object.assign(t.ships[0], { x: 0, y: -1700, vx, vy, heading: 64, headingAcc: 0 });
      Object.assign(t.ships[1], { x: 0, y: 1700 });
      const [cx, cy] = circularVelocity(120, -1700);
      mover(t, 100, 120, -1700, cx, cy, 10);           // 120 ahead on the same orbit, moving with it
      expect(hazardAway(d, NO_AXES)).toBeNull();
      mover(t, 100, 120, -1700, cx - 100, cy, 10);     // the same rock coming at the ship at 100 u/s
      expect(hazardAway(d, NO_AXES)).not.toBeNull();
    } finally { disposeDuel(d); }
  });
  it('the Hunter\'s threat check sweeps its velocity relative to each rock', () => {
    const st = arena();
    st.ships[1].active = true;
    const [vx, vy] = circularVelocity(1700, 0);
    Object.assign(st.ships[1], { x: 1700, y: 0, vx, vy });
    mover(st, 100, 1700, 60, vx, vy, 10);              // 60 ahead, moving with it: no threat
    expect(threatAhead(st, 1)).toBeNull();
    mover(st, 100, 1700, 60, vx, vy - 100, 10);        // closing at 100 u/s: a threat
    expect(threatAhead(st, 1)).not.toBeNull();
  });
  it('predictRock: a rail along its rail, a free rock by the sim\'s own free motion', () => {
    const st = arena();
    rail(st, 3, 0, 1700, 20);
    const railPath = predictRock(st, 3, 120, 30), o = { x: 0, y: 0, vx: 0, vy: 0 };
    railPos(0, 1700, 0, 0, st.tick, st.tick + 120, false, o);
    expect(railPath).toHaveLength(4);
    expect(railPath[3]!.x).toBeCloseTo(o.x, 9); expect(railPath[3]!.y).toBeCloseTo(o.y, 9);
    mover(st, 4, 0, -1500, 40, 5, 10);
    const freePath = predictRock(st, 4, 60, 60), v = Float64Array.from(st.rocks.subarray(4 * ROCK_STRIDE, 5 * ROCK_STRIDE));
    for (let t = 1; t <= 60; t++) moveFreeSlot(v, 0, st.tick + t);
    expect(freePath).toEqual([{ x: v[1], y: v[2] }]);
    expect(rockAt(st, 4).x).toBe(0);   // pure: the state is untouched
  });
});

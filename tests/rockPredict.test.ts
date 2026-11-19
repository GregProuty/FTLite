// Asteroids-iii §6.3: Helm's predicted path meets rocks where they will be (a rail on its rail, a free rock in a straight
// line); the scripted pilot's hazard check and the Hunter's threat check sweep the ship's velocity relative to each rock;
// the predicted rock path (§7.2) follows the sim's own motion.
import { describe, expect, it } from 'vitest';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { hazardAway } from '../src/renderer/src/sim/duel/scripted';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { threatAhead } from '../src/renderer/src/sim/tactical/hunter';
import { predictFlight, predictMissile, predictRock, rockAhead, touchesSolid } from '../src/renderer/src/sim/tactical/predict';
import { circularVelocity, railPos } from '../src/renderer/src/sim/tactical/rails';
import { moveFreeSlot } from '../src/renderer/src/sim/tactical/rockContacts';
import { rockAt, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';
import { NO_AXES } from '../src/renderer/src/sim/tactical/state';
import type { FlightTuning } from '../src/renderer/src/sim/tactical/tuning';
import { arena, mover, rail } from './helpers/rockArena';
import { flyShip, shipEngineFactor } from '../src/renderer/src/sim/tactical/physics';
import { flyMissile } from '../src/renderer/src/sim/tactical/missiles';
import { rockAlive, rockSlots, rockX, rockY } from '../src/renderer/src/sim/tactical/rocks';
import { ROCK_MAX_SPEED } from '../src/renderer/src/sim/tactical/rockTuning';
import { classOf, cloneShip, createTacticalState, missileOf, placeMissile, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { DT, MISSILE_RADIUS } from '../src/renderer/src/sim/tactical/tuning';

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

// The reference: the first (Task 11) algorithm, scanning every slot through the accessors with the ROCK_MAX_SPEED skip.
function refTouches(state: TacticalState, x: number, y: number, r: number, ahead: number): boolean {
  const p = state.map.planet, pd = r + p.r;
  if ((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) < pd * pd) return true;
  const span = ahead * DT, o = { x: 0, y: 0, vx: 0, vy: 0 };
  for (let k = 0, n = rockSlots(state); k < n; k++) {
    if (!rockAlive(state, k)) continue;
    const rk = state.rocks[k * 8 + 5]!, dx = rockX(state, k) - x, dy = rockY(state, k) - y, reach = rk + r + ROCK_MAX_SPEED * span + 1;
    if (dx * dx + dy * dy > reach * reach) continue;
    rockAhead(state, k, ahead, o);
    const ex = o.x - x, ey = o.y - y, d = rk + r;
    if (ex * ex + ey * ey < d * d) return true;
  }
  return false;
}
function refFlight(state: TacticalState, ticks: number, every: number, tuning: FlightTuning) {
  const s = cloneShip(state.ships[0]!), cls = classOf(state, 0), eng = state.systems[0]!.rooms[Room.Engines], f = shipEngineFactor(state, 0), points: { x: number; y: number }[] = [];
  for (let t = 1; t <= ticks; t++) {
    flyShip(s, NO_AXES, tuning, eng, cls, f);
    if (refTouches(state, s.x, s.y, cls.radius, t)) { points.push({ x: s.x, y: s.y }); return { points, contact: { x: s.x, y: s.y, tick: t } }; }
    if (t % every === 0) points.push({ x: s.x, y: s.y });
  }
  return { points, contact: null };
}
function refMissile(state: TacticalState, i: number, ticks: number, every: number) {
  const copy: TacticalState = { ...state, missiles: state.missiles.map((m) => ({ ...m })) as TacticalState['missiles'] }, m = missileOf(copy, i), out: { x: number; y: number }[] = [];
  if (!m) return out;
  for (let t = 1; t <= ticks; t++) {
    flyMissile(copy, i);
    if (refTouches(state, m.x, m.y, MISSILE_RADIUS, t)) { out.push({ x: m.x, y: m.y }); break; }
    if (t % every === 0) out.push({ x: m.x, y: m.y });
  }
  return out;
}

describe('the snapshot prediction equals the reference algorithm (Task 11 fix round)', () => {
  it('predictFlight and predictMissile: points and contacts deep-equal over crossing cases on the seed-5 map at tick 100000', () => {
    const st = createTacticalState(5); st.tick = 100000;
    let flightHits = 0, missileHits = 0, cases = 0;
    for (let a = 0; a < 360; a += 6) {
      const c = Math.cos(a * Math.PI / 180), sn = Math.sin(a * Math.PI / 180);
      for (const R of [1050, 1200, 1350, 1700]) {
        const x = R * c, y = R * sn, [vx, vy] = circularVelocity(x, y);
        Object.assign(st.ships[0], { x, y, vx: vx - 90 * c, vy: vy - 90 * sn });
        const A = predictFlight(st, 0, NO_AXES, 480, 4, STILL), B = refFlight(st, 480, 4, STILL);
        expect(A, `flight ${a} ${R}`).toEqual(B);
        if (A.contact) flightHits++;
        placeMissile(st, 1, { x, y, vx: vx - 140 * c, vy: vy - 140 * sn, heading: 0, headingAcc: 0, age: 0 });
        const MA = predictMissile(st, 1, 300, 3), MB = refMissile(st, 1, 300, 3);
        expect(MA, `missile ${a} ${R}`).toEqual(MB);
        if (MA.length && MA.length < 100) missileHits++;
        cases++;
      }
    }
    expect([cases, flightHits > 20, missileHits > 5]).toEqual([240, true, true]);
  });
});

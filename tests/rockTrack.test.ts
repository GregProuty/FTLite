// Asteroids-iii §7.1, §7.2, §13.5 (renderer): rails drawn at tick − 1 + α, free rocks lerped from the last tick, trails
// (25 s at 4 Hz while young, 6 s after) that reset on a kind or r change or a jump, streaks relative to V_c, the outline
// spin, and the predicted path of the Weapons map's rock target.
import { describe, expect, it } from 'vitest';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { createRockTrack, JUMP_RESET_U, rockDrawPos, rockTrail, TRAIL_LEN, updateRockTrack } from '../src/renderer/src/render/tactical/rockTrack';
import { asteroidSpin, tacticalModel, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { circularVelocity, orbitRate } from '../src/renderer/src/sim/tactical/rails';
import { NO_AXES } from '../src/renderer/src/sim/tactical/state';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { arena, mover, rail } from './helpers/rockArena';

const model = (st: ReturnType<typeof arena>, extra: Partial<TacticalModelInput> = {}) => tacticalModel({ state: st, prev: st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading })), alpha: 1, camera: createCamera(0, 2000, 1),
  viewport: { w: 1280, h: 720 }, console: 'weapons', axes: NO_AXES, ships: [0], paused: false, reserveRight: 0, ...extra } as TacticalModelInput);

describe('the rock track (spec §7.1, §13.5)', () => {
  it('draws a rail at tick − 1 + α by its rotation, and a free rock lerped from the last tick', () => {
    const st = arena(), track = createRockTrack();
    rail(st, 3, 0, 1700, 20); mover(st, 4, 0, 2000, 30, 0, 10);
    updateRockTrack(track, st);
    stepDuel(st, IDLE_INPUT); updateRockTrack(track, st);
    const p = rockDrawPos(track, st, 3, 0.25), a = orbitRate(1700) * (st.tick - 1 + 0.25 - 0) / 60;
    expect(p.x).toBeCloseTo(-Math.sin(a) * 1700, 9); expect(p.y).toBeCloseTo(Math.cos(a) * 1700, 9);
    const q = rockDrawPos(track, st, 4, 0.5);
    expect(q.x).toBeCloseTo((0 + st.rocks[4 * 8 + 1]!) / 2, 9);
  });
  it('keeps 25 s of 4 Hz samples while a free rock is young and shows 6 s once it is older than 60 s; resets on a kind or r change or a jump', () => {
    const st = arena(), track = createRockTrack(), [vx, vy] = circularVelocity(0, 1700);
    mover(st, 4, 0, 1700, vx, vy + 5, 10);   // 5 u/s off circular, so it does not settle onto a rail within the test
    updateRockTrack(track, st);
    for (let t = 0; t < 40 * 60; t++) { stepDuel(st, IDLE_INPUT); updateRockTrack(track, st); }
    expect(rockTrail(track, st, 4)).toHaveLength(TRAIL_LEN);                  // 25 s × 4 Hz
    st.rocks[4 * 8 + 7] = st.tick - 61 * 60;                                   // older than 60 s
    expect(rockTrail(track, st, 4)).toHaveLength(6 * 4);
    st.rocks[4 * 8 + 5] = 11; stepDuel(st, IDLE_INPUT); updateRockTrack(track, st);
    expect(rockTrail(track, st, 4).length).toBeLessThanOrEqual(1);              // r changed: a new rock in this slot
    st.rocks[4 * 8 + 1]! += JUMP_RESET_U + 1; stepDuel(st, IDLE_INPUT); updateRockTrack(track, st);
    expect(rockTrail(track, st, 4).length).toBeLessThanOrEqual(1);              // jumped
  });
});

describe('the map model (spec §7.1, §7.2, §13.5)', () => {
  it('a free rock streaks only by its speed relative to V_c; a co-orbiting one does not', () => {
    const st = arena(), [vx, vy] = circularVelocity(0, 2000);
    mover(st, 10, 0, 2000, vx, vy, 10); mover(st, 11, 100, 2000, vx + 30, vy, 10);
    const m = model(st), still = m.asteroids.find((a) => a.index === 10)!, fast = m.asteroids.find((a) => a.index === 11)!;
    expect(still.streak).toBeUndefined();
    expect(fast.streak).toBeDefined();
    expect(fast.streak!.alpha).toBeCloseTo(Math.min(1, (Math.hypot(30 + vx - circularVelocity(100, 2000)[0], vy - circularVelocity(100, 2000)[1]) - 8) / 40), 6);
  });
  it('every outline turns at its own hashed rate of 0.1 to 0.5 rad/s, either way', () => {
    for (let i = 0; i < 200; i++) { const w = Math.abs(asteroidSpin(i)); expect(w).toBeGreaterThanOrEqual(0.1); expect(w).toBeLessThanOrEqual(0.5); }
    expect(new Set(Array.from({ length: 50 }, (_, i) => Math.sign(asteroidSpin(i)))).size).toBe(2);
    const st = arena(); rail(st, 3, 0, 2000, 20); st.tick = 600;
    expect(model(st).asteroids.find((a) => a.index === 3)!.spin).toBeCloseTo(asteroidSpin(3) * (600 + 1) / 60, 9);
  });
  it('draws the Weapons map\'s rock target\'s next 20 s as a dotted path; none without a target or off Weapons', () => {
    const st = arena(); rail(st, 3, 0, 2000, 20);
    expect(model(st, { contacts: true }).rockPath).toBeUndefined();
    st.systems[0].laserRock = 3;
    expect(model(st, { contacts: true }).rockPath).toHaveLength(40);
    expect(model(st, { contacts: true, console: 'helm' }).rockPath).toBeUndefined();
  });
});

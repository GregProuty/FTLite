// Asteroids-iii §7.1, §7.2, §13.5 (renderer): rails drawn at tick − 1 + α, free rocks lerped from the last tick, trails
// (25 s at 4 Hz while young, 6 s after) that reset on a kind or r change or a jump, streaks relative to V_c, the outline
// spin, and the predicted path of the Weapons map's rock target.
import { describe, expect, it } from 'vitest';
import { createCamera, worldToScreen } from '../src/renderer/src/render/tactical/camera';
import { createRockTrack, JUMP_RESET_U, rockDrawPos, rockTrail, rockTrailInto, TRAIL_LEN, updateRockTrack } from '../src/renderer/src/render/tactical/rockTrack';
import { asteroidSpin, tacticalModel, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { circularVelocity, orbitRate, railPos, type RailOut } from '../src/renderer/src/sim/tactical/rails';
import { predictRock } from '../src/renderer/src/sim/tactical/predict';
import { RockKind, ROCK_STRIDE, rockX, rockY, writeRock } from '../src/renderer/src/sim/tactical/rocks';
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
    const before = { x: st.rocks[4 * 8 + 1]!, y: st.rocks[4 * 8 + 2]! };   // the tick-1 position: px must hold it after the next step
    stepDuel(st, IDLE_INPUT); updateRockTrack(track, st);
    expect(track.px[4]).toBe(before.x); expect(track.py[4]).toBe(before.y);
    expect(track.cx[4]).toBe(st.rocks[4 * 8 + 1]!);
    const r = rockDrawPos(track, st, 4, 0.5);
    expect(r.x).toBeCloseTo((before.x + st.rocks[4 * 8 + 1]!) / 2, 9); expect(r.y).toBeCloseTo((before.y + st.rocks[4 * 8 + 2]!) / 2, 9);
  });
  it("draws a Tumble with a nonzero offset where the sim's railPos puts it at tick - 1 and at tick", () => {
    const st = arena(), track = createRockTrack();
    writeRock(st, 6, RockKind.Tumble, 1500, 300, 25, -12, 20, 5, st.tick);
    for (let i = 0; i < 90; i++) stepDuel(st, IDLE_INPUT);
    updateRockTrack(track, st);
    const out: RailOut = { x: 0, y: 0, vx: 0, vy: 0 }, v = st.rocks, b = 6 * ROCK_STRIDE;
    for (const [alpha, T] of [[0, st.tick - 1], [1, st.tick]] as const) {
      railPos(v[b + 1]!, v[b + 2]!, v[b + 3]!, v[b + 4]!, v[b + 7]!, T, true, out);
      const p = rockDrawPos(track, st, 6, alpha);
      expect(p.x).toBeCloseTo(out.x, 6); expect(p.y).toBeCloseTo(out.y, 6);
    }
  });
  it('a free rock that jumps, changes r or is refreed on a 4 Hz sample tick restarts its trail with exactly the new position', () => {
    const run = (mutate: (st: ReturnType<typeof arena>) => void): { len: number; head: number[]; at: number[] } => {
      const st = arena(), track = createRockTrack(), [vx, vy] = circularVelocity(0, 1700);
      mover(st, 4, 0, 1700, vx, vy + 5, 10); rail(st, 5, 300, 1700, 12);
      updateRockTrack(track, st);
      while ((st.tick + 1) % 15 !== 0 || st.tick < 100) { stepDuel(st, IDLE_INPUT); updateRockTrack(track, st); }   // the next update is a 4 Hz sample tick
      expect(track.len[4]).toBeGreaterThan(3);
      mutate(st); stepDuel(st, IDLE_INPUT); updateRockTrack(track, st);
      const out: number[] = [], n = rockTrailInto(track, st, 4, out);
      const o5: number[] = [], n5 = rockTrailInto(track, st, 5, o5);
      return { len: n, head: [rockX(st, 4), rockY(st, 4)], at: n5 > 0 ? o5.slice(0, 2) : out.slice(0, 2) };
    };
    const jumped = run((st) => { st.rocks[4 * 8 + 1]! += JUMP_RESET_U + 1; });
    expect(jumped.len).toBe(1); expect(jumped.at).toEqual(jumped.head);
    const resized = run((st) => { st.rocks[4 * 8 + 5] = 11; });
    expect(resized.len).toBe(1); expect(resized.at).toEqual(resized.head);
    const kept = run(() => undefined);   // no change: the history continues
    expect(kept.len).toBeGreaterThan(3);
    // a free rock turned into a rail (same r, moved under JUMP_RESET_U) on a sample tick: only the kind rule resets it
    const sk = arena(), tk = createRockTrack(), [kx, ky] = circularVelocity(0, 1700);
    mover(sk, 5, 0, 1700, kx, ky + 5, 12); updateRockTrack(tk, sk);
    while (tk.len[5]! <= 3 || (sk.tick + 1) % 15 !== 0) { stepDuel(sk, IDLE_INPUT); updateRockTrack(tk, sk); }
    const prevX = tk.cx[5]!;
    writeRock(sk, 5, RockKind.Rail, 0, 1710, 0, 0, 12, 5, sk.tick); stepDuel(sk, IDLE_INPUT); updateRockTrack(tk, sk);
    expect(tk.len[5]).toBe(0);                                     // a rail keeps no trail, and the free history is gone
    expect(tk.px[5]).toBe(rockX(sk, 5)); expect(tk.py[5]).toBe(rockY(sk, 5));
    expect(Math.hypot(rockX(sk, 5) - prevX, rockY(sk, 5) - 1700)).toBeLessThan(JUMP_RESET_U);
  });
  it('a tick that goes backwards resets the history', () => {
    const st = arena(), track = createRockTrack();
    mover(st, 4, 0, 1700, 1, 1, 10); updateRockTrack(track, st);
    for (let i = 0; i < 120; i++) { stepDuel(st, IDLE_INPUT); updateRockTrack(track, st); }
    expect(track.len[4]).toBeGreaterThan(3);
    st.tick = 3; updateRockTrack(track, st);
    expect(track.len[4]).toBe(1);
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
    const cam = createCamera(0, 2000, 1), vp = { w: 1280, h: 720 }, scr = (k: number) => predictRock(st, k, 1200, 30).map((q) => worldToScreen(cam, vp, q.x, q.y));
    expect(model(st, { contacts: true }).rockPath).toEqual(scr(3));
    st.systems[0].laserRock = -1; st.systems[0].torpRock = -1; mover(st, 9, 400, 2200, 3, -2, 15); st.systems[0].torpRockFlying = 9;
    expect(model(st, { contacts: true }).rockPath).toEqual(scr(9));
  });
});

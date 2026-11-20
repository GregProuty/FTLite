// Asteroids-iii §7.1, §7.2, §13.5 (renderer): rails drawn at tick − 1 + α, free rocks lerped from the last tick, trails
// (25 s at 4 Hz while young, 6 s after) that reset on a kind or r change or a jump, streaks relative to V_c, the outline
// spin, and the predicted path of the Weapons map's rock target.
import { describe, expect, it } from 'vitest';
import { createCamera, worldToScreen } from '../src/renderer/src/render/tactical/camera';
import { createRockTrack, JUMP_RESET_U, rockDrawPos, rockDrawTick, rockTrail, rockTrailInto, TRAIL_LEN, updateRockTrack } from '../src/renderer/src/render/tactical/rockTrack';
import { createCorrectionSmoother, SMOOTH_MS } from '../src/renderer/src/render/duel/correctionSmoother';
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
  it('on a guest seeing every third tick (gap 3), draws a rail at tick − 3(1 − α), so the rail and the outline spin run on without a judder', () => {
    const st = arena(), track = createRockTrack();
    rail(st, 3, 0, 1700, 20);
    for (let i = 0; i < 30; i++) stepDuel(st, IDLE_INPUT);
    updateRockTrack(track, st);
    const T0 = st.tick, end = rockDrawPos(track, st, 3, 1), spinEnd = model(st, { rockTrack: track, alpha: 1 }).asteroids.find((a) => a.index === 3)!.spin;
    for (let i = 0; i < 3; i++) stepDuel(st, IDLE_INPUT);
    updateRockTrack(track, st);
    expect(track.gap).toBe(3);
    const out: RailOut = { x: 0, y: 0, vx: 0, vy: 0 }, v = st.rocks, b = 3 * ROCK_STRIDE;
    for (const alpha of [0, 1]) {   // whole ticks: tick − 3 and tick, where the sim's railPos puts it
      railPos(v[b + 1]!, v[b + 2]!, v[b + 3]!, v[b + 4]!, v[b + 7]!, st.tick - 3 * (1 - alpha), false, out);
      const p = rockDrawPos(track, st, 3, alpha);
      expect(p.x).toBeCloseTo(out.x, 6); expect(p.y).toBeCloseTo(out.y, 6);
    }
    const half = rockDrawPos(track, st, 3, 0.5), a = (orbitRate(1700) * (st.tick - 1.5 - v[b + 7]!)) / 60;   // between: by its rotation
    expect(half.x).toBeCloseTo(-Math.sin(a) * 1700, 9); expect(half.y).toBeCloseTo(Math.cos(a) * 1700, 9);
    const start = rockDrawPos(track, st, 3, 0);   // the new gap starts where the last one ended: no step back
    expect(start.x).toBeCloseTo(end.x, 9); expect(start.y).toBeCloseTo(end.y, 9);
    expect(T0 + 3).toBe(st.tick);
    const spin = (alpha: number): number => model(st, { rockTrack: track, alpha }).asteroids.find((a) => a.index === 3)!.spin!;
    expect(spin(0)).toBeCloseTo(spinEnd!, 9);
    expect(spin(0.5)).toBeCloseTo((asteroidSpin(3) * (st.tick - 1.5)) / 60, 9);
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
  it('a small backward tick (a prediction retarget, Fable #8) re-syncs: the trails stay, the free rock does not lerp across it', () => {
    const st = arena(), track = createRockTrack();
    mover(st, 4, 0, 1700, 1, 1, 10); rail(st, 3, 0, 1700, 20); updateRockTrack(track, st);
    for (let i = 0; i < 120; i++) { stepDuel(st, IDLE_INPUT); updateRockTrack(track, st); }
    const len = track.len[4]!;
    expect(len).toBeGreaterThan(3);
    st.tick -= 4; updateRockTrack(track, st);
    expect(track.len[4]).toBe(len);
    expect(track.gap).toBe(1);
    expect(track.px[4]).toBe(track.cx[4]);
    expect(rockDrawPos(track, st, 4, 0.3)).toEqual({ x: track.cx[4], y: track.cy[4] });
  });
  it('online while predicting the blend spans one tick (Fable #8): a gap given to the track wins over the ticks seen; none keeps the observed gap', () => {
    const st = arena(), given = createRockTrack(), seen = createRockTrack();
    rail(st, 3, 0, 1700, 20); updateRockTrack(given, st, 1); updateRockTrack(seen, st);
    stepDuel(st, IDLE_INPUT); stepDuel(st, IDLE_INPUT); updateRockTrack(given, st, 1); updateRockTrack(seen, st);
    expect([given.gap, seen.gap]).toEqual([1, 2]);   // Single player and the guest's replica keep the observed gap
    const at = (t: typeof given) => { const p = rockDrawPos(t, st, 3, 0.5), a = Math.atan2(-p.x, p.y); return a * 60 / orbitRate(1700); };
    expect(at(given)).toBeCloseTo(st.tick - 0.5, 6);
    expect(at(seen)).toBeCloseTo(st.tick - 1, 6);
    updateRockTrack(given, st, 1); expect(given.gap).toBe(1);   // the same tick again: still one
  });
  for (const shift of [3, -3]) it(`rock jump brief §2: a ${shift > 0 ? 'backward' : 'forward'} 3-tick retarget, smoothed: the drawn rail tick moves at most 1 + 3 × (frame ms / SMOOTH_MS) a frame, never back, and is on P by 100 ms; the free rock follows it`, () => {
    // Online at 60 Hz: one tick, then one frame drawn at alpha 0.4 with the one-tick gap. At frame 30 P is retargeted: back
    // 3 ticks (restored to the rocks it had 3 ticks ago) or on 3 ticks, and the session's smoother keeps the draw-tick
    // offset, before minus after, decaying over SMOOTH_MS, which the track takes each frame.
    const st = arena(), track = createRockTrack(), smoother = createCorrectionSmoother(), none = { ships: [], missiles: [], crew: [] };
    const [vx, vy] = circularVelocity(0, 1700), TICK = 1000 / 60, A = 0.4;
    rail(st, 3, 1700, 0, 20); mover(st, 4, 0, 1700, vx, vy + 5, 10);   // a quarter turn apart
    const saved: { tick: number; rocks: Float64Array }[] = [], frames: { at: number; tick: number; drawn: number; free: { x: number; y: number } }[] = [];
    let shiftAt = Infinity;
    for (let f = 0; f < 60; f++) {
      const now = f * TICK;
      if (f === 30) {
        const before = st.tick;
        if (shift > 0) { const back = saved.at(-shift)!; st.tick = back.tick; st.rocks.set(back.rocks); } else for (let k = 0; k < -shift; k++) stepDuel(st, IDLE_INPUT);
        smoother.shift(none, none, now, before - st.tick); shiftAt = now;
      }
      saved.push({ tick: st.tick, rocks: st.rocks.slice() });
      stepDuel(st, IDLE_INPUT);
      updateRockTrack(track, st, 1, smoother.tickOffset(now));
      if (f >= 5) frames.push({ at: now, tick: st.tick, drawn: rockDrawTick(track, st, A), free: rockDrawPos(track, st, 4, A) });   // from the fifth frame: the free blend is under way
    }
    const bound = 1 + 3 * (TICK / SMOOTH_MS) + 1e-9, speed = Math.hypot(vx, vy + 5) / 60;   // the free rock's distance a tick, about
    for (let k = 1; k < frames.length; k++) {
      const a = frames[k - 1]!, b = frames[k]!, step = b.drawn - a.drawn, dx = b.free.x - a.free.x, dy = b.free.y - a.free.y;
      expect(step).toBeGreaterThan(0); expect(step).toBeLessThanOrEqual(bound);
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(bound * speed * 1.01);
      expect(Math.hypot(dx, dy)).toBeGreaterThan(0.4 * speed);   // it never stalls or turns back
      if (b.at >= shiftAt + SMOOTH_MS || b.at < shiftAt) expect(b.drawn).toBe(b.tick - (1 - A));   // no offset: exactly the old draw tick
    }
    expect(frames.find((f) => f.at === shiftAt)!.drawn - frames.find((f) => f.at === shiftAt - TICK)!.drawn).toBeCloseTo(1, 9);   // the retarget frame moves one tick, like any other
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
    expect(model(st).asteroids.find((a) => a.index === 3)!.spin).toBeCloseTo(asteroidSpin(3) * 600 / 60, 9);   // at α 1: the rail's own draw tick
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

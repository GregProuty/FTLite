// Sensors blip spec §2, §4 (fogModel): while the enemy ship is active and beyond sensor range the fog view carries a blip, a
// ping made on the game's tick (every BLIP_PING_TICKS) at the enemy's place plus a hashed offset inside the circle, held
// until the next one. No ghost of kind 'enemy' is produced; the derelict's ghost is as before.
import { describe, expect, it } from 'vitest';
import { BLIP_GROW, BLIP_PING_TICKS, BLIP_R_MAX, BLIP_R_MIN, blipHash, blipRadius, createFog, GHOST_SECONDS, stepFog } from '../src/renderer/src/render/tactical/fogModel';
import { derelictPos, sensorRange } from '../src/renderer/src/sim/tactical/science';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';

/** The crew ship at (1000, 2000), the enemy `beyond` units past sensor range due east of it, the state's tick set by hand. */
function scene(beyond: number, tick = 0) {
  const t = createTacticalState(5), own = t.ships[0]!, e = t.ships[1]!, range = sensorRange(t.systems[0]!);
  Object.assign(own, { x: 1000, y: 2000 });
  Object.assign(e, { x: 1000 + range + beyond, y: 2000, active: true });
  t.tick = tick;
  return { t, own, e, range, f: createFog() };
}

describe('the blip (sensors blip spec §2.1, §2.2)', () => {
  it('unseen from the first frame: a blip at once, with no earlier sighting, and no enemy ghost', () => {
    const { t, f } = scene(1000), v = stepFog(f, t, 0, 0);
    expect(v.seen.enemy).toBe(false);
    expect(v.blip).toMatchObject({ r: 400, age: 0 });
    expect(v.ghosts.filter((g) => g.kind === 'enemy')).toEqual([]);
  });
  it('the radius: 150 just beyond range, 400 at 1000 u beyond, 600 from 1800 u beyond', () => {
    expect([BLIP_R_MIN, BLIP_GROW, BLIP_R_MAX, BLIP_PING_TICKS]).toEqual([150, 0.25, 600, 120]);
    expect([blipRadius(0), blipRadius(1000), blipRadius(1800), blipRadius(3000), blipRadius(-50)]).toEqual([150, 400, 600, 600, 150]);
    for (const [beyond, r] of [[1, 150.25], [1000, 400], [3000, 600]] as const) {
      const s = scene(beyond);
      expect(stepFog(s.f, s.t, 0, 0).blip!.r).toBe(r);
    }
    const edge = scene(0), v = stepFog(edge.f, edge.t, 0, 0);   // at exactly the range the enemy is seen (pointSeen is <=)
    expect(v.seen.enemy).toBe(true); expect(v.blip ?? null).toBeNull();
  });
});

describe('the ping (sensors blip spec §2.3)', () => {
  it('the hash of (epoch, index) gives pinned u and v', () => {
    expect(blipHash(0, 0)).toEqual({ u: 8705 / 65536, v: 10503 / 65536 });
    expect(blipHash(3, 17)).toEqual({ u: 18494 / 65536, v: 40792 / 65536 });
    expect(blipHash(12345, 4)).toEqual({ u: 40159 / 65536, v: 61642 / 65536 });
  });
  it('the centre is the enemy\'s place plus 0.8 r sqrt(u) along the angle 2 pi v, always within 0.8 r of the enemy', () => {
    const { t, e, f } = scene(1000), b = stepFog(f, t, 0, 0).blip!;
    const { u, v } = blipHash(0, 0), len = 0.8 * 400 * Math.sqrt(u), a = 2 * Math.PI * v;
    expect(b.x).toBeCloseTo(e.x + Math.cos(a) * len, 9); expect(b.y).toBeCloseTo(e.y + Math.sin(a) * len, 9);
    expect(b.x).toBeCloseTo(2962.328351, 5); expect(b.y).toBeCloseTo(2098.573521, 5);   // pinned: the enemy at (2900, 2000)
    const s = scene(1000);
    for (let epoch = 0; epoch < 5; epoch++) for (let index = 0; index < 40; index++) {
      s.t.tick = index * BLIP_PING_TICKS + 7;
      const p = stepFog(createFog(), s.t, 0, epoch).blip!;
      expect(Math.hypot(p.x - s.e.x, p.y - s.e.y), `epoch ${epoch} index ${index}`).toBeLessThanOrEqual(0.8 * p.r + 1e-9);
    }
  });
  it('the same round and ping index give the same centre; another index or another round gives another', () => {
    const at = (epoch: number, tick: number) => { const s = scene(1000, tick), b = stepFog(s.f, s.t, 0, epoch).blip!; return [b.x, b.y]; };
    expect(at(0, 130)).toEqual(at(0, 130));
    expect(at(0, 239)).toEqual(at(0, 120));       // both in ping 1
    expect(at(0, 240)).not.toEqual(at(0, 239));   // ping 2
    expect(at(1, 0)).not.toEqual(at(0, 0));       // another round
  });
  it('the circle holds its centre and radius for 120 ticks while the enemy moves, its age running 0 to 1; then a new ping', () => {
    const { t, e, f } = scene(3000, 240), first = stepFog(f, t, 0, 0).blip!;
    expect(first).toMatchObject({ r: 600, age: 0 });
    for (let k = 1; k < BLIP_PING_TICKS; k++) {
      t.tick = 240 + k; e.x += 5;
      const b = stepFog(f, t, k / 60, 0).blip!;
      expect([b.x, b.y, b.r]).toEqual([first.x, first.y, first.r]);
      expect(b.age).toBe(k / BLIP_PING_TICKS);
    }
    expect(Math.hypot(e.x - first.x, e.y - first.y)).toBeGreaterThan(first.r);   // the enemy has left the held circle: the roughness
    t.tick = 360; e.x += 5;
    const next = stepFog(f, t, 2, 0).blip!;
    expect(next.age).toBe(0);
    expect([next.x, next.y]).not.toEqual([first.x, first.y]);
    expect(Math.hypot(next.x - e.x, next.y - e.y)).toBeLessThanOrEqual(0.8 * next.r + 1e-9);
  });
  it('a ping made 78 ticks into a period starts at age 0 and runs to the period\'s end, kept within 0..1', () => {
    const { t, f } = scene(1000, 78), age = () => stepFog(f, t, 0, 0).blip!.age;
    expect(age()).toBe(0);
    t.tick = 70; expect(age()).toBe(0);                       // a tick behind the ping (an online correction): never below 0
    t.tick = 99; expect(age()).toBe(0.5);                     // 21 of its 42 ticks
    t.tick = 119; expect(age()).toBeCloseTo(41 / 42, 12);     // its last tick; at 120 the formula reads 1 and the next ping is made
    t.tick = 120; expect(age()).toBe(0);
    t.tick = 180; expect(age()).toBe(0.5);                    // the next ping lasts the full 120
  });
  it('a state whose tick does not advance keeps one ping across 10 s of the presentation clock', () => {
    const { t, f } = scene(1000, 500), first = stepFog(f, t, 0, 0).blip!;
    for (let k = 1; k <= 600; k++) expect(stepFog(f, t, k / 60, 0).blip).toEqual(first);
  });
  it('seen again: no blip; unseen again: a new ping at once', () => {
    const { t, e, own, range, f } = scene(1000, 250);
    expect(stepFog(f, t, 0, 0).blip!.age).toBe(0);
    t.tick = 300;
    expect(stepFog(f, t, 1, 0).blip!.age).toBe(50 / 110);     // held: made at 250, due at 360
    e.x = own.x + range / 2;
    const seen = stepFog(f, t, 2, 0);
    expect(seen.seen.enemy).toBe(true); expect(seen.blip ?? null).toBeNull();
    t.tick = 310; e.x = own.x + range + 1000;
    expect(stepFog(f, t, 3, 0).blip).toMatchObject({ age: 0 });   // the held ping would read 60 / 110
  });
  it('a new round clears the held ping; a destroyed enemy has no blip', () => {
    const { t, e, f } = scene(1000, 50), first = stepFog(f, t, 0, 0).blip!;
    t.tick = 60;
    const next = stepFog(f, t, 1, 1).blip!;   // epoch 1, the same ping index: the held ping would read 10 / 70 at the old centre
    expect(next.age).toBe(0);
    expect([next.x, next.y]).not.toEqual([first.x, first.y]);
    e.active = false;
    const gone = stepFog(f, t, 2, 1);
    expect(gone.blip ?? null).toBeNull();
    expect(gone.ghosts.filter((g) => g.kind === 'enemy')).toEqual([]);
  });
});

describe('the ghosts (sensors blip spec §2.1)', () => {
  it('no ghost of kind enemy is ever produced, seen then unseen; the derelict still leaves its fading ghost', () => {
    const { t, e, own, range, f } = scene(1000);
    e.x = own.x + range / 2; stepFog(f, t, 100, 0);   // seen
    e.x = own.x + range * 2;
    for (const now of [100.5, 101, 105, 109.9, 111]) expect(stepFog(f, t, now, 0).ghosts.filter((g) => g.kind === 'enemy')).toEqual([]);
    expect(f.tracks.has('enemy')).toBe(false);
    const w = derelictPos(t);
    Object.assign(own, { x: w.x, y: w.y });
    expect(stepFog(f, t, 200, 0).seen.derelict).toBe(true);
    own.x = w.x + range * 2;
    expect(stepFog(f, t, 201, 0).ghosts.find((g) => g.kind === 'derelict')).toEqual({ kind: 'derelict', x: w.x, y: w.y, h: 0, alpha: 1 - 1 / GHOST_SECONDS });
    expect(stepFog(f, t, 200 + GHOST_SECONDS, 0).ghosts.find((g) => g.kind === 'derelict')).toBeUndefined();
  });
});

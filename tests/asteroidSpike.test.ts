// SPIKE (destructible asteroids, docs/superpowers/specs/2026-11-17-destructible-asteroids-spike.md): the rock pool's
// rules, its broad phase against brute force, and that it is part of the hash, the clone and the snapshot.
import { describe, expect, it } from 'vitest';
import { cloneTactical, createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { hashTactical } from '../src/renderer/src/sim/tactical/hash';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import {
  damageRock, firstBlocker, rockAlive, rockAt, rockHp, RockKind, rockKind, rocksNear, rockSlots, ROCK_FLING, ROCK_SPLIT_R, ROCK_SPLIT_SCALE, TORPEDO_ROCK_DAMAGE
} from '../src/renderer/src/sim/tactical/rocks';

const bigRock = (st: TacticalState): number => st.map.asteroids.findIndex((a) => a.r >= ROCK_SPLIT_R);
const smallRock = (st: TacticalState): number => st.map.asteroids.findIndex((a) => a.r < ROCK_SPLIT_R);

describe('the destructible-asteroids spike', () => {
  it('starts every seeded asteroid as a static rock with hp ceil(r / 10), and the reserve empty', () => {
    const st = createTacticalState(3);
    st.map.asteroids.forEach((a, k) => expect(rockAt(st, k)).toEqual({ kind: RockKind.Static, x: a.x, y: a.y, vx: 0, vy: 0, r: a.r, hp: rockHp(a.r) }));
    for (let k = st.map.asteroids.length; k < rockSlots(st); k++) expect(rockAlive(st, k)).toBe(false);
  });
  it('a rock of radius 30+ splits at 0 hp into two moving fragments of r · 0.55; a small one shatters', () => {
    const st = createTacticalState(3), k = bigRock(st), a = rockAt(st, k);
    damageRock(st, k, a.hp, 1, 0, 'laser');
    expect(rockKind(st, k)).toBe(RockKind.Moving);
    const second = st.map.asteroids.length;   // the first reserve slot is the lowest empty one
    expect(rockKind(st, second)).toBe(RockKind.Moving);
    for (const f of [rockAt(st, k), rockAt(st, second)]) {
      expect(f.r).toBeCloseTo(a.r * ROCK_SPLIT_SCALE, 12);
      expect(Math.hypot(f.vx, f.vy)).toBeCloseTo(ROCK_FLING, 9);
      expect(f.vx).toBeGreaterThan(0);   // thrown forward along the hit
    }
    expect(st.rockSplits).toBe(1);
    const s = smallRock(st);
    damageRock(st, s, TORPEDO_ROCK_DAMAGE * 10, 0, 1, 'torpedo');
    expect(rockAlive(st, s)).toBe(false);
    expect(st.rockDust).toBe(1);
  });
  it('rocksNear matches a brute-force scan of the live pool, before and after splits and drift', () => {
    const st = createTacticalState(4);
    const brute = (x: number, y: number, h: number): number[] => {
      const out: number[] = [];
      for (let k = 0; k < rockSlots(st); k++) { if (!rockAlive(st, k)) continue; const a = rockAt(st, k); if (Math.abs(a.x - x) <= h + a.r && Math.abs(a.y - y) <= h + a.r) out.push(k); }
      return out;
    };
    for (let n = 0; n < 6; n++) { const k = st.map.asteroids.findIndex((a, i) => a.r >= ROCK_SPLIT_R && rockKind(st, i) === RockKind.Static); if (k >= 0) damageRock(st, k, 99, 1, 1, 'laser'); }
    for (let t = 0; t < 400; t++) {
      if (t % 50 === 0) for (let q = 0; q < 40; q++) {
        const x = -2600 + ((q * 977) % 5200), y = -2600 + ((q * 571) % 5200), h = 20 + (q % 7) * 60;
        const got = rocksNear(st, x, y, h).filter((k) => { const a = rockAt(st, k); return Math.abs(a.x - x) <= h + a.r && Math.abs(a.y - y) <= h + a.r; });
        expect(got).toEqual(brute(x, y, h));
      }
      stepDuel(st, IDLE_INPUT);
    }
  });
  it('the pool is in the hash and the clone: a chipped rock changes the hash, and a clone runs on identically', () => {
    const a = createTacticalState(5), b = createTacticalState(5);
    damageRock(b, 0, 1, 1, 0, 'laser');
    expect(hashTactical(a)).not.toBe(hashTactical(b));
    const k = bigRock(a); damageRock(a, k, 99, 0, -1, 'laser');
    const c = cloneTactical(a);
    expect(c.rocks).not.toBe(a.rocks);
    for (let t = 0; t < 600; t++) { stepDuel(a, IDLE_INPUT); stepDuel(c, IDLE_INPUT); }
    expect(hashTactical(c)).toBe(hashTactical(a));
  });
  it('firstBlocker finds the nearest rock along a segment, and nothing once it is gone', () => {
    const st = createTacticalState(5), a = rockAt(st, 0);
    const hit = firstBlocker(st, a.x - 200, a.y, a.x + 200, a.y);
    expect(hit?.rock).toBe(0);
    expect(hit!.t).toBeCloseTo((200 - a.r) / 400, 9);
    damageRock(st, 0, 99, 1, 0, 'laser');
    if (a.r < ROCK_SPLIT_R) expect(firstBlocker(st, a.x - 200, a.y, a.x + 200, a.y)?.rock ?? -2).not.toBe(0);
  });
});

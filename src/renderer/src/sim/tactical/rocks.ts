// SPIKE (destructible asteroids, docs/superpowers/specs/2026-11-17-destructible-asteroids-spike.md): the map's asteroids
// as mutable rocks. `state.rocks` is a fixed-capacity pool, ROCK_STRIDE values per slot: kind (0 gone, 1 static, 2 a
// moving fragment), x, y, vx, vy, r, hp. Slots 0 .. n − 1 start as the seeded map's asteroids (index for index); the
// ROCK_RESERVE slots after them start empty. A split keeps its first fragment in the broken rock's slot and takes the
// lowest empty slot for the second (no free slot: the second is debris). The pool is a Float64Array, so the space module
// flattens, hashes, snapshots and clones it as one vector.
// Broad phase: the seeded grid (grid.ts) is never rebuilt. It indexes slots 0 .. n − 1 at their seeded footprints, and
// a static rock never moves, so a grid hit is kept only while its slot still holds a static rock; moving fragments are
// found by a linear scan. rocksNear merges both, ascending, so every caller still meets rocks in one fixed index order.
// Order of operations inside a tick (fixed): weapon commands (laser hits on rocks), ships fly, missiles fly, rocks fly
// (stepRocks: each moving fragment in ascending slot order, then its contacts), ship contacts, missile contacts
// (torpedo hits on rocks). Breaks happen immediately where the damage lands.
import { queryGrid } from './grid';
import type { MapDef } from './map';
import { gravityAccel } from './physics';
import type { TacticalState } from './state';
import { DT, R_MAP } from './tuning';

export const ROCK_STRIDE = 7;
export const RockKind = { Gone: 0, Static: 1, Moving: 2 } as const;
/** Spare slots for fragments (each split needs one). */
export const ROCK_RESERVE = 32;
/** Spike rules (start values): hp = ceil(r / ROCK_HP_PER); a laser shot −1, a torpedo −4; radius ≥ ROCK_SPLIT_R splits into
 *  two of r · ROCK_SPLIT_SCALE flung apart at ROCK_FLING u/s, else it shatters; a fragment under ROCK_MIN_R is removed. */
export const ROCK_HP_PER = 10;
export const LASER_ROCK_DAMAGE = 1;
export const TORPEDO_ROCK_DAMAGE = 4;
export const FRAGMENT_ROCK_DAMAGE = 1;
export const ROCK_SPLIT_R = 30;
export const ROCK_SPLIT_SCALE = 0.55;
export const ROCK_FLING = 40;
export const ROCK_MIN_R = 10;
/** The crew laser fires on its own at a rock that blocks its in-arc, in-range target (it digs). */
export const AUTO_DIG = true;

export type RockCause = 'laser' | 'torpedo' | 'fragment';

/** The pool's capacity for a map: its asteroids plus the reserve. Also the number of rock bodies in a ship's graceUntil. */
export function rockCapacity(map: MapDef): number { return map.asteroids.length + ROCK_RESERVE; }
export function rockHp(r: number): number { return Math.ceil(r / ROCK_HP_PER); }

export function initRocks(map: MapDef): Float64Array {
  const out = new Float64Array(rockCapacity(map) * ROCK_STRIDE);
  map.asteroids.forEach((a, k) => { out.set([RockKind.Static, a.x, a.y, 0, 0, a.r, rockHp(a.r)], k * ROCK_STRIDE); });
  return out;
}

export const rockKind = (s: TacticalState, k: number): number => s.rocks[k * ROCK_STRIDE]!;
export const rockAlive = (s: TacticalState, k: number): boolean => s.rocks[k * ROCK_STRIDE]! !== RockKind.Gone;
export interface RockView { x: number; y: number; vx: number; vy: number; r: number; hp: number; kind: number }
export function rockAt(s: TacticalState, k: number): RockView {
  const b = k * ROCK_STRIDE, v = s.rocks;
  return { kind: v[b]!, x: v[b + 1]!, y: v[b + 2]!, vx: v[b + 3]!, vy: v[b + 4]!, r: v[b + 5]!, hp: v[b + 6]! };
}
export function rockSlots(s: TacticalState): number { return s.rocks.length / ROCK_STRIDE; }

/** Slots of every live rock whose bounding box may overlap the square around (x, y) of half-size h, ascending, no repeats. */
export function rocksNear(s: TacticalState, x: number, y: number, h: number): number[] {
  const v = s.rocks, out: number[] = [];
  for (const k of queryGrid(s.grid, x, y, h)) if (v[k * ROCK_STRIDE] === RockKind.Static) out.push(k);
  let moving = false;
  for (let k = 0, n = v.length / ROCK_STRIDE; k < n; k++) {
    const b = k * ROCK_STRIDE;
    if (v[b] !== RockKind.Moving) continue;
    const r = v[b + 5]!;
    if (Math.abs(v[b + 1]! - x) <= h + r && Math.abs(v[b + 2]! - y) <= h + r) { out.push(k); moving = true; }
  }
  if (moving) out.sort((a, b) => a - b);
  return out;
}

function write(s: TacticalState, k: number, kind: number, x: number, y: number, vx: number, vy: number, r: number, hp: number): void {
  s.rocks.set([kind, x, y, vx, vy, r, hp], k * ROCK_STRIDE);
}
function clear(s: TacticalState, k: number): void { s.rocks.fill(0, k * ROCK_STRIDE, (k + 1) * ROCK_STRIDE); }
/** A reused slot starts with no contact grace: every ship's grace for that body is cleared. */
function freshGrace(s: TacticalState, k: number): void { for (const ship of s.ships) ship.graceUntil[k + 1] = 0; }

/** Damage rock k by `dmg` from direction (dx, dy) (need not be unit; zero falls back to north). At 0 hp it breaks. */
export function damageRock(s: TacticalState, k: number, dmg: number, dx: number, dy: number, by: RockCause): void {
  if (!rockAlive(s, k)) return;
  const b = k * ROCK_STRIDE, hp = s.rocks[b + 6]! - dmg;
  s.rocks[b + 6] = Math.max(0, hp);
  s.events.push({ kind: 'rock', what: 'hit', by, rock: k, x: s.rocks[b + 1]!, y: s.rocks[b + 2]!, r: s.rocks[b + 5]! });
  s.rockHits++;
  if (hp <= 0) breakRock(s, k, dx, dy, by);
}

/** Rock k breaks (spec rules): radius ≥ ROCK_SPLIT_R splits into two fragments thrown forward along the hit direction at
 *  ±45°, else (or when the fragments would be under ROCK_MIN_R) it shatters into debris and is gone. */
export function breakRock(s: TacticalState, k: number, dx: number, dy: number, by: RockCause): void {
  const a = rockAt(s, k), d = Math.sqrt(dx * dx + dy * dy), ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : -1;
  const cr = a.r * ROCK_SPLIT_SCALE;
  if (a.r < ROCK_SPLIT_R || cr < ROCK_MIN_R) {
    clear(s, k); s.rockShatters++;
    s.events.push({ kind: 'rock', what: 'shatter', by, rock: k, x: a.x, y: a.y, r: a.r });
    return;
  }
  const px = -uy, py = ux, h = 0.7071067811865476, off = a.r * 0.6;
  // Fragment directions (forward ± sideways) / √2; positions either side of the centre across the hit line.
  const sides = [-1, 1] as const;
  clear(s, k);
  let second = -1;
  for (let j = 0, n = rockSlots(s); j < n; j++) if (j !== k && !rockAlive(s, j)) { second = j; break; }   // the lowest empty slot but k's
  sides.forEach((side, n) => {
    const slot = n === 0 ? k : second;
    if (slot < 0) return;
    const fx = (ux + side * px) * h, fy = (uy + side * py) * h;
    write(s, slot, RockKind.Moving, a.x + side * px * off, a.y + side * py * off, a.vx + fx * ROCK_FLING, a.vy + fy * ROCK_FLING, cr, rockHp(cr));
    freshGrace(s, slot);
  });
  s.rockSplits++;
  s.events.push({ kind: 'rock', what: 'split', by, rock: k, x: a.x, y: a.y, r: a.r });
}

function touching(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx, dy = ay - by, rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

/** One tick of the moving fragments, ascending slot order: gravity (no drag), semi-implicit Euler, then contacts. A
 *  fragment that touches the planet or leaves the map is gone; one that touches another rock shatters and deals that
 *  rock FRAGMENT_ROCK_DAMAGE. Fragments created during this pass first move next tick. */
export function stepRocks(s: TacticalState): void {
  const v = s.rocks, movers: number[] = [];
  for (let k = 0, n = v.length / ROCK_STRIDE; k < n; k++) if (v[k * ROCK_STRIDE] === RockKind.Moving) movers.push(k);
  for (const k of movers) {
    const b = k * ROCK_STRIDE;
    const [gx, gy] = gravityAccel(v[b + 1]!, v[b + 2]!);
    v[b + 3]! += gx * DT; v[b + 4]! += gy * DT;
    v[b + 1]! += v[b + 3]! * DT; v[b + 2]! += v[b + 4]! * DT;
  }
  for (const k of movers) {
    const b = k * ROCK_STRIDE;
    if (v[b] !== RockKind.Moving) continue;   // broken earlier in this pass
    const x = v[b + 1]!, y = v[b + 2]!, r = v[b + 5]!, p = s.map.planet;
    if (touching(x, y, r, p.x, p.y, p.r) || x * x + y * y > R_MAP * R_MAP) {
      clear(s, k); s.rockShatters++;
      s.events.push({ kind: 'rock', what: 'shatter', by: 'fragment', rock: k, x, y, r });
      continue;
    }
    for (const j of rocksNear(s, x, y, r)) {
      if (j === k) continue;
      const o = rockAt(s, j);
      if (!touching(x, y, r, o.x, o.y, o.r)) continue;
      const vx = v[b + 3]!, vy = v[b + 4]!;
      clear(s, k); s.rockShatters++;
      s.events.push({ kind: 'rock', what: 'shatter', by: 'fragment', rock: k, x, y, r });
      damageRock(s, j, FRAGMENT_ROCK_DAMAGE, vx - o.vx, vy - o.vy, 'fragment');
      break;
    }
  }
}

/** Where the segment a → b first enters circle (cx, cy, r), as t in [0, 1], or −1 when it never does. Starting inside is 0. */
export function segmentEntry(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): number {
  const ex = bx - ax, ey = by - ay, fx = ax - cx, fy = ay - cy;
  const c = fx * fx + fy * fy - r * r;
  if (c < 0) return 0;
  const a = ex * ex + ey * ey;
  if (a === 0) return -1;
  const bb = fx * ex + fy * ey, disc = bb * bb - a * c;
  if (disc < 0 || bb > 0) return -1;
  const t = (-bb - Math.sqrt(disc)) / a;
  return t <= 1 ? t : -1;
}

/** The first solid body along a → b: the planet (−1), a rock slot (≥ 0), or null; with the entry t. */
export function firstBlocker(s: TacticalState, ax: number, ay: number, bx: number, by: number): { rock: number; t: number } | null {
  let best: { rock: number; t: number } | null = null;
  const p = s.map.planet, tp = segmentEntry(ax, ay, bx, by, p.x, p.y, p.r);
  if (tp >= 0) best = { rock: -1, t: tp };
  const half = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / 2;
  for (const k of rocksNear(s, (ax + bx) / 2, (ay + by) / 2, half)) {
    const a = rockAt(s, k), t = segmentEntry(ax, ay, bx, by, a.x, a.y, a.r);
    if (t >= 0 && (!best || t < best.t)) best = { rock: k, t };   // ascending k: a tie keeps the lower slot (the planet wins ties)
  }
  return best;
}

// Spike ii §3.4, §3.5, §6.1 (docs/superpowers/specs/2026-11-18-asteroids-ii-design.md): how a rock takes a hit, a push,
// turns to dust and breaks. A break's pieces fan across the 120° ahead of the hit direction (laser, blast-secondary,
// collision, ram) or burst in a full circle (a torpedo's direct hit). Directions come from literal cos/sin tables
// rotated onto the hit direction by multiplication (the determinism guard allows no trigonometry). Piece 0 keeps the
// broken rock's slot, the others take the lowest empty slots, else evict the smallest moving rock smaller than the
// piece that is not born this tick and not a body of the contact being resolved, else the piece is dust. Every slot
// cleared or rewritten clears the rock targets that named it. A slot born this tick takes no damage, push or break.
import { ROCK_BLAST_FLING, ROCK_FLING, ROCK_MIN_R } from './rockTuning';
import { rockAlive, rockAt, rockHp, RockKind, rockSlots, ROCK_STRIDE, wakeRock, writeRock } from './rocks';
import type { RockCause, TacticalState } from './state';

export type BreakPattern = 'fan' | 'burst';
const C30 = 0.8660254037844386, C40 = 0.766044443118978, S40 = 0.6427876096865393, S60 = 0.8660254037844386;
/** The fan's piece directions as (cos θ, sin θ) of the turn from the hit direction, piece 0 first: θk = −60° + 120°(k + ½)/n
 *  (2 pieces ±30°, 3 pieces −40°, 0°, +40°; θ clockwise on the y-down map). */
export const FAN_DIRS: Readonly<Record<2 | 3, readonly (readonly [number, number])[]>> = {
  2: [[C30, -0.5], [C30, 0.5]],
  3: [[C40, -S40], [1, 0], [C40, S40]]
};
/** The burst's: θk = 360° · k / n from the hit direction, so piece 0 flies straight on. */
export const BURST_DIRS: Readonly<Record<4 | 6, readonly (readonly [number, number])[]>> = {
  4: [[1, 0], [0, 1], [-1, 0], [0, -1]],
  6: [[1, 0], [0.5, S60], [-0.5, S60], [-1, 0], [-0.5, -S60], [0.5, -S60]]
};

/** §3.4: the pieces a break of a rock of radius r makes (0: dust). */
export function pieceCount(r: number, pattern: BreakPattern): 0 | 2 | 3 | 4 | 6 {
  if (pattern === 'fan') return r >= 40 ? 3 : r >= 25 ? 2 : 0;
  return r >= 35 ? 6 : r >= 25 ? 4 : 0;
}
/** §3.4: a piece's radius, 0.9 r / √n. */
export function pieceRadius(r: number, n: number): number { return (0.9 * r) / Math.sqrt(n); }

/** Clear slot k and every active ship's rock target that names it (§6.1: laser and torpedo to −1, a flying torpedo's to −2). */
export function vacate(s: TacticalState, k: number): void {
  s.rocks.fill(0, k * ROCK_STRIDE, (k + 1) * ROCK_STRIDE);
  s.systems.forEach((sys, i) => {
    if (!s.ships[i]!.active) return;   // an inactive slot's record holds zeros, and keeps them
    if (sys.laserRock === k) sys.laserRock = -1;
    if (sys.torpRock === k) sys.torpRock = -1;
    if (sys.torpRockFlying === k) sys.torpRockFlying = -2;
  });
}
const shipField = (ship: number): { ship?: number } => (ship >= 0 ? { ship } : {});

/** §3.5: rock k turns to dust: a dust event with its position, radius and velocity, then the slot is vacated. Not a break. */
export function dustRock(s: TacticalState, k: number, by: RockCause, ship = -1, evicted = false): void {
  const a = rockAt(s, k);
  s.events.push({ kind: 'rock', what: 'dust', by, rock: k, x: a.x, y: a.y, r: a.r, vx: a.vx, vy: a.vy, ...shipField(ship), ...(evicted ? { evicted: true as const } : {}) });
  s.rockDust++;
  vacate(s, k);
}
/** §3.1, §4: add (dvx, dvy) to rock k's velocity, waking a static rock (a push always wakes it). Born or gone: nothing. */
export function pushRock(s: TacticalState, k: number, dvx: number, dvy: number): void {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return;
  wakeRock(s, k);
  const b = k * ROCK_STRIDE;
  s.rocks[b + 3]! += dvx; s.rocks[b + 4]! += dvy;
}
/** Take dmg off rock k's hp (born or gone: nothing, false); true when it is now at or below 0 (the caller breaks it). */
export function wearRock(s: TacticalState, k: number, dmg: number): boolean {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return false;
  const b = k * ROCK_STRIDE + 6;
  s.rocks[b]! -= dmg;
  return s.rocks[b]! <= 0;
}
/** A weapon's hit (§4.1, §4.2): wear, a hit event (rockHits + 1), and at hp ≤ 0 a fan break along (ux, uy). */
export function hitRock(s: TacticalState, k: number, dmg: number, ux: number, uy: number, by: RockCause, ship = -1): void {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return;
  const broke = wearRock(s, k, dmg), a = rockAt(s, k);
  s.events.push({ kind: 'rock', what: 'hit', by, rock: k, x: a.x, y: a.y, r: a.r, vx: a.vx, vy: a.vy, ...shipField(ship) });
  s.rockHits++;
  if (broke) breakRock(s, k, ux, uy, by, ship, 'fan');
}

/** §3.4: a slot for a new piece of radius rp: the lowest empty one, else evict (rockEvictions + 1, a dust event without a
 *  ship) the smallest moving rock smaller than rp that is not born and not in `exclude` (ties: the lowest slot), else −1. */
function allocate(s: TacticalState, rp: number, exclude: readonly number[], by: RockCause): number {
  const v = s.rocks, n = rockSlots(s);
  for (let j = 0; j < n; j++) if (v[j * ROCK_STRIDE] === RockKind.Gone) return j;
  let best = -1;
  for (let j = 0; j < n; j++) {
    const b = j * ROCK_STRIDE;
    if (v[b] !== RockKind.Moving || s.rockBorn[j] === 1 || exclude.includes(j) || v[b + 5]! >= rp) continue;
    if (best < 0 || v[b + 5]! < v[best * ROCK_STRIDE + 5]!) best = j;
  }
  if (best < 0) return -1;
  s.rockEvictions++;
  dustRock(s, best, by, -1, true);   // eviction: not a break (the views and the feel proxy skip `evicted` dust)
  return best;
}

/**
 * §3.4: rock k breaks, its hit direction (ux, uy) (need not be unit; zero: north), its cause and ship (−1 none) and the
 * pattern. rocksBroken + 1 for `ship`, once. Too small for pieces (or pieces under ROCK_MIN_R): dust. Otherwise piece j
 * starts at centre + dir · 0.6 r with the parent's velocity plus dir · the pattern's speed, radius 0.9 r / √n, hp
 * ceil(rp / 10), kind 2, born, with fresh contact grace; then one split event naming the slots written.
 */
export function breakRock(s: TacticalState, k: number, ux: number, uy: number, by: RockCause, ship: number, pattern: BreakPattern, exclude: readonly number[] = []): void {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return;
  const a = rockAt(s, k), n = pieceCount(a.r, pattern), rp = n > 0 ? pieceRadius(a.r, n) : 0;
  if (ship >= 0) s.systems[ship]!.rocksBroken++;
  if (n === 0 || rp < ROCK_MIN_R) { dustRock(s, k, by, ship); return; }
  const d = Math.sqrt(ux * ux + uy * uy), hx = d > 0 ? ux / d : 0, hy = d > 0 ? uy / d : -1;
  const dirs = pattern === 'fan' ? FAN_DIRS[n as 2 | 3] : BURST_DIRS[n as 4 | 6], speed = pattern === 'fan' ? ROCK_FLING : ROCK_BLAST_FLING;
  const off = 0.6 * a.r, pieces: number[] = [];
  vacate(s, k);
  dirs.forEach(([c, sn], j) => {
    const dx = hx * c - hy * sn, dy = hx * sn + hy * c;
    const px = a.x + dx * off, py = a.y + dy * off, vx = a.vx + dx * speed, vy = a.vy + dy * speed;
    const slot = j === 0 ? k : allocate(s, rp, exclude, by);
    if (slot < 0) {   // no slot: this piece is dust, never silent
      s.events.push({ kind: 'rock', what: 'dust', by, rock: -1, x: px, y: py, r: rp, vx, vy, ...shipField(ship) });
      s.rockDust++;
      return;
    }
    writeRock(s, slot, RockKind.Moving, px, py, vx, vy, rp, rockHp(rp));
    s.rockBorn[slot] = 1;
    for (const body of s.ships) body.graceUntil[slot + 1] = 0;   // a new rock: no contact grace on any ship
    pieces.push(slot);
  });
  s.rockSplits++;
  s.events.push({ kind: 'rock', what: 'split', by, rock: k, x: a.x, y: a.y, r: a.r, vx: a.vx, vy: a.vy, pieces, ...shipField(ship) });
}

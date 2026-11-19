// Asteroids-iii §5, §13.3, §13.6 (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md), on spike ii's rockBreak: how
// a rock takes a hit, a push, turns to dust and breaks. A torpedo's direct hit bursts the rock into 8, 6 or 4 pieces
// (parent r ≥ 40, ≥ 30, ≥ 20; else dust) evenly round the hit direction, born 0.85, 0.80 or 0.70 r out so no two siblings
// overlap; any other break fans 3 or 2 pieces across the 120° ahead, born 0.6 r out; a tidal break (the Roche rule) is a
// fan with a tiny kick. Piece j leaves at the parent's velocity plus its direction times k_j = v_esc(ρ_parent) · (MIN +
// SPAN · f_j), f_j the fractional part of j · GOLDEN_FRAC: burst 0.15 + 0.25 f, fan 0.10 + 0.15 f, tidal 0.03 + 0.05 f.
// Directions come from literal cos/sin tables turned onto the hit direction by multiplication. Piece 0 keeps the broken
// rock's slot, the others take the lowest empty slots, else evict the smallest rock (any live kind) smaller than the
// piece that is not born this tick and not in `exclude` (ties: the lowest slot), else the piece is dust (rockSlotDust + 1).
// Pieces are Free with t = the phase tick (siblings share t) and are linked into the rock grid at birth. Every slot
// cleared or rewritten clears the rock targets that named it. A slot born this tick takes no damage, push or break. A
// push frees a rail first, restarts the rock's clock and touches it (§3.4).
import { escapeSpeed } from './rails';
import { BURST_4_MIN_R, BURST_6_MIN_R, BURST_8_MIN_R, BURST_KICK_MIN, BURST_KICK_SPAN, BURST_OFFSET, FAN_KICK_MIN, FAN_KICK_SPAN, FAN_OFFSET, FAN_SPLIT_MIN_R, FAN_TRIPLE_MIN_R, GOLDEN_FRAC, ROCK_CRUSH_SPEED, ROCK_CRUSH_STEP, ROCK_MIN_R, TIDAL_KICK_MIN, TIDAL_KICK_SPAN } from './rockTuning';
import { freeRock, markTouched, regridRock, restartClock, rockAlive, rockAt, rockHp, RockKind, rockSlots, ROCK_STRIDE, writeRock } from './rocks';
import type { RockCause, TacticalState } from './state';

export type BreakPattern = 'fan' | 'burst' | 'tidal';
const C30 = 0.8660254037844386, C40 = 0.766044443118978, S40 = 0.6427876096865393, S45 = 0.7071067811865476, S60 = 0.8660254037844386;
/** The fan's piece directions as (cos θ, sin θ) of the turn from the hit direction, piece 0 first: θk = −60° + 120°(k + ½)/n
 *  (2 pieces ±30°, 3 pieces −40°, 0°, +40°; θ clockwise on the y-down map). */
export const FAN_DIRS: Readonly<Record<2 | 3, readonly (readonly [number, number])[]>> = {
  2: [[C30, -0.5], [C30, 0.5]],
  3: [[C40, -S40], [1, 0], [C40, S40]]
};
/** The burst's: θk = 360° · k / n from the hit direction, so piece 0 flies straight on. */
export const BURST_DIRS: Readonly<Record<4 | 6 | 8, readonly (readonly [number, number])[]>> = {
  4: [[1, 0], [0, 1], [-1, 0], [0, -1]],
  6: [[1, 0], [0.5, S60], [-0.5, S60], [-1, 0], [-0.5, -S60], [0.5, -S60]],
  8: [[1, 0], [S45, S45], [0, 1], [-S45, S45], [-1, 0], [-S45, -S45], [0, -1], [S45, -S45]]
};

/** §5.1, §5.2: the pieces a break of a rock of radius r makes (0: dust); a tidal break counts as the fan. */
export function pieceCount(r: number, pattern: BreakPattern): 0 | 2 | 3 | 4 | 6 | 8 {
  if (pattern !== 'burst') return r >= FAN_TRIPLE_MIN_R ? 3 : r >= FAN_SPLIT_MIN_R ? 2 : 0;
  return r >= BURST_8_MIN_R ? 8 : r >= BURST_6_MIN_R ? 6 : r >= BURST_4_MIN_R ? 4 : 0;
}
/** §5.1: a piece's radius, 0.9 r / √n. */
export function pieceRadius(r: number, n: number): number { return (0.9 * r) / Math.sqrt(n); }
/** §5.1, §5.2: the birth offset from the parent's centre, as a share of the parent's r. */
export function pieceOffset(pattern: BreakPattern, n: number): number { return pattern === 'burst' ? BURST_OFFSET[n as 4 | 6 | 8] : FAN_OFFSET; }
/** §5.1: f_j, the fractional part of j · GOLDEN_FRAC. */
export function kickFraction(j: number): number { const p = j * GOLDEN_FRAC; return p - Math.floor(p); }
/** §5.2, §13.3, §13.6: piece j's kick (u/s) at the parent's orbital radius ρ. */
export function pieceKick(rho: number, j: number, pattern: BreakPattern): number {
  const ve = escapeSpeed(rho), f = kickFraction(j);
  return pattern === 'burst' ? ve * (BURST_KICK_MIN + BURST_KICK_SPAN * f) : pattern === 'tidal' ? ve * (TIDAL_KICK_MIN + TIDAL_KICK_SPAN * f) : ve * (FAN_KICK_MIN + FAN_KICK_SPAN * f);
}

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
/** Asteroids-iii §3.4, §5.3: add (dvx, dvy) to rock k's velocity: a Rail is freed first; the push restarts its clock and
 *  touches it. Born or gone: nothing. */
export function pushRock(s: TacticalState, k: number, dvx: number, dvy: number): void {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return;
  freeRock(s, k); markTouched(s, k); restartClock(s, k);
  const b = k * ROCK_STRIDE;
  s.rocks[b + 3]! += dvx; s.rocks[b + 4]! += dvy;
}
/** Take dmg off rock k's hp (born or gone: nothing, false); true when it is now at or below 0 (the caller breaks it). */
export function wearRock(s: TacticalState, k: number, dmg: number): boolean {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return false;
  markTouched(s, k);
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

/** §5.5: a slot for a new piece of radius rp: the lowest empty one, else evict (rockEvictions + 1, a dust event without a
 *  ship) the smallest live rock of any kind smaller than rp that is not born and not in `exclude` (ties: the lowest slot),
 *  else −1. */
function allocate(s: TacticalState, rp: number, exclude: readonly number[], by: RockCause): number {
  const v = s.rocks, n = rockSlots(s);
  for (let j = 0; j < n; j++) if (v[j * ROCK_STRIDE] === RockKind.Gone) return j;
  let best = -1;
  for (let j = 0; j < n; j++) {
    const b = j * ROCK_STRIDE;
    if (v[b] === RockKind.Gone || s.rockBorn[j] === 1 || exclude.includes(j) || v[b + 5]! >= rp) continue;
    if (best < 0 || v[b + 5]! < v[best * ROCK_STRIDE + 5]!) best = j;
  }
  if (best < 0) return -1;
  s.rockEvictions++;
  dustRock(s, best, by, -1, true);   // eviction: not a break (the views and the feel proxy skip `evicted` dust)
  return best;
}

/**
 * §5: rock k breaks, its hit direction (ux, uy) (need not be unit; zero: north), its cause and ship (−1 none) and the
 * pattern. rocksBroken + 1 for `ship`, once. Too small for pieces (or pieces under ROCK_MIN_R): dust. Otherwise piece j
 * starts at centre + dir · pieceOffset · r with the parent's velocity plus dir · pieceKick, radius 0.9 r / √n, hp
 * ceil(rp / 10), Free, born, linked into the grid, with fresh contact grace; then one split event naming the slots
 * written (`burst: true` for the burst pattern).
 */
export function breakRock(s: TacticalState, k: number, ux: number, uy: number, by: RockCause, ship: number, pattern: BreakPattern, exclude: readonly number[] = []): void {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return;
  const a = rockAt(s, k), n = pieceCount(a.r, pattern), rp = n > 0 ? pieceRadius(a.r, n) : 0;
  if (ship >= 0) s.systems[ship]!.rocksBroken++;
  if (n === 0 || rp < ROCK_MIN_R) { dustRock(s, k, by, ship); return; }
  const d = Math.sqrt(ux * ux + uy * uy), hx = d > 0 ? ux / d : 0, hy = d > 0 ? uy / d : -1;
  const dirs = pattern === 'burst' ? BURST_DIRS[n as 4 | 6 | 8] : FAN_DIRS[n as 2 | 3], off = pieceOffset(pattern, n) * a.r, rho = Math.sqrt(a.x * a.x + a.y * a.y), pieces: number[] = [];
  vacate(s, k);
  dirs.forEach(([c, sn], j) => {
    const dx = hx * c - hy * sn, dy = hx * sn + hy * c, kick = pieceKick(rho, j, pattern);
    const px = a.x + dx * off, py = a.y + dy * off, vx = a.vx + dx * kick, vy = a.vy + dy * kick;
    const slot = j === 0 ? k : allocate(s, rp, exclude, by);
    if (slot < 0) {   // no slot: this piece is dust, never silent (§5.5: rockSlotDust)
      s.events.push({ kind: 'rock', what: 'dust', by, rock: -1, x: px, y: py, r: rp, vx, vy, ...shipField(ship) });
      s.rockDust++; s.rockSlotDust++;
      return;
    }
    writeRock(s, slot, RockKind.Free, px, py, vx, vy, rp, rockHp(rp));
    s.rockBorn[slot] = 1;
    regridRock(s, slot);   // §6.1: a new piece is linked into the grid at birth
    for (const body of s.ships) body.graceUntil[slot + 1] = 0;   // a new rock: no contact grace on any ship
    pieces.push(slot);
  });
  s.rockSplits++;
  s.events.push({ kind: 'rock', what: 'split', by, rock: k, x: a.x, y: a.y, r: a.r, vx: a.vx, vy: a.vy, pieces, ...shipField(ship), ...(pattern === 'burst' ? { burst: true as const } : {}) });
}

/** §3.3, §5.1: the damage a body of mass `own` takes from a contact closing at vc against a body of mass `other`:
 *  (vc − ROCK_CRUSH_SPEED) / ROCK_CRUSH_STEP · 2·other / (own + other) above the crush speed, else 0. */
export function crushDamage(vc: number, own: number, other: number): number {
  return vc > ROCK_CRUSH_SPEED ? (((vc - ROCK_CRUSH_SPEED) / ROCK_CRUSH_STEP) * 2 * other) / (own + other) : 0;
}

// Asteroids-iv §5 (docs/superpowers/specs/2026-11-20-asteroids-iv-cell-rocks-design.md), on spike ii's and asteroids-iii's
// rockBreak: how a rock takes a hit, a push, turns to dust and breaks. A break divides the rock's cells and never invents a
// shape. Every break but a torpedo's direct hit is one straight cut through a world point along a direction (§5.2): the
// cells left and right of the line, each side's connected groups. A torpedo's direct hit is a shatter (§5.3): a crater at
// the struck cell and six sectors round it. A group of two or more cells whose bounding radius is at least ROCK_MIN_R is a
// piece: it keeps its cells where they stood, at the parent's velocity plus a kick (§5.4). Any other group is dust (an
// event with rock −1). A rock with no piece (a plain rock, or only crumbs) turns to dust whole. The largest piece keeps
// the broken rock's slot, the others take the lowest empty slots, else evict the smallest rock (any live kind) smaller
// than the piece that is not born this tick and not in `exclude` (ties: the lowest slot), else the piece is dust
// (rockSlotDust + 1). Pieces are Free with t = the phase tick (siblings share t) and are linked into the rock grid at
// birth. Every slot cleared or rewritten clears the rock targets that named it. A slot born this tick takes no damage,
// push or break. A push frees a rail first, restarts the rock's clock and touches it.
import { escapeSpeed } from './rails';
import { components, cutSides, popcount, shapeOf, shatterGroups, templateFor, type CutOut } from './rockCells';
import { BURST_KICK_MIN, BURST_KICK_SPAN, CUT_KICK, GOLDEN_FRAC, ROCK_CRUSH_SPEED, ROCK_CRUSH_STEP, ROCK_MIN_R, TIDAL_CUT_KICK } from './rockTuning';
import { CELL_STRIDE, freeRock, markTouched, regridRock, restartClock, rockAlive, rockAt, rockHp, RockKind, rockMaskOf, rockSlots, rockTmpl, ROCK_STRIDE, setRockCells, writeRock } from './rocks';
import type { RockCause, TacticalState } from './state';

export type BreakPattern = 'cut' | 'shatter' | 'tidal';
/** §5.4: f_j, the fractional part of j · GOLDEN_FRAC (a shatter's piece j flies at v_esc · (BURST_KICK_MIN + BURST_KICK_SPAN · f_j)). */
export function kickFraction(j: number): number { const p = j * GOLDEN_FRAC; return p - Math.floor(p); }

/** Clear slot k and every active ship's rock target that names it (§6.1: laser and torpedo to −1, a flying torpedo's to −2). */
export function vacate(s: TacticalState, k: number): void {
  s.rocks.fill(0, k * ROCK_STRIDE, (k + 1) * ROCK_STRIDE);
  s.rockCells[k * CELL_STRIDE] = 0; s.rockCells[k * CELL_STRIDE + 1] = 0;
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
/** A weapon's hit at world point (px, py) along (ux, uy): wear, a hit event (rockHits + 1), and at hp ≤ 0 a cut. */
export function hitRock(s: TacticalState, k: number, dmg: number, px: number, py: number, ux: number, uy: number, by: RockCause, ship = -1): void {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return;
  const broke = wearRock(s, k, dmg), a = rockAt(s, k);
  s.events.push({ kind: 'rock', what: 'hit', by, rock: k, x: a.x, y: a.y, r: a.r, vx: a.vx, vy: a.vy, ...shipField(ship) });
  s.rockHits++;
  if (broke) breakRock(s, k, px, py, ux, uy, by, ship, 'cut');
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

interface Group { mask: number; n: number; kx: number; ky: number }
const groupScratch: number[] = [], cutOut: CutOut = { left: 0, right: 0, ux: 0, uy: 0 };
/**
 * §5: rock k breaks at world point (px, py) along (ux, uy) (need not be unit; zero: north), with its cause, its ship (−1
 * none) and the pattern. rocksBroken + 1 for `ship`, once. The point is taken into the rock's frame (§10a 1: no
 * orientation in iv-a, so only the shift by its centre of mass). 'cut' and 'tidal': cutSides, each side's groups; the left
 * side (cross(u, cell − P) ≥ 0) takes +n · S · (right cells) / (all cells) and the right −n · S · (left cells) / (all), n =
 * (−uy, ux) of the direction used and S = v_esc(ρ) · CUT_KICK (tidal: TIDAL_CUT_KICK). 'shatter': shatterGroups; piece j
 * (largest first) flies from the point toward its centre of mass at v_esc(ρ) · (BURST_KICK_MIN + BURST_KICK_SPAN · f_j).
 * Then one split event naming the slots written (`burst: true` for a shatter), and a dust event (rock −1) per dust group (a shatter's crater is one).
 */
export function breakRock(s: TacticalState, k: number, px: number, py: number, ux: number, uy: number, by: RockCause, ship: number, pattern: BreakPattern, exclude: readonly number[] = []): void {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return;
  const a = rockAt(s, k), tm = rockTmpl(s, k);
  if (ship >= 0) s.systems[ship]!.rocksBroken++;
  if (tm < 0) { dustRock(s, k, by, ship); return; }   // a plain rock is one cell
  const t = templateFor(s.map, tm), mask = rockMaskOf(s, k), parent = shapeOf(t, mask);
  const len = Math.sqrt(ux * ux + uy * uy), hx = len > 0 ? ux / len : 0, hy = len > 0 ? uy / len : -1;
  const lx = px - a.x + parent.gx, ly = py - a.y + parent.gy, ve = escapeSpeed(Math.sqrt(a.x * a.x + a.y * a.y));
  const pieces: Group[] = [], dust: Group[] = [];
  const classify = (g: number, kx: number, ky: number): void => { const n = popcount(g); (n >= 2 && shapeOf(t, g).r >= ROCK_MIN_R ? pieces : dust).push({ mask: g, n, kx, ky }); };
  if (pattern === 'shatter') {
    const count = shatterGroups(t, mask, lx, ly, hx, hy, groupScratch);
    let grouped = 0;
    for (let i = 0; i < count; i++) { grouped |= groupScratch[i]!; classify(groupScratch[i]!, 0, 0); }
    const crater = mask & ~grouped;   // the struck cell and what the sectors dropped: one more dust group
    if (crater !== 0) dust.push({ mask: crater, n: popcount(crater), kx: 0, ky: 0 });
  } else {
    cutSides(t, mask, lx, ly, hx, hy, cutOut);
    const nl = popcount(cutOut.left), nr = popcount(cutOut.right), sp = ve * (pattern === 'tidal' ? TIDAL_CUT_KICK : CUT_KICK), nx = -cutOut.uy, ny = cutOut.ux;
    const kl = (sp * nr) / (nl + nr), kr = (sp * nl) / (nl + nr), right = cutOut.right;
    let count = components(t, cutOut.left, groupScratch);
    for (let i = 0; i < count; i++) classify(groupScratch[i]!, nx * kl, ny * kl);
    count = components(t, right, groupScratch);
    for (let i = 0; i < count; i++) classify(groupScratch[i]!, -nx * kr, -ny * kr);
  }
  if (pieces.length === 0) { dustRock(s, k, by, ship); return; }
  pieces.sort((p, q) => q.n - p.n || (p.mask & -p.mask) - (q.mask & -q.mask));
  if (pattern === 'shatter') pieces.forEach((p, j) => {
    const sh = shapeOf(t, p.mask), dx = sh.gx - lx, dy = sh.gy - ly, dd = Math.sqrt(dx * dx + dy * dy), kick = ve * (BURST_KICK_MIN + BURST_KICK_SPAN * kickFraction(j));
    p.kx = (dd > 0 ? dx / dd : hx) * kick; p.ky = (dd > 0 ? dy / dd : hy) * kick;
  });
  const written: number[] = [];
  vacate(s, k);
  pieces.forEach((p, j) => {
    const sh = shapeOf(t, p.mask), x = a.x + sh.gx - parent.gx, y = a.y + sh.gy - parent.gy, vx = a.vx + p.kx, vy = a.vy + p.ky;
    const slot = j === 0 ? k : allocate(s, sh.r, exclude, by);
    if (slot < 0) {   // no slot: this piece is dust, never silent (rockSlotDust)
      s.events.push({ kind: 'rock', what: 'dust', by, rock: -1, x, y, r: sh.r, vx, vy, ...shipField(ship) });
      s.rockDust++; s.rockSlotDust++;
      return;
    }
    writeRock(s, slot, RockKind.Free, x, y, vx, vy, sh.r, rockHp(sh.r));
    setRockCells(s, slot, tm, p.mask);
    s.rockBorn[slot] = 1;
    regridRock(s, slot);
    for (const body of s.ships) body.graceUntil[slot + 1] = 0;   // a new rock: no contact grace on any ship
    written.push(slot);
  });
  for (const g of dust) {
    const sh = shapeOf(t, g.mask);
    s.events.push({ kind: 'rock', what: 'dust', by, rock: -1, x: a.x + sh.gx - parent.gx, y: a.y + sh.gy - parent.gy, r: sh.r, vx: a.vx + g.kx, vy: a.vy + g.ky, ...shipField(ship) });
    s.rockDust++;
  }
  s.rockSplits++;
  s.events.push({ kind: 'rock', what: 'split', by, rock: k, x: a.x, y: a.y, r: a.r, vx: a.vx, vy: a.vy, pieces: written, ...shipField(ship), ...(pattern === 'shatter' ? { burst: true as const } : {}) });
}

/** §3.3, §5.1: the damage a body of mass `own` takes from a contact closing at vc against a body of mass `other`:
 *  (vc − ROCK_CRUSH_SPEED) / ROCK_CRUSH_STEP · 2·other / (own + other) above the crush speed, else 0. */
export function crushDamage(vc: number, own: number, other: number): number {
  return vc > ROCK_CRUSH_SPEED ? (((vc - ROCK_CRUSH_SPEED) / ROCK_CRUSH_STEP) * 2 * other) / (own + other) : 0;
}

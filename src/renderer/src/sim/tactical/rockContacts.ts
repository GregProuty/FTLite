// Spike ii §3.2, §3.3 (docs/superpowers/specs/2026-11-18-asteroids-ii-design.md), asteroids-iii §3.4, §5.4: the free rocks'
// turn in stepDuel, after the missiles fly and before the ship contacts.
// Part 1, motion: every Free rock not born this tick, ascending (spike ii's gravity, drag, cap and semi-implicit Euler
// until asteroids-iii Task 6). Then rocksMoved: free rocks now stand at tick + 1.
// Part 2, contacts, a live outer loop: slot a from 0 upward, reading kinds as they stand now, takes a turn when it is
// Free and not born. Its turn: the planet and edge test (dust, turn over); else rocksNear(a) once, ascending, and each
// b ≠ a still alive, not born and not done is resolved if it touches (a Rail b at its accessor position); a break of a
// ends its turn. Then a is marked done (rockDone). A Rail never takes a turn, so a free-rail pair is always checked by
// the free rock, and rail-rail pairs never are.
import { gravityAccel } from './physics';
import { breakRock, crushDamage, dustRock, wearRock } from './rockBreak';
import { freeRock, markTouched, rockAlive, rockMass, RockKind, rocksMoved, rocksNear, rockSlots, ROCK_STRIDE, rockX, rockY } from './rocks';
import { ROCK_CRUSH_SPEED, ROCK_DRAG, ROCK_GRAVITY, ROCK_MAX_SPEED, ROCK_RESTITUTION } from './rockTuning';
import type { TacticalState } from './state';
import { DT, R_MAP } from './tuning';

function touching(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx, dy = ay - by, rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

/**
 * Spike ii §3.3, asteroids-iii §5.4: rock a and rock b touch. A Rail is freed first (at its rail position and velocity),
 * so every pair is two bodies; both are touched. Normal n from b to a (zero distance: north), closing speed
 * vc = (vb − va) · n. Separate by the overlap, shared by inverse mass. Bounce when vc > 0: j = (1 + e) vc / (1/ma + 1/mb).
 * Above ROCK_CRUSH_SPEED: rockCollisions + 1, a bump event, both amounts applied (a then b), then breaks (a along n, b
 * along −n, each with its post-bounce velocity), neither able to evict a or b.
 */
export function resolveRockPair(s: TacticalState, a: number, b: number): void {
  freeRock(s, a); freeRock(s, b);
  markTouched(s, a); markTouched(s, b);
  const v = s.rocks, A = a * ROCK_STRIDE, B = b * ROCK_STRIDE;
  const dx = v[A + 1]! - v[B + 1]!, dy = v[A + 2]! - v[B + 2]!, d = Math.sqrt(dx * dx + dy * dy);
  const nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : -1;
  const vc = (v[B + 3]! - v[A + 3]!) * nx + (v[B + 4]! - v[A + 4]!) * ny;
  const ra = v[A + 5]!, rb = v[B + 5]!, ma = rockMass(ra), mb = rockMass(rb), ia = 1 / ma, ib = 1 / mb, overlap = ra + rb - d;
  if (overlap > 0) {
    const sa = (overlap * ia) / (ia + ib), sb = (overlap * ib) / (ia + ib);
    v[A + 1]! += nx * sa; v[A + 2]! += ny * sa; v[B + 1]! -= nx * sb; v[B + 2]! -= ny * sb;
  }
  if (vc > 0) {
    const j = ((1 + ROCK_RESTITUTION) * vc) / (ia + ib);
    v[A + 3]! += nx * j * ia; v[A + 4]! += ny * j * ia; v[B + 3]! -= nx * j * ib; v[B + 4]! -= ny * j * ib;
  }
  if (vc <= ROCK_CRUSH_SPEED) return;
  const da = crushDamage(vc, ma, mb), db = crushDamage(vc, mb, ma);
  const aBreaks = wearRock(s, a, da), bBreaks = wearRock(s, b, db);
  s.rockCollisions++;
  s.events.push({ kind: 'rock', what: 'bump', by: 'collision', rock: a, other: b, x: v[A + 1]! - nx * ra, y: v[A + 2]! - ny * ra, r: ra, vx: v[A + 3]!, vy: v[A + 4]! });
  if (aBreaks) breakRock(s, a, nx, ny, 'collision', -1, 'fan', [a, b]);
  if (bBreaks) breakRock(s, b, -nx, -ny, 'collision', -1, 'fan', [a, b]);
}

export function stepRocks(s: TacticalState): void {
  const v = s.rocks, n = rockSlots(s), keep = 1 - ROCK_DRAG * DT;
  for (let k = 0; k < n; k++) {   // part 1: motion
    const b = k * ROCK_STRIDE;
    if (v[b] !== RockKind.Free || s.rockBorn[k] === 1) continue;
    const [gx, gy] = gravityAccel(v[b + 1]!, v[b + 2]!);
    let vx = (v[b + 3]! + gx * ROCK_GRAVITY * DT) * keep, vy = (v[b + 4]! + gy * ROCK_GRAVITY * DT) * keep;
    const sp = Math.sqrt(vx * vx + vy * vy);
    if (sp > ROCK_MAX_SPEED) { const f = ROCK_MAX_SPEED / sp; vx *= f; vy *= f; }
    v[b + 3] = vx; v[b + 4] = vy;
    v[b + 1]! += vx * DT; v[b + 2]! += vy * DT;
  }
  rocksMoved(s);
  const p = s.map.planet;
  for (let a = 0; a < n; a++) {   // part 2: contacts, reading kinds as they stand now
    const A = a * ROCK_STRIDE;
    if (v[A] !== RockKind.Free || s.rockBorn[a] === 1) continue;
    const x = v[A + 1]!, y = v[A + 2]!, r = v[A + 5]!, planet = touching(x, y, r, p.x, p.y, p.r);
    if (planet || x * x + y * y > R_MAP * R_MAP) { dustRock(s, a, planet ? 'planet' : 'edge'); s.rockDone[a] = 1; continue; }
    for (const o of rocksNear(s, x, y, r)) {
      if (o === a || !rockAlive(s, o) || s.rockBorn[o] === 1 || s.rockDone[o] === 1) continue;
      if (!touching(v[A + 1]!, v[A + 2]!, v[A + 5]!, rockX(s, o), rockY(s, o), v[o * ROCK_STRIDE + 5]!)) continue;
      resolveRockPair(s, a, o);
      if (v[A] !== RockKind.Free || s.rockBorn[a] === 1) break;   // a broke: its turn ends
    }
    s.rockDone[a] = 1;
  }
}

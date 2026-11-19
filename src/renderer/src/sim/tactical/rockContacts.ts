// Spike ii §3.2, §3.3 (docs/superpowers/specs/2026-11-18-asteroids-ii-design.md), asteroids-iii §3.4, §5.4: the free rocks'
// turn in stepDuel, after the missiles fly and before the ship contacts.
// Part 1, motion: every Free rock not born this tick, ascending, by moveFreeSlot (§13.3: the symmetric age-ramped drag toward V_c, the lane pull, the soft edge, the cap, counted in rockCapHits). Then rocksMoved: free rocks now stand at tick + 1. A rock touching the planet, or past R_MAP + rockEdgeSlack(), turns to dust at the start of its contact turn.
// Part 2, contacts, a live outer loop: slot a from 0 upward, reading kinds as they stand now, takes a turn when it is
// Free and not born. Its turn: the planet and edge test (dust, turn over); else rocksNear(a) once, ascending, and each
// b ≠ a still alive, not born and not done is resolved if it touches (a Rail b at its accessor position); a break of a
// ends its turn. Then a is marked done (rockDone). A Rail never takes a turn, so a free-rail pair is always checked by
// the free rock, and rail-rail pairs never are.
// Pairs (asteroids-iii §5.4, §13.4): only Free rocks take turns; candidates are every live, unborn rock near the turn's rock, ascending; one that had its turn this tick (rockDone) is skipped. A rail never has rockDone, so a free-rail pair is always checked; a rail freed mid-pass takes its own turn later if its slot is higher.
import { gravityAccel } from './physics';
import { circularVelocity, lanePull, targetVelocity } from './rails';
import { breakRock, crushDamage, dustRock, wearRock } from './rockBreak';
import { freeRock, markTouched, regridRock, rockAlive, rockMass, RockKind, rockPhase, rocksMoved, restartClock, rocksNear, rockSlots, ROCK_STRIDE, rockX, rockY } from './rocks';
import { BOUNCE_MIN, E_LOW, E_RAMP, E_SPAN, EDGE_SETTLE_K, FAN_SPLIT_MIN_R, K_EDGE_ROCK, ROCK_CRUSH_SPEED, ROCK_EDGE_SLACK, ROCK_EDGE_SLACK_SOFT, ROCK_GRAVITY, ROCK_MAX_SPEED, ROCHE_MIN_AGE, ROCHE_R, ROCK_SEPARATE_MAX, ROCK_SWITCHES, SETTLE_A0, SETTLE_A1, SETTLE_K_MAX, SEPARATE_SHARE, SEPARATE_SLOP, TOUCH_MIN } from './rockTuning';
import type { TacticalState } from './state';
import { DT, K_EDGE, R_MAP } from './tuning';
import { TICK_HZ } from '../tuning';

function touching(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx, dy = ay - by, rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

/** §13.4: the rock-rock restitution above BOUNCE_MIN: E_LOW + E_SPAN · clamp((vc − BOUNCE_MIN) / E_RAMP, 0, 1); 0.8 from
 *  30 u/s, falling toward 0.3 near 4 u/s, so a debris cloud calms in 2 to 3 bounces. */
export function restitution(vc: number): number { return E_LOW + E_SPAN * Math.min(1, Math.max(0, (vc - BOUNCE_MIN) / E_RAMP)); }

/**
 * Asteroids-iii §5.4, §13.4 (on spike ii §3.3): rock a and rock b touch. Each clock is read first (plan deviation 9), then
 * a rail is freed (at its rail position and velocity) so every pair is two bodies, and both are touched. Normal n from b
 * to a (zero distance: north), closing speed vc = (vb − va) · n. The overlap is corrected by SEPARATE_SHARE · max(0,
 * overlap − SEPARATE_SLOP) this tick, shared by inverse mass, each rock moving at most ROCK_SEPARATE_MAX. Above TOUCH_MIN
 * between rocks of different clocks: rockTouches + 1 and a touch event (siblings share t, so they never count). Above
 * BOUNCE_MIN: j = (1 + e(vc)) vc / (1/ma + 1/mb) and both clocks restart (a push); at or below it (and closing): an e = 0
 * impulse j = vc / (1/ma + 1/mb), momentum kept. Above ROCK_CRUSH_SPEED: rockCollisions + 1, a bump event, both amounts
 * applied (a then b), then breaks (a along n, b along −n, each with its post-bounce velocity), neither able to evict a or b.
 */
export function resolveRockPair(s: TacticalState, a: number, b: number): void {
  const v = s.rocks, A = a * ROCK_STRIDE, B = b * ROCK_STRIDE, ta = v[A + 7]!, tb = v[B + 7]!;
  freeRock(s, a); freeRock(s, b);
  markTouched(s, a); markTouched(s, b);
  const dx = v[A + 1]! - v[B + 1]!, dy = v[A + 2]! - v[B + 2]!, d = Math.sqrt(dx * dx + dy * dy);
  const nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : -1;
  const vc = (v[B + 3]! - v[A + 3]!) * nx + (v[B + 4]! - v[A + 4]!) * ny;
  const ra = v[A + 5]!, rb = v[B + 5]!, ma = rockMass(ra), mb = rockMass(rb), ia = 1 / ma, ib = 1 / mb;
  const fix = SEPARATE_SHARE * Math.max(0, ra + rb - d - SEPARATE_SLOP);
  if (fix > 0) {
    const sa = Math.min(ROCK_SEPARATE_MAX, (fix * ia) / (ia + ib)), sb = Math.min(ROCK_SEPARATE_MAX, (fix * ib) / (ia + ib));
    v[A + 1]! += nx * sa; v[A + 2]! += ny * sa; v[B + 1]! -= nx * sb; v[B + 2]! -= ny * sb;
    regridRock(s, a); regridRock(s, b);
  }
  if (vc > TOUCH_MIN && ta !== tb) {
    s.rockTouches++;
    s.events.push({ kind: 'rock', what: 'touch', by: 'collision', rock: a, other: b, x: v[A + 1]! - nx * ra, y: v[A + 2]! - ny * ra, r: ra, vx: v[A + 3]!, vy: v[A + 4]!, speed: vc });
  }
  if (vc > 0) {
    const bounce = vc > BOUNCE_MIN, j = ((bounce ? 1 + restitution(vc) : 1) * vc) / (ia + ib);
    v[A + 3]! += nx * j * ia; v[A + 4]! += ny * j * ia; v[B + 3]! -= nx * j * ib; v[B + 4]! -= ny * j * ib;
    if (bounce) { restartClock(s, a); restartClock(s, b); }
  }
  if (vc <= ROCK_CRUSH_SPEED) return;
  const da = crushDamage(vc, ma, mb), db = crushDamage(vc, mb, ma);
  const aBreaks = wearRock(s, a, da), bBreaks = wearRock(s, b, db);
  s.rockCollisions++;
  s.events.push({ kind: 'rock', what: 'bump', by: 'collision', rock: a, other: b, x: v[A + 1]! - nx * ra, y: v[A + 2]! - ny * ra, r: ra, vx: v[A + 3]!, vy: v[A + 4]! });
  if (aBreaks) breakRock(s, a, nx, ny, 'collision', -1, 'fan', [a, b]);
  if (bBreaks) breakRock(s, b, -nx, -ny, 'collision', -1, 'fan', [a, b]);
}

/** §13.3: the settling drag's rate for a rock `ageTicks` old (since its last birth, freeing or push): 0 before SETTLE_A0
 *  seconds, rising linearly to SETTLE_K_MAX at SETTLE_A1, flat after. A young piece flies a true gravity path. */
export function settleRate(ageTicks: number): number {
  const f = (ageTicks / TICK_HZ - SETTLE_A0) / (SETTLE_A1 - SETTLE_A0);
  return SETTLE_K_MAX * Math.min(1, Math.max(0, f));
}
/** §13.3: the rocks' edge spring past R_MAP: K_EDGE_ROCK with the soft edge, the ships' K_EDGE without; zero inside. */
export function rockEdgeAccel(x: number, y: number, soft = ROCK_SWITCHES.softEdge): [number, number] {
  const d = Math.sqrt(x * x + y * y);
  if (d <= R_MAP) return [0, 0];
  const k = (-(soft ? K_EDGE_ROCK : K_EDGE) * (d - R_MAP)) / d;
  return [k * x, k * y];
}
/** §13.3: the far-edge safety slack past R_MAP (a free rock past R_MAP + this turns to dust, 'edge'). */
export function rockEdgeSlack(soft = ROCK_SWITCHES.softEdge): number { return soft ? ROCK_EDGE_SLACK_SOFT : ROCK_EDGE_SLACK; }
/**
 * §13.3: one tick of a free rock's motion, the slot at base b of v, its age T1 - t: (1) drift p += v*DT/2; (2) half drag
 * v += (V* - v)*k*DT/2, V* = V_c (and, with the soft edge past R_MAP, + (V_c - v)*EDGE_SETTLE_K*DT/2); (3) kick v += (g*ROCK_GRAVITY +
 * e_rock + lanePull(p, k))*DT; (4) the same half drag again; (5) the ROCK_MAX_SPEED cap; (6) drift p += v*DT/2. V*, V_c, g, e_rock and the pull are
 * taken once, at the half-drift point. Returns whether the cap fired (rockCapHits; the stress gate is 0).
 */
export function moveFreeSlot(v: Float64Array, b: number, T1: number, soft = ROCK_SWITCHES.softEdge): boolean {
  const h = DT / 2, k = settleRate(T1 - v[b + 7]!), x = v[b + 1]! + v[b + 3]! * h, y = v[b + 2]! + v[b + 4]! * h;
  const [gx, gy] = gravityAccel(x, y), [ex, ey] = rockEdgeAccel(x, y, soft), [tx, ty] = targetVelocity(x, y), [lx, ly] = lanePull(x, y, k);
  const out = soft && x * x + y * y > R_MAP * R_MAP, [cx, cy] = out ? circularVelocity(x, y) : [0, 0], ke = out ? EDGE_SETTLE_K : 0;
  let vx = v[b + 3]!, vy = v[b + 4]!;
  vx += (tx - vx) * k * h; vy += (ty - vy) * k * h; vx += (cx - vx) * ke * h; vy += (cy - vy) * ke * h;
  vx += (gx * ROCK_GRAVITY + ex + lx) * DT; vy += (gy * ROCK_GRAVITY + ey + ly) * DT;
  vx += (tx - vx) * k * h; vy += (ty - vy) * k * h; vx += (cx - vx) * ke * h; vy += (cy - vy) * ke * h;
  const sp = Math.sqrt(vx * vx + vy * vy), capped = sp > ROCK_MAX_SPEED;
  if (capped) { const f = ROCK_MAX_SPEED / sp; vx *= f; vy *= f; }
  v[b + 1] = x + vx * h; v[b + 2] = y + vy * h; v[b + 3] = vx; v[b + 4] = vy;
  return capped;
}

const contactNear: number[] = [];   // stepRocks part 2 rocksNear scratch (resolveRockPair and breakRock never call rocksNear)
export function stepRocks(s: TacticalState): void {
  const v = s.rocks, n = rockSlots(s), T1 = rockPhase(s);
  for (let k = 0; k < n; k++) {   // part 1: motion
    const b = k * ROCK_STRIDE;
    if (v[b] !== RockKind.Free || s.rockBorn[k] === 1) continue;
    const rx = v[b + 1]!, ry = v[b + 2]!;
    if (ROCK_SWITCHES.rocheBreak && rx * rx + ry * ry < ROCHE_R * ROCHE_R && v[b + 5]! >= FAN_SPLIT_MIN_R && T1 - v[b + 7]! >= ROCHE_MIN_AGE) {
      breakRock(s, k, v[b + 3]!, v[b + 4]!, 'tidal', -1, 'tidal');   // §13.3: a tidal fan along its velocity; its pieces are born, so they hold this tick
      continue;
    }
    if (moveFreeSlot(v, b, T1)) s.rockCapHits++;
    regridRock(s, k);
  }
  rocksMoved(s);
  const p = s.map.planet, far = R_MAP + rockEdgeSlack();
  for (let a = 0; a < n; a++) {   // part 2: contacts, reading kinds as they stand now
    const A = a * ROCK_STRIDE;
    if (v[A] !== RockKind.Free || s.rockBorn[a] === 1) continue;
    const x = v[A + 1]!, y = v[A + 2]!, r = v[A + 5]!, planet = touching(x, y, r, p.x, p.y, p.r);
    if (planet || x * x + y * y > far * far) { dustRock(s, a, planet ? 'planet' : 'edge'); s.rockDone[a] = 1; continue; }
    const cn = rocksNear(s, x, y, r, contactNear);
    for (let ci = 0; ci < cn; ci++) {
      const o = contactNear[ci]!;
      if (o === a || !rockAlive(s, o) || s.rockBorn[o] === 1 || s.rockDone[o] === 1) continue;
      if (!touching(v[A + 1]!, v[A + 2]!, v[A + 5]!, rockX(s, o), rockY(s, o), v[o * ROCK_STRIDE + 5]!)) continue;
      resolveRockPair(s, a, o);
      if (v[A] !== RockKind.Free || s.rockBorn[a] === 1) break;   // a broke: its turn ends
    }
    s.rockDone[a] = 1;
  }
}

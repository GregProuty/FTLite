// Asteroids-iii §3.4, §13.2 (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md): rejoining a rail, decided in one
// pass at the end of the tick, after the ship contacts, lasers, gun, pew and missiles (stepDuel runs settleRocks last,
// before the outcome). A Free rock may rejoin when its clock has run REJOIN_MIN_TICKS ((T + 1) − t), it was not touched or
// born this tick, |v − V*| < REJOIN_SPEED, ρ + r ≤ R_MAP − REJOIN_EDGE_CLEAR and ρ − r ≥ PLANET_RADIUS + REJOIN_PLANET_CLEAR,
// and it overlaps no live rock. Its ρω, in order: (1) in a lane zone, the lane's ρ when |ρ − ρ_lane| ≤ LANE_CAPTURE_DR (lane
// capture; farther off in a zone it stays Free while the lane pull works on it); (2) otherwise the first
// (lowest-slot) rejoined Rail whose annulus its padded annulus [ρ − r − ASTEROID_GAP, ρ + r + ASTEROID_GAP] overlaps,
// when the snap REJOIN_SNAP_FACTOR · ω · |ρ − ρω_j| is under REJOIN_SNAP_MAX (a rigid group; at or over it the rock stays
// Free); (3) otherwise its own ρ. Plan deviation 3: it also stays Free when a live rail of another ω sweeps across its
// padded annulus, so rail-rail pairs stay impossible. It becomes a Rail with centre p · (ρω / ρ) and offset p − centre,
// t = T + 1, and a `rejoin` event (by 'settle', `how`) tells the views and the measure script.
// §14 D14: a rock that passes every other check and is refused only by one cluster C's sweep joins C (how 'cluster'); two
// clusters sweeping it refuse it. D is its distance from C's centre at T + 1 (read from C's lowest live Tumble, or its
// lowest live rail with the clusterTumble switch off). Its position is unchanged either way.
//   - The tumble join (join 'tumble'), D ≤ RAIL_OFFSET_MAX: C's kind, centre C's centre, offset p − centre, when
//     |v − V_group(p)| < CLUSTER_JOIN_SNAP (V_group = ω·perp(centre) + ω_s·perp(offset), ω_s = ω + SPIN_RATE for a Tumble,
//     ω for a Rail), its member sweep |centre| ± (D + r) crosses no rail outside C, and its member circle stays inside the
//     distance of every C ring rock.
//   - The ring join (join 'ring'), D > ρo_max + r_max + r + ASTEROID_GAP over C's tumbling members: a plain Rail on C's
//     rotation, ρω = |C's centre|, centre p · ρω / ρ, its stored offset at most RAIL_OFFSET_MAX, when
//     |v − ω(ρω)·perp(p)| < CLUSTER_JOIN_SNAP and its annulus crosses no rail outside C; it keeps the distance D from C's
//     centre, so it never meets a member.
//   - Between the two (neither joins), it stays Free, refused as 'sweepCluster'.
import { laneZone, orbitRate, railPos, SPIN_RATE, type RailOut } from './rails';
import { CLUSTER_JOIN_SNAP, LANE_CAPTURE_DR, RAIL_OFFSET_MAX, REJOIN_EDGE_CLEAR, REJOIN_RECHECK_TICKS, REJOIN_MIN_TICKS, REJOIN_PLANET_CLEAR, REJOIN_SNAP_FACTOR, REJOIN_SNAP_MAX, REJOIN_SPEED } from './rockTuning';
import { railCentreRadius, railRowChanged, rockPhase, RockKind, rockSlots, ROCK_STRIDE, rockX, rockY } from './rocks';
import type { TacticalState } from './state';
import { ASTEROID_GAP, GM, GRAVITY_EPS, LANES, PLANET_RADIUS, R_MAP } from './tuning';

/** How a Free rock rejoins: its ρω and how; a cluster join (§14 D14) also says which (the tumble group, or the ring: the
 *  cluster's rotation as a plain Rail), and a tumble join carries the cluster's kind and its centre at T + 1. */
export interface RejoinChoice { rhoW: number; how: 'lane' | 'group' | 'own' | 'cluster'; join?: 'tumble' | 'ring'; kind?: number; cx?: number; cy?: number }
/** Why a Free rock stays Free (the first rule that refused it): its kind or masks, the clock, the speed, the ρ bounds, a
 *  live rock overlapping, a lane zone but too far off its lane, a group snap of 2 u/s or more, or (plan deviation 3) a
 *  cluster rock's, a lane rock's or another rejoined rail's sweep across its annulus. */
export type RejoinRefusal = 'state' | 'clock' | 'speed' | 'bounds' | 'overlap' | 'laneFar' | 'snap' | 'sweepCluster' | 'sweepLane' | 'sweepRail';
/** Two ω-radii this close are the same rail rate (a lane rock's |centre| is its lane's ρ to an ulp). */
const SAME_RHO = 1e-6;
const EPS2 = GRAVITY_EPS * GRAVITY_EPS;
function laneRail(rc: number): boolean { for (let i = 0; i < LANES.length; i++) if (Math.abs(rc - LANES[i]!.rho) < SAME_RHO) return true; return false; }
function clusterRail(s: TacticalState, rc: number): boolean { const c = s.map.clusterRho; for (let i = 0; i < c.length; i++) if (Math.abs(rc - c[i]!) < SAME_RHO) return true; return false; }

// The rail classes, taken once per settle pass (and once per call outside one): for each slot its class bits (0 when it
// is not a live rail), its centre radius |centre| and the orbital radii it sweeps, [swLo, swHi]: a Rail's |p| is constant
// (it turns rigidly), a Tumble's spins within |centre| ± |offset|. Within a pass only a rejoining slot changes, and
// settleRocks re-classifies it, so every read sees the values the per-call computation gave, bit for bit.
const C_RAIL = 1, C_TUMBLE = 2, C_LANE = 4, C_CLUSTER = 8;
let cls = new Uint8Array(0), rcOf = new Float64Array(0), swLo = new Float64Array(0), swHi = new Float64Array(0);
/** The state whose settle pass is running, or null; passReady once that pass has classified (lazily, at its first
 *  candidate to need the classes). */
let passOf: TacticalState | null = null, passReady = false;
function classifyRail(s: TacticalState, j: number): void {
  const v = s.rocks, b = j * ROCK_STRIDE, kind = v[b]!;
  if (kind !== RockKind.Rail && kind !== RockKind.Tumble) { cls[j] = 0; return; }
  const r = v[b + 5]!, rc = railCentreRadius(s, j);
  rcOf[j] = rc;
  if (kind === RockKind.Tumble) { const ro = Math.sqrt(v[b + 3]! * v[b + 3]! + v[b + 4]! * v[b + 4]!); swLo[j] = rc - ro - r; swHi[j] = rc + ro + r; }
  else { const px = v[b + 1]! + v[b + 3]!, py = v[b + 2]! + v[b + 4]!, p = Math.sqrt(px * px + py * py); swLo[j] = p - r; swHi[j] = p + r; }
  cls[j] = (kind === RockKind.Tumble ? C_TUMBLE : C_RAIL) | (laneRail(rc) ? C_LANE : 0) | (clusterRail(s, rc) ? C_CLUSTER : 0);
}
function classifyRails(s: TacticalState): void {
  const n = rockSlots(s);
  if (cls.length < n) { cls = new Uint8Array(n); rcOf = new Float64Array(n); swLo = new Float64Array(n); swHi = new Float64Array(n); }
  for (let j = 0; j < n; j++) classifyRail(s, j);
}
function refuse(why: { reason: RejoinRefusal | null } | undefined, reason: RejoinRefusal): null { if (why) why.reason = reason; return null; }

/** Whether Free rock k rejoins now, and how (every §3.4 and §13.2 rule, plan deviation 3); null when it stays Free, with
 *  `why.reason` set to the first rule that refused it. */
export function rejoinChoice(s: TacticalState, k: number, why?: { reason: RejoinRefusal | null }): RejoinChoice | null {
  const v = s.rocks, b = k * ROCK_STRIDE, n = rockSlots(s);
  if (v[b] !== RockKind.Free || s.rockBorn[k] === 1 || s.rockTouched[k] === 1) return refuse(why, 'state');
  if (rockPhase(s) - v[b + 7]! < REJOIN_MIN_TICKS) return refuse(why, 'clock');
  // targetVelocity (= circularVelocity) inlined: the same operations in the same order, no tuple
  const x = v[b + 1]!, y = v[b + 2]!, r = v[b + 5]!, q = x * x + y * y + EPS2, wt = Math.sqrt(GM / (q * Math.sqrt(q))), dvx = v[b + 3]! - -wt * y, dvy = v[b + 4]! - wt * x;
  if (dvx * dvx + dvy * dvy >= REJOIN_SPEED * REJOIN_SPEED) return refuse(why, 'speed');
  const rho = Math.sqrt(x * x + y * y);
  if (rho + r > R_MAP - REJOIN_EDGE_CLEAR || rho - r < PLANET_RADIUS + REJOIN_PLANET_CLEAR) return refuse(why, 'bounds');
  for (let j = 0; j < n; j++) {
    if (j === k || v[j * ROCK_STRIDE] === RockKind.Gone) continue;
    const dx = rockX(s, j) - x, dy = rockY(s, j) - y, rr = r + v[j * ROCK_STRIDE + 5]!;
    if (dx * dx + dy * dy < rr * rr) return refuse(why, 'overlap');
  }
  if (passOf !== s || !passReady) { classifyRails(s); passReady = passOf === s; }
  const lo = rho - r - ASTEROID_GAP, hi = rho + r + ASTEROID_GAP, zone = laneZone(rho);
  let rhoW = rho, how: RejoinChoice['how'] = 'own';
  if (zone >= 0) {   // §13.2: a lane capture only close to the lane radius
    if (Math.abs(rho - LANES[zone]!.rho) > LANE_CAPTURE_DR) return refuse(why, 'laneFar');
    rhoW = LANES[zone]!.rho; how = 'lane';
  }
  else for (let j = 0; j < n; j++) {
    const c = cls[j]!;
    if (j === k || (c & C_RAIL) === 0 || (c & (C_LANE | C_CLUSTER)) !== 0) continue;
    if (!(lo < swHi[j]! && hi > swLo[j]!)) continue;
    const rc = rcOf[j]!;
    if (REJOIN_SNAP_FACTOR * orbitRate(rho) * Math.abs(rho - rc) >= REJOIN_SNAP_MAX) return refuse(why, 'snap');
    rhoW = rc; how = 'group';
    break;
  }
  let first: RejoinRefusal | null = null, group = -1;   // the first sweep's reason; the one cluster (its ρω) sweeping, if only clusters do
  for (let j = 0; j < n; j++) {   // plan deviation 3
    const c = cls[j]!;
    if (j === k || c === 0) continue;
    const rj = rcOf[j]!;
    if ((c & C_RAIL) !== 0 && Math.abs(rj - rhoW) < SAME_RHO) continue;   // same ω: rigid together
    if (!(lo < swHi[j]! && hi > swLo[j]!)) continue;
    const inCluster = (c & (C_TUMBLE | C_CLUSTER)) !== 0;
    first ??= inCluster ? 'sweepCluster' : (c & C_LANE) !== 0 ? 'sweepLane' : 'sweepRail';
    if (!inCluster) return refuse(why, first);
    if (group < 0) group = rj;
    else if (Math.abs(rj - group) >= SAME_RHO) return refuse(why, first);   // two clusters sweep it
  }
  if (first === null) return { rhoW, how };
  return clusterJoin(s, k, group) ?? refuse(why, first);
}

const centreOut: RailOut = { x: 0, y: 0, vx: 0, vy: 0 };
/** Whether any live rail outside the cluster of ρω `group` sweeps across [lo, hi] (the classes are current). */
function crossesOutside(s: TacticalState, k: number, group: number, lo: number, hi: number): boolean {
  for (let j = 0, n = rockSlots(s); j < n; j++) {
    if (j === k || cls[j] === 0 || Math.abs(rcOf[j]! - group) < SAME_RHO) continue;
    if (lo < swHi[j]! && hi > swLo[j]!) return true;
  }
  return false;
}
/** §14 D14: Free rock k joining the cluster C of ρω `group` (it passed every other check and only C's sweep refused it), or
 *  null (it stays Free). C's centre at the phase tick is read from its lowest live Tumble (its lowest live rail when none
 *  tumbles); D = |p − centre|.
 *  - Near (D ≤ RAIL_OFFSET_MAX): it joins the tumble group, C's kind with centre the centre and offset p − centre, when
 *    |v − V_group(p)| < CLUSTER_JOIN_SNAP (V_group = ω·perp(centre) + ω_s·perp(offset), ω_s = ω + SPIN_RATE for a Tumble),
 *    its member sweep crosses no rail outside C, and its member circle stays clear of C's ring rocks.
 *  - Far (the controller's extension: D > ρo_max + r_max + r + ASTEROID_GAP over C's tumbling members): it joins C's
 *    rotation as a plain Rail at ρω = ρc = |C's stored centre| (centre p · ρc / ρ, offset radial, at most RAIL_OFFSET_MAX)
 *    when |v − ω(ρc)·perp(p)| < CLUSTER_JOIN_SNAP and its annulus crosses no rail outside C: a fixed distance D from the
 *    centre, so it never meets a tumbling member.
 *  - Between the two: null. */
function clusterJoin(s: TacticalState, k: number, group: number): RejoinChoice | null {
  const v = s.rocks, n = rockSlots(s), b = k * ROCK_STRIDE;
  let g = -1, firstRail = -1, roMax = 0, rMax = 0;
  for (let j = 0; j < n; j++) {
    const J = j * ROCK_STRIDE;
    if (j === k || cls[j] === 0 || Math.abs(rcOf[j]! - group) >= SAME_RHO) continue;
    if (firstRail < 0) firstRail = j;
    if (v[J] === RockKind.Tumble) {
      if (g < 0) g = j;
      const ro = Math.sqrt(v[J + 3]! * v[J + 3]! + v[J + 4]! * v[J + 4]!); if (ro > roMax) roMax = ro; if (v[J + 5]! > rMax) rMax = v[J + 5]!;
    }
  }
  const tumbling = g >= 0;
  if (!tumbling) {   // the clusterTumble switch off: every member a Rail; the extents over all of them
    g = firstRail;
    for (let j = 0; j < n; j++) { const J = j * ROCK_STRIDE; if (j !== k && cls[j] !== 0 && Math.abs(rcOf[j]! - group) < SAME_RHO) { const ro = Math.sqrt(v[J + 3]! * v[J + 3]! + v[J + 4]! * v[J + 4]!); if (ro > roMax) roMax = ro; if (v[J + 5]! > rMax) rMax = v[J + 5]!; } }
  }
  if (g < 0) return null;
  const G = g * ROCK_STRIDE, kind = v[G]!, gx = v[G + 1]!, gy = v[G + 2]!, rho_c = Math.sqrt(gx * gx + gy * gy), w = orbitRate(rho_c);
  railPos(gx, gy, 0, 0, v[G + 7]!, rockPhase(s), false, centreOut);   // the centre alone: the same turn a member's centre takes
  const cx = centreOut.x, cy = centreOut.y, x = v[b + 1]!, y = v[b + 2]!, r = v[b + 5]!, ox = x - cx, oy = y - cy, D = Math.sqrt(ox * ox + oy * oy);
  if (D <= RAIL_OFFSET_MAX) {   // near: the tumble group
    const ws = tumbling ? w + SPIN_RATE : w, dvx = v[b + 3]! - (-w * cy - ws * oy), dvy = v[b + 4]! - (w * cx + ws * ox);
    let ok = dvx * dvx + dvy * dvy < CLUSTER_JOIN_SNAP * CLUSTER_JOIN_SNAP;
    if (ok && tumbling) {
      const rc = Math.sqrt(cx * cx + cy * cy);
      ok = !crossesOutside(s, k, group, rc - D - r - ASTEROID_GAP, rc + D + r + ASTEROID_GAP);
      for (let j = 0; j < n && ok; j++) {   // C's ring rocks (its Rails) sit at a fixed distance from the centre: keep the member circle inside theirs
        const J = j * ROCK_STRIDE;
        if (j === k || (cls[j]! & C_RAIL) === 0 || Math.abs(rcOf[j]! - group) >= SAME_RHO) continue;
        const ex = rockX(s, j) - cx, ey = rockY(s, j) - cy;
        if (D + r + ASTEROID_GAP >= Math.sqrt(ex * ex + ey * ey) - v[J + 5]!) ok = false;
      }
    }
    if (ok) return { rhoW: Math.sqrt(cx * cx + cy * cy), how: 'cluster', join: 'tumble', kind, cx, cy };
  }
  if (D > roMax + rMax + r + ASTEROID_GAP) {   // far: the cluster's rotation as a plain Rail
    const rho = Math.sqrt(x * x + y * y), f = rho_c / rho, rx = x - x * f, ry = y - y * f;   // the offset as settleRocks stores it
    if (Math.sqrt(rx * rx + ry * ry) > RAIL_OFFSET_MAX) return null;                         // so restore never refuses it
    const dvx = v[b + 3]! - -w * y, dvy = v[b + 4]! - w * x;
    if (dvx * dvx + dvy * dvy >= CLUSTER_JOIN_SNAP * CLUSTER_JOIN_SNAP) return null;
    if (crossesOutside(s, k, group, rho - r - ASTEROID_GAP, rho + r + ASTEROID_GAP)) return null;
    return { rhoW: rho_c, how: 'cluster', join: 'ring' };
  }
  return null;
}

/** §3.4, §13.2: the end-of-tick rejoin pass, ascending (a rock that rejoins counts as a live rail for the later ones).
 *  §14 (the cost fix): a Free rock whose clock has run REJOIN_MIN_TICKS + REJOIN_RECHECK_TICKS or more is checked only on
 *  ticks where (T1 − startTick + k) % REJOIN_RECHECK_TICKS is 0 (from the round tick and the slot alone, no other state:
 *  round-relative, so a round started at T behaves as a fresh duel started at 0); a younger one every tick. */
export function settleRocks(s: TacticalState): void {
  const v = s.rocks, T1 = rockPhase(s);
  passOf = s; passReady = false;
  try { for (let k = 0, n = rockSlots(s); k < n; k++) {
    const b0 = k * ROCK_STRIDE;
    if (v[b0] !== RockKind.Free) continue;
    if (T1 - v[b0 + 7]! >= REJOIN_MIN_TICKS + REJOIN_RECHECK_TICKS && (T1 - s.startTick + k) % REJOIN_RECHECK_TICKS !== 0) continue;
    const c = rejoinChoice(s, k);
    if (!c) continue;
    const b = k * ROCK_STRIDE, x = v[b + 1]!, y = v[b + 2]!, f = c.rhoW / Math.sqrt(x * x + y * y);
    const tumble = c.join === 'tumble', cx = tumble ? c.cx! : x * f, cy = tumble ? c.cy! : y * f;
    v[b] = tumble ? c.kind! : RockKind.Rail; v[b + 1] = cx; v[b + 2] = cy; v[b + 3] = x - cx; v[b + 4] = y - cy; v[b + 7] = T1;
    railRowChanged(s, k);
    classifyRail(s, k);   // it is a live rail for the later ones
    s.events.push({ kind: 'rock', what: 'rejoin', by: 'settle', rock: k, x, y, r: v[b + 5]!, vx: 0, vy: 0, how: c.how, ...(c.join ? { join: c.join } : {}) });
  } } finally { passOf = null; passReady = false; }
}

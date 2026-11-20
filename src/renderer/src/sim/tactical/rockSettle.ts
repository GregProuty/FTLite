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
// §14 D14: a rock that passes every other check and is refused only by one cluster's sweep joins that cluster's group
// when |v − V_group(p)| < CLUSTER_JOIN_SNAP: the cluster's kind (a Tumble, or a Rail with the clusterTumble switch off),
// centre the cluster's centre at T + 1 (read from its lowest live slot), offset p − centre (at most RAIL_OFFSET_MAX), so its
// position is unchanged; refused when two clusters sweep it, or when its own sweep as a member would cross another rail's.
import { laneZone, orbitRate, railPos, SPIN_RATE, targetVelocity, type RailOut } from './rails';
import { CLUSTER_JOIN_SNAP, LANE_CAPTURE_DR, RAIL_OFFSET_MAX, REJOIN_EDGE_CLEAR, REJOIN_MIN_TICKS, REJOIN_PLANET_CLEAR, REJOIN_SNAP_FACTOR, REJOIN_SNAP_MAX, REJOIN_SPEED } from './rockTuning';
import { isRail, railCentreRadius, rockPhase, RockKind, rockSlots, ROCK_STRIDE, rockX, rockY } from './rocks';
import type { TacticalState } from './state';
import { ASTEROID_GAP, LANES, PLANET_RADIUS, R_MAP } from './tuning';

/** How a Free rock rejoins: its ρω and how; a cluster join (§14 D14) also carries the cluster's kind and its centre at T + 1. */
export interface RejoinChoice { rhoW: number; how: 'lane' | 'group' | 'own' | 'cluster'; kind?: number; cx?: number; cy?: number }
/** Why a Free rock stays Free (the first rule that refused it): its kind or masks, the clock, the speed, the ρ bounds, a
 *  live rock overlapping, a lane zone but too far off its lane, a group snap of 2 u/s or more, or (plan deviation 3) a
 *  cluster rock's, a lane rock's or another rejoined rail's sweep across its annulus. */
export type RejoinRefusal = 'state' | 'clock' | 'speed' | 'bounds' | 'overlap' | 'laneFar' | 'snap' | 'sweepCluster' | 'sweepLane' | 'sweepRail';
/** Two ω-radii this close are the same rail rate (a lane rock's |centre| is its lane's ρ to an ulp). */
const SAME_RHO = 1e-6;
const laneRail = (rc: number): boolean => LANES.some((l) => Math.abs(rc - l.rho) < SAME_RHO);
const clusterRail = (s: TacticalState, rc: number): boolean => s.map.clusterRho.some((c) => Math.abs(rc - c) < SAME_RHO);
/** The orbital radii live rail j sweeps: a Rail's |p| is constant (it turns rigidly), a Tumble's spins within |centre| ± |offset|. */
function sweep(s: TacticalState, j: number): [number, number] {
  const v = s.rocks, b = j * ROCK_STRIDE, r = v[b + 5]!, rc = railCentreRadius(s, j);
  if (v[b] === RockKind.Tumble) { const ro = Math.sqrt(v[b + 3]! * v[b + 3]! + v[b + 4]! * v[b + 4]!); return [rc - ro - r, rc + ro + r]; }
  const px = v[b + 1]! + v[b + 3]!, py = v[b + 2]! + v[b + 4]!, p = Math.sqrt(px * px + py * py);
  return [p - r, p + r];
}

/** Whether Free rock k rejoins now, and how (every §3.4 and §13.2 rule, plan deviation 3); null when it stays Free, with
 *  `why.reason` set to the first rule that refused it. */
export function rejoinChoice(s: TacticalState, k: number, why?: { reason: RejoinRefusal | null }): RejoinChoice | null {
  const v = s.rocks, b = k * ROCK_STRIDE, n = rockSlots(s), no = (reason: RejoinRefusal): null => { if (why) why.reason = reason; return null; };
  if (v[b] !== RockKind.Free || s.rockBorn[k] === 1 || s.rockTouched[k] === 1) return no('state');
  if (rockPhase(s) - v[b + 7]! < REJOIN_MIN_TICKS) return no('clock');
  const x = v[b + 1]!, y = v[b + 2]!, r = v[b + 5]!, [tx, ty] = targetVelocity(x, y), dvx = v[b + 3]! - tx, dvy = v[b + 4]! - ty;
  if (dvx * dvx + dvy * dvy >= REJOIN_SPEED * REJOIN_SPEED) return no('speed');
  const rho = Math.sqrt(x * x + y * y);
  if (rho + r > R_MAP - REJOIN_EDGE_CLEAR || rho - r < PLANET_RADIUS + REJOIN_PLANET_CLEAR) return no('bounds');
  for (let j = 0; j < n; j++) {
    if (j === k || v[j * ROCK_STRIDE] === RockKind.Gone) continue;
    const dx = rockX(s, j) - x, dy = rockY(s, j) - y, rr = r + v[j * ROCK_STRIDE + 5]!;
    if (dx * dx + dy * dy < rr * rr) return no('overlap');
  }
  const lo = rho - r - ASTEROID_GAP, hi = rho + r + ASTEROID_GAP, zone = laneZone(rho);
  let choice: RejoinChoice = { rhoW: rho, how: 'own' };
  if (zone >= 0) {   // §13.2: a lane capture only close to the lane radius
    if (Math.abs(rho - LANES[zone]!.rho) > LANE_CAPTURE_DR) return no('laneFar');
    choice = { rhoW: LANES[zone]!.rho, how: 'lane' };
  }
  else for (let j = 0; j < n; j++) {
    if (j === k || v[j * ROCK_STRIDE] !== RockKind.Rail) continue;
    const rc = railCentreRadius(s, j);
    if (laneRail(rc) || clusterRail(s, rc)) continue;
    const [a, z] = sweep(s, j);
    if (!(lo < z && hi > a)) continue;
    if (REJOIN_SNAP_FACTOR * orbitRate(rho) * Math.abs(rho - rc) >= REJOIN_SNAP_MAX) return no('snap');
    choice = { rhoW: rc, how: 'group' };
    break;
  }
  let first: RejoinRefusal | null = null, group = -1;   // the first sweep's reason; the one cluster (its ρω) sweeping, if only clusters do
  for (let j = 0; j < n; j++) {   // plan deviation 3
    if (j === k || !isRail(v[j * ROCK_STRIDE]!)) continue;
    if (Math.abs(railCentreRadius(s, j) - choice.rhoW) < SAME_RHO && v[j * ROCK_STRIDE] === RockKind.Rail) continue;   // same ω: rigid together
    const [a, z] = sweep(s, j), rj = railCentreRadius(s, j);
    if (!(lo < z && hi > a)) continue;
    const inCluster = v[j * ROCK_STRIDE] === RockKind.Tumble || clusterRail(s, rj);
    first ??= inCluster ? 'sweepCluster' : laneRail(rj) ? 'sweepLane' : 'sweepRail';
    if (!inCluster) return no(first);
    if (group < 0) group = rj;
    else if (Math.abs(rj - group) >= SAME_RHO) return no(first);   // two clusters sweep it
  }
  if (first === null) return choice;
  return clusterJoin(s, k, group) ?? no(first);
}

const centreOut: RailOut = { x: 0, y: 0, vx: 0, vy: 0 };
/** §14 D14: Free rock k joining the cluster of ρω `group` (it passed every other check), or null: the cluster's centre at the
 *  phase tick from its lowest live slot, V_group(p) = ω·perp(centre) + ω_s·perp(p − centre) (ω_s = ω + SPIN_RATE for a
 *  Tumble, ω for a Rail), |v − V_group| < CLUSTER_JOIN_SNAP, |offset| ≤ RAIL_OFFSET_MAX, and the member's sweep crossing no
 *  rail outside the cluster. */
function clusterJoin(s: TacticalState, k: number, group: number): RejoinChoice | null {
  const v = s.rocks, n = rockSlots(s), b = k * ROCK_STRIDE;
  let g = -1;
  for (let j = 0; j < n && g < 0; j++) if (j !== k && isRail(v[j * ROCK_STRIDE]!) && Math.abs(railCentreRadius(s, j) - group) < SAME_RHO) g = j;
  if (g < 0) return null;
  const G = g * ROCK_STRIDE, kind = v[G]!, tumble = kind === RockKind.Tumble, gx = v[G + 1]!, gy = v[G + 2]!;
  railPos(gx, gy, 0, 0, v[G + 7]!, rockPhase(s), false, centreOut);   // the centre alone: the same turn a member's centre takes
  const cx = centreOut.x, cy = centreOut.y, x = v[b + 1]!, y = v[b + 2]!, r = v[b + 5]!, ox = x - cx, oy = y - cy, ro2 = ox * ox + oy * oy;
  if (ro2 > RAIL_OFFSET_MAX * RAIL_OFFSET_MAX) return null;
  const w = orbitRate(Math.sqrt(gx * gx + gy * gy)), ws = tumble ? w + SPIN_RATE : w;
  const dvx = v[b + 3]! - (-w * cy - ws * oy), dvy = v[b + 4]! - (w * cx + ws * ox);
  if (dvx * dvx + dvy * dvy >= CLUSTER_JOIN_SNAP * CLUSTER_JOIN_SNAP) return null;
  const rc = Math.sqrt(cx * cx + cy * cy);
  if (tumble) {   // as a member its sweep is |centre| ± (|offset| + r): it must cross no rail outside the cluster
    const ro = Math.sqrt(ro2), lo = rc - ro - r - ASTEROID_GAP, hi = rc + ro + r + ASTEROID_GAP;
    for (let j = 0; j < n; j++) {
      if (j === k || !isRail(v[j * ROCK_STRIDE]!) || Math.abs(railCentreRadius(s, j) - group) < SAME_RHO) continue;
      const [a, z] = sweep(s, j);
      if (lo < z && hi > a) return null;
    }
  }
  return { rhoW: rc, how: 'cluster', kind, cx, cy };
}

/** §3.4, §13.2: the end-of-tick rejoin pass, ascending (a rock that rejoins counts as a live rail for the later ones). */
export function settleRocks(s: TacticalState): void {
  const v = s.rocks, T1 = rockPhase(s);
  for (let k = 0, n = rockSlots(s); k < n; k++) {
    const c = rejoinChoice(s, k);
    if (!c) continue;
    const b = k * ROCK_STRIDE, x = v[b + 1]!, y = v[b + 2]!, f = c.rhoW / Math.sqrt(x * x + y * y);
    const cx = c.how === 'cluster' ? c.cx! : x * f, cy = c.how === 'cluster' ? c.cy! : y * f;
    v[b] = c.how === 'cluster' ? c.kind! : RockKind.Rail; v[b + 1] = cx; v[b + 2] = cy; v[b + 3] = x - cx; v[b + 4] = y - cy; v[b + 7] = T1;
    s.events.push({ kind: 'rock', what: 'rejoin', by: 'settle', rock: k, x, y, r: v[b + 5]!, vx: 0, vy: 0, how: c.how });
  }
}

// Asteroids-iii (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md §2, §3.2, §13.1, §13.2): the orbit maths of the
// rock rails, with + − × ÷ and Math.sqrt only (the determinism guard). Softened gravity as physics.ts: q(ρ) = ρ² + ε².
//   orbitRate(ρ)        ω = sqrt(GM / (q·sqrt(q)));      circularVelocity  V_c(p) = ω(|p|)·(−y, x), prograde;
//   escapeSpeed(ρ)      sqrt(2·GM / sqrt(q));            seriesStep(θ)     (cos θ, sin θ) by the §2 series (θ < 0.05);
//   railStep(ρω)        seriesStep(ω(ρω)·DT);            turnPower(c,s,n)  (c + i s)^n by repeated squaring;
//   laneZone, targetVelocity, lanePull: §13.2's lane zones, the drag and rejoin target V* (V_c everywhere) and the lane pull;
//   railPos: a rail slot (centre and offset at tick t) at tick T: the centre and the offset each turned by P = step^n
//   (a Tumble's offset also by S = spinStep^n) and rescaled to its own length, then added (§13.1).
import { CLUSTER_SPIN_PERIOD, LANE_PULL, SETTLE_K_MAX } from './rockTuning';
import { DT, GM, GRAVITY_EPS, LANES, LANE_ZONE_EDGES } from './tuning';

const EPS2 = GRAVITY_EPS * GRAVITY_EPS;
/** §13.1: a Tumble's extra spin, rad/s (2π a literal). */
export const SPIN_RATE = (2 * 3.141592653589793) / CLUSTER_SPIN_PERIOD;

/** A position and velocity, written in place (no allocation). */
export interface RailOut { x: number; y: number; vx: number; vy: number }

export function orbitRate(rho: number): number {
  const q = rho * rho + EPS2;
  return Math.sqrt(GM / (q * Math.sqrt(q)));
}
export function circularVelocity(x: number, y: number): [number, number] {
  const q = x * x + y * y + EPS2, w = Math.sqrt(GM / (q * Math.sqrt(q)));
  return [-w * y, w * x];
}
export function escapeSpeed(rho: number): number {
  return Math.sqrt((2 * GM) / Math.sqrt(rho * rho + EPS2));
}
export function seriesStep(th: number): [number, number] {
  const t2 = th * th, t4 = t2 * t2, t6 = t4 * t2, t8 = t4 * t4;
  return [1 - t2 / 2 + t4 / 24 - t6 / 720 + t8 / 40320, th * (1 - t2 / 6 + t4 / 120 - t6 / 5040 + t8 / 362880)];
}
export function railStep(rhoW: number): [number, number] { return seriesStep(orbitRate(rhoW) * DT); }
/** (c + i s)^n for a whole n ≥ 0 (a 3-hour game, about 648,000 ticks, takes at most about 39 products). */
export function turnPower(c: number, s: number, n: number): [number, number] {
  let rc = 1, rs = 0, bc = c, bs = s, k = n;
  while (k > 0) {
    if (k % 2 === 1) { const a = rc * bc - rs * bs; rs = rc * bs + rs * bc; rc = a; }
    k = Math.floor(k / 2);
    if (k > 0) { const a = bc * bc - bs * bs; bs = 2 * bc * bs; bc = a; }
  }
  return [rc, rs];
}
/** §13.2: the lane whose zone holds orbital radius ρ (0 inner, 1 main, 2 outer), or −1 outside [1092, 1308]. */
export function laneZone(rho: number): number {
  const e = LANE_ZONE_EDGES;
  if (rho < e[0]! || rho > e[3]!) return -1;
  return rho < e[1]! ? 0 : rho < e[2]! ? 1 : 2;
}
/** §13.2 (revised, spec 73497bc4): V* at (x, y), the drag and rejoin target: V_c(p) everywhere. */
export function targetVelocity(x: number, y: number): [number, number] { return circularVelocity(x, y); }
/** §13.2: the lane pull at (x, y) for drag rate k: inside a lane zone −LANE_PULL · (ρ − ρ_lane) · p/ρ · (k / SETTLE_K_MAX),
 *  so debris settles onto the lane (radial period about 100 s, damping about 0.5 at full drag); zero outside the zones. */
export function lanePull(x: number, y: number, k: number): [number, number] {
  const rho = Math.sqrt(x * x + y * y), zone = laneZone(rho);
  if (zone < 0 || k <= 0) return [0, 0];
  const f = (-LANE_PULL * (rho - LANES[zone]!.rho) * (k / SETTLE_K_MAX)) / rho;
  return [f * x, f * y];
}
/**
 * §13.1: a rail slot at tick T ≥ t. Its centre (cx, cy) and offset (ox, oy) are those at tick t; ρω = |centre|. Both are
 * turned by P = railStep(ρω)^(T − t), a Tumble's offset also by S = seriesStep(SPIN_RATE·DT)^(T − t); each is rescaled to
 * its own stored length (an offset of 0 is skipped), and p = centre_T + offset_T. Velocity: a Rail ω·perp(p); a Tumble
 * ω·perp(centre_T) + (ω + SPIN_RATE)·perp(offset_T), perp(x, y) = (−y, x). At T = t, p is centre + offset exactly.
 * Throws when T < t: a rail is never read before its anchor tick.
 */
export function railPos(cx: number, cy: number, ox: number, oy: number, t: number, T: number, tumble: boolean, out: RailOut): void {
  const n = T - t, rc = Math.sqrt(cx * cx + cy * cy), w = orbitRate(rc);
  if (n < 0) throw new Error(`railPos: tick ${T} is before the rail's anchor tick ${t}`);
  let Cx = cx, Cy = cy, Ox = ox, Oy = oy;
  if (n > 0) {
    const [c, s] = railStep(rc), [pc, ps] = turnPower(c, s, n);
    const wx = pc * cx - ps * cy, wy = ps * cx + pc * cy, m = Math.sqrt(wx * wx + wy * wy);
    Cx = (rc * wx) / m; Cy = (rc * wy) / m;
    if (ox !== 0 || oy !== 0) {
      let qc = pc, qs = ps;
      if (tumble) { const [sc0, ss0] = seriesStep(SPIN_RATE * DT), [sc, ss] = turnPower(sc0, ss0, n); qc = pc * sc - ps * ss; qs = pc * ss + ps * sc; }
      const ro = Math.sqrt(ox * ox + oy * oy), ux = qc * ox - qs * oy, uy = qs * ox + qc * oy, mo = Math.sqrt(ux * ux + uy * uy);
      Ox = (ro * ux) / mo; Oy = (ro * uy) / mo;
    }
  }
  out.x = Cx + Ox; out.y = Cy + Oy;
  if (tumble) { const ws = w + SPIN_RATE; out.vx = -w * Cy - ws * Oy; out.vy = w * Cx + ws * Ox; }
  else { out.vx = -w * out.y; out.vy = w * out.x; }
}

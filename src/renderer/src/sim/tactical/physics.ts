// Flight physics (spec §3, §4, §6): softened gravity, the edge spring, turn, thrust, stabilise, drag,
// semi-implicit Euler. Float64 with + − × ÷ and sqrt only; no trigonometry (the determinism guard enforces it).
import { hx, hy, wrapHeading } from './direction';
import { Room, type Axes, type Ship, type TacticalState } from './state';
import { DEFAULT_FLIGHT, DT, ENGINE_FACTOR, GM, GRAVITY_EPS, K_EDGE, R_MAP, REVERSE_FRACTION, THRUST, TURN_STEPS_PER_TICK, type FlightTuning } from './tuning';

/** Acceleration toward the planet at the origin: a = −GM · d / (|d|² + ε²)^{3/2}. */
export function gravityAccel(x: number, y: number): [number, number] {
  const q = x * x + y * y + GRAVITY_EPS * GRAVITY_EPS;
  const k = -GM / (q * Math.sqrt(q));
  return [k * x, k * y];
}

/** Inward acceleration past the map edge: a = −K_EDGE · (|d| − R_MAP) · d/|d|; zero inside. */
export function edgeAccel(x: number, y: number): [number, number] {
  const d = Math.sqrt(x * x + y * y);
  if (d <= R_MAP) return [0, 0];
  const k = (-K_EDGE * (d - R_MAP)) / d;
  return [k * x, k * y];
}

export function engineFactor(s: Ship): number { return ENGINE_FACTOR[s.rooms[Room.Engines]]!; }

/** One tick of one ship's flight, without contacts. Shared by the step and by predictPath, so the prediction is exact. */
export function flyShip(s: Ship, axes: Axes, tuning: FlightTuning): void {
  const f = engineFactor(s);
  s.headingAcc += axes.turn * TURN_STEPS_PER_TICK * f;
  while (s.headingAcc >= 1) { s.heading = wrapHeading(s.heading + 1); s.headingAcc -= 1; }
  while (s.headingAcc <= -1) { s.heading = wrapHeading(s.heading - 1); s.headingAcc += 1; }
  const h0 = hx(s.heading), h1 = hy(s.heading);
  // Stabilise (spec §6): on the tick both axes go to zero, capture the sideways speed (along px, py, 90° clockwise of the
  // nose) as the skid to remove; then remove up to STABILISE · dt of it per tick until it is gone. Gravity's later
  // sideways pull is never captured, so a released ship still falls and orbits. Runs before this tick's forces.
  const idle = axes.turn === 0 && axes.thrust === 0, px = -h1, py = h0;
  if (idle && !s.released) { const side = s.vx * px + s.vy * py; s.skidBudget = Math.abs(side); s.skidSign = Math.sign(side); }
  if (!idle) { s.skidBudget = 0; s.skidSign = 0; }
  s.released = idle;
  if (idle && s.skidBudget > 0 && tuning.stabilise > 0) {
    const cut = Math.min(s.skidBudget, tuning.stabilise * DT);
    s.vx -= s.skidSign * cut * px; s.vy -= s.skidSign * cut * py; s.skidBudget -= cut;
  }
  let ax = 0, ay = 0;
  if (tuning.gravity) { const [gx, gy] = gravityAccel(s.x, s.y); ax += gx; ay += gy; }
  if (tuning.edge) { const [ex, ey] = edgeAccel(s.x, s.y); ax += ex; ay += ey; }
  if (axes.thrust > 0) { ax += h0 * THRUST * f; ay += h1 * THRUST * f; }
  else if (axes.thrust < 0) { ax -= h0 * THRUST * REVERSE_FRACTION * f; ay -= h1 * THRUST * REVERSE_FRACTION * f; }
  s.vx += ax * DT; s.vy += ay * DT;
  const keep = 1 - tuning.drag * DT;
  s.vx *= keep; s.vy *= keep;
  s.skidBudget *= keep;   // drag shrinks the remaining skid too, so the assist never pushes past zero
  s.x += s.vx * DT; s.y += s.vy * DT;
}

/** One duel tick of flight: ships fly in fixed order, then the tick advances. Task 4 adds contacts. */
export function stepFlight(state: TacticalState, axes: readonly Axes[], tuning: FlightTuning = DEFAULT_FLIGHT): void {
  state.ships.forEach((s, i) => flyShip(s, axes[i] ?? { turn: 0, thrust: 0 }, tuning));
  state.tick++;
}

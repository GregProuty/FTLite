// Flight physics (spec §3, §4, §6): softened gravity, the edge spring, turn, thrust, stabilise, drag,
// semi-implicit Euler. Float64 with + − × ÷ and sqrt only; no trigonometry (the determinism guard enforces it).
import { CUTTER_CLASS, type ShipClassDef } from './defs';
import { hx, hy, wrapHeading } from './direction';
import { hitStatics, resolveContacts } from './contacts';
import { classOf, Room, type Axes, type Ship, type TacticalState } from './state';
import { DEFAULT_FLIGHT, DT, GM, GRAVITY_EPS, K_EDGE, R_MAP, type FlightTuning } from './tuning';

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

/** The class's thrust and turn factor at an Engines damage level (0..2). */
export function engineFactor(cls: ShipClassDef, engines: number): number { return cls.engineFactor[engines]!; }

/** One tick of one ship's flight, without contacts, at Engines damage level `engines` and with the class's thrust and
 *  turn. Shared by the step and by predictPath, so the prediction is exact. */
export function flyShip(s: Ship, axes: Axes, tuning: FlightTuning, engines = 0, cls: ShipClassDef = CUTTER_CLASS): void {
  // Quantise the held axes (Artemis spec §5.3): the turn by sign, the thrust to quarters, so q is one of −1, −¾ … 1.
  // `|| 0` maps NaN and −0 to 0. Whole axes (the hunter, the flight view, levels 4 and −1) fly exactly as before.
  const turn = Math.sign(axes.turn) || 0, q = (Math.max(-4, Math.min(4, Math.round(axes.thrust * 4))) || 0) / 4;
  const f = engineFactor(cls, engines);
  s.headingAcc += turn * cls.turnStepsPerTick * f;
  while (s.headingAcc >= 1) { s.heading = wrapHeading(s.heading + 1); s.headingAcc -= 1; }
  while (s.headingAcc <= -1) { s.heading = wrapHeading(s.heading - 1); s.headingAcc += 1; }
  const h0 = hx(s.heading), h1 = hy(s.heading);
  // Stabilise (spec §6): on the tick both axes go to zero, capture the sideways speed (along px, py, 90° clockwise of the
  // nose) as the skid to remove; then remove up to STABILISE · dt of it per tick until it is gone. Gravity's later
  // sideways pull is never captured, so a released ship still falls and orbits. Runs before this tick's forces.
  const idle = turn === 0 && q === 0, px = -h1, py = h0;
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
  if (q > 0) { const push = q * cls.thrust; ax += h0 * push * f; ay += h1 * push * f; }   // q = 1: push is cls.thrust exactly
  else if (q < 0) { ax -= h0 * cls.thrust * cls.reverseFraction * f; ay -= h1 * cls.thrust * cls.reverseFraction * f; }   // any reverse is full reverse
  s.vx += ax * DT; s.vy += ay * DT;
  const keep = 1 - tuning.drag * DT;
  s.vx *= keep; s.vy *= keep;
  s.skidBudget *= keep;   // drag shrinks the remaining skid too, so the assist never pushes past zero
  s.x += s.vx * DT; s.y += s.vy * DT;
}

/** Ship slot i's flight for one tick: its body, its Engines level and its class. */
export function flySlot(state: TacticalState, i: number, axes: Axes, tuning: FlightTuning): void {
  flyShip(state.ships[i]!, axes, tuning, state.systems[i]!.rooms[Room.Engines], classOf(state, i));
}

/** One duel tick of flight: the active ships fly in slot order, then contacts resolve, then the tick advances. */
export function stepFlight(state: TacticalState, axes: readonly Axes[], tuning: FlightTuning = DEFAULT_FLIGHT): void {
  state.ships.forEach((s, i) => { if (s.active) flySlot(state, i, axes[i] ?? { turn: 0, thrust: 0 }, tuning); });
  resolveContacts(state);
  state.tick++;
}

/** The dev flight view's single-ship step (H-1 spec §9): ship 0 flies, meets the planet and asteroids, then the tick
 *  advances. Ship 1 is never stepped and never collides, so it stays exactly as created. */
export function stepSoloFlight(state: TacticalState, axes: Axes, tuning: FlightTuning = DEFAULT_FLIGHT): void {
  flySlot(state, 0, axes, tuning);
  hitStatics(state, 0);
  state.tick++;
}

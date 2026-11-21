// Flight physics (spec §3, §4, §6): softened gravity, the edge spring, turn, thrust, stabilise, drag,
// semi-implicit Euler. Float64 with + − × ÷ and sqrt only; no trigonometry (the determinism guard enforces it).
import { CUTTER_CLASS, type ShipClassDef } from './defs';
import { hx, hy, wrapHeading } from './direction';
import { hitStatics, resolveContacts } from './contacts';
import { classOf, CREW_SLOT, Room, type Axes, type Ship, type TacticalState } from './state';
import { DuelSystem, effectiveBars, ENGINE_FACTOR_BY_BARS, roomLevel } from './bars';
import { CREW_FLIGHT, DEFAULT_FLIGHT, DT, GM, GRAVITY_EPS, K_EDGE, MAX_SPEED, R_MAP, RCS_THRUST, SHIP_GRAVITY, SLING_CALM_R, SLING_MIN_SPEED, SLING_OUT_CUT, type FlightTuning } from './tuning';

/** Acceleration toward the planet at the origin: a = −GM · d / (|d|² + ε²)^{3/2}. */
export function gravityAccel(x: number, y: number): [number, number] {
  const q = x * x + y * y + GRAVITY_EPS * GRAVITY_EPS;
  const k = -GM / (q * Math.sqrt(q));
  return [k * x, k * y];
}

/** The planet's pull on a ship (the slingshot, tuning.ts): SHIP_GRAVITY times gravityAccel. */
export function shipGravityAccel(x: number, y: number): [number, number] {
  const [ax, ay] = gravityAccel(x, y);
  return [ax * SHIP_GRAVITY, ay * SHIP_GRAVITY];
}

/** The share of a ship's drag that applies at (x, y): 0 within SLING_CALM_R of the planet, 1 from 2 · SLING_CALM_R. */
export function slingDragShare(x: number, y: number): number {
  const d = Math.sqrt(x * x + y * y);
  return d <= SLING_CALM_R ? 0 : d >= 2 * SLING_CALM_R ? 1 : d / SLING_CALM_R - 1;
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
 *  turn. Shared by the step and by predictPath, so the prediction is exact. Playtest2feedback §2: a ship flying with
 *  drag 0 caps its thrust at max(MAX_SPEED, its speed before the thrust), then adds gravity and the edge uncapped; a ship
 *  flying with drag runs the arithmetic it always has, bit for bit. Helm round 2 §3.1, §3.2: the turn steps the class turn with no boost, and a tuning with stabiliseUnderThrust stabilises under thrust. */
export function flyShip(s: Ship, axes: Axes, tuning: FlightTuning, engines = 0, cls: ShipClassDef = CUTTER_CLASS, factor = engineFactor(cls, engines)): void {
  // The turn is quantised by sign; the thrust (playtest2feedback §3) is rounded to thousandths and clamped to −1..1, so the
  // crew's held throttle flies smoothly. `|| 0` maps NaN and −0 to 0. Whole axes (the hunter's −1, 0, 1, the Valkyrn's
  // levels −1, ¼, ½, ¾, 1, the flight view) give exactly the quarter-quantised q they always did.
  const turn = Math.sign(axes.turn) || 0, q = Math.max(-1, Math.min(1, Math.round(axes.thrust * 1000) / 1000)) || 0;
  const rcsX = Math.sign(axes.rcsX ?? 0) || 0, rcsY = Math.sign(axes.rcsY ?? 0) || 0;   // §4
  const f = factor;   // Engineering spike Decision 7: flySlot and predictFlight pass shipEngineFactor
  s.headingAcc += turn * cls.turnStepsPerTick * f;   // helm round 2 §3.2: no boost (the boost was 1 on every ship but a gas-boosting Hound, and × 1 is exact)
  while (s.headingAcc >= 1) { s.heading = wrapHeading(s.heading + 1); s.headingAcc -= 1; }
  while (s.headingAcc <= -1) { s.heading = wrapHeading(s.heading - 1); s.headingAcc += 1; }
  const h0 = hx(s.heading), h1 = hy(s.heading);
  // Stabilise (spec §6): on the tick the ship goes idle, capture the sideways speed (along px, py, 90° clockwise of the
  // nose) as the skid to remove; then remove up to STABILISE · dt of it per tick until it is gone. Gravity's later
  // sideways pull is never captured, so a released ship still falls and orbits. Runs before this tick's forces. Idle is
  // no turn, no thruster and no thrust; helm round 2 §3.1: with stabiliseUnderThrust the thrust does not count.
  const idle = turn === 0 && rcsX === 0 && rcsY === 0 && (tuning.stabiliseUnderThrust === true || q === 0), px = -h1, py = h0;
  if (idle && !s.released) { const side = s.vx * px + s.vy * py; s.skidBudget = Math.abs(side); s.skidSign = Math.sign(side); }
  if (!idle) { s.skidBudget = 0; s.skidSign = 0; }
  s.released = idle;
  if (idle && s.skidBudget > 0 && tuning.stabilise > 0) {
    const cut = Math.min(s.skidBudget, tuning.stabilise * DT);
    s.vx -= s.skidSign * cut * px; s.vy -= s.skidSign * cut * py; s.skidBudget -= cut;
  }
  // The field: gravity and the edge spring, summed from 0 in today's order.
  let gx = 0, gy = 0;
  if (tuning.gravity) {
    // The slingshot: the ship's stronger pull, cut by SLING_OUT_CUT while it moves away from the planet faster than SLING_MIN_SPEED.
    const fast = s.vx * s.vx + s.vy * s.vy > SLING_MIN_SPEED * SLING_MIN_SPEED;
    const [ax, ay] = shipGravityAccel(s.x, s.y), out = fast && s.x * s.vx + s.y * s.vy > 0 ? 1 - SLING_OUT_CUT : 1;
    gx += ax * out; gy += ay * out;
  }
  if (tuning.edge) { const [ex, ey] = edgeAccel(s.x, s.y); gx += ex; gy += ey; }
  // The pushes: the main engine scaled by the Engines factor, its reverse in proportion (§3: |q| of the full reverse),
  // and the cold gas thrusters (§4: RCS_THRUST per vented axis along the nose or its right, never scaled by the Engines).
  let tx = 0, ty = 0;
  if (q > 0) { const push = q * cls.thrust; tx += h0 * push * f; ty += h1 * push * f; }   // q = 1: push is cls.thrust exactly
  else if (q < 0) { const r = -q; tx -= h0 * cls.thrust * cls.reverseFraction * r * f; ty -= h1 * cls.thrust * cls.reverseFraction * r * f; }   // r = 1: today's full reverse exactly
  if (rcsY !== 0) { tx += h0 * RCS_THRUST * rcsY; ty += h1 * RCS_THRUST * rcsY; }
  if (rcsX !== 0) { tx += px * RCS_THRUST * rcsX; ty += py * RCS_THRUST * rcsX; }
  if (tuning.drag === 0) {
    // §2: thrust first, capped so it never raises the speed past max(MAX_SPEED, the speed before it); a perpendicular push
    // still turns the velocity. Then gravity and the edge, uncapped.
    const s0 = Math.sqrt(s.vx * s.vx + s.vy * s.vy), lim = Math.max(MAX_SPEED, s0);
    let vx = s.vx + tx * DT, vy = s.vy + ty * DT;
    const s1 = Math.sqrt(vx * vx + vy * vy);
    if (s1 > lim && s1 > 0) { const k = lim / s1; vx *= k; vy *= k; }
    s.vx = vx + gx * DT; s.vy = vy + gy * DT;
  } else {
    const ax = gx + tx, ay = gy + ty;   // the field then the push: today's sum, value for value
    s.vx += ax * DT; s.vy += ay * DT;
    const keep = 1 - tuning.drag * (tuning.gravity ? slingDragShare(s.x, s.y) : 1) * DT;   // the slingshot: no drag near the planet (a flight with no field has no planet)
    s.vx *= keep; s.vy *= keep;
    s.skidBudget *= keep;   // drag shrinks the remaining skid too, so the assist never pushes past zero
  }
  s.x += s.vx * DT; s.y += s.vy * DT;
}

/** Playtest2feedback §2, helm round 2 §3.1: ship slot i's flight tuning. The crew slot flies CREW_FLIGHT (the Hound's own
 *  drag and stabilise, stabilising under thrust) when its class is newtonianHelm (the Hound); every other slot and class
 *  keeps DEFAULT_FLIGHT. */
export function flightFor(state: TacticalState, i: number): FlightTuning {
  return i === CREW_SLOT && classOf(state, i).newtonianHelm ? CREW_FLIGHT : DEFAULT_FLIGHT;
}

/** Engineering spike spec §10.2 (Task 8): ship i's thrust and turn factor: the crew slot's from its effective Engines
 *  bars (times its class's undamaged factor, 1 for every class today), any other slot's from its Engines level as before. */
export function shipEngineFactor(state: TacticalState, i: number): number {
  const sys = state.systems[i]!, cls = classOf(state, i);
  return i === CREW_SLOT ? cls.engineFactor[0]! * ENGINE_FACTOR_BY_BARS[effectiveBars(sys, DuelSystem.Engines)]! : engineFactor(cls, roomLevel(sys, Room.Engines));   // hacking spike: a hacked Engines room is off
}

/** Ship slot i's flight for one tick: its body, its engine factor and its class. */
export function flySlot(state: TacticalState, i: number, axes: Axes, tuning: FlightTuning): void {
  flyShip(state.ships[i]!, axes, tuning, state.systems[i]!.rooms[Room.Engines], classOf(state, i), shipEngineFactor(state, i));
}

/** One duel tick of flight: the active ships fly in slot order, then contacts resolve, then the tick advances. `tuning`
 *  overrides every slot's (the §4 test configurations); absent, each slot flies flightFor (playtest2feedback §2). */
export function stepFlight(state: TacticalState, axes: readonly Axes[], tuning?: FlightTuning): void {
  state.ships.forEach((s, i) => { if (s.active) flySlot(state, i, axes[i] ?? { turn: 0, thrust: 0 }, tuning ?? flightFor(state, i)); });
  resolveContacts(state);
  state.tick++;
}

/** The dev flight view's single-ship step (H-1 spec §9): ship 0 flies, meets the planet and asteroids, then the tick
 *  advances. Ship 1 is never stepped and never collides, so it stays exactly as created. */
export function stepSoloFlight(state: TacticalState, axes: Axes, tuning?: FlightTuning): void {
  flySlot(state, 0, axes, tuning ?? flightFor(state, 0));   // playtest2feedback Decision 3: as its drawn prediction
  hitStatics(state, 0);
  state.tick++;
}

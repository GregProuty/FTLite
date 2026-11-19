// The hunter (spec §9): a blunt, deterministic state machine that flies a ship slot whose class has the hunter AI
// profile (the duel's slot 1) against that slot's locked target, through the same ShipInput the crew uses. It reads the
// state as it stands at the start of the tick. Its randomness is the release jitter and (W-1) the pew's defence roll and aim error, all drawn from rng.tactical. One
// hunter brain per encounter (state.hunter) until R-5 gives every ship its own.
import { nextInt } from '../../../../shared/rng';
import { hx, hy } from './direction';
import { inArc, segmentNear, sideOf } from './geometry';
import { pewFull, pewLead, pewReady } from './pew';
import { rockAt, rocksNear } from './rocks';
import { ROCK_MAX_SPEED } from './rockTuning';
import { classOf, HunterMode, missileOf, Room, type TacticalState } from './state';
import {
  AIM_STEPS, AUTO_FACE_SIN, HUNTER_AVOID_MARGIN, HUNTER_BRAKE_SPEED, HUNTER_JITTER_TICKS, HUNTER_LEAD_S, HUNTER_LOOKAHEAD_S, HUNTER_MISSILE_COOLDOWN_TICKS,
  HUNTER_PD_ODDS, HUNTER_PD_RANGE, HUNTER_PEW_ERROR_STEPS, HUNTER_PEW_GAP, HUNTER_STANDOFF, HUNTER_THRUST_COS, HUNTER_TRAIL_TICKS, HUNTER_WALK_TICKS, PEW_ARC_COS, PEW_RANGE, REPAIR_WORK_TICKS
} from './tuning';
import { enemyHostile } from './science';
import { canLaunch, laserEligible, laserFull, type ShipInput } from './weapons';

/** Repair priority (spec §9): highest level first, ties Engines, then Weapons, then Shields. */
const REPAIR_ORDER = [Room.Engines, Room.Weapons, Room.Shields] as const;

/** Turn toward (dx, dy) for pursuit (spec §9): sideOf, except a target dead astern (zero cross product, behind) gets a fixed
 *  clockwise turn instead of none. Dead ahead stays 0. */
export function pursuitTurn(heading: number, dx: number, dy: number): number {
  const side = sideOf(heading, dx, dy);
  return side !== 0 || hx(heading) * dx + hy(heading) * dy >= 0 ? side : 1;
}

/** Feel-i's auto-face (console feel spec §2): the turn (−1, 0 or 1) that brings ship i's nose onto its locked target's lead
 *  point, the Hunter's own aim (the target HUNTER_LEAD_S of its velocity ahead), dead astern clockwise as pursuitTurn,
 *  and none once the point is within AUTO_FACE_SIN of the nose. Reads the state as it stands; pure. */
export function autoFaceTurn(state: TacticalState, i: number): number {
  const p = autoFacePoint(state, i);
  return faceTurn(state.ships[i]!.heading, p.x, p.y);
}

/** Playtest2feedback §4a: auto-face's target as a vector from ship i: its target's position led by HUNTER_LEAD_S (the
 *  boost's far test reads the same point autoFaceTurn turns to). Pure. */
export function autoFacePoint(state: TacticalState, i: number): { x: number; y: number } {
  const me = state.ships[i]!, t = state.ships[state.systems[i]!.target]!;
  return { x: t.x - me.x + t.vx * HUNTER_LEAD_S, y: t.y - me.y + t.vy * HUNTER_LEAD_S };
}

/** Feel-ii's click-to-heading (Feel-ii spec §1.1): auto-face's turn law aimed at the fixed bearing of heading index `h`
 *  instead of the lead point. Pure. */
export function headingTurn(state: TacticalState, i: number, h: number): number {
  return holdTurn(state.ships[i]!.heading, h);
}

/** W-3 (pew pew spec §3): headingTurn's law for any nose: the turn (−1, 0 or 1) from a nose at heading index `heading`
 *  toward the bearing of heading index `h`, none once it is within AUTO_FACE_SIN of the nose. A MANUAL torpedo holds its
 *  heading by it, as the Helm does. Pure. */
export function holdTurn(heading: number, h: number): number {
  return faceTurn(heading, hx(h), hy(h));
}

/** The auto-face turn law: toward (dx, dy) as pursuitTurn, none once it is within AUTO_FACE_SIN of the nose. */
function faceTurn(heading: number, dx: number, dy: number): number {
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d === 0) return 0;
  const h0 = hx(heading), h1 = hy(heading);
  if (h0 * dx + h1 * dy > 0 && Math.abs(h0 * dy - h1 * dx) <= AUTO_FACE_SIN * d) return 0;
  return pursuitTurn(heading, dx, dy);
}

const threatNear: number[] = [];   // threatAhead's rocksNear scratch
/** The first solid body ship i's straight-line path over the lookahead comes within its radius + margin of, or null.
 *  Asteroids-iii 6.3: against a rock the sweep is the ship's velocity relative to the rock's, so a co-orbiting rock is no
 *  threat. Exported for the tests. */
export function threatAhead(state: TacticalState, i: number): { x: number; y: number } | null {
  const s = state.ships[i]!, L = HUNTER_LOOKAHEAD_S, ex = s.x + s.vx * L, ey = s.y + s.vy * L, p = state.map.planet;
  if (segmentNear(s.x, s.y, ex, ey, p.x, p.y, p.r + HUNTER_AVOID_MARGIN)) return p;
  const reach = (Math.sqrt(s.vx * s.vx + s.vy * s.vy) + ROCK_MAX_SPEED) * L + HUNTER_AVOID_MARGIN;
  const n = rocksNear(state, s.x, s.y, reach, threatNear);
  for (let j = 0; j < n; j++) {
    const a = rockAt(state, threatNear[j]!), rx = s.x + (s.vx - a.vx) * L, ry = s.y + (s.vy - a.vy) * L;
    if (segmentNear(s.x, s.y, rx, ry, a.x, a.y, a.r + HUNTER_AVOID_MARGIN)) return a;
  }
  return null;
}

function updateRepair(state: TacticalState, i: number): void {
  const h = state.hunter, me = state.systems[i]!, self = state.ships[i]!, crew = state.ships[me.target]!;
  if (h.mode === HunterMode.Repair) {
    if (--h.timer > 0) return;
    if (!h.working) { h.working = true; h.timer = REPAIR_WORK_TICKS; return; }
    me.rooms[h.room as 0 | 1 | 2] = Math.max(0, me.rooms[h.room]! - 1); me.gunRoomWear[h.room as 0 | 1 | 2] = 0;   // Valkyrn spec §7.2: a repaired Room's wear goes
    h.mode = HunterMode.Hunt;
    return;
  }
  const laser = classOf(state, i).slots.laser, range = laser ? laser.range : 0, dx = crew.x - self.x, dy = crew.y - self.y, outOfRange = dx * dx + dy * dy > range * range;
  let best = -1;
  for (const room of REPAIR_ORDER) {
    const level = me.rooms[room];
    if ((level >= 2 || (level === 1 && outOfRange)) && (best < 0 || level > me.rooms[best]!)) best = room;
  }
  if (best >= 0) { h.mode = HunterMode.Repair; h.room = best; h.working = false; h.timer = HUNTER_WALK_TICKS; }
}

/** The Hunter's seeded aim error on a fine aim (spec §1): one draw, uniform in ±HUNTER_PEW_ERROR_STEPS, wrapped. */
function aimError(state: TacticalState, aim: number): number {
  return (aim + nextInt(state.rng, 2 * HUNTER_PEW_ERROR_STEPS + 1) - HUNTER_PEW_ERROR_STEPS + AIM_STEPS) % AIM_STEPS;
}

/**
 * W-1 (pew pew spec §1): the Hunter's pew this tick, a fine aim or −1. The burst clock counts down every call. With less
 * than a third stored there is no shot and the burst ends. Defence first: its target's torpedo in flight within
 * HUNTER_PD_RANGE and inside the cone is tried for once a tick (one roll, 1 in HUNTER_PD_ODDS), led with the round speed
 * and the aim error. Then attack: its target ship within PEW_RANGE and inside the cone, in bursts of the class's shots
 * HUNTER_PEW_GAP ticks apart; a burst starts only on a full charge and ends when the ship leaves the cone or the range.
 * Draws from rng.tactical, in order: the defence roll, then one error for the shot.
 */
function hunterPew(state: TacticalState, i: number): number {
  const def = classOf(state, i).slots.pew, h = state.hunter;
  if (h.pewClock > 0) h.pewClock--;
  if (!def || !pewReady(state, i)) { h.pewBurst = 0; return -1; }
  const me = state.ships[i]!, target = state.systems[i]!.target, crew = state.ships[target]!, torp = missileOf(state, target);
  if (torp) {
    const dx = torp.x - me.x, dy = torp.y - me.y;
    if (dx * dx + dy * dy <= HUNTER_PD_RANGE * HUNTER_PD_RANGE && inArc(me.heading, dx, dy, PEW_ARC_COS) && nextInt(state.rng, HUNTER_PD_ODDS) === 0) {
      const aim = pewLead(state, i, torp.x, torp.y, torp.vx, torp.vy);
      if (aim >= 0) return aimError(state, aim);
    }
  }
  const cx = crew.x - me.x, cy = crew.y - me.y;
  if (!crew.active || cx * cx + cy * cy > PEW_RANGE * PEW_RANGE || !inArc(me.heading, cx, cy, PEW_ARC_COS)) { h.pewBurst = 0; return -1; }
  if (h.pewBurst === 0) {
    if (state.systems[i]!.pewCharge < pewFull(def)) return -1;   // after a burst it waits for every third
    h.pewBurst = def.shots; h.pewClock = 0;
  }
  if (h.pewClock > 0) return -1;
  const aim = pewLead(state, i, crew.x, crew.y, crew.vx, crew.vy);
  if (aim < 0) return -1;
  h.pewBurst--; h.pewClock = HUNTER_PEW_GAP;
  return aimError(state, aim);
}

/** Ship i's input for this tick (the duel's hunter is slot 1), against its locked target. Updates the hunter's own state
 *  (trail, repair timers, scheduled release). The trail is still recorded, but since its missile homes by itself (homing
 *  torpedo spec) nothing reads it. Before it turns hostile (`hostileAt` −1, Sci-1 spec §4.2, owner decision 2026-11-17)
 *  it holds: no thrust, no turn, no charge, no launch. W-1: it fires the pew by hunterPew (defence before attack). */
export function hunterThink(state: TacticalState, i = 1): ShipInput {
  const h = state.hunter, me = state.ships[i]!, mine = state.systems[i]!, target = mine.target, crew = state.ships[target]!, crewSys = state.systems[target]!;
  h.trail[2 * h.trailHead] = crew.x; h.trail[2 * h.trailHead + 1] = crew.y; h.trailHead = (h.trailHead + 1) % HUNTER_TRAIL_TICKS;
  updateRepair(state, i);
  const repairing = h.mode === HunterMode.Repair;
  const helm = !(repairing && h.room === Room.Engines), weapons = !(repairing && h.room !== Room.Engines);
  const input: ShipInput = { helm, weapons, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, rockLock: { laser: null, torpedo: null }, laserCharge: null, missileLaunch: false, gunHeld: false, pewAim: -1, laserFire: -1, torpTurn: 0, torpHeading: -1, scanner: true };   // W-2, W-3: the Hunter is always AUTO
  if (!enemyHostile(state)) { h.fireAt = -1; return input; }   // the hold before hostility (Sci-1 spec §4.2): it keeps only its drift

  if (helm) {
    const threat = threatAhead(state, i);
    if (threat) input.axes = { turn: -sideOf(me.heading, threat.x - me.x, threat.y - me.y) || 1, thrust: 1 };
    else {
      const cx = crew.x - me.x, cy = crew.y - me.y, dist = Math.sqrt(cx * cx + cy * cy);
      if (dist <= HUNTER_STANDOFF) {
        // Standoff (spec §9): nose on the crew's current position, no forward thrust, brake when closing fast.
        const closing = dist > 0 ? ((me.vx - crew.vx) * cx + (me.vy - crew.vy) * cy) / dist : 0;
        input.axes = { turn: pursuitTurn(me.heading, cx, cy), thrust: closing > HUNTER_BRAKE_SPEED ? -1 : 0 };
      } else {
        const dx = cx + crew.vx * HUNTER_LEAD_S, dy = cy + crew.vy * HUNTER_LEAD_S;
        const aligned = hx(me.heading) * dx + hy(me.heading) * dy >= HUNTER_THRUST_COS * Math.sqrt(dx * dx + dy * dy);
        input.axes = { turn: pursuitTurn(me.heading, dx, dy), thrust: aligned ? 1 : 0 };
      }
    }
  }
  if (!weapons) { h.fireAt = -1; h.pewBurst = 0; return input; }   // W-1: an unattended Weapons ends a burst

  input.laserLock = crewSys.rooms[Room.Shields] < 2 ? Room.Shields : Room.Weapons;
  if (!missileOf(state, i)) {   // its missile homes by itself (homing torpedo spec); none in flight, it charges and launches
    if (!mine.fireHeld) { input.laserCharge = true; h.fireAt = -1; }   // press first; a release can only follow a held press
    else if (laserFull(state, i) && laserEligible(state, i, target)) {
      if (h.fireAt < 0) h.fireAt = state.tick + nextInt(state.rng, HUNTER_JITTER_TICKS + 1);
      if (state.tick >= h.fireAt) { input.laserCharge = false; h.fireAt = -1; }
    } else h.fireAt = -1;
    if (canLaunch(state, i) && state.tick - h.lastLaunch >= HUNTER_MISSILE_COOLDOWN_TICKS) input.missileLaunch = true;   // stepDuel starts the cooldown only if it launches
  }
  input.pewAim = hunterPew(state, i);   // W-1: attended and hostile; its own torpedo in flight does not stop the pew
  return input;
}

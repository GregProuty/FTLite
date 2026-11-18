// The hunter (spec §9): a blunt, deterministic state machine that flies a ship slot whose class has the hunter AI
// profile (the duel's slot 1) against that slot's locked target, through the same ShipInput the crew uses. It reads the
// state as it stands at the start of the tick. Its only randomness is the release jitter, drawn from rng.tactical. One
// hunter brain per encounter (state.hunter) until R-5 gives every ship its own.
import { nextInt } from '../../../../shared/rng';
import { hx, hy } from './direction';
import { segmentNear, sideOf } from './geometry';
import { queryGrid } from './grid';
import { classOf, HunterMode, missileOf, Room, type TacticalState } from './state';
import {
  AUTO_FACE_SIN, HUNTER_AVOID_MARGIN, HUNTER_BRAKE_SPEED, HUNTER_JITTER_TICKS, HUNTER_LEAD_S, HUNTER_LOOKAHEAD_S, HUNTER_MISSILE_COOLDOWN_TICKS,
  HUNTER_STANDOFF, HUNTER_THRUST_COS, HUNTER_TRAIL_TICKS, HUNTER_WALK_TICKS, REPAIR_WORK_TICKS
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
  const me = state.ships[i]!, t = state.ships[state.systems[i]!.target]!;
  return faceTurn(me.heading, t.x - me.x + t.vx * HUNTER_LEAD_S, t.y - me.y + t.vy * HUNTER_LEAD_S);
}

/** Feel-ii's click-to-heading (Feel-ii spec §1.1): auto-face's turn law aimed at the fixed bearing of heading index `h`
 *  instead of the lead point. Pure. */
export function headingTurn(state: TacticalState, i: number, h: number): number {
  return faceTurn(state.ships[i]!.heading, hx(h), hy(h));
}

/** The auto-face turn law: toward (dx, dy) as pursuitTurn, none once it is within AUTO_FACE_SIN of the nose. */
function faceTurn(heading: number, dx: number, dy: number): number {
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d === 0) return 0;
  const h0 = hx(heading), h1 = hy(heading);
  if (h0 * dx + h1 * dy > 0 && Math.abs(h0 * dy - h1 * dx) <= AUTO_FACE_SIN * d) return 0;
  return pursuitTurn(heading, dx, dy);
}

/** The first solid body ship i's straight-line path over the lookahead comes within its radius + margin of, or null. */
function threatAhead(state: TacticalState, i: number): { x: number; y: number } | null {
  const s = state.ships[i]!, ex = s.x + s.vx * HUNTER_LOOKAHEAD_S, ey = s.y + s.vy * HUNTER_LOOKAHEAD_S, p = state.map.planet;
  if (segmentNear(s.x, s.y, ex, ey, p.x, p.y, p.r + HUNTER_AVOID_MARGIN)) return p;
  const half = Math.max(Math.abs(ex - s.x), Math.abs(ey - s.y)) / 2 + HUNTER_AVOID_MARGIN;
  for (const k of queryGrid(state.grid, (s.x + ex) / 2, (s.y + ey) / 2, half)) {
    const a = state.map.asteroids[k]!;
    if (segmentNear(s.x, s.y, ex, ey, a.x, a.y, a.r + HUNTER_AVOID_MARGIN)) return a;
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

/** Ship i's input for this tick (the duel's hunter is slot 1), against its locked target. Updates the hunter's own state
 *  (trail, repair timers, scheduled release). The trail is still recorded, but since its missile homes by itself (homing
 *  torpedo spec) nothing reads it. Before it turns hostile (`hostileAt` −1, Sci-1 spec §4.2, owner decision 2026-11-17)
 *  it holds: no thrust, no turn, no charge, no launch. */
export function hunterThink(state: TacticalState, i = 1): ShipInput {
  const h = state.hunter, me = state.ships[i]!, mine = state.systems[i]!, target = mine.target, crew = state.ships[target]!, crewSys = state.systems[target]!;
  h.trail[2 * h.trailHead] = crew.x; h.trail[2 * h.trailHead + 1] = crew.y; h.trailHead = (h.trailHead + 1) % HUNTER_TRAIL_TICKS;
  updateRepair(state, i);
  const repairing = h.mode === HunterMode.Repair;
  const helm = !(repairing && h.room === Room.Engines), weapons = !(repairing && h.room !== Room.Engines);
  const input: ShipInput = { helm, weapons, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, laserCharge: null, missileLaunch: false, gunHeld: false, scanner: true };
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
  if (!weapons) { h.fireAt = -1; return input; }

  input.laserLock = crewSys.rooms[Room.Shields] < 2 ? Room.Shields : Room.Weapons;
  if (!missileOf(state, i)) {   // its missile homes by itself (homing torpedo spec); none in flight, it charges and launches
    if (!mine.fireHeld) { input.laserCharge = true; h.fireAt = -1; }   // press first; a release can only follow a held press
    else if (laserFull(state, i) && laserEligible(state, i, target)) {
      if (h.fireAt < 0) h.fireAt = state.tick + nextInt(state.rng, HUNTER_JITTER_TICKS + 1);
      if (state.tick >= h.fireAt) { input.laserCharge = false; h.fireAt = -1; }
    } else h.fireAt = -1;
    if (canLaunch(state, i) && state.tick - h.lastLaunch >= HUNTER_MISSILE_COOLDOWN_TICKS) input.missileLaunch = true;   // stepDuel starts the cooldown only if it launches
  }
  return input;
}

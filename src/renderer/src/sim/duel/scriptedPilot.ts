// The scripted Valkyrn pilot (Valkyrn spec §10 Gate): a deterministic headless crew of one, for tests and telemetry only,
// never offered as a seat. Each tick it reads the duel and returns that tick's held input and commands. Seated at the
// Flight seat (Navigation + Weapons, spec §5) it steers by `aim` only (spec §5.1): avoid, dodge, orbit until the Hunter is
// near, then attack the lead pip (sim/tactical/lead.ts) with the minigun in bursts under the heat limit and the torpedo
// when it can. It stands to repair a level-2 Room; the layout's helmHoldsUnattended flies the ship meanwhile (spec §4.4).
// It lives under sim/ so the determinism guard covers it, and it draws no random numbers at all.
import type { HeldInput } from '../../net/contracts';
import { Health, Life, LifeState, Position, Seated } from '../components';
import { roomAt } from '../grid';
import { hx, hy } from '../tactical/direction';
import { leadOffset, nearestHeading } from '../tactical/lead';
import { missileOf, Room, targetOf } from '../tactical/state';
import { GUN_HEAT_MAX, SHIP_RADIUS } from '../tactical/tuning';
import { canLaunch } from '../tactical/weapons';
import { HEALTH_MAX, REACH } from '../tuning';
import { medbayOnline, medbayRoom } from './health';
import { LOCAL_DUEL_RUN, type DuelCommand, type DuelEnvelope } from './commands';
import { canSit, EVADE_RANGE, goalTiles, hazardAway, HURT_HEALTH, inRepairReach, orbitSteer, roomTiles, SPEED_SLACK, walkTo } from './scripted';
import type { DuelState } from './state';
import { aimTurn, type DuelInput } from './step';
import { THROTTLE_MAX, THROTTLE_MIN, throttleThrust } from './throttle';

// The pilot's own numbers (tuned with the Valkyrn gate, spec §12), separate from the game tuning.
/** The orbit radius it holds while the Hunter is far: the middle of the pair's ORBIT_MIN..ORBIT_MAX, fixed (no rng). */
export const PILOT_ORBIT_R = 1850;
/** Within this range of the Hunter it stops orbiting and attacks (u). */
export const PILOT_ENGAGE_RANGE = 900;
/** The range the attack's throttle closes to and holds (u): inside the torpedo's 360. */
export const PILOT_STAND_RANGE = 300;
/** The attack's wanted closing speed per unit of range error (1/s), clamped to ±PILOT_MAX_CLOSE (u/s). */
export const PILOT_CLOSE_GAIN = 0.5;
export const PILOT_MAX_CLOSE = 120;
/** The gun is held only while the lead is within this range (u), inside the round's about 607 u reach (spec §7.1). */
export const PILOT_FIRE_RANGE = 560;
/** A burst ends at this heat and the next starts when the gun is cold again (0). */
export const PILOT_HEAT_RELEASE = 0.8 * GUN_HEAT_MAX;
/** Ticks between two torpedo launches (start: the pair's MISSILE_GAP). */
export const PILOT_MISSILE_GAP = 1500;
/** The throttle it leaves the ship at when it stands up. */
export const PILOT_AWAY_THROTTLE = 0;

const COS_45 = 0.7071067811865476;
const NO_HELD: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
/** The Rooms the pilot will stand up for, in order (Valkyrn iii plan Decision 7). */
const REPAIR_ORDER = [Room.Weapons, Room.Shields, Room.Engines] as const;

export interface ScriptedPilot {
  /** Next command sequence (player 0). */
  seq: number;
  /** The aim sent on the last seated tick, or −1; the hazard prediction flies its turn. */
  aim: number;
  /** True from PILOT_HEAT_RELEASE (or a lockout) until the gun is cold. */
  cooling: boolean;
  /** Tick of the last torpedo launch sent. */
  lastLaunch: number;
  /** The Room being repaired, or −1. */
  task: number;
  /** On its way to (or in) the Medbay to heal to full. */
  heal: boolean;
}

export function createScriptedPilot(): ScriptedPilot {
  return { seq: 0, aim: -1, cooling: false, lastLaunch: -PILOT_MISSILE_GAP, task: -1, heal: false };
}

function len(x: number, y: number): number { return Math.sqrt(x * x + y * y); }

/** The pair's goalTiles less the tiles on the very edge of reach. A walker settles on a tile centre only to about 1e-14,
 *  so a centre exactly REACH from the target (the Valkyrn's Flight seat from x = 15) can read just out of reach and the
 *  sit or repair never comes. All of goalTiles when every one is on the edge. */
function firmGoals(d: DuelState, room: number, target: number): Set<number> {
  const all = goalTiles(d, room, target), w = d.interior.derived.width, tx = target % w, ty = (target - tx) / w, out = new Set<number>();
  for (const i of all) {
    const x = (i % w) + 0.5, y = Math.floor(i / w) + 0.5;
    if (len(Math.max(tx - x, 0, x - (tx + 1)), Math.max(ty - y, 0, y - (ty + 1))) <= REACH - 1e-6) out.add(i);
  }
  return out.size > 0 ? out : all;
}
const levelOf = (thrust: number): number => thrust > 0 ? THROTTLE_MAX : thrust < 0 ? THROTTLE_MIN : 0;

/** The seated pilot's flight this tick (plan Decision 4): the aim to send, the throttle level, and whether the shot is on. */
function flight(p: ScriptedPilot, d: DuelState): { aim: number; level: number; on: boolean } {
  const t = d.tactical, s = t.ships[0], target = targetOf(t, 0), e = t.ships[target]!;
  const keep = (h: number): number => h >= 0 ? h : p.aim;
  const away = hazardAway(d, { turn: p.aim >= 0 ? aimTurn(s.heading, p.aim) : 0, thrust: throttleThrust(d.throttle) });
  if (away) return { aim: keep(nearestHeading(away.x, away.y)), level: THROTTLE_MAX, on: false };
  const inbound = missileOf(t, target);
  if (inbound) {
    const mx = inbound.x - s.x, my = inbound.y - s.y;
    if (mx * mx + my * my <= EVADE_RANGE * EVADE_RANGE) {
      const side = s.vx * -my + s.vy * mx >= 0 ? 1 : -1;
      return { aim: keep(nearestHeading(-my * side, mx * side)), level: THROTTLE_MAX, on: false };
    }
  }
  const rx = e.x - s.x, ry = e.y - s.y, dist = len(rx, ry);
  if (dist > PILOT_ENGAGE_RANGE) {
    const o = orbitSteer(d, PILOT_ORBIT_R);
    return { aim: keep(nearestHeading(o.dx, o.dy)), level: levelOf(o.thrust), on: false };
  }
  const lead = leadOffset(t, 0), lx = lead ? lead.x : rx, ly = lead ? lead.y : ry;
  const vx = e.vx - s.vx, vy = e.vy - s.vy, closing = dist > 0 ? -(rx * vx + ry * vy) / dist : 0;
  const want = Math.max(-PILOT_MAX_CLOSE, Math.min(PILOT_MAX_CLOSE, (dist - PILOT_STAND_RANGE) * PILOT_CLOSE_GAIN));
  const nx = hx(s.heading), ny = hy(s.heading), facing = nx * rx + ny * ry >= COS_45 * dist;
  const level = !facing ? 0 : closing < want - SPEED_SLACK ? THROTTLE_MAX : closing > want + SPEED_SLACK ? THROTTLE_MIN : 0;
  const along = nx * lx + ny * ly, across = Math.abs(nx * ly - ny * lx);
  const on = lead !== null && along > 0 && len(lx, ly) <= PILOT_FIRE_RANGE && across <= SHIP_RADIUS;
  return { aim: keep(nearestHeading(lx, ly)), level, on };
}

/** This tick's input for a crew-of-one duel: player 0's held input and commands, stamped with the duel's tick. */
export function scriptedPilotInput(p: ScriptedPilot, d: DuelState): DuelInput {
  const st = d.interior, eid = st.crew[0]!, seat = Seated.station[eid]!, cmds: DuelCommand[] = [], sys = d.tactical.systems[0];
  let held: HeldInput = NO_HELD;
  if (Life.state[eid] === LifeState.Conscious) {
    if (p.task >= 0 && sys.rooms[p.task] === 0) p.task = -1;
    if (p.task < 0) { const r = REPAIR_ORDER.find((k) => sys.rooms[k] >= 2); if (r !== undefined) p.task = r; }
    if (Health.cur[eid]! < HURT_HEALTH) p.heal = true;
    if (Health.cur[eid]! >= HEALTH_MAX) p.heal = false;
    const mb = medbayRoom(d), healing = p.task < 0 && p.heal && mb >= 0 && medbayOnline(d);
    if (p.task >= 0 || healing) {
      if (seat >= 0) {   // stand up; the ship flies the last aim and this throttle (spec §4.4)
        // Two ticks (plan Decision 7): a throttle sent with the stand is checked against the emptied Helm and rejected.
        if (d.throttle !== PILOT_AWAY_THROTTLE) {
          cmds.push({ kind: 'throttle', level: PILOT_AWAY_THROTTLE });
          held = p.aim >= 0 ? { moveX: 0, moveY: 0, interactHeld: false, aim: p.aim, gunHeld: false } : NO_HELD;
        } else cmds.push({ kind: 'stand' });
      } else if (p.task >= 0) {
        if (inRepairReach(d, 0, p.task)) held = { moveX: 0, moveY: 0, interactHeld: true };
        else { const pt = d.points.find((q) => q.tacticalRoom === p.task)!; held = walkTo(d, 0, firmGoals(d, pt.room, pt.tile)); }
      } else if (roomAt(st, Position.x[eid]!, Position.y[eid]!) !== mb) held = walkTo(d, 0, roomTiles(d, mb));
    } else if (seat < 0) {   // back to the Flight seat (one console group: Navigation + Weapons)
      if (canSit(d, 0, d.nav)) cmds.push({ kind: 'sit', station: d.nav });
      else held = walkTo(d, 0, firmGoals(d, st.derived.stationRoom[d.nav]!, st.derived.stationTile[d.nav]!));
    } else {
      const f = flight(p, d);
      if (sys.gunHeat >= PILOT_HEAT_RELEASE || sys.gunLocked) p.cooling = true;
      else if (sys.gunHeat === 0) p.cooling = false;
      p.aim = f.aim;
      if (f.level !== d.throttle) cmds.push({ kind: 'throttle', level: f.level });
      held = { moveX: 0, moveY: 0, interactHeld: false, aim: f.aim, gunHeld: f.on && !p.cooling };
      if (canLaunch(d.tactical, 0) && d.tactical.tick - p.lastLaunch >= PILOT_MISSILE_GAP) { cmds.push({ kind: 'missileLaunch' }); p.lastLaunch = d.tactical.tick; }
    }
  }
  const commands: DuelEnvelope[] = cmds.map((command) => ({ runId: LOCAL_DUEL_RUN, id: { player: 0, sequence: p.seq++ }, requestedTick: st.tick, command }));
  return { held: [held], commands };
}

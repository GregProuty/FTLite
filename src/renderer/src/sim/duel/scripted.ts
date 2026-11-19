// The scripted pair (H-0c-ii-a spec §3): a deterministic headless crew for tests and telemetry only, never offered as a
// seat (Q15). Each tick it reads the duel and returns that tick's held input and commands. Player 0 flies (avoid, line
// up, orbit), player 1 fights (charge, release, lock, missile), and either walks to a repair by the nearest-free rule.
// It lives under sim/ so the determinism guard covers it; its only randomness is its own seeded stream.
import { createRng, nextFloat, type RngState } from '../../../../shared/rng';
import type { HeldInput } from '../../net/contracts';
import { Health, Life, LifeState, Position, Seated } from '../components';
import { roomAt, solidAt } from '../grid';
import { inReachOfTile } from '../interact';
import { stationOnline } from '../stations';
import { hx, hy } from '../tactical/direction';
import { inArc, sideOf } from '../tactical/geometry';
import { pewLead, pewReady } from '../tactical/pew';
import { autoFaceTurn } from '../tactical/hunter';
import { queryGrid } from '../tactical/grid';
import { circularSpeed } from '../tactical/map';
import { predictPath } from '../tactical/predict';
import { missileOf, Room, targetOf, type Axes } from '../tactical/state';
import { BELT_OUTER, HEADING_COUNT, HUNTER_PD_RANGE, LASER_ARC_COS, LASER_RANGE, PEW_ARC_COS, PEW_RANGE, R_MAP, SHIP_RADIUS } from '../tactical/tuning';
import { canLaunch, laserEligible, laserFull } from '../tactical/weapons';
import { CREW_SPEED, DT, HEALTH_MAX, REACH } from '../tuning';
import { isDowned, medbayOnline, medbayRoom, revivers } from './health';
import { LOCAL_DUEL_RUN, type DuelCommand, type DuelEnvelope } from './commands';
import type { DuelState } from './state';
import type { DuelInput } from './step';
import { THROTTLE_MAX, THROTTLE_MIN, throttleThrust } from './throttle';

// The pair's own numbers (spec §3 "Tunable"), separate from the game tuning.
/** Ticks of predicted path the Helm checks for hazards, and the clearance it keeps from them (u). */
export const AVOID_TICKS = 90;
export const AVOID_MARGIN = 40;
/** Orbit radius correction: tan of the desired direction's tilt toward the planet per unit of radius error (1/u). */
export const ORBIT_GAIN = 0.004;
/** The orbit radius is drawn once per duel in [ORBIT_MIN, ORBIT_MAX] (spec: ≥ BELT_OUTER + 200, ≤ R_MAP − 600). */
export const ORBIT_MIN = 1500;
export const ORBIT_MAX = 2200;
/** Speed band around the circular speed inside which the Helm neither thrusts nor brakes (u/s). */
export const SPEED_SLACK = 8;
/** The Helm dodges the enemy's torpedo inside this range with a hard full-thrust turn across its path (homing torpedo
 *  spec §1: a hard turn can beat it). 350 from the telemetry gate (tests/duelGates.test.ts): without a dodge the
 *  homing Hunter torpedo cut the median duel to 136 s. */
export const EVADE_RANGE = 350;
/** Ticks between two crew missile launches. 1500 (was 900) from the telemetry gate at the FTL targeting update (FTL
 *  targeting spec §3): with the laser always ready and auto-firing, 900 won all ten gate seeds, and the gate wants a loss. */
export const MISSILE_GAP = 1500;
/** W-1 (pew pew spec §1, §5): the fewest ticks between two scripted pew rounds. Start 20 (a round about every third of a
 *  second while the Hunter is in the cone), kept at the start value; the duel gates (tests/duelGates.test.ts): Hound
 *  median 224.1 s, 7 crew wins, 3 losses (the Valkyrn pilot has no pew). */
export const SCRIPTED_PEW_GAP = 20;
/** A bot below this health with nothing to repair goes to the Medbay and stays until full (duel-health spec §1.9). */
export const HURT_HEALTH = 50;
/** Salt for the pair's own stream, so it never shares a sequence with rng.tactical. */
export const PAIR_SALT = 0x48454c4d;

/** tan 30°: the tilt clamp (the desired direction is t + tilt · inward, normalised). */
const TAN_30 = 0.5773502691896257;
const COS_45 = 0.7071067811865476;
const COS_10 = 0.984807753012208;
/** cos of one heading step (360° / 256): under it the nose counts as on the desired direction. */
const COS_STEP = 0.9996988186962042;
const NO_HELD: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };

export interface ScriptedPair {
  rng: RngState;
  orbitR: number;
  /** Next command sequence per player. */
  seq: [number, number];
  /** The Helm's axes on the tick before. The avoidance prediction holds their turn, and flies the throttle's thrust. */
  axes: Axes;
  /** Tick of the last crew missile launch the pair sent. */
  lastLaunch: number;
  /** W-1: tick of the last scripted pew round. */
  lastPew: number;
  /** The tactical Room each character is assigned to repair, or −1. */
  task: [number, number];
  /** Whether each character is on its way to (or in) the Medbay to heal to full. */
  heal: [boolean, boolean];
}

export function createScriptedPair(seed: number): ScriptedPair {
  const rng = createRng((seed ^ PAIR_SALT) >>> 0);
  const orbitR = ORBIT_MIN + nextFloat(rng) * (ORBIT_MAX - ORBIT_MIN);
  return { rng, orbitR, seq: [0, 0], axes: { turn: 0, thrust: 0 }, lastLaunch: -MISSILE_GAP, lastPew: -SCRIPTED_PEW_GAP, task: [-1, -1], heal: [false, false] };
}

/** Turn toward (dx, dy): the sign of the heading error, ties clockwise. */
function turnToward(heading: number, dx: number, dy: number): number { return sideOf(heading, dx, dy) || 1; }

function len(x: number, y: number): number { return Math.sqrt(x * x + y * y); }

/** Rule 1 (spec §3): the heading away from the first hazard on the predicted path, as a direction, or null. */
export function hazardAway(d: DuelState, axes: Axes): { x: number; y: number } | null {
  const t = d.tactical, s = t.ships[0], p = t.map.planet, keep = SHIP_RADIUS + AVOID_MARGIN;
  for (const q of predictPath(t, 0, axes, AVOID_TICKS, 4)) {
    if (len(q.x - p.x, q.y - p.y) < p.r + keep) return { x: s.x - p.x, y: s.y - p.y };
    if (len(q.x, q.y) > t.map.rMap - AVOID_MARGIN) return { x: -s.x, y: -s.y };
    let best = -1, bestClear = 0;
    for (const k of queryGrid(t.grid, q.x, q.y, keep)) {
      const a = t.map.asteroids[k]!, dist = len(q.x - a.x, q.y - a.y);
      if (dist < a.r + keep && (best < 0 || dist - a.r < bestClear)) { best = k; bestClear = dist - a.r; }   // ascending k: ties keep the lower index
    }
    if (best >= 0) { const a = t.map.asteroids[best]!; return { x: s.x - a.x, y: s.y - a.y }; }
  }
  return null;
}

/** The Helm's axes (spec §3): avoid, then dodge an inbound torpedo, then line up (a full laser with a target, FTL targeting
 *  spec §3; Feel-i: by holding auto-face, as a player would, so `face` is set and `turn` is the turn it will make), then orbit. The hazard check predicts with the thrust the ship flies
 *  at this tick before any new command: the throttle's (Artemis spec §5.5). */
function helmAxes(pair: ScriptedPair, d: DuelState): Axes & { face?: boolean } {
  const t = d.tactical, s = t.ships[0], e = t.ships[targetOf(t, 0)]!;
  const away = hazardAway(d, { turn: pair.axes.turn, thrust: throttleThrust(d.throttle) });
  if (away) return { turn: turnToward(s.heading, away.x, away.y), thrust: 1 };
  // Dodge (homing torpedo spec): the enemy's torpedo within EVADE_RANGE, turn the nose square across its line of approach,
  // on the side the ship already moves to, at full thrust.
  const inbound = missileOf(t, targetOf(t, 0));
  if (inbound) {
    const mx = inbound.x - s.x, my = inbound.y - s.y;
    if (mx * mx + my * my <= EVADE_RANGE * EVADE_RANGE) {
      const side = s.vx * -my + s.vy * mx >= 0 ? 1 : -1;
      return { turn: turnToward(s.heading, -my * side, mx * side), thrust: 1 };
    }
  }
  const ex = e.x - s.x, ey = e.y - s.y;
  if (laserFull(t, 0) && t.systems[0].laserTargeted && ex * ex + ey * ey <= LASER_RANGE * LASER_RANGE && !inArc(s.heading, ex, ey, LASER_ARC_COS))
    return { turn: autoFaceTurn(t, 0), thrust: 0, face: true };
  const o = orbitSteer(d, pair.orbitR);
  return { turn: o.turn, thrust: o.thrust };
}

/** The Helm's orbit (spec §3), shared with the Valkyrn pilot (sim/duel/scriptedPilot.ts): the desired direction (dx, dy),
 *  unit, and the turn and thrust that fly it. t is the prograde tangent (the way the ship already circles, clockwise at
 *  rest); tilt it toward the planet when outside `orbitR` and away when inside, by at most 30°. */
export function orbitSteer(d: DuelState, orbitR: number): Axes & { dx: number; dy: number } {
  const s = d.tactical.ships[0];
  const r = len(s.x, s.y), ux = r > 0 ? s.x / r : 0, uy = r > 0 ? s.y / r : -1;
  const cw = s.x * s.vy - s.y * s.vx >= 0, tx = cw ? -uy : uy, ty = cw ? ux : -ux;
  const tilt = Math.max(-TAN_30, Math.min(TAN_30, ORBIT_GAIN * (r - orbitR)));
  let dx = tx - ux * tilt, dy = ty - uy * tilt;
  const dl = len(dx, dy); dx /= dl; dy /= dl;
  const nose = hx(s.heading) * dx + hy(s.heading) * dy;
  const turn = nose >= COS_STEP ? 0 : turnToward(s.heading, dx, dy);
  const speed = len(s.vx, s.vy), vc = circularSpeed(r);
  let thrust = 0;
  if (nose < COS_45) thrust = 0;
  else if (speed > vc + SPEED_SLACK) thrust = -1;
  else if (speed < vc - SPEED_SLACK || s.vx * dx + s.vy * dy < COS_10 * speed) thrust = 1;
  return { turn, thrust, dx, dy };
}

// --- Walking (spec §3): a BFS over the Cutter's walkable tiles, doors held open, four-way only. ---

/** Tiles inside `room` whose centre is within REACH of tile `target`'s square: where a character can act on it. */
export function goalTiles(d: DuelState, room: number, target: number): Set<number> {
  const st = d.interior, w = st.derived.width, tx = target % w, ty = (target - tx) / w, out = new Set<number>();
  for (let i = 0; i < st.derived.roomOfTile.length; i++) {
    if (st.derived.roomOfTile[i] !== room) continue;
    const x = (i % w) + 0.5, y = Math.floor(i / w) + 0.5;
    const ddx = Math.max(tx - x, 0, x - (tx + 1)), ddy = Math.max(ty - y, 0, y - (ty + 1));
    if (Math.sqrt(ddx * ddx + ddy * ddy) <= REACH && !solidAt(st, i % w, Math.floor(i / w))) out.add(i);
  }
  return out;
}

/** Shortest four-way path from tile `from` to the nearest goal tile: the tiles to step through, without `from` itself
 *  ([] when `from` is a goal), or null when none is reachable. Neighbours in a fixed order (up, left, right, down), so
 *  the path is deterministic. Walkable means not solid (doors are held open in the duel). */
export function bfsPath(d: DuelState, from: number, goals: ReadonlySet<number>): number[] | null {
  const st = d.interior, w = st.derived.width, h = st.derived.height, prev = new Int32Array(w * h).fill(-2);
  if (goals.has(from)) return [];
  prev[from] = -1;
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head]!, cx = c % w, cy = (c - cx) / w;
    for (const [nx, ny] of [[cx, cy - 1], [cx - 1, cy], [cx + 1, cy], [cx, cy + 1]] as const) {
      if (solidAt(st, nx, ny)) continue;
      const n = ny * w + nx;
      if (prev[n] !== -2) continue;
      prev[n] = c;
      if (goals.has(n)) {
        const path: number[] = [];
        for (let k = n; k !== from; k = prev[k]!) path.push(k);
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}

/** Held stick that moves pid toward the centre of the next path tile: first onto the current tile's centre line
 *  across the step, then along it, scaled so no tick overshoots a centre (a Recruit walks CREW_SPEED · DT a tick). */
function walkToward(d: DuelState, pid: number, next: number): HeldInput {
  const st = d.interior, eid = st.crew[pid]!, w = st.derived.width, x = Position.x[eid]!, y = Position.y[eid]!;
  const nx = (next % w) + 0.5, ny = Math.floor(next / w) + 0.5, cx = Math.floor(x) + 0.5, cy = Math.floor(y) + 0.5;
  const step = CREW_SPEED * DT, clamp = (v: number): number => Math.max(-1, Math.min(1, v / step));
  if (Math.floor(nx) !== Math.floor(x)) {   // a step along x: line up on the row's centre first
    if (Math.abs(cy - y) > 1e-9) return { moveX: 0, moveY: clamp(cy - y), interactHeld: false };
    return { moveX: clamp(nx - x), moveY: 0, interactHeld: false };
  }
  if (Math.abs(cx - x) > 1e-9) return { moveX: clamp(cx - x), moveY: 0, interactHeld: false };
  return { moveX: 0, moveY: clamp(ny - y), interactHeld: false };
}
/** Held stick that walks pid toward the nearest goal tile, settling on its centre; neutral when none is reachable. */
export function walkTo(d: DuelState, pid: number, goals: ReadonlySet<number>): HeldInput {
  const st = d.interior, eid = st.crew[pid]!, w = st.derived.width;
  const from = Math.floor(Position.y[eid]!) * w + Math.floor(Position.x[eid]!);
  const path = bfsPath(d, from, goals);
  if (!path) return NO_HELD;
  return walkToward(d, pid, path.length > 0 ? path[0]! : from);
}

/** BFS tile distance from pid's tile to the room's goal tiles (0 in reach already), or Infinity. */
function walkDistance(d: DuelState, pid: number, goals: ReadonlySet<number>): number {
  const st = d.interior, eid = st.crew[pid]!, w = st.derived.width;
  const path = bfsPath(d, Math.floor(Position.y[eid]!) * w + Math.floor(Position.x[eid]!), goals);
  return path ? path.length : Infinity;
}

/** As the sim's sit check (and app/duel/controls consoleInReach): pid standing in the console's room, in reach of its
 *  tile, with no member of its group occupied and one online. */
export function canSit(d: DuelState, pid: number, i: number): boolean {
  const st = d.interior, eid = st.crew[pid]!;
  if (Seated.station[eid]! >= 0 || Life.state[eid] !== LifeState.Conscious) return false;
  const g = st.derived.stationGroup[i], members = g !== undefined && g >= 0 ? st.derived.groupStations[g]! : [i];
  if (members.some((j) => st.stations.occupant[j]! >= 0) || !members.some((j) => stationOnline(st, j))) return false;
  return st.derived.stationRoom[i] === roomAt(st, Position.x[eid]!, Position.y[eid]!) && inReachOfTile(st, eid, st.derived.stationTile[i]!);
}

/** As the sim's repair rule: pid standing in the room's repair room and in reach of its point. */
export function inRepairReach(d: DuelState, pid: number, room: number): boolean {
  const st = d.interior, eid = st.crew[pid]!, p = d.points.find((q) => q.tacticalRoom === room)!;
  return Seated.station[eid]! < 0 && roomAt(st, Position.x[eid]!, Position.y[eid]!) === p.room && inReachOfTile(st, eid, p.tile);
}

/** Repair assignment (spec §3 nearest free character): damaged rooms without a repairer, higher level first, then Room
 *  order, each to the free character with the shortest walk, ties to player 1. A finished room frees its repairer. */
function assignRepairs(pair: ScriptedPair, d: DuelState): void {
  const rooms = d.tactical.systems[0].rooms;
  for (let pid = 0; pid < 2; pid++) if (pair.task[pid]! >= 0 && (rooms[pair.task[pid]!] === 0 || isDowned(d, pid))) pair.task[pid as 0 | 1] = -1;   // a downed character drops its task
  const open = [Room.Weapons, Room.Shields, Room.Engines].filter((r) => rooms[r] >= 1 && !pair.task.includes(r)).sort((a, b) => rooms[b] - rooms[a]);
  for (const r of open) {
    const p = d.points.find((q) => q.tacticalRoom === r)!, goals = goalTiles(d, p.room, p.tile);
    let best = -1, bestDist = Infinity;
    for (const pid of [1, 0]) {
      if (pair.task[pid]! >= 0 || isDowned(d, pid)) continue;
      const dist = walkDistance(d, pid, goals);
      if (dist < bestDist) { best = pid; bestDist = dist; }
    }
    if (best >= 0) pair.task[best as 0 | 1] = r;
  }
}

/** Walkable tiles whose centre is within REACH of pid's centre: where a teammate stands to pick pid up. */
function reviveTiles(d: DuelState, pid: number): Set<number> {
  const st = d.interior, w = st.derived.width, eid = st.crew[pid]!, px = Position.x[eid]!, py = Position.y[eid]!, out = new Set<number>();
  for (let i = 0; i < st.derived.roomOfTile.length; i++) {
    const tx = i % w, ty = Math.floor(i / w);
    const dx = tx + 0.5 - px, dy = ty + 0.5 - py;
    if (!solidAt(st, tx, ty) && Math.sqrt(dx * dx + dy * dy) <= REACH) out.add(i);
  }
  return out;
}

/** The non-solid tiles of an interior room. */
export function roomTiles(d: DuelState, room: number): Set<number> {
  const st = d.interior, w = st.derived.width, out = new Set<number>();
  for (let i = 0; i < st.derived.roomOfTile.length; i++) if (st.derived.roomOfTile[i] === room && !solidAt(st, i % w, Math.floor(i / w))) out.add(i);
  return out;
}

/** W-1 (pew pew spec §1): the scripted gunner's pew, sent only when the sim will apply it (a third stored, the gap since its
 *  last round): defence first, the Hunter's torpedo within HUNTER_PD_RANGE inside the cone, then the Hunter itself within
 *  PEW_RANGE inside the cone, each aimed with pewLead (no error). */
function gunnerPew(pair: ScriptedPair, d: DuelState, out: DuelCommand[]): void {
  const t = d.tactical, s = t.ships[0], target = targetOf(t, 0), e = t.ships[target]!, inbound = missileOf(t, target);
  if (!pewReady(t, 0) || t.tick - pair.lastPew < SCRIPTED_PEW_GAP) return;
  let aim = -1;
  if (inbound) {
    const dx = inbound.x - s.x, dy = inbound.y - s.y;
    if (dx * dx + dy * dy <= HUNTER_PD_RANGE * HUNTER_PD_RANGE && inArc(s.heading, dx, dy, PEW_ARC_COS)) aim = pewLead(t, 0, inbound.x, inbound.y, inbound.vx, inbound.vy);
  }
  if (aim < 0 && e.active) {
    const dx = e.x - s.x, dy = e.y - s.y;
    if (dx * dx + dy * dy <= PEW_RANGE * PEW_RANGE && inArc(s.heading, dx, dy, PEW_ARC_COS)) aim = pewLead(t, 0, e.x, e.y, e.vx, e.vy);
  }
  if (aim < 0) return;
  out.push({ kind: 'pewFire', aim: Math.floor(aim / HEADING_COUNT), aimAcc: aim % HEADING_COUNT });
  pair.lastPew = t.tick;
}

/** The gunner's commands while seated at Weapons (spec §3; FTL targeting spec §3: it uses targets). The laser targets the
 *  enemy's Shields while they are up, else its Weapons, and auto-fires; its missile homes by itself (homing torpedo spec),
 *  so the gunner holds nothing. W-1: it fires the pew by gunnerPew. */
function gunner(pair: ScriptedPair, d: DuelState, out: DuelCommand[]): void {
  const t = d.tactical, target = targetOf(t, 0), sys = t.systems[0];
  const want = t.systems[target]!.shields > 0 ? Room.Shields : Room.Weapons;
  if (!sys.laserTargeted || sys.lock !== want) out.push({ kind: 'laserLock', room: want });
  gunnerPew(pair, d, out);   // W-1: before the torpedo's early return (the pew fires while a torpedo flies)
  if (missileOf(t, 0) || sys.torpLock >= 0) return;
  // Weapons update spec §2: the torpedo launches only within its range, so it is targeted when the laser has no shot to
  // make (not full and on target, no burst shot pending), since a torpedo in flight freezes the laser; the target
  // launches it this tick and clears.
  if (canLaunch(t, 0) && !(laserFull(t, 0) && laserEligible(t, 0, target)) && sys.laserBurst === 0 && t.tick - pair.lastLaunch >= MISSILE_GAP) {
    out.push({ kind: 'torpLock', room: want }); pair.lastLaunch = t.tick;
  }
}

/** This tick's input for the duel: both players' held input and commands, stamped with the duel's tick. */
export function scriptedInput(pair: ScriptedPair, d: DuelState): DuelInput {
  const st = d.interior, held: HeldInput[] = [NO_HELD, NO_HELD], cmds: DuelCommand[][] = [[], []];
  assignRepairs(pair, d);
  for (let pid = 0; pid < 2; pid++) {
    const eid = st.crew[pid]!, seat = Seated.station[eid]!, own = pid === 0 ? d.nav : d.weapons, task = pair.task[pid]!, mate = 1 - pid;
    if (Life.state[eid] !== LifeState.Conscious) continue;   // downed: its input is ignored anyway
    // duel-health spec §1.9: picking up a downed teammate outranks repair.
    if (isDowned(d, mate)) {
      if (seat >= 0) { cmds[pid]!.push({ kind: 'stand' }); continue; }
      if (!revivers(d, mate).includes(pid)) held[pid] = walkTo(d, pid, reviveTiles(d, mate));
      continue;
    }
    if (task >= 0) {
      if (seat >= 0) { cmds[pid]!.push({ kind: 'stand' }); continue; }
      if (inRepairReach(d, pid, task)) { held[pid] = { moveX: 0, moveY: 0, interactHeld: true }; continue; }
      const p = d.points.find((q) => q.tacticalRoom === task)!;
      held[pid] = walkTo(d, pid, goalTiles(d, p.room, p.tile));
      continue;
    }
    // A hurt bot with nothing to repair heals at the Medbay, to full.
    if (Health.cur[eid]! < HURT_HEALTH) pair.heal[pid as 0 | 1] = true;
    if (Health.cur[eid]! >= HEALTH_MAX) pair.heal[pid as 0 | 1] = false;
    const mb = medbayRoom(d);
    if (pair.heal[pid] && mb >= 0 && medbayOnline(d)) {
      if (seat >= 0) { cmds[pid]!.push({ kind: 'stand' }); continue; }
      if (roomAt(st, Position.x[eid]!, Position.y[eid]!) !== mb) held[pid] = walkTo(d, pid, roomTiles(d, mb));
      continue;
    }
    if (seat < 0) {   // walk back to its own console and sit
      if (canSit(d, pid, own)) { cmds[pid]!.push({ kind: 'sit', station: own }); continue; }
      held[pid] = walkTo(d, pid, goalTiles(d, st.derived.stationRoom[own]!, st.derived.stationTile[own]!));
      continue;
    }
    if (seat === d.nav) {
      const axes = helmAxes(pair, d);
      pair.axes = axes;
      // Artemis spec §5.5: the throttle stands for the wanted thrust (1 → 4, 0 → 0, −1 → −1), sent only when it changes.
      const level = axes.thrust > 0 ? THROTTLE_MAX : axes.thrust < 0 ? THROTTLE_MIN : 0;
      if (level !== d.throttle) cmds[pid]!.push({ kind: 'throttle', level });
      held[pid] = axes.face ? { moveX: 0, moveY: 0, interactHeld: false, face: true } : { moveX: axes.turn, moveY: 0, interactHeld: false };
    } else if (seat === d.weapons) {
      gunner(pair, d, cmds[pid]!);
    }
  }
  if (Seated.station[st.crew[0]!]! !== d.nav) pair.axes = { turn: 0, thrust: 0 };
  const commands: DuelEnvelope[] = [];
  for (let pid = 0; pid < 2; pid++) for (const command of cmds[pid]!) commands.push({ runId: LOCAL_DUEL_RUN, id: { player: pid, sequence: pair.seq[pid as 0 | 1]++ }, requestedTick: st.tick, command });
  return { held, commands };
}

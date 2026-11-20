// One duel tick (spec §13 phase list). The sector step (sim/step.ts) is never called on the duel's interior; this runs
// only the interior pieces the duel uses (sit, stand, Interact for repair, movement) and then the tactical stepDuel.
// H-2 spec §7: a duel is a series of rounds in one run. A decided round's ticks keep advancing with no physics (the end
// card), every command still gets a result, and a `rematch` there starts the next round on the following tick.
import { NEUTRAL_INTENT, type Intent } from '../../../../shared/intent';
import type { CommandEnvelope, HeldInput } from '../../net/contracts';
import { applyConsoleCommand, applyInteractionCommands } from '../commands';
import { Life, LifeState, Position, Seated } from '../components';
import { doorSystem } from '../doors';
import { roomAt } from '../grid';
import { fireStep } from '../hazards/fire';
import { oxygenStep } from '../hazards/oxygen';
import { movementSystem } from '../movement';
import { DuelSystem, effectiveBars, throttleAllowed, WeaponSlot, WEAPON_SLOTS } from '../tactical/bars';
import { applyWeaponPower } from './weaponSlots';
import { stepDuel } from '../tactical/duel';
import { autoFacePoint, autoFaceTurn, headingTurn } from '../tactical/hunter';
import { contactSeen, scanCommand, shipSeen } from '../tactical/science';
import { AIM_STEPS, BOOST_FAR, HEADING_COUNT, RCS_TURN_BOOST, SCAN_RATE_OTHER, SCAN_RATE_SCIENCE } from '../tactical/tuning';
import { classOf, CONTACT_MAX_LEVEL, Outcome, type Axes } from '../tactical/state';
import { hx, hy } from '../tactical/direction';
import { shipEngineFactor } from '../tactical/physics';
import { HAZARD_EVERY } from '../tuning';
import { rockAlive, rockSlots, ROCK_STRIDE } from '../tactical/rocks';
import { canCharge, canLaunch, manualLaserReady, validRockLock, validTarget, type ShipInput } from '../tactical/weapons';
import { pewReady, validAim } from '../tactical/pew';
import { hasTurret } from '../tactical/defs';
import { manualTorpedoFlying } from '../tactical/manualTorpedo';
import type { DuelEnvelope, DuelReason, DuelResult } from './commands';
import { clampThrottle } from './engines';
import { extinguishRoomWork, extinguishWork, firePhase, pointBurning } from './fire';
import { applyHitDamage, healthPhase } from './health';
import { followingSeed } from './seeds';
import { applyPower, clampToCapacity, cycleDuelCoolant, duelHeatStep, OVERDRIVE_SYSTEMS, validSystem } from './power';
import { duelInjection, patchWork, toggleAirlock, toggleDoor, validAirlock, validDoor, workJob } from './hazards';
import { throttleThrust, validHoldHeading, validThrottle } from './throttle';
import { createDuel, disposeDuel, type DuelState } from './state';
import { crewThrust, engineBars, heldAxis, noVent, rampThrottle, throttleCap, throttleFloor } from './helmFlight';
import { BOOST_FACE_SIN, DUEL_FIRE_O2_RATE, REPAIR_RATE_SOLO, REPAIR_RATE_TEAM, REPAIR_UNITS } from './tuning';

export interface DuelInput { held: readonly HeldInput[]; commands: readonly DuelEnvelope[] }

const NO_HELD: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
/** The fixed order weapon commands take effect in within one tick (W-1: the pew last, as applyWeaponsInput fires it). */
const WEAPON_ORDER = ['laserMode', 'torpMode', 'gunMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire'] as const;
/** Every duel command kind the step handles; any other kind is rejected not-in-duel. */
const DUEL_KINDS = ['sit', 'stand', 'presence', 'laserMode', 'torpMode', 'gunMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire', 'rematch', 'throttle', 'heading', 'contactScan', 'designate', 'laserFrequency',
  'shipPower', 'shipCoolant', 'shipDoor', 'shipAirlock', 'weaponPower'];   // Engineering spike spec §7, §10.3
/** Engineering spike spec §7: the ship-view commands. */
const SHIP_KINDS = new Set(['shipPower', 'shipCoolant', 'shipDoor', 'shipAirlock']);

function resetScratch(d: DuelState): void {
  const sc = d.interior.scratch;
  sc.commandResults.length = 0;
  sc.doorToggles.clear(); sc.doorCycles.clear(); sc.airlockToggles.clear();
  sc.satThisTick.fill(0); sc.stoodThisTick.fill(0); sc.activeThisTick.fill(0);
  sc.voteChoices.fill(-1); sc.jumpConfirm.fill(0); sc.confirmUsed.fill(0);
}

/** A duel sit or stand as today's envelope, so today's validation and handlers apply unchanged. */
function sector(env: DuelEnvelope): CommandEnvelope {
  const c = env.command;
  return { runId: env.runId, id: env.id, requestedTick: env.requestedTick, command: c.kind === 'sit' ? { kind: 'sit', station: c.station } : { kind: 'stand' } };
}

/** The player seated at station i who is present, or −1. */
function attendant(d: DuelState, station: number): number {
  const pid = d.interior.stations.occupant[station]!;
  return pid >= 0 && d.present[pid] ? pid : -1;
}
/** The console (Navigation, Weapons or Science) pid is the present attendant of, or −1 (Sci-1 spec §5: who may scan). */
function scanStation(d: DuelState, pid: number): number {
  for (const s of [d.nav, d.weapons, d.science]) if (s >= 0 && attendant(d, s) === pid) return s;
  return -1;
}

function conscious(d: DuelState, pid: number): boolean { return Life.state[d.interior.crew[pid]!] === LifeState.Conscious; }
function seated(d: DuelState, pid: number): boolean { return Seated.station[d.interior.crew[pid]!]! >= 0; }
/** A player id of this duel's crew (Sci-2 spec §4.1): an integer 0..n−1. */
function validPlayer(d: DuelState, pid: number): boolean { return Number.isInteger(pid) && pid >= 0 && pid < d.interior.playerCount; }

/** Each standing, present, conscious player holding Interact does one job (Engineering spike spec §4, Decision 11):
 *  the room's fire (at its repair point, else its breach-site tile), then a breach in reach, then the point's damaged
 *  Room. A burning point room's repair progress holds. Point-room fire and repair work push today's repairWork or
 *  fireWork per worker in player order, then per Room in Room order a repairDone or fireOut (H-0c-ii-a spec §4);
 *  fires in other rooms and breaches push nothing (spec §4 Events). */
function repairPhase(d: DuelState, held: readonly HeldInput[]): void {
  const crewShip = d.tactical.systems[0], workers: number[][] = [[], [], []];
  const fireCrew = new Map<number, number>(), breachCrew = new Map<number, number>();
  for (let pid = 0; pid < d.interior.playerCount; pid++) {
    if (!d.present[pid] || !conscious(d, pid) || seated(d, pid) || !(held[pid] ?? NO_HELD).interactHeld) continue;
    const eid = d.interior.crew[pid]!, job = workJob(d, eid, roomAt(d.interior, Position.x[eid]!, Position.y[eid]!));
    if (!job) continue;
    if (job.kind === 'pointFire' || job.kind === 'repair') {
      workers[job.point.tacticalRoom]!.push(pid);
      d.events.push({ kind: job.kind === 'pointFire' ? 'fireWork' : 'repairWork', player: pid, room: job.point.tacticalRoom });
    } else if (job.kind === 'fire') fireCrew.set(job.room, (fireCrew.get(job.room) ?? 0) + 1);
    else breachCrew.set(job.site, (breachCrew.get(job.site) ?? 0) + 1);
  }
  for (const p of d.points) {
    const r = p.tacticalRoom as 0 | 1 | 2, n = workers[r]!.length;
    if (pointBurning(d, p)) {   // the fire first; the room's repair progress stays put while it burns
      if (n > 0 && extinguishWork(d, p, n)) d.events.push({ kind: 'fireOut', room: r, players: workers[r]! });
      continue;
    }
    if (crewShip.rooms[r] === 0) { d.repair[r] = 0; continue; }
    if (n === 0) continue;
    d.repair[r] += n === 1 ? REPAIR_RATE_SOLO : n * REPAIR_RATE_TEAM;
    if (d.repair[r] >= REPAIR_UNITS) { crewShip.rooms[r]--; crewShip.gunRoomWear[r] = 0; d.repair[r] = 0;   /* Valkyrn spec §7.2 */ d.events.push({ kind: 'repairDone', room: r, players: workers[r]! }); }
  }
  for (const [room, n] of [...fireCrew].sort((a, b) => a[0] - b[0])) extinguishRoomWork(d, room, n);   // Engineering spike spec §4: rooms with no point
  for (const [site, n] of [...breachCrew].sort((a, b) => a[0] - b[0])) patchWork(d, site, n);
}

/** Valkyrn spec §6.2: a held aim, a heading index 0..255; absent, −1, NaN, a non-integer or out of range is −1 (none). */
export function heldAim(h: HeldInput): number {
  const a = h.aim;
  return typeof a === 'number' && Number.isInteger(a) && a >= 0 && a < HEADING_COUNT ? a : -1;
}
/** W-4 spec §8: the reticle in a held frame: an integer 0..65535, else −1 (none). */
export function heldTurretAim(h: HeldInput): number {
  const a = h.turretAim;
  return typeof a === 'number' && Number.isInteger(a) && a >= 0 && a < AIM_STEPS ? a : -1;
}
/** W-3 (pew pew spec §3), W-4 spec §7: the heading a held frame's torpHeading asks a MANUAL torpedo to hold: a heading index
 *  0..255 (absent, −1, a non-integer or out of range: −1, none). */
export function heldTorpHeading(h: HeldInput): number {
  const a = h.torpHeading;
  return typeof a === 'number' && Number.isInteger(a) && a >= 0 && a < HEADING_COUNT ? a : -1;
}

/** W-4 spec §8: the selected slot in a held frame: an integer 0..2, else −1 (none). */
export function heldWeaponSel(h: HeldInput): number {
  const w = h.weaponSel;
  return typeof w === 'number' && Number.isInteger(w) && w >= 0 && w <= 2 ? w : -1;
}

/** Valkyrn spec §6.2: the turn from `heading` toward the aim index `aim`. The signed index difference is
 *  d = ((aim − heading + 384) mod 256) − 128: none when |d| ≤ 1, else its sign. The band of three indices is wider than
 *  one tick's integer step (defs.ts asserts every class turns fewer than 3 steps a tick), so the nose never steps across
 *  it. Pure; only + − and the integer modulo. */
export function aimTurn(heading: number, aim: number): number {
  const d = headingDelta(heading, aim);
  return d >= -1 && d <= 1 ? 0 : Math.sign(d);
}

/** The turn the Helm attendant's held input flies this tick (Artemis spec §5.3, Feel-i, Feel-ii spec §1.1, Valkyrn spec
 *  §6.2): A/D (on every class, owner 2026-11-19), else auto-face's turn, else the aim's, else the held heading's, else none. Pure; reads the state before
 *  the step (the app's predicted path calls it too). */
export function helmTurn(d: DuelState, h: HeldInput): number {
  // Owner 2026-11-19: A/D turn every class again (playtest2feedback §4a had made them thrusters on a newtonianHelm class).
  if ((Math.sign(h.moveX) || 0) !== 0) return Math.sign(h.moveX);
  if (d.tactical.outcome !== Outcome.Running) return 0;
  if (h.face === true) return autoFaceTurn(d.tactical, 0);
  const aim = heldAim(h);
  if (aim >= 0) return aimTurn(d.tactical.ships[0].heading, aim);
  return d.holdHeading >= 0 ? headingTurn(d.tactical, 0, d.holdHeading) : 0;
}

/** Playtest2feedback §4a: the signed heading-index difference from `heading` to `target`, −128..127. */
export function headingDelta(heading: number, target: number): number {
  return ((target - heading + HEADING_COUNT + HEADING_COUNT / 2) % HEADING_COUNT) - HEADING_COUNT / 2;
}

/** Playtest2feedback §4a: the crew turn's boost this tick, RCS_TURN_BOOST or 1. It is boosted on a newtonianHelm class when
 *  all of these hold:
 *  - helmTurn turns;
 *  - the Engines turn the ship at all (Engineering's engine factor, from the effective Engines bars, above 0);
 *  - the target is far. For the aim or the held heading, far is |headingDelta| > BOOST_FAR. For auto-face, the led target
 *    lies outside BOOST_FACE_SIN of the nose, or behind it.
 *  Owner 2026-11-19: the boost is free (no gas to hold). Both far bands are wider than a boosted step, so the normal step
 *  and today's bands finish the turn and the nose never chatters. Pure, from the state before the step: the step and the
 *  app's prediction both call it. */
export function helmBoost(d: DuelState, h: HeldInput): number {
  const t = d.tactical, cls = classOf(t, 0);
  if (!cls.newtonianHelm || helmTurn(d, h) === 0 || shipEngineFactor(t, 0) <= 0) return 1;   // owner 2026-11-19: the gas is free
  if ((Math.sign(h.moveX) || 0) !== 0) return 1;   // owner 2026-11-19: A/D turn at the normal rate, unboosted
  const heading = t.ships[0].heading;
  if (h.face === true) {
    const p = autoFacePoint(t, 0), dist = Math.sqrt(p.x * p.x + p.y * p.y), h0 = hx(heading), h1 = hy(heading);
    const near = h0 * p.x + h1 * p.y > 0 && Math.abs(h0 * p.y - h1 * p.x) <= BOOST_FACE_SIN * dist;
    return near ? 1 : RCS_TURN_BOOST;
  }
  const aim = heldAim(h), target = aim >= 0 ? aim : d.holdHeading;   // helmTurn turns, so one of them is set
  return Math.abs(headingDelta(heading, target)) > BOOST_FAR ? RCS_TURN_BOOST : 1;
}

/** Playtest2feedback §3, §6: the axes the app predicts the crew ship flies on the next tick, from the state as it stands
 *  and a held input (so flyShip with them flies exactly what crewHelm's tick flies, final review M3):
 *  - the turn and its boost (helmTurn, helmBoost);
 *  - the thrust of one ramp step on the held throttle from `thrMille` (the duel's by default, or the app's local
 *    prediction of it), clamped to the Engines bars' floor and cap as the step clamps it (owner 2026-11-19);
 *  - the held thrusters, every one of which vents (owner 2026-11-19: free cold gas).
 *  Pure. */
export function crewAxes(d: DuelState, h: HeldInput, thrMille: number = d.thrMille): Axes {
  const boost = helmBoost(d, h), y = heldAxis(h.rcsY), x = heldAxis(h.rcsX), engine = engineBars(d);
  const thrust = crewThrust(rampThrottle(thrMille, heldAxis(h.throttleHeld), throttleFloor(engine), throttleCap(engine)));
  return { turn: helmTurn(d, h), turnBoost: boost, thrust, rcsX: x, rcsY: y };   // owner 2026-11-19: every held thruster vents
}

/** Playtest2feedback (spec §3, §4, §4a, §5, §7's step order 2 to 7): the crew Helm's tick on a newtonianHelm class,
 *  attended (`h` is the attendant's held input) or not (null). In order:
 *  - the turn and its boost, from the state before the step;
 *  - a held aim becomes the held heading, and A/D or auto-face clears it (owner 2026-11-19, as the other classes);
 *  - the throttle ramp on the attendant's throttleHeld (0 with no attendant), clamped to the Engines bars' floor and cap
 *    (owner 2026-11-19: Engineering's effective Engines bars, after this tick's ship commands);
 *  - the fore/aft and the side thruster, each venting whenever the attendant holds it (owner 2026-11-19: free cold gas, so
 *    no tank, no spend and no compressor);
 *  - this tick's helmVent;
 *  - the crew's axes, which fly attended or not.
 *  Runs only while the round runs (stepDuelTick). */
function crewHelm(d: DuelState, h: HeldInput | null, crew: ShipInput): void {
  const held = h ?? NO_HELD, turn = helmTurn(d, held), boost = helmBoost(d, held);
  if (h) {
    if ((Math.sign(h.moveX) || 0) !== 0 || h.face === true) d.holdHeading = -1;
    else if (heldAim(h) >= 0) d.holdHeading = heldAim(h);
  }
  const engine = engineBars(d);
  d.thrMille = rampThrottle(d.thrMille, h ? heldAxis(h.throttleHeld) : 0, throttleFloor(engine), throttleCap(engine));
  const rcsY = h ? heldAxis(h.rcsY) : 0, rcsX = h ? heldAxis(h.rcsX) : 0;   // owner 2026-11-19: free cold gas, no tank
  d.helmVent = { x: rcsX, y: rcsY, boosted: boost === RCS_TURN_BOOST, turn: boost === RCS_TURN_BOOST ? Math.sign(turn) || 0 : 0 };
  crew.helm = true;
  crew.axes = { turn, turnBoost: boost, thrust: crewThrust(d.thrMille), rcsX, rcsY };
}

/**
 * The next round (H-2 spec §7), built in place in `d` so every holder of the duel keeps it: a fresh duel (a fresh
 * interior world) from the round seed after this one, with the same Helm player and presence, whose every tick stamp
 * is moved to the encounter tick `tick`: the interior and tactical ticks, each ship's graceUntil, the hunter's last
 * launch and each live rock's clock t. A round started at `tick` behaves as a fresh duel started at 0 (tests/duelRounds.test.ts).
 */
function startRound(d: DuelState, tick: number): void {
  const next = createDuel(d.interior.layout, followingSeed(d.tactical.seed), d.helmPlayer, d.interior.playerCount, d.crewClass);   // Valkyrn spec §6.1: the class carries over
  next.present = d.present.slice();   // Sci-2 spec §7: an empty seat stays away in the next round
  next.round = d.round + 1; next.baseTick = tick; next.decidedTick = -1;
  next.interior.tick = tick; next.tactical.tick = tick;
  for (const ship of next.tactical.ships) ship.graceUntil.fill(tick);
  for (let k = 0; k < rockSlots(next.tactical); k++) if (rockAlive(next.tactical, k)) next.tactical.rocks[k * ROCK_STRIDE + 7] = tick;   // asteroids-iii §3.1: each rock's clock t, so the belt starts unturned
  next.tactical.hunter.lastLaunch += tick;
  next.tactical.startTick = tick;   // Sci-1 spec §4.1: the round's rules read rt = tick − startTick; hostileAt is round-relative
  disposeDuel(d);
  Object.assign(d, next);
}

/** A decided round's tick (the end card): no physics, both ticks advance, and every command gets a result. The first
 *  rematch from a present player is applied (a second in the tick is noop) and starts the next round on the next tick;
 *  presence applies as ever; every other duel command is rejected duel-decided. */
function stepDecided(d: DuelState, input: DuelInput): DuelResult[] {
  const st = d.interior, tick = st.tick, results: DuelResult[] = [];
  const result = (env: DuelEnvelope, reason?: DuelReason, status: DuelResult['status'] = 'applied'): void => {
    results.push(reason ? { id: env.id, tick, status: 'rejected', reason } : { id: env.id, tick, status });
  };
  resetScratch(d);
  d.events = []; d.tactical.events = []; d.helmVent = noVent();   // playtest2feedback §4: the end card vents nothing
  const presentBefore = d.present.slice();
  let rematch = false;
  for (const e of input.commands) {
    const c = e.command;
    if (c.kind === 'rematch') {
      if (e.requestedTick !== tick) result(e, 'stale-tick');
      else if (!presentBefore[e.id.player]) result(e, 'unavailable');
      else if (rematch) result(e, undefined, 'noop');
      else { rematch = true; result(e); }
    } else if (c.kind === 'presence') {
      if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
      if (!validPlayer(d, e.id.player) || typeof c.present !== 'boolean') { result(e, 'malformed'); continue; }
      d.present[e.id.player] = c.present; result(e);
    } else result(e, DUEL_KINDS.includes(c.kind) ? 'duel-decided' : 'not-in-duel');
  }
  if (rematch) startRound(d, tick + 1);
  else { st.tick++; d.tactical.tick++; }
  return results.sort((a, b) => a.id.player - b.id.player || a.id.sequence - b.id.sequence);
}

/**
 * Spec §13, in order: scratch reset (and d.events cleared); seat phase (sit through today's interaction validation,
 * only at the three role consoles (Navigation, Weapons, Science); stand through today's handler; then presence); tactical commands validated against the
 * seats after the seat phase and folded into the crew's ShipInput; the Helm's throttle (Artemis spec §5.2); laserFrequency, designate and contactScan (Sci-1 spec §5); repair, with its events; movement for standing
 * present players; the tactical stepDuel; hit damage to the crew; the doors; fire (the damage cadence, then the hits' fire and breach rolls); the bar clamp; on the hazard tick Life Support, oxygen, fire growth and spread, and heat (Engineering spike spec §7);
 * health (fire damage, downed, pick-up, the Medbay, the all-down loss); the interior tick. Commands apply in the order given (the authority's
 * envelope order). Returns one result per command, sorted by player then sequence. A rematch while the round runs is
 * rejected duel-running; the step that decides the round records `decidedTick`. A decided round steps by stepDecided.
 */
export function stepDuelTick(d: DuelState, input: DuelInput): DuelResult[] {
  if (d.tactical.outcome !== Outcome.Running) return stepDecided(d, input);
  const st = d.interior, tick = st.tick, results: DuelResult[] = [];
  const result = (env: DuelEnvelope, reason?: DuelReason, status: DuelResult['status'] = 'applied'): void => {
    results.push(reason ? { id: env.id, tick, status: 'rejected', reason } : { id: env.id, tick, status });
  };
  resetScratch(d);
  d.events = [];

  // Seat phase: sits (today's validation), then stands (today's handler), then presence.
  const away = (e: DuelEnvelope): boolean => !d.present[e.id.player];   // an away character stays exactly where it is (spec §8)
  const sits = input.commands.filter((e) => e.command.kind === 'sit');
  const roleConsole = (station: number): boolean => station === d.nav || station === d.weapons || (d.science >= 0 && station === d.science);   // Sci-1 spec §6.1
  const allowedSits = sits.filter((e) => e.command.kind === 'sit' && roleConsole(e.command.station));
  for (const e of sits) if (!allowedSits.includes(e)) result(e, 'not-in-duel');
  const liveSits = allowedSits.filter((e) => { if (!away(e)) return true; result(e, 'unavailable'); return false; });
  applyInteractionCommands(st, liveSits.map(sector));
  for (const r of st.scratch.commandResults) results.push({ id: r.id, tick, status: r.status, ...(r.reason ? { reason: r.reason } : {}) });
  for (const e of input.commands) if (e.command.kind === 'stand') {
    if (away(e)) { result(e, 'unavailable'); continue; }
    const r = applyConsoleCommand(st, sector(e));
    results.push({ id: r.id, tick, status: r.status, ...(r.reason ? { reason: r.reason } : {}) });
  }
  for (const e of input.commands) if (e.command.kind === 'presence') {
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (!validPlayer(d, e.id.player) || typeof e.command.present !== 'boolean') { result(e, 'malformed'); continue; }
    d.present[e.id.player] = e.command.present; result(e);
  }

  // Tactical commands, against the seats as they now stand. Within a tick they take effect in a fixed order, lock, then
  // the torpedo's target (FTL targeting spec §2), then the rock target (rockLock), then charge, then launch (the order applyWeaponsInput applies them), whatever their envelope order; admission is checked
  // in that same order so every result matches what happens. Within one kind, envelope order holds and the last wins. W-1: pewFire last; only the first in a tick fires (the rest noop). W-2: laserMode first, set at once (as laserFrequency is), so a same-tick laserCharge or laserFire is judged in the new mode; laserFire after laserCharge, the first in a tick fires. W-3: torpMode second, set at once, so a same-tick missileLaunch is judged in the new mode. W-4: gunMode third, set at once, so a same-tick pewFire is judged in the new mode; one gun a command (amendment §2.2).
  const helm = attendant(d, d.nav), gunner = attendant(d, d.weapons);
  const gunnerHeld = gunner >= 0 ? input.held[gunner] ?? NO_HELD : NO_HELD, weaponSel = gunner >= 0 ? heldWeaponSel(gunnerHeld) : -1;
  // W-4 spec §8: on a turret class (the Hound) the trigger fires the autocannon only while it is the selected weapon, and
  // (W-4 spec §7) never while the crew's MANUAL torpedo flies as the tick starts; elsewhere today's rule.
  const turretClass = hasTurret(classOf(d.tactical, 0)), flying = turretClass && manualTorpedoFlying(d.tactical);
  const trigger = gunner >= 0 && gunnerHeld.gunHeld === true && (!turretClass || (weaponSel === WeaponSlot.Autocannon && !flying));
  const crew: ShipInput = { helm: helm >= 0, weapons: gunner >= 0, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, rockLock: { laser: null, torpedo: null }, laserCharge: null, missileLaunch: false,
    gunHeld: trigger, pewAim: -1, laserFire: -1, torpHeading: gunner >= 0 ? heldTorpHeading(gunnerHeld) : -1, weaponSel, pewTrigger: false, turretAim: gunner >= 0 ? heldTurretAim(gunnerHeld) : -1, scanner: true };   // W-4 spec §8: the reticle; Valkyrn spec §7.1: the trigger of Weapons' attendant; W-2: laserFire sets laserFire; W-3: the held steering; W-4: only Weapons' attendant flies the MANUAL torpedo; W-4: pewFire sets pewTrigger
  // Spike ii §6.1: missileLaunch is admitted with this tick's effective torpedo rock target: the last accepted
  // rockLock(torpedo), else −1 after an accepted torpLock (it clears torpRock first), else the stored value.
  let torpRockNext: number | null = null, torpLocked = false;
  for (const e of WEAPON_ORDER.flatMap((kind) => input.commands.filter((x) => x.command.kind === kind))) {
    const c = e.command, sys0 = d.tactical.systems[0];
    if (c.kind !== 'laserMode' && c.kind !== 'torpMode' && c.kind !== 'gunMode' && c.kind !== 'laserLock' && c.kind !== 'torpLock' && c.kind !== 'rockLock' && c.kind !== 'laserCharge' && c.kind !== 'laserFire' && c.kind !== 'missileLaunch' && c.kind !== 'pewFire') continue;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (gunner < 0 || e.id.player !== gunner) { result(e, 'not-at-weapons'); continue; }   // −1 is the empty-seat value, never a player
    // Valkyrn spec §6.1: no laser; W-2: nor its mode or MANUAL shot. W-4 amendment §3.2: on a class with a turret gun (the Hound) laserLock is the target room's command, so it is not caught here.
    if ((c.kind === 'laserMode' || (c.kind === 'laserLock' && !hasTurret(classOf(d.tactical, 0))) || c.kind === 'laserCharge' || c.kind === 'laserFire' || (c.kind === 'rockLock' && c.weapon === 'laser')) && classOf(d.tactical, 0).slots.laser === null) { result(e, 'unavailable'); continue; }
    if (c.kind === 'pewFire' && classOf(d.tactical, 0).slots.pew === null) { result(e, 'unavailable'); continue; }   // W-1: no pew (the Valkyrn)
    if (c.kind === 'laserMode') {   // W-2 (pew pew spec §2): the mode, set now
      if (typeof c.manual !== 'boolean') { result(e, 'malformed'); continue; }
      if (c.manual === sys0.laserManual) { result(e, undefined, 'noop'); continue; }
      sys0.laserManual = c.manual;
    }
    else if (c.kind === 'torpMode') {   // W-3 (pew pew spec §3): the torpedo's mode, set now (a flying torpedo keeps the mode it launched with)
      if (typeof c.manual !== 'boolean') { result(e, 'malformed'); continue; }
      if (c.manual === sys0.torpManual) { result(e, undefined, 'noop'); continue; }
      sys0.torpManual = c.manual;
    }
    else if (c.kind === 'gunMode') {   // W-4 spec §4.1, amendment §2.2: one gun's mode (slot 0 pew pew, 1 the autocannon), set now, so a same-tick pewFire is judged in it
      if ((c.slot !== 0 && c.slot !== 1) || typeof c.manual !== 'boolean') { result(e, 'malformed'); continue; }
      const slots = classOf(d.tactical, 0).slots, key = c.slot === 0 ? 'pewManual' : 'gunManual';
      if (((c.slot === 0 ? slots.pew : slots.gun)?.turret ?? null) === null) { result(e, 'unavailable'); continue; }   // no turret in that slot: the Valkyrn and its laser fit
      if (c.manual === sys0[key]) { result(e, undefined, 'noop'); continue; }   // that gun's mode is unchanged (a second for the slot in a tick is judged against the first)
      sys0[key] = c.manual;
    }
    else if (c.kind === 'laserLock') {
      if (!validTarget(c.room)) { result(e, 'malformed'); continue; }
      if (c.room < 0 && classOf(d.tactical, 0).slots.laser === null) { result(e, 'unavailable'); continue; }   // W-4 amendment §3.2: the Hound's target room has no "none": nothing to clear
      if (c.room >= 0 && !shipSeen(d.tactical, d.tactical.systems[0].target)) { result(e, 'unavailable'); continue; }   // Task 10, spec §10.4: seen
      crew.laserLock = c.room;   // −1 clears the laser's target (a laser class only)
    }
    else if (c.kind === 'torpLock') { if (!validTarget(c.room)) { result(e, 'malformed'); continue; } if (c.room >= 0 && !shipSeen(d.tactical, d.tactical.systems[0].target)) { result(e, 'unavailable'); continue; } crew.torpLock = c.room; torpLocked = true; }   // spec §10.4: seen
    else if (c.kind === 'rockLock') {
      if (!validRockLock(d.tactical, c.weapon, c.rock)) { result(e, 'malformed'); continue; }
      if (c.rock >= 0 && !rockAlive(d.tactical, c.rock)) { result(e, undefined, 'noop'); continue; }
      if (c.weapon === 'laser') crew.rockLock.laser = c.rock; else { crew.rockLock.torpedo = c.rock; torpRockNext = c.rock; }
    }
    else if (c.kind === 'laserCharge') {
      if (sys0.laserManual) { result(e, 'unavailable'); continue; }   // W-2: in MANUAL Space is laserFire
      if (!canCharge(d.tactical, 0)) { result(e, 'missile-in-flight'); continue; }
      crew.laserCharge = c.held;
    }
    else if (c.kind === 'laserFire') {   // W-2 (pew pew spec §2, §4): the aim, the mode, one shot a tick, no torpedo flying, then a full charge (NO CHARGE)
      if (!validAim(c.aim, c.aimAcc)) { result(e, 'malformed'); continue; }
      if (!sys0.laserManual) { result(e, 'unavailable'); continue; }
      if (crew.laserFire >= 0) { result(e, undefined, 'noop'); continue; }
      if (!canCharge(d.tactical, 0)) { result(e, 'missile-in-flight'); continue; }
      if (!manualLaserReady(d.tactical, 0)) { result(e, 'unavailable'); continue; }
      crew.laserFire = c.aim * HEADING_COUNT + c.aimAcc;
    }
    else if (c.kind === 'missileLaunch') {
      const torpRock = torpRockNext ?? (torpLocked ? -1 : d.tactical.systems[0].torpRock);
      if (!canLaunch(d.tactical, 0, torpRock)) { result(e, 'unavailable'); continue; }
      crew.missileLaunch = true;
    }
    else {   // W-4 spec §6: no aim; MAN only; one round a tick (the first wins), then a pew pew bar and a third stored (pewReady)
      if (!sys0.pewManual) { result(e, 'unavailable'); continue; }   // W-4b, amendment §2.3: pew pew's own switch; on AUTO it fires itself
      if (manualTorpedoFlying(d.tactical)) { result(e, 'missile-in-flight'); continue; }   // W-4 spec §6, §7: no gun is fired by hand while the MANUAL torpedo flies
      if (crew.pewTrigger) { result(e, undefined, 'noop'); continue; }
      if (!pewReady(d.tactical, 0)) { result(e, 'unavailable'); continue; }
      crew.pewTrigger = true;
    }
    result(e);
  }
  // The Helm's throttle (Artemis spec §5.2), against the seats as they now stand: stale, then the Helm attendant, then
  // the level, then noop. Envelope order holds and the last applied level wins.
  for (const e of input.commands) if (e.command.kind === 'throttle') {
    const level = e.command.level;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (helm < 0 || e.id.player !== helm) { result(e, 'invalid-seat'); continue; }
    if (classOf(d.tactical, 0).newtonianHelm) { result(e, 'unavailable'); continue; }   // playtest2feedback §3: the crew Helm holds its throttle (Decision 6)
    if (!validThrottle(level)) { result(e, 'malformed'); continue; }
    if (!throttleAllowed(d.tactical.systems[0], level)) { result(e, 'unavailable'); continue; }   // Task 8, spec §10.2: the Engines cap
    if (level === d.throttle) { result(e, undefined, 'noop'); continue; }
    d.throttle = level; result(e);
  }
  // Feel-ii's click-to-heading (Feel-ii spec §1.1), checked like the throttle: stale, the Helm attendant, the heading
  // (−1 or 0..255), then noop. Envelope order holds and the last applied heading wins.
  for (const e of input.commands) if (e.command.kind === 'heading') {
    const h = e.command.heading;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (helm < 0 || e.id.player !== helm) { result(e, 'invalid-seat'); continue; }
    if (!validHoldHeading(h)) { result(e, 'malformed'); continue; }
    if (h === d.holdHeading) { result(e, undefined, 'noop'); continue; }
    d.holdHeading = h; result(e);
  }
  // Sci-1 (spec §5), against the seats as they now stand: every laserFrequency in envelope order, then every designate,
  // then every contactScan; each is checked for stale-tick first, and within a kind the last applied wins.
  const t = d.tactical, scientist = d.science >= 0 ? attendant(d, d.science) : -1;
  for (const e of input.commands) if (e.command.kind === 'laserFrequency') {
    const freq = e.command.freq;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (gunner < 0 || e.id.player !== gunner) { result(e, 'not-at-weapons'); continue; }
    if (classOf(t, 0).slots.laser === null && !hasTurret(classOf(t, 0))) { result(e, 'unavailable'); continue; }   // Valkyrn spec §6.1: nothing to tune; W-4 spec §5.2: the Hound's guns tune
    if (!Number.isInteger(freq) || freq < 0 || freq > 2) { result(e, 'malformed'); continue; }
    if (freq === t.systems[0].freq) { result(e, undefined, 'noop'); continue; }
    t.systems[0].freq = freq; result(e);
  }
  for (const e of input.commands) if (e.command.kind === 'designate') {
    const c = e.command.contact;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (scientist < 0 || e.id.player !== scientist) { result(e, 'invalid-seat'); continue; }
    if (c !== -1 && c !== 0 && c !== 1) { result(e, 'malformed'); continue; }
    if (c >= 0 && !contactSeen(t, c)) { result(e, 'unavailable'); continue; }   // Task 10, spec §10.4
    if (c === t.designated) { result(e, undefined, 'noop'); continue; }
    t.designated = c; result(e);
  }
  for (const e of input.commands) if (e.command.kind === 'contactScan') {
    const c = e.command.contact, station = scanStation(d, e.id.player);
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (station < 0) { result(e, 'invalid-seat'); continue; }
    if (c !== 0 && c !== 1) { result(e, 'malformed'); continue; }
    if (t.known[c]! >= CONTACT_MAX_LEVEL[c]!) { result(e, 'unavailable'); continue; }
    if (effectiveBars(t.systems[0], DuelSystem.Sensors) === 0) { result(e, 'unavailable'); continue; }   // Task 10, spec §2 Scans: no Sensors, no scan
    if (!contactSeen(t, c)) { result(e, 'unavailable'); continue; }   // Task 10, spec §10.4: unseen
    result(e, undefined, scanCommand(t, c, station === d.science ? SCAN_RATE_SCIENCE : SCAN_RATE_OTHER, station));
  }
  crew.scanner = t.scan.contact < 0 || attendant(d, t.scan.by) >= 0;   // spec §4.6: after admission, so a same-tick takeover keeps it
  // Engineering spike spec §7 (Decision 12): shipPower, shipCoolant, shipDoor and shipAirlock from any valid, present,
  // conscious player, seated or standing, with no range or view check, applied in (player, sequence) order so the last
  // in player order wins. The tactical admissions above read the bars as they stood at the start of the tick.
  const engineer = (pid: number): boolean => validPlayer(d, pid) && d.present[pid] === true && conscious(d, pid);
  const shipCommands = input.commands.filter((e) => SHIP_KINDS.has(e.command.kind)).sort((a, b) => a.id.player - b.id.player || a.id.sequence - b.id.sequence);
  for (const e of shipCommands) {
    const c = e.command;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    const wellFormed = c.kind === 'shipPower' ? validSystem(c.system) && (c.delta === 1 || c.delta === -1)
      : c.kind === 'shipCoolant' ? Number.isInteger(c.system) && c.system >= 0 && c.system < OVERDRIVE_SYSTEMS
      : c.kind === 'shipDoor' ? validDoor(d, c.edge)
      : c.kind === 'shipAirlock' ? validAirlock(d, c.index) : false;
    if (!wellFormed) { result(e, 'malformed'); continue; }
    if (!engineer(e.id.player)) { result(e, 'unavailable'); continue; }
    if (c.kind === 'shipPower') { if (applyPower(d, c.system, c.delta) === 'applied') result(e); else result(e, 'unavailable'); }
    else if (c.kind === 'shipCoolant') result(e, undefined, cycleDuelCoolant(d, c.system));
    else if (c.kind === 'shipDoor') { toggleDoor(d, c.edge); result(e); }
    else if (c.kind === 'shipAirlock') { toggleAirlock(d, c.index); result(e); }
  }
  // Task 9a, spec §10.3: weaponPower from the Weapons seat's attendant, in (player, sequence) order: stale, the seat,
  // the slot and delta, then the allocation rules.
  for (const e of input.commands.filter((x) => x.command.kind === 'weaponPower').sort((a, b) => a.id.player - b.id.player || a.id.sequence - b.id.sequence)) {
    const c = e.command;
    if (c.kind !== 'weaponPower') continue;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (gunner < 0 || e.id.player !== gunner) { result(e, 'not-at-weapons'); continue; }
    if (!Number.isInteger(c.slot) || c.slot < 0 || c.slot >= WEAPON_SLOTS || (c.delta !== 1 && c.delta !== -1)) { result(e, 'malformed'); continue; }
    if (applyWeaponPower(d, c.slot, c.delta) === 'applied') result(e); else result(e, 'unavailable');
  }
  clampThrottle(d);   // Task 8, spec §10.2: an Engines bar removed this tick lowers the throttle before the axes read it
  for (const e of input.commands) if (e.command.kind === 'rematch') result(e, 'duel-running');
  for (const e of input.commands) if (!DUEL_KINDS.includes(e.command.kind)) result(e, 'not-in-duel');
  // Artemis spec §5.3: held moveX turns, the throttle thrusts; held moveY no longer does. Feel-i (console feel spec §2):
  // the Helm's held `face` turns the nose onto the enemy's lead point instead, unless A/D turns. Feel-ii (spec §1.1): A/D
  // or auto-face held at the Helm clears a held heading; otherwise a held heading turns the nose onto its bearing.
  // Valkyrn spec §6.2: a held aim turns before the held heading, and when neither A/D nor auto-face is held a valid aim
  // becomes the held heading. Valkyrn spec §4.4: with the Helm empty, a layout whose Helm holds unattended flies its
  // throttle and held heading; any other (the Hound's) flies zero axes as before.
  // Playtest2feedback §3: a newtonianHelm class runs crewHelm instead, attended or not.
  if (classOf(t, 0).newtonianHelm) crewHelm(d, helm >= 0 ? input.held[helm] ?? NO_HELD : null, crew);   // playtest2feedback §3, §7: attended or not
  else if (helm >= 0) {
    const h = input.held[helm] ?? NO_HELD;
    crew.axes = { turn: helmTurn(d, h), thrust: throttleThrust(d.throttle) };
    if ((Math.sign(h.moveX) || 0) !== 0 || h.face === true) d.holdHeading = -1;
    else if (heldAim(h) >= 0) d.holdHeading = heldAim(h);
  } else if (st.layout.helmHoldsUnattended === true) {
    crew.helm = true;   // stepDuel flies a ship's axes only while its Helm flies (Decision 13); Weapons stays the seat rule
    crew.axes = { turn: d.tactical.outcome === Outcome.Running && d.holdHeading >= 0 ? headingTurn(d.tactical, 0, d.holdHeading) : 0, thrust: throttleThrust(d.throttle) };
  }

  repairPhase(d, input.held);
  const intents: Intent[] = Array.from({ length: st.playerCount }, (_, pid) => {
    const h = input.held[pid] ?? NO_HELD;
    return d.present[pid] ? { ...NEUTRAL_INTENT, moveX: h.moveX, moveY: h.moveY } : { ...NEUTRAL_INTENT };
  });
  movementSystem(st, intents);   // skips seated and downed crew, and anyone who stood this tick
  doorSystem(st);   // Engineering spike spec §5: auto doors open for crew and close behind (the Doors station stays online)
  stepDuel(d.tactical, crew);
  const hits = applyHitDamage(d, d.tactical.events);   // duel-health spec §1.2: hit damage in tactical event order, before the fire rolls
  firePhase(d, tick);   // duel-fire spec §1: the damage cadence, then this tick's hits roll (rng.hazards)
  clampToCapacity(d);   // Engineering spike spec §7: excess bars back to the pool after every damage rise this tick
  if ((tick - d.baseTick) % HAZARD_EVERY === 0) {   // Engineering spike spec §7 (Decision 13): the hazard tick, 12 Hz
    const vented = duelInjection(d);   // fire venting (owner 2026-11-19): no Life Support into a section open to space
    oxygenStep(st, st.injectionScratch, DUEL_FIRE_O2_RATE);   // the duel fire's own oxygen use
    fireStep(st, vented);   // a fire in a section open to space shrinks below FIRE_GROW_FRAC
    duelHeatStep(d);   // overheat draws last; each overheat clamps its bars inline
    clampToCapacity(d);   // Task 10, spec §10.4: a fire that spread into the Sensors room costs it a slot this tick
  }
  healthPhase(d, hits);   // duel-health spec §1: fire damage, downed, pick-up, the Medbay; every character down loses the round
  st.tick++;
  if (d.tactical.outcome !== Outcome.Running) d.decidedTick = st.tick;   // the snapshot tick of the first decided publication
  return results.sort((a, b) => a.id.player - b.id.player || a.id.sequence - b.id.sequence);
}

// One duel tick (spec §13 phase list). The sector step (sim/step.ts) is never called on the duel's interior; this runs
// only the interior pieces the duel uses (sit, stand, Interact for repair, movement) and then the tactical stepDuel.
// H-2 spec §7: a duel is a series of rounds in one run. A decided round's ticks keep advancing with no physics (the end
// card), every command still gets a result, and a `rematch` there starts the next round on the following tick.
import { NEUTRAL_INTENT, type Intent } from '../../../../shared/intent';
import type { CommandEnvelope, HeldInput } from '../../net/contracts';
import { applyConsoleCommand, applyInteractionCommands } from '../commands';
import { Life, LifeState, Position, Seated } from '../components';
import { roomAt } from '../grid';
import { inReachOfTile } from '../interact';
import { movementSystem } from '../movement';
import { stepDuel } from '../tactical/duel';
import { autoFaceTurn, headingTurn } from '../tactical/hunter';
import { scanCommand } from '../tactical/science';
import { HEADING_COUNT, SCAN_RATE_OTHER, SCAN_RATE_SCIENCE } from '../tactical/tuning';
import { classOf, CONTACT_MAX_LEVEL, Outcome } from '../tactical/state';
import { canCharge, canLaunch, validTarget, type ShipInput } from '../tactical/weapons';
import type { DuelEnvelope, DuelReason, DuelResult } from './commands';
import { extinguishWork, firePhase, pointBurning } from './fire';
import { applyHitDamage, healthPhase } from './health';
import { followingSeed } from './seeds';
import { throttleThrust, validHoldHeading, validThrottle } from './throttle';
import { createDuel, disposeDuel, type DuelState } from './state';
import { REPAIR_RATE_SOLO, REPAIR_RATE_TEAM, REPAIR_UNITS } from './tuning';

export interface DuelInput { held: readonly HeldInput[]; commands: readonly DuelEnvelope[] }

const NO_HELD: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
/** The fixed order weapon commands take effect in within one tick. */
const WEAPON_ORDER = ['laserLock', 'torpLock', 'laserCharge', 'missileLaunch'] as const;
/** Every duel command kind the step handles; any other kind is rejected not-in-duel. */
const DUEL_KINDS = ['sit', 'stand', 'presence', 'laserLock', 'torpLock', 'laserCharge', 'missileLaunch', 'rematch', 'throttle', 'heading', 'contactScan', 'designate', 'laserFrequency'];

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

/** Each standing, present, conscious player holding Interact inside a damaged or burning room's repair room and in reach
 *  of its point. A burning room's workers put the fire out instead of repairing (duel-fire spec §1.4), and its repair
 *  progress holds. Pushes a repairWork or fireWork event per worker in player order, then per Room in Room order a
 *  repairDone when its level drops or a fireOut when its fire goes out (H-0c-ii-a spec §4). */
function repairPhase(d: DuelState, held: readonly HeldInput[]): void {
  const crewShip = d.tactical.systems[0], workers: number[][] = [[], [], []];
  for (let pid = 0; pid < d.interior.playerCount; pid++) {
    if (!d.present[pid] || !conscious(d, pid) || seated(d, pid) || !(held[pid] ?? NO_HELD).interactHeld) continue;
    const eid = d.interior.crew[pid]!, here = roomAt(d.interior, Position.x[eid]!, Position.y[eid]!);
    const point = d.points.find((p) => (crewShip.rooms[p.tacticalRoom]! > 0 || pointBurning(d, p)) && p.room === here && inReachOfTile(d.interior, eid, p.tile));
    if (!point) continue;
    workers[point.tacticalRoom]!.push(pid);
    d.events.push({ kind: pointBurning(d, point) ? 'fireWork' : 'repairWork', player: pid, room: point.tacticalRoom });
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
}

/** Valkyrn spec §6.2: a held aim, a heading index 0..255; absent, −1, NaN, a non-integer or out of range is −1 (none). */
export function heldAim(h: HeldInput): number {
  const a = h.aim;
  return typeof a === 'number' && Number.isInteger(a) && a >= 0 && a < HEADING_COUNT ? a : -1;
}

/** Valkyrn spec §6.2: the turn from `heading` toward the aim index `aim`. The signed index difference is
 *  d = ((aim − heading + 384) mod 256) − 128: none when |d| ≤ 1, else its sign. The band of three indices is wider than
 *  one tick's integer step (defs.ts asserts every class turns fewer than 3 steps a tick), so the nose never steps across
 *  it. Pure; only + − and the integer modulo. */
export function aimTurn(heading: number, aim: number): number {
  const d = ((aim - heading + HEADING_COUNT + HEADING_COUNT / 2) % HEADING_COUNT) - HEADING_COUNT / 2;
  return d >= -1 && d <= 1 ? 0 : Math.sign(d);
}

/** The turn the Helm attendant's held input flies this tick (Artemis spec §5.3, Feel-i, Feel-ii spec §1.1, Valkyrn spec
 *  §6.2): A/D, else auto-face's turn, else the aim's, else the held heading's, else none. Pure; reads the state before
 *  the step (the app's predicted path calls it too). */
export function helmTurn(d: DuelState, h: HeldInput): number {
  if ((Math.sign(h.moveX) || 0) !== 0) return h.moveX;
  if (d.tactical.outcome !== Outcome.Running) return 0;
  if (h.face === true) return autoFaceTurn(d.tactical, 0);
  const aim = heldAim(h);
  if (aim >= 0) return aimTurn(d.tactical.ships[0].heading, aim);
  return d.holdHeading >= 0 ? headingTurn(d.tactical, 0, d.holdHeading) : 0;
}

/**
 * The next round (H-2 spec §7), built in place in `d` so every holder of the duel keeps it: a fresh duel (a fresh
 * interior world) from the round seed after this one, with the same Helm player and presence, whose every tick stamp
 * is moved to the encounter tick `tick`: the interior and tactical ticks, each ship's graceUntil and the hunter's last
 * launch. A round started at `tick` behaves as a fresh duel started at 0 (tests/duelRounds.test.ts).
 */
function startRound(d: DuelState, tick: number): void {
  const next = createDuel(d.interior.layout, followingSeed(d.tactical.seed), d.helmPlayer, d.interior.playerCount, d.crewClass);   // Valkyrn spec §6.1: the class carries over
  next.present = d.present.slice();   // Sci-2 spec §7: an empty seat stays away in the next round
  next.round = d.round + 1; next.baseTick = tick; next.decidedTick = -1;
  next.interior.tick = tick; next.tactical.tick = tick;
  for (const ship of next.tactical.ships) ship.graceUntil.fill(tick);
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
  d.events = []; d.tactical.events = [];
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
 * present players; the tactical stepDuel; hit damage to the crew; fire (growth, damage, ignition from this tick's hits);
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
  // the torpedo's target (FTL targeting spec §2), then charge, then launch (the order applyWeaponsInput applies them), whatever their envelope order; admission is checked
  // in that same order so every result matches what happens. Within one kind, envelope order holds and the last wins.
  const helm = attendant(d, d.nav), gunner = attendant(d, d.weapons);
  const crew: ShipInput = { helm: helm >= 0, weapons: gunner >= 0, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, laserCharge: null, missileLaunch: false,
    gunHeld: gunner >= 0 && (input.held[gunner] ?? NO_HELD).gunHeld === true, pewAim: -1, scanner: true };   // Valkyrn spec §7.1: the trigger of Weapons' attendant; W-1: pewFire sets pewAim (Task 4)
  for (const e of WEAPON_ORDER.flatMap((kind) => input.commands.filter((x) => x.command.kind === kind))) {
    const c = e.command;
    if (c.kind !== 'laserLock' && c.kind !== 'torpLock' && c.kind !== 'laserCharge' && c.kind !== 'missileLaunch') continue;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (gunner < 0 || e.id.player !== gunner) { result(e, 'not-at-weapons'); continue; }   // −1 is the empty-seat value, never a player
    if ((c.kind === 'laserLock' || c.kind === 'laserCharge') && classOf(d.tactical, 0).slots.laser === null) { result(e, 'unavailable'); continue; }   // Valkyrn spec §6.1: no laser
    if (c.kind === 'laserLock') { if (!validTarget(c.room)) { result(e, 'malformed'); continue; } crew.laserLock = c.room; }   // −1 clears the target
    else if (c.kind === 'torpLock') { if (!validTarget(c.room)) { result(e, 'malformed'); continue; } crew.torpLock = c.room; }
    else if (c.kind === 'laserCharge') { if (!canCharge(d.tactical, 0)) { result(e, 'missile-in-flight'); continue; } crew.laserCharge = c.held; }
    else { if (!canLaunch(d.tactical, 0)) { result(e, 'unavailable'); continue; } crew.missileLaunch = true; }
    result(e);
  }
  // The Helm's throttle (Artemis spec §5.2), against the seats as they now stand: stale, then the Helm attendant, then
  // the level, then noop. Envelope order holds and the last applied level wins.
  for (const e of input.commands) if (e.command.kind === 'throttle') {
    const level = e.command.level;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (helm < 0 || e.id.player !== helm) { result(e, 'invalid-seat'); continue; }
    if (!validThrottle(level)) { result(e, 'malformed'); continue; }
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
    if (classOf(t, 0).slots.laser === null) { result(e, 'unavailable'); continue; }   // Valkyrn spec §6.1: no laser to tune
    if (!Number.isInteger(freq) || freq < 0 || freq > 2) { result(e, 'malformed'); continue; }
    if (freq === t.systems[0].freq) { result(e, undefined, 'noop'); continue; }
    t.systems[0].freq = freq; result(e);
  }
  for (const e of input.commands) if (e.command.kind === 'designate') {
    const c = e.command.contact;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (scientist < 0 || e.id.player !== scientist) { result(e, 'invalid-seat'); continue; }
    if (c !== -1 && c !== 0 && c !== 1) { result(e, 'malformed'); continue; }
    if (c === t.designated) { result(e, undefined, 'noop'); continue; }
    t.designated = c; result(e);
  }
  for (const e of input.commands) if (e.command.kind === 'contactScan') {
    const c = e.command.contact, station = scanStation(d, e.id.player);
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (station < 0) { result(e, 'invalid-seat'); continue; }
    if (c !== 0 && c !== 1) { result(e, 'malformed'); continue; }
    if (t.known[c]! >= CONTACT_MAX_LEVEL[c]!) { result(e, 'unavailable'); continue; }
    result(e, undefined, scanCommand(t, c, station === d.science ? SCAN_RATE_SCIENCE : SCAN_RATE_OTHER, station));
  }
  crew.scanner = t.scan.contact < 0 || attendant(d, t.scan.by) >= 0;   // spec §4.6: after admission, so a same-tick takeover keeps it
  for (const e of input.commands) if (e.command.kind === 'rematch') result(e, 'duel-running');
  for (const e of input.commands) if (!DUEL_KINDS.includes(e.command.kind)) result(e, 'not-in-duel');
  // Artemis spec §5.3: held moveX turns, the throttle thrusts; held moveY no longer does. Feel-i (console feel spec §2):
  // the Helm's held `face` turns the nose onto the enemy's lead point instead, unless A/D turns. Feel-ii (spec §1.1): A/D
  // or auto-face held at the Helm clears a held heading; otherwise a held heading turns the nose onto its bearing.
  // Valkyrn spec §6.2: a held aim turns before the held heading, and when neither A/D nor auto-face is held a valid aim
  // becomes the held heading. Valkyrn spec §4.4: with the Helm empty, a layout whose Helm holds unattended flies its
  // throttle and held heading; any other (the Hound's) flies zero axes as before.
  if (helm >= 0) {
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
  stepDuel(d.tactical, crew);
  const hits = applyHitDamage(d, d.tactical.events);   // duel-health spec §1.2: hit damage in tactical event order, before the fire rolls
  firePhase(d, tick);   // duel-fire spec §1: growth and damage, then this tick's hits roll (rng.hazards)
  healthPhase(d, hits);   // duel-health spec §1: fire damage, downed, pick-up, the Medbay; every character down loses the round
  st.tick++;
  if (d.tactical.outcome !== Outcome.Running) d.decidedTick = st.tick;   // the snapshot tick of the first decided publication
  return results.sort((a, b) => a.id.player - b.id.player || a.id.sequence - b.id.sequence);
}

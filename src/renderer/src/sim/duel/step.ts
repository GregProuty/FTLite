// One duel tick (spec §13 phase list). The sector step (sim/step.ts) is never called on the duel's interior; this runs
// only the interior pieces the duel uses (sit, stand, Interact for repair, movement) and then the tactical stepDuel.
import { NEUTRAL_INTENT, type Intent } from '../../../../shared/intent';
import type { CommandEnvelope, HeldInput } from '../../net/contracts';
import { applyConsoleCommand, applyInteractionCommands } from '../commands';
import { Life, LifeState, Position, Seated } from '../components';
import { roomAt } from '../grid';
import { inReachOfTile } from '../interact';
import { movementSystem } from '../movement';
import { stepDuel } from '../tactical/duel';
import { Outcome } from '../tactical/state';
import { canCharge, canLaunch, validLock, type ShipInput } from '../tactical/weapons';
import type { DuelEnvelope, DuelReason, DuelResult } from './commands';
import type { DuelState } from './state';
import { REPAIR_RATE_SOLO, REPAIR_RATE_TEAM, REPAIR_UNITS } from './tuning';

export interface DuelInput { held: readonly HeldInput[]; commands: readonly DuelEnvelope[] }

const NO_HELD: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
/** The fixed order weapon commands take effect in within one tick. */
const WEAPON_ORDER = ['laserLock', 'laserCharge', 'missileLaunch'] as const;

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
  return pid >= 0 && d.present[pid as 0 | 1] ? pid : -1;
}

function conscious(d: DuelState, pid: number): boolean { return Life.state[d.interior.crew[pid]!] === LifeState.Conscious; }
function seated(d: DuelState, pid: number): boolean { return Seated.station[d.interior.crew[pid]!]! >= 0; }

/** Each standing, present, conscious player holding Interact inside a damaged room's repair room and in reach of its
 *  point. Pushes a repairWork event per worker and a repairDone event per room whose level drops (H-0c-ii-a spec §4). */
function repairPhase(d: DuelState, held: readonly HeldInput[]): void {
  const crewShip = d.tactical.systems[0], workers: number[][] = [[], [], []];
  for (let pid = 0; pid < 2; pid++) {
    if (!d.present[pid as 0 | 1] || !conscious(d, pid) || seated(d, pid) || !(held[pid] ?? NO_HELD).interactHeld) continue;
    const eid = d.interior.crew[pid]!, here = roomAt(d.interior, Position.x[eid]!, Position.y[eid]!);
    const point = d.points.find((p) => crewShip.rooms[p.tacticalRoom]! > 0 && p.room === here && inReachOfTile(d.interior, eid, p.tile));
    if (point) { workers[point.tacticalRoom]!.push(pid); d.events.push({ kind: 'repairWork', player: pid, room: point.tacticalRoom }); }
  }
  for (const p of d.points) {
    const r = p.tacticalRoom as 0 | 1 | 2, n = workers[r]!.length;
    if (crewShip.rooms[r] === 0) { d.repair[r] = 0; continue; }
    if (n === 0) continue;
    d.repair[r] += n === 1 ? REPAIR_RATE_SOLO : n * REPAIR_RATE_TEAM;
    if (d.repair[r] >= REPAIR_UNITS) { crewShip.rooms[r]--; d.repair[r] = 0; d.events.push({ kind: 'repairDone', room: r, players: workers[r]! }); }
  }
}

/**
 * Spec §13, in order: scratch reset (and d.events cleared); seat phase (sit through today's interaction validation,
 * only at the two role consoles; stand through today's handler; then presence); tactical commands validated against the
 * seats after the seat phase and folded into the crew's ShipInput; repair, with its events; movement for standing
 * present players; the tactical stepDuel; the interior tick. Commands apply in the order given (the authority's
 * envelope order). Returns one result per command, sorted by player then sequence. Does nothing once the duel has ended.
 */
export function stepDuelTick(d: DuelState, input: DuelInput): DuelResult[] {
  if (d.tactical.outcome !== Outcome.Running) return [];
  const st = d.interior, tick = st.tick, results: DuelResult[] = [];
  const result = (env: DuelEnvelope, reason?: DuelReason): void => {
    results.push(reason ? { id: env.id, tick, status: 'rejected', reason } : { id: env.id, tick, status: 'applied' });
  };
  resetScratch(d);
  d.events = [];

  // Seat phase: sits (today's validation), then stands (today's handler), then presence.
  const away = (e: DuelEnvelope): boolean => !d.present[e.id.player as 0 | 1];   // an away character stays exactly where it is (spec §8)
  const sits = input.commands.filter((e) => e.command.kind === 'sit');
  const allowedSits = sits.filter((e) => e.command.kind === 'sit' && (e.command.station === d.nav || e.command.station === d.weapons));
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
    if ((e.id.player !== 0 && e.id.player !== 1) || typeof e.command.present !== 'boolean') { result(e, 'malformed'); continue; }
    d.present[e.id.player] = e.command.present; result(e);
  }

  // Tactical commands, against the seats as they now stand. Within a tick they take effect in a fixed order, lock, then
  // charge, then launch (the order applyWeaponsInput applies them), whatever their envelope order; admission is checked
  // in that same order so every result matches what happens. Within one kind, envelope order holds and the last wins.
  const helm = attendant(d, d.nav), gunner = attendant(d, d.weapons);
  const crew: ShipInput = { helm: helm >= 0, weapons: gunner >= 0, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false };
  for (const e of WEAPON_ORDER.flatMap((kind) => input.commands.filter((x) => x.command.kind === kind))) {
    const c = e.command;
    if (c.kind !== 'laserLock' && c.kind !== 'laserCharge' && c.kind !== 'missileLaunch') continue;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (gunner < 0 || e.id.player !== gunner) { result(e, 'not-at-weapons'); continue; }   // −1 is the empty-seat value, never a player
    if (c.kind === 'laserLock') { if (!validLock(c.room)) { result(e, 'malformed'); continue; } crew.laserLock = c.room; }
    else if (c.kind === 'laserCharge') { if (!canCharge(d.tactical, 0)) { result(e, 'missile-in-flight'); continue; } crew.laserCharge = c.held; }
    else { if (!canLaunch(d.tactical, 0)) { result(e, 'unavailable'); continue; } crew.missileLaunch = true; }
    result(e);
  }
  for (const e of input.commands) if (!['sit', 'stand', 'presence', 'laserLock', 'laserCharge', 'missileLaunch'].includes(e.command.kind)) result(e, 'not-in-duel');
  if (helm >= 0) { const h = input.held[helm] ?? NO_HELD; crew.axes = { turn: h.moveX, thrust: -h.moveY }; }   // W (moveY −1, up) is thrust forward
  if (gunner >= 0) crew.steer = (input.held[gunner] ?? NO_HELD).moveX;

  repairPhase(d, input.held);
  const intents: Intent[] = [0, 1].map((pid) => {
    const h = input.held[pid] ?? NO_HELD;
    return d.present[pid as 0 | 1] ? { ...NEUTRAL_INTENT, moveX: h.moveX, moveY: h.moveY } : { ...NEUTRAL_INTENT };
  });
  movementSystem(st, intents);   // skips seated and downed crew, and anyone who stood this tick
  stepDuel(d.tactical, crew);
  st.tick++;
  return results.sort((a, b) => a.id.player - b.id.player || a.id.sequence - b.id.sequence);
}

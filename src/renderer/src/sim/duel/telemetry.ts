// Duel telemetry (H-0c-ii-a spec §4, parent §13's list): accumulated tick by tick from the duel state after each
// stepDuelTick, that tick's events and the input it was given. Pure apart from its own accumulator; it never changes
// the duel. Counter diffs (contact counters, launches, graceUntil) are taken against the accumulator's copy of the
// tick before. One accumulator covers one round (H-2 spec §7, §8): its `ticks` count from the round's baseTick, and it
// freezes once the round is decided, so the end card's ticks add nothing and the terminal causes are never recomputed.
import { Life, LifeState, Seated } from '../components';
import { inArc } from '../tactical/geometry';
import { classOf, missileOf, Outcome, targetOf } from '../tactical/state';
import { CONTACT_GRACE_TICKS, LASER_ARC_COS, LASER_RANGE } from '../tactical/tuning';
import { canLaunch, laserFull } from '../tactical/weapons';
import type { DuelState } from './state';
import type { DuelInput } from './step';

/** A crew manoeuvre (the Helm turns, or its throttle is set: Artemis spec §5.3) counts toward a bait for this many ticks (spec §4). */
export const BAIT_WINDOW_TICKS = 300;
/** A crew manoeuvre needs the enemy within this distance (u). */
export const BAIT_RANGE = 900;

/** `downed`: the crew ship only, both characters down at once (duel-health spec §1.5, owner 2026-11-17). */
export type TerminalCause = 'planet' | 'asteroid' | 'ship' | 'laser' | 'missile' | 'downed';
export type MissileLoss = 'planet' | 'asteroid' | 'edge' | 'expired' | 'own' | 'missile';

export interface ShipTelemetry {
  laserReleases: number; laserHits: number; laserMisses: number; layersStripped: number;
  missilesLaunched: number;
  /** Missile hits on the other ship by the Room struck (Weapons, Shields, Engines). */
  missileHitsByRoom: [number, number, number];
  missileLosses: Record<MissileLoss, number>;
  planetContacts: number; asteroidContacts: number;
}

export interface PlayerTelemetry {
  repairsStarted: number; repairsFinished: number;
  /** Ticks standing (away from any console), split into walking and repairing. */
  walkingTicks: number; repairingTicks: number;
}

export interface DuelTelemetry {
  /** Ticks of this round so far, from its baseTick; frozen at decidedTick − baseTick once it is decided. */
  ticks: number;
  outcome: number;
  ships: [ShipTelemetry, ShipTelemetry];
  players: [PlayerTelemetry, PlayerTelemetry];
  /** Enemy planet and asteroid contacts that followed a crew manoeuvre (spec §4 baits). */
  baits: number;
  consoleSwaps: number;
  /** Ticks the Helm and the Weapons console were empty (nobody present seated there). */
  helmEmptyTicks: number; weaponsEmptyTicks: number;
  /** Ticks the enemy was inside the crew's laser arc and range. */
  enemyInArcTicks: number;
  /** Ticks Weapons had nothing to do (spec §4 idle predicate). */
  weaponsIdleTicks: number;
  /** For each ship whose hull reached 0 on the final tick, what hit it that tick; empty for a ship still flying. */
  terminal: [TerminalCause[], TerminalCause[]];
  /** The accumulator's copy of the tick before. */
  prev: { counters: number[][]; grace: [Int32Array, Int32Array]; work: [number, number]; seat: [number, number]; lastConsole: [number, number] };
  /** The last crew manoeuvre: its tick (−1 for none) and the enemy's position then. */
  manoeuvre: { tick: number; x: number; y: number };
}

function shipTelemetry(): ShipTelemetry {
  return {
    laserReleases: 0, laserHits: 0, laserMisses: 0, layersStripped: 0, missilesLaunched: 0, missileHitsByRoom: [0, 0, 0],
    missileLosses: { planet: 0, asteroid: 0, edge: 0, expired: 0, own: 0, missile: 0 }, planetContacts: 0, asteroidContacts: 0
  };
}

const counters = (d: DuelState): number[][] => d.tactical.ships.map((s, i) => [s.planetHits, s.asteroidHits, s.shipHits, d.tactical.systems[i]!.missilesLaunched]);
const seats = (d: DuelState): [number, number] => [Seated.station[d.interior.crew[0]!]!, Seated.station[d.interior.crew[1]!]!];

export function createTelemetry(d: DuelState): DuelTelemetry {
  const seat = seats(d);
  return {
    ticks: 0, outcome: d.tactical.outcome, ships: [shipTelemetry(), shipTelemetry()],
    players: [0, 1].map(() => ({ repairsStarted: 0, repairsFinished: 0, walkingTicks: 0, repairingTicks: 0 })) as [PlayerTelemetry, PlayerTelemetry],
    baits: 0, consoleSwaps: 0, helmEmptyTicks: 0, weaponsEmptyTicks: 0, enemyInArcTicks: 0, weaponsIdleTicks: 0, terminal: [[], []],
    prev: { counters: counters(d), grace: [new Int32Array(d.tactical.ships[0].graceUntil), new Int32Array(d.tactical.ships[1].graceUntil)], work: [-1, -1], seat, lastConsole: seat },
    manoeuvre: { tick: -1, x: 0, y: 0 }
  };
}

function dist(ax: number, ay: number, bx: number, by: number): number { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

/** The player present and seated at station i, or −1. */
function attendant(d: DuelState, i: number): number {
  const pid = d.interior.stations.occupant[i]!;
  return pid >= 0 && d.present[pid as 0 | 1] ? pid : -1;
}

/** Fold one finished tick into the accumulator: call right after stepDuelTick(d, input) with the same input. A call
 *  for a tick already counted, or once the round is decided (the end card's ticks), is ignored. */
export function recordTick(t: DuelTelemetry, d: DuelState, input: DuelInput): void {
  const tac = d.tactical, tick = tac.tick - 1;   // the tick that just ran
  if (t.outcome !== Outcome.Running || tick - d.baseTick < t.ticks) return;
  t.ticks = tac.tick - d.baseTick; t.outcome = tac.outcome;
  const now = counters(d), [crew, enemy] = tac.ships;

  // Weapons and missiles, from the tick's events.
  const laserOn = [false, false], missileOn = [false, false];
  for (const e of tac.events) {
    if (e.kind !== 'laser' && e.kind !== 'missileEnd') continue;   // Sci-1's events are not weapons
    const s = t.ships[e.ship as 0 | 1]!;
    if (e.kind === 'laser') {
      if (tac.systems[e.ship]!.laserBurst > 0 || classOf(tac, e.ship).slots.laser.shots === 1) s.laserReleases++;   // a burst's first shot (its rest still pending) is the release
      if (e.hit) { s.laserHits++; if (e.stripped) s.layersStripped++; else laserOn[targetOf(tac, e.ship)] = true; } else s.laserMisses++;
    } else if (e.cause === 'ship') {
      missileOn[e.target] = true;
      if (e.target === e.ship) s.missileLosses.own++; else s.missileHitsByRoom[e.room as 0 | 1 | 2]++;
    } else s.missileLosses[e.cause]++;
  }
  for (let i = 0; i < 2; i++) t.ships[i]!.missilesLaunched += now[i]![3]! - t.prev.counters[i]![3]!;

  // Contacts and baits. The struck bodies are exactly those whose graceUntil was set this tick.
  const struck: number[][] = [[], []];
  for (let i = 0; i < 2; i++) {
    const g = tac.ships[i]!.graceUntil, old = t.prev.grace[i]!, set = tick + CONTACT_GRACE_TICKS;
    for (let k = 0; k < g.length; k++) if (g[k] !== old[k] && g[k] === set) struck[i]!.push(k);
    t.ships[i]!.planetContacts += now[i]![0]! - t.prev.counters[i]![0]!;
    t.ships[i]!.asteroidContacts += now[i]![1]! - t.prev.counters[i]![1]!;
  }
  const m = t.manoeuvre, asteroids = tac.map.asteroids.length;
  if (m.tick >= 0 && tick - m.tick <= BAIT_WINDOW_TICKS) for (const k of struck[1]!) {
    if (k > asteroids) continue;   // a ship body: only the planet and asteroids can be baits
    const b = k === 0 ? tac.map.planet : tac.map.asteroids[k - 1]!;
    if (dist(enemy.x, enemy.y, b.x, b.y) < dist(m.x, m.y, b.x, b.y)) t.baits++;
  }
  const helm = attendant(d, d.nav);
  if (helm >= 0) {
    const turning = (input.held[helm]?.moveX ?? 0) !== 0;   // Artemis spec §5.3: the Helm turns, or the throttle is not 0
    if ((turning || d.throttle !== 0) && dist(crew.x, crew.y, enemy.x, enemy.y) <= BAIT_RANGE) { m.tick = tick; m.x = enemy.x; m.y = enemy.y; }
  }

  // Repairs: a start is the first tick of work on a room after not working on it; a finish credits every named player.
  // Fire work (duel-fire spec) is not repair work: a firefighter's ticks count as walking.
  const work: [number, number] = [-1, -1];
  for (const e of d.events) {
    if (e.kind === 'repairWork') work[e.player as 0 | 1] = e.room;
    else if (e.kind === 'repairDone') for (const p of e.players) t.players[p as 0 | 1]!.repairsFinished++;   // fire work and fires out are not repairs
  }
  const seat = seats(d);
  for (let pid = 0; pid < 2; pid++) {
    const p = t.players[pid]!;
    if (work[pid]! >= 0 && work[pid] !== t.prev.work[pid]) p.repairsStarted++;
    if (seat[pid]! < 0) { if (work[pid]! >= 0) p.repairingTicks++; else p.walkingTicks++; }
    if (seat[pid]! >= 0 && t.prev.seat[pid]! < 0) { if (t.prev.lastConsole[pid]! >= 0 && seat[pid] !== t.prev.lastConsole[pid]) t.consoleSwaps++;   // a first sit is not a swap (start-aboard spec §1)
      t.prev.lastConsole[pid as 0 | 1] = seat[pid]!; }
  }

  // Consoles, the arc and the idle predicate.
  const gunner = attendant(d, d.weapons);
  if (helm < 0) t.helmEmptyTicks++;
  if (gunner < 0) t.weaponsEmptyTicks++;
  const ex = enemy.x - crew.x, ey = enemy.y - crew.y, inRange = ex * ex + ey * ey <= LASER_RANGE * LASER_RANGE;
  const arc = inRange && inArc(crew.heading, ex, ey, LASER_ARC_COS);
  if (arc) t.enemyInArcTicks++;
  // Weapons update spec §2: a torpedo can be launched only within its range (inside the laser's), so a possible launch is
  // always something to do; idle is a full laser with no shot and no launch possible.
  if (gunner >= 0 && missileOf(tac, 0) === null && laserFull(tac, 0) && !canLaunch(tac, 0) && !arc) t.weaponsIdleTicks++;

  // Terminal cause: what hit each ship whose hull reached 0 on the final tick, and `downed` for the crew ship when both
  // characters were down (the round is lost with the hull still up, duel-health spec §1.5).
  const allDowned = tac.outcome === Outcome.EnemyWins && d.interior.crew.every((eid) => Life.state[eid] === LifeState.Downed);   // a crew that also won on that tick is not lost to `downed`
  if (tac.outcome !== Outcome.Running) for (let i = 0; i < 2; i++) {
    const downed = i === 0 && allDowned;
    if (tac.systems[i]!.hull > 0 && !downed) continue;
    const c: TerminalCause[] = [], was = t.prev.counters[i]!, is = now[i]!;
    if (tac.systems[i]!.hull > 0) { t.terminal[0] = ['downed']; continue; }
    if (is[0]! > was[0]!) c.push('planet');
    if (is[1]! > was[1]!) c.push('asteroid');
    if (is[2]! > was[2]!) c.push('ship');
    if (laserOn[i]) c.push('laser');
    if (missileOn[i]) c.push('missile');
    if (downed) c.push('downed');
    t.terminal[i as 0 | 1] = c;
  }

  t.prev = { counters: now, grace: [new Int32Array(crew.graceUntil), new Int32Array(enemy.graceUntil)], work, seat, lastConsole: t.prev.lastConsole };
}

/** True when the duel ended from a planet contact: the losing ship (both, for a draw) took one on its final tick. */
export function endedFromPlanet(t: DuelTelemetry): boolean {
  const losers = t.outcome === Outcome.Draw ? [0, 1] : t.outcome === Outcome.CrewWins ? [1] : t.outcome === Outcome.EnemyWins ? [0] : [];
  return losers.length > 0 && losers.every((i) => t.terminal[i]!.includes('planet'));
}

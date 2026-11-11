import type { SimState } from './state';
import { nextFloat, nextInt } from '../../../shared/rng';
import { Position, Life, LifeState } from './components';
import { roomAt } from './grid';
import { StationKind } from './stationKinds';
import { activeBoarderCount } from './boarders';
import { igniteRoom, burningRoomCount } from './hazards/fire';
import { activateBreach, activeBreachCount, freeSites } from './hazards/breach';
import { failStation } from './power';
import { failedStationCount } from './stations';
import { activeDebrisCount, spawnDebris } from './debris';
import { TICK_HZ, REACH, SPAWN_INTERVAL, SPAWN_JITTER, SPAWN_CAP, SPAWN_WEIGHTS, STRESS_PERIOD, STRESS_WEIGHTS, STRESS_RISE, STRESS_FALL, PEAK_LEVEL, RELAX_LEVEL, SUSTAIN_SECONDS, FADE_TIMEOUT, RELAX_MIN, RELAX_MAX, STALL_SECONDS, SPAWN_INTERVAL_MIN, ESCALATION_RATE, SOLO_INTERVAL_MULT, SPAWN_CAP_MAX, CAP_MINUTES, BUDGET_BASE, BUDGET_GROWTH, WEIGHT_MINUTES, ROUTE_BONUS, ROUTE_IDLE_SECONDS } from './tuning';

export const Phase = { BuildUp: 0, SustainPeak: 1, PeakFade: 2, Relax: 3 } as const;
export const PHASE_NAMES = ['Build Up', 'Sustain Peak', 'Peak Fade', 'Relax'] as const;
export const HazardType = { Fire: 0, Breach: 1, Power: 2, Debris: 3 } as const;
const TYPE_COUNT = 4;

export function activeHazardCount(state: SimState): number {
  return burningRoomCount(state) + activeBreachCount(state) + failedStationCount(state) + activeDebrisCount(state);
}

export function minutesOf(state: SimState): number { return state.tick / (60 * TICK_HZ); }

/** Escalation (spec 4-i section 7): the interval shrinks toward a floor; solo crews get more time. */
export function spawnInterval(minutes: number, players: number): number {
  const base = Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL / (1 + ESCALATION_RATE * minutes));
  return base * (players === 1 ? SOLO_INTERVAL_MULT : 1);
}

export function spawnCap(minutes: number, players: number): number {
  const cap = Math.min(SPAWN_CAP_MAX, SPAWN_CAP + Math.floor(minutes / CAP_MINUTES) + Math.floor(Math.max(0, players - 2) / 2));
  return Math.max(1, cap - (players === 1 ? 1 : 0));
}

export function cycleBudget(minutes: number, players: number): number {
  return Math.max(1, Math.floor((BUDGET_BASE + BUDGET_GROWTH * minutes) * Math.max(0.5, players / 2)));
}

function downedCount(state: SimState): number {
  let n = 0; for (let pid = 0; pid < state.playerCount; pid++) if (Life.state[state.crew[pid]!] === LifeState.Downed) n++; return n;
}

/** Unsmoothed stress: a weighted count of what is wrong right now, clamped to 1 (spec 4-i section 5). */
export function rawStress(state: SimState): number {
  const w = STRESS_WEIGHTS;
  const raw = w.fire * burningRoomCount(state) + w.breach * activeBreachCount(state) + w.power * failedStationCount(state) + w.debris * activeDebrisCount(state) + w.downed * downedCount(state) + w.enemy * state.enemy.present + w.boarder * activeBoarderCount(state);
  return Math.max(0, Math.min(1, raw));
}

function consciousNear(state: SimState, x: number, y: number): boolean {
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Life.state[eid] !== LifeState.Conscious) continue;
    const dx = Position.x[eid]! - x, dy = Position.y[eid]! - y;
    if (Math.sqrt(dx * dx + dy * dy) <= REACH) return true;
  }
  return false;
}

function consciousInRoom(state: SimState, room: number): boolean {
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Life.state[eid] === LifeState.Conscious && roomAt(state, Position.x[eid]!, Position.y[eid]!) === room) return true;
  }
  return false;
}

function consciousInReachOfTile(state: SimState, tile: number): boolean {
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Life.state[eid] === LifeState.Conscious && withinReachOfTile(state, Position.x[eid]!, Position.y[eid]!, tile)) return true;
  }
  return false;
}

/** Same geometry as interact.ts (distance to the nearest point of the tile's unit square), kept local so director.ts does not import interact.ts, which imports step.ts, which imports this module. */
function withinReachOfTile(state: SimState, x: number, y: number, tileIdx: number): boolean {
  const w = state.derived.width, tx = tileIdx % w, ty = (tileIdx - tx) / w;
  const dx = Math.max(tx - x, 0, x - (tx + 1)), dy = Math.max(ty - y, 0, y - (ty + 1));
  return Math.sqrt(dx * dx + dy * dy) <= REACH;
}

/** The one unattended definition (spec 4-i section 5): fires by room, breaches and failures by reach of the tile, Downed crew by reach; debris never. */
export function anyUnattended(state: SimState): boolean {
  const d = state.derived;
  for (let r = 0; r < state.rooms.fire.length; r++) if (state.rooms.fire[r]! > 0 && !consciousInRoom(state, r)) return true;
  for (let s = 0; s < state.breaches.active.length; s++) if (state.breaches.active[s] && !consciousInReachOfTile(state, d.siteTile[s]!)) return true;
  for (let i = 0; i < state.stations.failed.length; i++) if (state.stations.failed[i] && !consciousInReachOfTile(state, d.stationTile[i]!)) return true;
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Life.state[eid] === LifeState.Downed && !consciousNear(state, Position.x[eid]!, Position.y[eid]!)) return true;
  }
  for (let k = 0; k < state.boarders.active.length; k++) if (state.boarders.active[k] && !consciousInRoom(state, state.boarders.room[k]!)) return true;   // a boarder in a room without Conscious crew (spec Boarders-i section 6)
  return false;
}

/** One smoothing step: fast up, slow down, slower still while something is unattended. */
export function updateStress(state: SimState): void {
  const d = state.director, raw = rawStress(state);
  const k = raw > d.stress ? STRESS_RISE : (anyUnattended(state) ? STRESS_FALL * 0.5 : STRESS_FALL);
  d.stress = Math.max(0, Math.min(1, d.stress + (raw - d.stress) * k));
  if (d.stress > state.telemetry.maxStress) state.telemetry.maxStress = d.stress;
}

function idleOf(state: SimState, kind: number): number {
  return state.derived.stationOfKind[kind]! < 0 ? 0 : state.director.sinceProductive[kind]! / TICK_HZ;
}

/** Responding-console idle time per hazard type (spec 4-i section 7); -1 for every type when routing is disabled (fewer than 3 players). */
export function routeIdle(state: SimState): number[] {
  if (state.playerCount < 3) return [-1, -1, -1, -1];
  const doors = idleOf(state, StationKind.Doors), ls = idleOf(state, StationKind.LifeSupport), eng = idleOf(state, StationKind.Engineering);
  const handoff = Math.min(idleOf(state, StationKind.Science), idleOf(state, StationKind.Weapons), idleOf(state, StationKind.Navigation));
  return [doors, Math.min(doors, ls), eng, handoff];
}

/** Doubled base weights, escalation on the demanding types, the last type halved, then the routing bonus on every type tied for the longest idle. */
export function typeWeights(state: SimState): number[] {
  const m = minutesOf(state), grow = 2 * Math.floor(m / WEIGHT_MINUTES);
  const w = [2 * SPAWN_WEIGHTS.fire, 2 * SPAWN_WEIGHTS.breach, 2 * SPAWN_WEIGHTS.power + grow, 2 * SPAWN_WEIGHTS.debris + grow];
  const last = state.director.lastType;
  if (last >= 0) w[last] = Math.max(1, Math.floor(w[last]! / 2));
  const idle = routeIdle(state), top = Math.max(...idle);
  if (top > ROUTE_IDLE_SECONDS) for (let t = 0; t < TYPE_COUNT; t++) if (idle[t] === top) w[t]! += 2 * ROUTE_BONUS;
  return w;
}

/** Map a unit roll onto the weight intervals in type order. */
export function chooseType(weights: readonly number[], u: number): number {
  let total = 0; for (const w of weights) total += w;
  const x = u * total;
  let acc = 0;
  for (let t = 0; t < weights.length; t++) { acc += weights[t]!; if (x < acc) return t; }
  return weights.length - 1;
}

function spawnOfType(state: SimState, type: number): boolean {
  if (type === HazardType.Fire) {
    const candidates: number[] = [];
    for (let r = 0; r < state.rooms.fire.length; r++) if (state.rooms.fire[r] === 0) candidates.push(r);
    if (!candidates.length) return false;
    return igniteRoom(state, candidates[nextInt(state.rng.hazards, candidates.length)]!);
  }
  if (type === HazardType.Breach) {
    const sites = freeSites(state);
    if (!sites.length) return false;
    return activateBreach(state, sites[nextInt(state.rng.hazards, sites.length)]!);
  }
  if (type === HazardType.Power) {
    const candidates: number[] = [];
    for (let i = 0; i < state.stations.failed.length; i++) if (!state.stations.failed[i]) candidates.push(i);
    if (!candidates.length) return false;
    failStation(state, candidates[nextInt(state.rng.hazards, candidates.length)]!); return true;
  }
  return spawnDebris(state) >= 0;
}

function rearm(state: SimState): void {
  const d = state.director, u = nextFloat(state.rng.director);
  const jitter = 1 + SPAWN_JITTER * (2 * u - 1);
  d.nextSpawnTick = Math.max(d.nextSpawnTick, state.tick + Math.round(spawnInterval(minutesOf(state), state.playerCount) * TICK_HZ * jitter));   // never pulls a later timer earlier
}

/** A due Build Up attempt: re-arm first, then the cap, then one type roll and the target draw. Returns whether a hazard was spawned. */
function attemptSpawn(state: SimState): boolean {
  const d = state.director;
  d.nextSpawnTick = state.tick;                                                   // the re-arm below is relative to now
  rearm(state);
  if (activeHazardCount(state) >= spawnCap(minutesOf(state), state.playerCount)) return false;
  const type = chooseType(typeWeights(state), nextFloat(state.rng.director));
  if (!spawnOfType(state, type)) return false;
  d.lastSpawnTick = state.tick; d.lastType = type; d.budgetLeft -= 1; state.telemetry.spawns[type]!++;
  return true;
}

export function enterPhase(state: SimState, phase: number): void {
  const d = state.director;
  d.phase = phase; d.phaseTick = state.tick; state.telemetry.phaseEntries[phase]!++;
  if (phase === Phase.BuildUp) { d.budgetLeft = cycleBudget(minutesOf(state), state.playerCount); rearm(state); }
}

/** Exit conditions of the current phase; at most one transition (spec 4-i section 6). */
export function phaseStep(state: SimState): void {
  const d = state.director, tick = state.tick, elapsed = (tick - d.phaseTick) / TICK_HZ;
  switch (d.phase) {
    case Phase.BuildUp:
      if (d.stress >= PEAK_LEVEL || d.budgetLeft <= 0 || tick - Math.max(d.lastSpawnTick, d.phaseTick) >= STALL_SECONDS * TICK_HZ) enterPhase(state, Phase.SustainPeak);
      break;
    case Phase.SustainPeak:
      if (elapsed >= SUSTAIN_SECONDS) enterPhase(state, Phase.PeakFade);
      break;
    case Phase.PeakFade:
      if (d.stress <= RELAX_LEVEL || elapsed >= FADE_TIMEOUT) enterPhase(state, Phase.Relax);
      break;
    case Phase.Relax:
      if ((elapsed >= RELAX_MIN && d.stress <= RELAX_LEVEL) || elapsed >= RELAX_MAX) enterPhase(state, Phase.BuildUp);
      break;
    default:
      break;                                                                      // an unknown phase value never transitions
  }
}

/** Step 5: stress if due, phase exits, then a Build Up spawn attempt; a spawn that spends the last budget ends the Build Up at once. */
export function directorSystem(state: SimState): void {
  const d = state.director;
  if (state.tick >= d.nextStressTick) { updateStress(state); d.nextStressTick += STRESS_PERIOD * TICK_HZ; }
  phaseStep(state);
  if (d.phase === Phase.BuildUp && state.tick >= d.nextSpawnTick) {
    const spawned = attemptSpawn(state);
    if (spawned && d.budgetLeft <= 0) enterPhase(state, Phase.SustainPeak);
  }
}

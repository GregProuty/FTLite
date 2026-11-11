import { Phase } from '../../src/renderer/src/sim/director';
import starter from '../../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { createSimState, type SimState } from '../../src/renderer/src/sim/state';
import { step } from '../../src/renderer/src/sim/step';
import { Position } from '../../src/renderer/src/sim/components';
import { NEUTRAL_INTENT, type Intent } from '../../src/shared/intent';
import { TICK_HZ, SKILL_COUNT, XP_THRESHOLDS, ENEMY_HULL, ENCOUNTER_MAX, ENEMY_FIRST_SHOT } from '../../src/renderer/src/sim/tuning';
import { ObjectKind } from '../../src/renderer/src/sim/debris';
import { RECRUIT } from '../../src/renderer/src/sim/characters';
import { shiftBar, maxLevel } from '../../src/renderer/src/sim/power';

export const LAYOUT = parseShip(starter);
export const RECRUITS: readonly number[] = [RECRUIT, RECRUIT, RECRUIT, RECRUIT];

export function makeState(players = 2, seed = 1, characters: readonly number[] = RECRUITS): SimState {
  return createSimState(LAYOUT, players, seed, characters);
}

export function intents(...per: Partial<Intent>[]): Intent[] {
  return per.map((p) => ({ ...NEUTRAL_INTENT, ...p }));
}

export function run(state: SimState, ticks: number, perTick: (tick: number) => Intent[] = () => []): void {
  for (let i = 0; i < ticks; i++) step(state, perTick(state.tick));
}

export function teleport(state: SimState, pid: number, x: number, y: number): void {
  const eid = state.crew[pid]!;
  Position.x[eid] = x; Position.y[eid] = y;
}

export function seconds(n: number): number { return Math.round(n * TICK_HZ); }

export function room(state: SimState, id: string): number { return state.derived.roomIndex.get(id)!; }

/** Place a debris object directly (no RNG draw): target room, ticks until impact, warned flag, optional explicit StableId and frequency (default 1). */
export function placeDebris(state: SimState, room: number, ticksOut: number, warned = 0, stableId?: number, frequency = 1): number {
  const db = state.debris;
  let slot = -1;
  for (let i = 0; i < db.active.length; i++) if (!db.active[i]) { slot = i; break; }
  if (slot < 0) throw new Error('no free debris slot');
  db.active[slot] = 1; db.room[slot] = room; db.impactTick[slot] = state.tick + ticksOut; db.warned[slot] = warned;
  db.frequency[slot] = frequency; db.scanned[slot] = 0; db.scan[slot] = 0; db.kind[slot] = ObjectKind.Debris;
  db.stableId[slot] = stableId ?? state.nextStableId++;
  if (stableId !== undefined && stableId >= state.nextStableId) state.nextStableId = stableId + 1;
  return slot;
}

/** Push a station to max + 1 with a widened reactor so the pool never refuses (heat tests are about heat, not bars). Returns the station index. */
export function overdrive(state: SimState, kind: number): number {
  const i = state.derived.stationOfKind[kind]!;
  state.power.capacity = 20;
  while (state.stations.level[i]! < maxLevel(kind)) if (!shiftBar(state, i, 1)) throw new Error('shiftBar refused');
  return i;
}

/** Set a crew member's skill to exactly the XP threshold of a level. */
export function setSkill(state: SimState, pid: number, skill: number, level: number): void {
  state.skills.xp[pid * SKILL_COUNT + skill] = XP_THRESHOLDS[level]!;
}

/** Silence the director: no spawn attempt can come due (re-arming never pulls a later timer earlier). */
export function quiet(state: SimState): void { state.director.nextSpawnTick = 1e9; }

/** Put the director in Build Up with a due attempt, plenty of budget and no stress or stall pressure, so one spawn can be observed in isolation. */
export function armSpawn(state: SimState): void {
  const d = state.director;
  d.phase = Phase.BuildUp; d.phaseTick = state.tick; d.lastSpawnTick = state.tick; d.budgetLeft = 99; d.stress = 0; d.nextStressTick = 1e9; d.nextSpawnTick = state.tick;
}

/** Place an enemy as arrive() would, with a fresh StableId and no draw. */
export function placeEnemy(state: SimState, hull = ENEMY_HULL): void {
  const e = state.enemy;
  e.present = 1; e.hull = hull; e.stableId = state.nextStableId++;
  e.departTick = state.tick + ENCOUNTER_MAX * TICK_HZ; e.nextShotTick = state.tick + ENEMY_FIRST_SHOT * TICK_HZ;
}

/** Place an enemy shot directly: placeDebris with kind Shot. */
export function placeShot(state: SimState, room: number, ticksOut: number, warned = 0, stableId?: number, frequency = 1): number {
  const slot = placeDebris(state, room, ticksOut, warned, stableId, frequency);
  state.debris.kind[slot] = ObjectKind.Shot;
  return slot;
}

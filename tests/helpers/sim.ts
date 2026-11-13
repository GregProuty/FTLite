import { Phase } from '../../src/renderer/src/sim/director';
import starter from '../../src/renderer/src/sim/ship/starter.json';
import cutter from '../../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { createSimState, type SimState, type SimOptions } from '../../src/renderer/src/sim/state';
import { step } from '../../src/renderer/src/sim/step';
import { Position } from '../../src/renderer/src/sim/components';
import { NEUTRAL_INTENT, type Intent } from '../../src/shared/intent';
import { NodeType } from '../../src/renderer/src/sim/run';
import { ENCOUNTER_FIRST, ENCOUNTER_FIRST_SMALL, BOARDING_FIRST, BOARDING_FIRST_SMALL } from '../../src/renderer/src/sim/tuning';
import { Encounter } from '../../src/renderer/src/sim/enemy';
import { NODE_STRIDE, SHIELD_ROTATE, TICK_HZ, SKILL_COUNT, XP_THRESHOLDS, ENEMY_HULL, ENCOUNTER_MAX, ENEMY_FIRST_SHOT, ENEMY_SYS_HP, ENEMY_SYS_REPAIR, BOARDER_HEALTH, BOARDER_MOVE } from '../../src/renderer/src/sim/tuning';
import { ObjectKind } from '../../src/renderer/src/sim/debris';
import { ENEMY_SLOTS } from '../../src/renderer/src/sim/debrisTargets';
import { RECRUIT } from '../../src/renderer/src/sim/characters';
import { enemyMaxHull, enemyShieldMax } from '../../src/renderer/src/sim/enemy';
import { shiftBar, maxLevel } from '../../src/renderer/src/sim/power';
import { sitDown } from '../../src/renderer/src/sim/stations';
import { StationKind } from '../../src/renderer/src/sim/stationKinds';

export const LAYOUT = parseShip(starter);
export const CUTTER = parseShip(cutter);

/** A two-Recruit cutter state (the ship with airlocks, spec Demo-vii). */
export function cutterState(seed = 1, players = 2): SimState { return createSimState(CUTTER, players, seed, RECRUITS); }
export const RECRUITS: readonly number[] = [RECRUIT, RECRUIT, RECRUIT, RECRUIT];

export function makeState(players = 2, seed = 1, characters: readonly number[] = RECRUITS, options: SimOptions = {}): SimState {
  return createSimState(LAYOUT, players, seed, characters, options);
}

/** A two-Recruit state with the ship quirk forced to k (spec Run-iii section 5); the quirk draw is still made. */
export function quirkState(k: number, seed = 1): SimState { return makeState(2, seed, RECRUITS, { quirk: k }); }

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
  while (state.stations.level[i]! < maxLevel(state, kind)) if (!shiftBar(state, i, 1)) throw new Error('shiftBar refused');
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
  wake(state); d.phase = Phase.BuildUp; d.phaseTick = state.tick; d.lastSpawnTick = state.tick; d.budgetLeft = 99; d.stress = 0; d.nextStressTick = 1e9; d.nextSpawnTick = state.tick;   // awake: no peace at the start beacon (spec Loop-i section 4b)
}

/** Place an enemy as arrive() would (no draw): fresh StableId, full systems, the given shield frequency, the combat fields (maxHull is the column's, never below the hull given: spec Demo-i section 11.5 places hull 40 of 100). */
export function placeEnemy(state: SimState, hull = ENEMY_HULL, shieldFreq = 1): void {
  const e = state.enemy;
  e.present = 1; e.maxHull = Math.max(hull, enemyMaxHull(state.run.column)); e.shieldLayers = enemyShieldMax(state.run.column); e.shieldRecharge = 0; e.shotArmTick = state.tick; e.fleeing = 0; e.surrenderIntact = 0; e.lastHitTick = -1;
  e.hull = hull; e.stableId = state.nextStableId++;
  e.departTick = state.tick + ENCOUNTER_MAX * TICK_HZ; e.nextShotTick = state.tick + ENEMY_FIRST_SHOT * TICK_HZ;
  e.sysHp.fill(ENEMY_SYS_HP); e.sysRepairTick.fill(-1); e.shieldFreq = shieldFreq; e.scanned = 0; e.scan = 0;
  e.shieldRotateTick = state.tick + SHIELD_ROTATE * TICK_HZ; e.lockUntilTick = -1; e.ionUntil.fill(-1);   // spec Coop-i section 1: as arrive() arms them
}
/** Knock a subsystem out as damageEnemy would, arming its repair. */
export function disableSystem(state: SimState, system: number): void {
  state.enemy.sysHp[system] = 0; state.enemy.sysRepairTick[system] = state.tick + ENEMY_SYS_REPAIR * TICK_HZ;
}
/** Replace every debris array with a Proxy that throws on a read at any enemy slot, so a test proves the pseudo-slots never index the table. */
export function guardDebris(s: SimState): void {
  const keys = new Set(ENEMY_SLOTS.map(String));
  const trap = <A extends object>(arr: A): A => new Proxy(arr, { get(t, p) { if (typeof p === 'string' && keys.has(p)) throw new Error(`debris array read at enemy slot ${p}`); const v = Reflect.get(t, p); return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v; } });
  const db = s.debris as unknown as Record<string, object>;
  for (const key of Object.keys(db)) db[key] = trap(db[key]!);
}

/** Place an enemy shot directly: placeDebris with kind Shot. */
export function placeShot(state: SimState, room: number, ticksOut: number, warned = 0, stableId?: number, frequency = 1): number {
  const slot = placeDebris(state, room, ticksOut, warned, stableId, frequency);
  state.debris.kind[slot] = ObjectKind.Shot;
  return slot;
}

/** Place a boarder directly (no draw): fresh StableId, full health, a move due in BOARDER_MOVE seconds, clock idle. Returns the slot. */
export function placeBoarder(state: SimState, room: number, health = BOARDER_HEALTH): number {
  const b = state.boarders;
  let slot = -1;
  for (let k = 0; k < b.active.length; k++) if (!b.active[k]) { slot = k; break; }
  if (slot < 0) throw new Error('no free boarder slot');
  b.active[slot] = 1; b.stableId[slot] = state.nextStableId++; b.room[slot] = room; b.health[slot] = health;
  b.nextMoveTick[slot] = state.tick + BOARDER_MOVE * TICK_HZ; b.aloneSince[slot] = -1;
  return slot;
}

export function chargeJump(state: SimState): void { state.run.jumpCharge = 1; }
export function seatNavigator(state: SimState, pid: number): number { const i = state.derived.stationOfKind[StationKind.Navigation]!; sitDown(state, pid, i); return i; }
/** Overwrite the generated map: nodes per column and `"c:n"` -> mask entries (unlisted masks become 0). */
export function setMap(state: SimState, colNodes: number[], masks: Record<string, number>): void {
  state.run.colNodes.set(colNodes); state.run.edgeMask.fill(0);
  for (const [key, mask] of Object.entries(masks)) { const [c, n] = key.split(':').map(Number); state.run.edgeMask[c! * NODE_STRIDE + n!] = mask; }
}

export function setNodeTypes(state: SimState, types: Record<string, number>): void {
  state.run.nodeType.fill(NodeType.Hazard);
  for (const [key, t] of Object.entries(types)) { const [c, n] = key.split(':').map(Number); state.run.nodeType[c! * NODE_STRIDE + n!] = t; }
}
export function allHazard(state: SimState): void { setNodeTypes(state, {}); }
export function grantScrap(state: SimState, n: number): void { state.run.scrap = n; }
export function setEvent(state: SimState, id: number): void { state.run.event = id; state.run.eventChoice = -1; state.run.eventOpenTick = -1; state.run.voteTick = -1; state.run.vote.fill(-1); }   // opens the event; its limit starts at the first vote (spec Demo-x-b section 2)
/** The spec's fixture map M on a six-column sector (spec Loop-i section 1): three nodes in column 1, forward-reachable [0, 2] from the start, every other mask 1; all nodes Hazard. */
export const MAP_M_NODES = [1, 3, 2, 2, 2, 1];
export const MAP_M_MASKS: Record<string, number> = { '0:0': 0b101, '1:0': 1, '1:1': 1, '1:2': 1, '2:0': 1, '2:1': 1, '3:0': 1, '3:1': 1, '4:0': 1, '4:1': 1 };
export function mapM(state: SimState): void {
  setMap(state, MAP_M_NODES, MAP_M_MASKS);
  allHazard(state);
}
/** A beacon as reachable() returns it. */
export const at = (column: number, node: number): { column: number; node: number } => ({ column, node });
/** The forward destination `node` in the next column. */
export const ahead = (state: SimState, node: number): { column: number; node: number } => ({ column: state.run.column + 1, node });
/** Leave the peace of the start beacon without a jump (spec Loop-i section 4b): the director, the enemy and boarders act at column 0, with the clocks counted from tick 0 as before Loop-i. Hazard tests and gates use it. */
export function wake(state: SimState): void { state.run.calm = 0; state.run.wakeTick = 0; }
/** The pre-Loop-i hazard schedule at the start beacon (the hazard gates): awake from tick 0, the first enemy and boarding party at the old crew-size times. */
export function hazardStart(state: SimState): void {
  wake(state);
  const small = state.playerCount <= 2;
  state.enemy.nextArrivalTick = (small ? ENCOUNTER_FIRST_SMALL : ENCOUNTER_FIRST) * TICK_HZ; state.boarders.nextArrivalTick = (small ? BOARDING_FIRST_SMALL : BOARDING_FIRST) * TICK_HZ; state.run.encounter = Encounter.Pending;
}
/** wake() returning the state, for setups that build an awake state inline. */
export function woke<S extends SimState>(state: S): S { wake(state); return state; }

import { createWorld, createEntityIndex, addEntity, addComponent } from 'bitecs';
import type { World } from 'bitecs';
import { createRng, nextU32, nextInt, type RngState } from '../../../shared/rng';
import type { ShipLayout } from './ship/schema';
import { deriveLayout, type Derived } from './ship/derived';
import { Position, Health, Life, LifeState, Stable, Owner, Seated } from './components';
import { DEFAULT_CHARACTERS, RECRUIT, applyHeadStarts } from './characters';
import { HULL_MAX, HEALTH_MAX, SPAWN_FIRST, TICK_HZ, REACTOR_CAPACITY, DEBRIS_SLOTS, TORP_START, SKILL_COUNT, STRESS_PERIOD, ENCOUNTER_FIRST, ENCOUNTER_FIRST_SMALL, BOARDER_SLOTS, BOARDING_FIRST, BOARDING_FIRST_SMALL, RUN_COLUMNS, QUIRK_COUNT, ENEMY_ROOMS } from './tuning';
import { generateMap } from './run';
import { applyStartBonuses } from './progress';
import { cycleBudget } from './director';
import { STATION_COUNT } from './stationKinds';
import { ENEMY_SYSTEM_COUNT } from './enemy';

export interface RngStreams { hazards: RngState; director: RngState; combat: RngState; loot: RngState; cosmetic: RngState; map: RngState; quirk: RngState }
export const STREAM_NAMES = ['hazards', 'director', 'combat', 'loot', 'cosmetic', 'map', 'quirk'] as const;

export interface SimState {
  tick: number;
  rng: RngStreams;
  nextStableId: number;
  layout: ShipLayout;
  derived: Derived;
  playerCount: number;
  world: World;
  crew: number[];
  hull: number;
  ended: number;
  endReason: number;
  rooms: { o2: Float64Array; fire: Float64Array; fireRepair: Float64Array; impactTick: Int32Array };   // impactTick: tick of the last debris impact per room, -1 until one
  doors: { state: Uint8Array; closeTimer: Float64Array; sealRequested: Uint8Array };
  /** Hull doors to space (spec Demo-vii section 1): 1 while open; an open airlock vents its room. */
  airlocks: { open: Uint8Array };
  breaches: { active: Uint8Array; repair: Float64Array };
  o2Counters: { injected: number; breathed: number; burned: number; vented: number; residual: number };
  /** Pacing director (spec 4-i section 4): phase machine, smoothed stress, spawn timing and budget, per-kind idle counters. */
  director: { phase: number; phaseTick: number; stress: number; nextStressTick: number; nextSpawnTick: number; budgetLeft: number; lastSpawnTick: number; lastType: number; sinceProductive: Int32Array };
  /** Run telemetry (spec 4-ii section 4): first down/death with the player, manned ticks per kind, idle streaks per player, event counts. Ticks and pids are -1 until set. */
  telemetry: { firstDownTick: number; firstDownPid: number; firstDeathTick: number; firstDeathPid: number; mannedTicks: Int32Array; idleRun: Int32Array; longestIdle: Int32Array; prevLife: Uint8Array; spawns: Int32Array; impacts: number; evadeRolls: number; evasions: number; shots: number; hits: number; repairs: Int32Array; maxStress: number; phaseEntries: Int32Array; encounters: number; enemiesDestroyed: number; enemyDisables: number; boardings: number; boardersKilled: number; jumps: number; scrapEarned: number; scrapSpent: number; eventsResolved: number; purchases: number; shieldHits: number; enemyFled: number; surrenderOffers: number; surrenders: number; encountersWon: number; boardersVented: number };
  /** Derived scratch (not snapshotted): per-room oxygen injection requested for the next hazard step. */
  injectionScratch: Float64Array;
  stations: { level: Uint8Array; failed: Uint8Array; repair: Float64Array; occupant: Int8Array; cursor: Int16Array; heat: Int16Array; coolant: Uint8Array };   // heat 0..HEAT_MAX and coolant units per station (spec 2b-i section 3)
  power: { capacity: number };
  stick: { heldDir: Int8Array; repeat: Int16Array };   // per player: 0 none, 1 up, 2 down, 3 left, 4 right; ticks until the next repeat edge
  /** Debris objects in fixed slots (spec 2a-ii section 3). stableId is 0 while a slot is inactive. */
  debris: { active: Uint8Array; stableId: Int32Array; room: Int16Array; impactTick: Int32Array; warned: Uint8Array; frequency: Uint8Array; scanned: Uint8Array; scan: Float64Array; kind: Uint8Array };
  weapons: { charge: number; selector: number; torpedoStock: number; torpedoLoaded: number; torpedoLoad: number; torpedoRegen: number; lastShotTick: number; lastShotTarget: number; lastShotResult: number; lastShotKind: number };   // selector 0..2 beam F1..F3, 3 torpedo; beam charge 0..1 survives standing and power failure; the last shot for the renderer (spec Demo-viii section 2): tick (-1 none), the cursor slot fired at, result 0 miss / 1 stripped / 2 hit, kind 0 beam / 1 torpedo
  /** The enemy ship (spec Combat-i section 4): one at a time; ticks are -1 while absent. */
  enemy: { present: number; hull: number; stableId: number; nextArrivalTick: number; nextShotTick: number; departTick: number; sysHp: Float64Array; sysRepairTick: Int32Array; shieldFreq: number; scanned: number; scan: number; maxHull: number; shieldLayers: number; shieldRecharge: number; shotArmTick: number; fleeing: number; surrenderIntact: number; lastHitTick: number; roomFire: Float64Array; roomBreach: Float64Array };   // sysHp is fractional so a fire can burn it (amendment A6); roomFire / roomBreach: seconds left per enemy room, 0 none (spec Demo-viii section 2b)
  /** Boarders (spec Boarders-i section 4): a room-level party, one at a time; aloneSince is -1 idle, a tick while running, -2 once this visit sabotaged. */
  boarders: { active: Uint8Array; stableId: Int32Array; room: Int16Array; health: Float64Array; nextMoveTick: Int32Array; aloneSince: Int32Array; nextArrivalTick: number };
  /** The run (spec Run-i section 4): position on the node map, the score, the drive charge, and the map itself; the node encounter (spec Demo-vi section 2: 0 none, 1 pending, 2 fighting, 3 won, 4 over), the tick it entered that state and the post-win drive boost. */
  run: { column: number; node: number; nodesReached: number; jumpCharge: number; colNodes: Uint8Array; edgeMask: Uint8Array; nodeType: Uint8Array; scrap: number; event: number; eventChoice: number; upgrades: Uint8Array; quirk: number; startBonus: number; encounter: number; encounterTick: number; driveBoost: number; fieldNextTick: number };   // fieldNextTick: the next field rock (spec Demo-viii section 1), -1 when no field
  crewCharacter: Uint8Array;   // CHARACTERS index per crew member (spec 3-ii section 4)
  /** Per-crew skill XP (pid x SKILL_COUNT + skill) and the productivity stamps (spec 3-i section 4); stamps are -1 until set. */
  skills: { xp: Float64Array; lastEngChangeTick: number; lastDoorToggleTick: number; lsDeliveredTick: number; lastShotTick: number };
  science: { scanning: number };                        // 1 while a scan is running (spec 2b-ii section 4)
  /** Tick-scoped scratch (not snapshotted): cleared at the start of every step. */
  scratch: { doorToggles: Set<number>; doorCycles: Set<number>; airlockToggles: Set<number>; satThisTick: Uint8Array; stoodThisTick: Uint8Array; activeThisTick: Uint8Array };
}

export function deriveStreams(seed: number): RngStreams {
  const master = createRng(seed);
  const out = {} as RngStreams;
  for (const name of STREAM_NAMES) out[name] = createRng(nextU32(master));
  return out;
}

// One entity index shared by every world this process creates. Components are module-level SoA arrays
// indexed by entity id, so two live states (tests compare runs; snapshot load creates a second state) must
// never share an id. A shared index hands out disjoint ids across worlds. Non-versioned: bitECS 0.4.0's
// withVersioning() misbehaves under recycling (docs/spikes.md).
const SHARED_ENTITY_INDEX = createEntityIndex();

/** Creation options (spec Run-iii section 5): the unlocked start bonuses, and a forced ship quirk (tests and gates; the draw is still made). */
export interface SimOptions { unlocked?: readonly string[]; quirk?: number }

export function createSimState(layout: ShipLayout, playerCount: number, seed: number, characters: readonly number[] = DEFAULT_CHARACTERS, options: SimOptions = {}): SimState {
  const derived = deriveLayout(layout);
  const world = createWorld(SHARED_ENTITY_INDEX);
  const R = derived.volume.length, E = layout.edges.length, S = layout.breachSites.length;
  const N = layout.stations.length;
  const rng = deriveStreams(seed);
  const state: SimState = {
    tick: 0, rng, nextStableId: 1, layout, derived, playerCount, world, crew: [],
    hull: HULL_MAX, ended: 0, endReason: 0,
    rooms: { o2: Float64Array.from(derived.volume), fire: new Float64Array(R), fireRepair: new Float64Array(R), impactTick: new Int32Array(R).fill(-1) },
    doors: { state: new Uint8Array(E), closeTimer: new Float64Array(E), sealRequested: new Uint8Array(E) },
    airlocks: { open: new Uint8Array(derived.airlockRoom.length) },
    breaches: { active: new Uint8Array(S), repair: new Float64Array(S) },
    o2Counters: { injected: 0, breathed: 0, burned: 0, vented: 0, residual: 0 },
    director: { phase: 0, phaseTick: 0, stress: 0, nextStressTick: STRESS_PERIOD * TICK_HZ, nextSpawnTick: SPAWN_FIRST * TICK_HZ, budgetLeft: cycleBudget(0, playerCount), lastSpawnTick: -1, lastType: -1, sinceProductive: new Int32Array(STATION_COUNT) },
    telemetry: { firstDownTick: -1, firstDownPid: -1, firstDeathTick: -1, firstDeathPid: -1, mannedTicks: new Int32Array(STATION_COUNT), idleRun: new Int32Array(playerCount), longestIdle: new Int32Array(playerCount), prevLife: new Uint8Array(playerCount).fill(LifeState.Conscious), spawns: new Int32Array(4), impacts: 0, evadeRolls: 0, evasions: 0, shots: 0, hits: 0, repairs: new Int32Array(3), maxStress: 0, phaseEntries: Int32Array.of(1, 0, 0, 0), encounters: 0, enemiesDestroyed: 0, enemyDisables: 0, boardings: 0, boardersKilled: 0, jumps: 0, scrapEarned: 0, scrapSpent: 0, eventsResolved: 0, purchases: 0, shieldHits: 0, enemyFled: 0, surrenderOffers: 0, surrenders: 0, encountersWon: 0, boardersVented: 0 },
    injectionScratch: new Float64Array(R),
    stations: { level: Uint8Array.from(layout.stations.map((st) => st.allocation)), failed: new Uint8Array(N), repair: new Float64Array(N), occupant: new Int8Array(N).fill(-1), cursor: new Int16Array(N), heat: new Int16Array(N), coolant: new Uint8Array(N) },
    power: { capacity: REACTOR_CAPACITY },
    stick: { heldDir: new Int8Array(playerCount), repeat: new Int16Array(playerCount) },
    debris: { active: new Uint8Array(DEBRIS_SLOTS), stableId: new Int32Array(DEBRIS_SLOTS), room: new Int16Array(DEBRIS_SLOTS), impactTick: new Int32Array(DEBRIS_SLOTS), warned: new Uint8Array(DEBRIS_SLOTS), frequency: new Uint8Array(DEBRIS_SLOTS), scanned: new Uint8Array(DEBRIS_SLOTS), scan: new Float64Array(DEBRIS_SLOTS), kind: new Uint8Array(DEBRIS_SLOTS) },
    weapons: { charge: 0, selector: 0, torpedoStock: TORP_START, torpedoLoaded: 0, torpedoLoad: 0, torpedoRegen: 0, lastShotTick: -1, lastShotTarget: -1, lastShotResult: 0, lastShotKind: 0 },
    boarders: { active: new Uint8Array(BOARDER_SLOTS), stableId: new Int32Array(BOARDER_SLOTS), room: new Int16Array(BOARDER_SLOTS), health: new Float64Array(BOARDER_SLOTS), nextMoveTick: new Int32Array(BOARDER_SLOTS), aloneSince: new Int32Array(BOARDER_SLOTS).fill(-1), nextArrivalTick: (playerCount <= 2 ? BOARDING_FIRST_SMALL : BOARDING_FIRST) * TICK_HZ },
    run: { column: 0, node: 0, nodesReached: 0, jumpCharge: 0, scrap: 0, event: -1, eventChoice: -1, upgrades: new Uint8Array(STATION_COUNT), quirk: 0, startBonus: 0, encounter: 1, encounterTick: -1, driveBoost: 0, fieldNextTick: -1, ...generateMap(rng.map, RUN_COLUMNS) },
    enemy: { present: 0, hull: 0, stableId: 0, nextArrivalTick: (playerCount <= 2 ? ENCOUNTER_FIRST_SMALL : ENCOUNTER_FIRST) * TICK_HZ, nextShotTick: -1, departTick: -1, sysHp: new Float64Array(ENEMY_SYSTEM_COUNT), sysRepairTick: new Int32Array(ENEMY_SYSTEM_COUNT).fill(-1), shieldFreq: 0, scanned: 0, scan: 0, maxHull: 0, shieldLayers: 0, shieldRecharge: 0, shotArmTick: -1, fleeing: 0, surrenderIntact: 0, lastHitTick: -1, roomFire: new Float64Array(ENEMY_ROOMS), roomBreach: new Float64Array(ENEMY_ROOMS) },
    science: { scanning: 0 },
    crewCharacter: Uint8Array.from({ length: playerCount }, (_, pid) => characters[pid] ?? RECRUIT),
    skills: { xp: new Float64Array(playerCount * SKILL_COUNT), lastEngChangeTick: -1, lastDoorToggleTick: -1, lsDeliveredTick: -1, lastShotTick: -1 },
    scratch: { doorToggles: new Set<number>(), doorCycles: new Set<number>(), airlockToggles: new Set<number>(), satThisTick: new Uint8Array(playerCount), stoodThisTick: new Uint8Array(playerCount), activeThisTick: new Uint8Array(playerCount) }
  };
  state.run.quirk = nextInt(rng.quirk, QUIRK_COUNT);   // the one draw from the seventh stream, before any override
  if (options.quirk !== undefined) { const q = options.quirk; if (!Number.isInteger(q) || q < 0 || q >= QUIRK_COUNT) throw new Error(`quirk out of range: ${q}`); state.run.quirk = q; }
  for (let pid = 0; pid < playerCount; pid++) state.crew.push(spawnCrew(state, pid));
  applyHeadStarts(state);
  applyStartBonuses(state, options.unlocked ?? []);
  return state;
}

function spawnCrew(state: SimState, pid: number): number {
  const eid = addEntity(state.world);
  const sp = state.layout.spawns[pid]!;
  addComponent(state.world, eid, Position); Position.x[eid] = sp[0] + 0.5; Position.y[eid] = sp[1] + 0.5;
  addComponent(state.world, eid, Health); Health.cur[eid] = HEALTH_MAX;
  addComponent(state.world, eid, Life); Life.state[eid] = LifeState.Conscious; Life.bleed[eid] = 0; Life.reviveProgress[eid] = 0; Life.reviverPid[eid] = -1;
  addComponent(state.world, eid, Stable); Stable.id[eid] = state.nextStableId++;
  addComponent(state.world, eid, Owner); Owner.pid[eid] = pid;
  addComponent(state.world, eid, Seated); Seated.station[eid] = -1;
  return eid;
}

import type { ShipLayout } from './ship/schema';
import { STREAM_NAMES } from './state';
import { DEBRIS_SLOTS, SKILL_COUNT, BOARDER_SLOTS, SECTOR_COLUMNS, NODE_STRIDE, ENEMY_ROOMS, WEAPON_SLOTS } from './tuning';
import { STATION_COUNT } from './stationKinds';
import { ENEMY_SYSTEM_COUNT } from './enemy';

/**
 * SimState members deliberately outside the canonical flatten (so outside the hash and the snapshot), by dotted path.
 * tests/simStateCompleteness.test.ts fails when a SimState member is neither a canonical field nor listed here, so a
 * new field must be added to canonicalFields() below (and its snapshotValidation rule) or here, with a reason.
 */
export const NOT_SNAPSHOTTED: Readonly<Record<string, string>> = {
  layout: 'static input; identified by the $layoutId / $layoutHash header fields',
  derived: 'computed from layout by deriveLayout()',
  world: 'the bitECS world; crew component cells are serialised per player as crew.<pid>.*',
  crew: 'entity ids, not state; the crew is serialised by player index (crew.<pid>.*) with the $crewCount header',
  injectionScratch: 'per-step scratch: oxygen injection requested for the next hazard step',
  scratch: 'tick-scoped scratch, cleared at the start of every step',
  'weapons.target': 'serialised as the virtual weapons.$targetKind / $targetId / $targetRoom fields',
  'science.target': 'serialised as the virtual science.$targetKind / $targetId / $targetRoom fields',
};

export interface CanonicalField { name: string; count: number; offset: number; array: boolean; parts: string[] }

const cache = new WeakMap<ShipLayout, Map<string, CanonicalField[]>>();

/** The canonical numeric order, shared by serialization and portable validation.
 * Counts depend only on layout and player count; constructing it allocates no ECS world.
 */
export function canonicalFields(layout: ShipLayout, players: number): CanonicalField[] {
  const shape = [players, layout.rooms.length, layout.edges.length, layout.airlocks.length, layout.breachSites.length, layout.stations.length, layout.consoleGroups.length].join(':');
  let shapes = cache.get(layout);
  if (!shapes) { shapes = new Map(); cache.set(layout, shapes); }
  const cached = shapes.get(shape); if (cached) return cached;
  const fields: CanonicalField[] = [];
  let offset = 0;
  const add = (prefix: string, names: string, count?: number): void => {
    for (const key of names.split(' ')) {
      const name = prefix ? `${prefix}.${key}` : key;
      fields.push({ name, parts: name.split('.'), count: count ?? 1, offset, array: count !== undefined });
      offset += count ?? 1;
    }
  };
  const map = SECTOR_COLUMNS * NODE_STRIDE;
  add('', '$simVersion $layoutId $layoutHash tick nextStableId playerCount hull ended endReason $crewCount');
  for (const stream of STREAM_NAMES) add('rng', stream);
  add('rooms', 'o2 fire fireRepair impactTick', layout.rooms.length);
  add('doors', 'state closeTimer sealRequested', layout.edges.length);
  add('airlocks', 'open', layout.airlocks.length);
  add('breaches', 'active repair', layout.breachSites.length);
  add('o2Counters', 'injected breathed burned vented residual');
  add('director', 'phase phaseTick stress nextStressTick nextSpawnTick budgetLeft lastSpawnTick lastType');
  add('director', 'sinceProductive', STATION_COUNT);
  add('telemetry', 'firstDownTick firstDownPid firstDeathTick firstDeathPid impacts evadeRolls evasions shots hits maxStress encounters enemiesDestroyed enemyDisables boardings boardersKilled jumps scrapEarned scrapSpent eventsResolved purchases shieldHits enemyFled surrenderOffers surrenders encountersWon boardersVented lockedShots teamSeconds revives timedRolls timedEvades votesUnanimous votesSplit');
  add('telemetry', 'mannedTicks', STATION_COUNT);
  add('telemetry', 'idleRun longestIdle prevLife', players);
  add('telemetry', 'spawns', 4); add('telemetry', 'repairs', 3); add('telemetry', 'phaseEntries', 4);
  add('stations', 'level failed repair occupant heat coolant', layout.stations.length);
  add('power', 'capacity'); add('groups', 'tab', layout.consoleGroups.length);
  add('debris', 'active stableId room impactTick warned frequency scanned scan kind', DEBRIS_SLOTS);
  add('weapons', '$targetKind $targetId $targetRoom charge selector torpedoStock torpedoLoaded torpedoLoad torpedoRegen lastShotTick lastShotTarget lastShotResult lastShotKind torpedoFed torpedoDropTick');
  add('weapons', 'slot charge2', WEAPON_SLOTS);
  add('weapons', 'cargo lootTick lootId lootPlace lootBought lastShotSelector lastShotDamage');
  add('enemy', 'present hull stableId nextArrivalTick nextShotTick departTick');
  add('enemy', 'sysHp sysRepairTick', ENEMY_SYSTEM_COUNT);
  add('enemy', 'shieldFreq scanned scan maxHull shieldLayers shieldRecharge shotArmTick fleeing surrenderIntact lastHitTick shieldRotateTick lockUntilTick');
  add('enemy', 'roomFire roomBreach', ENEMY_ROOMS); add('enemy', 'ionUntil', ENEMY_SYSTEM_COUNT);
  add('boarders', 'nextArrivalTick'); add('boarders', 'active stableId room health nextMoveTick aloneSince', BOARDER_SLOTS);
  add('run', 'column node nodesReached jumpCharge');
  add('run', 'colNodes', SECTOR_COLUMNS); add('run', 'edgeMask nodeType', map);
  add('run', 'scrap event eventChoice'); add('run', 'upgrades', STATION_COUNT);
  add('run', 'reactorBonus boughtTick boughtKind quirk startBonus encounter encounterTick driveBoost fieldNextTick evadeUntilTick evadeReadyTick');
  add('run', 'vote', players);
  add('run', 'eventOpenTick voteTick jumpPending jumpPendingTick sector fuel pursuit waitUntilTick pursuitFought calm wakeTick');
  add('run', 'visited', map); add('run', 'shopWeapon finalBeacon eventsSeen');
  add('run', 'ambush cache revealed', map); add('run', 'ambushState arrivalTick');
  add('science', '$targetKind $targetId $targetRoom scanning system systemState systemStartTick systemTick systemResult');
  add('skills', 'xp', players * SKILL_COUNT); add('skills', 'lastEngChangeTick lastDoorToggleTick lsDeliveredTick lastShotTick');
  add('', 'crewCharacter carrying', players);
  for (let p = 0; p < players; p++) add(`crew.${p}`, 'id x y health life bleed reviveProgress reviverPid station');
  shapes.set(shape, fields);
  return fields;
}

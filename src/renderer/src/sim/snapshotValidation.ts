import { MAX_PLAYERS } from '../../../shared/intent';
import { canonicalFields } from './canonicalFields';
import type { CanonicalField } from './canonicalFields';
import { CHARACTERS } from './characters';
import { EVENT_DEFS } from './eventDefs';
import { LOOT_WEAPON_TYPES } from './weaponDefs';
import type { ShipLayout } from './ship/schema';
import type { Derived } from './ship/derived';
import { STATION_COUNT } from './stationKinds';
import { HULL_MAX, HEALTH_MAX, HEAT_MAX, COOLANT_MAX_PER_STATION, ENEMY_ROOMS, ENEMY_SYS_HP, BOARDER_HEALTH, FREQ_COUNT, NODE_STRIDE, SECTOR_COLUMNS, SECTORS, QUIRK_COUNT, UPGRADE_MAX, REACTOR_BONUS_MAX, STATION_MAX, STATION_OVERDRIVE, TORP_CAP, WEAPON_SLOTS, FIRE_CAP, BLEEDOUT_TIME } from './tuning';

type Range = readonly [min: number, max: number, integer?: boolean];
const integer: Range = [0, Number.MAX_SAFE_INTEGER, true];
const real: Range = [0, Number.MAX_SAFE_INTEGER];
const signedReal: Range = [-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
const signedTick: Range = [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, true];
const int32: Range = [-2147483648, 2147483647, true];
const bit: Range = [0, 1, true];
const unit: Range = [0, 1];
const rules = new Map<string, Range>();
function rule(names: string, range: Range): void { for (const name of names.split(' ')) rules.set(name, range); }
rule('ended airlocks.open breaches.active doors.sealRequested stations.failed debris.active debris.warned debris.scanned weapons.torpedoLoaded weapons.torpedoFed weapons.lootBought enemy.present enemy.scanned enemy.fleeing enemy.surrenderIntact boarders.active run.driveBoost run.pursuitFought run.calm run.visited run.finalBeacon run.ambush run.cache run.revealed science.scanning carrying', bit);
rule('rooms.fireRepair breaches.repair stations.repair weapons.charge weapons.torpedoLoad weapons.torpedoRegen weapons.charge2 debris.scan enemy.scan enemy.shieldRecharge run.jumpCharge science.system', unit);
rule('rooms.o2 rooms.fire doors.closeTimer o2Counters.injected o2Counters.breathed o2Counters.burned o2Counters.vented director.stress telemetry.maxStress telemetry.teamSeconds enemy.hull enemy.maxHull enemy.sysHp enemy.roomFire enemy.roomBreach boarders.health skills.xp weapons.lastShotDamage', real);
rule('o2Counters.residual run.pursuit', signedReal);
rule('endReason director.phase doors.state weapons.lootPlace', [0, 3, true]);
rule('debris.kind weapons.lastShotResult science.systemState run.ambushState telemetry.prevLife', [0, 2, true]);
rule('weapons.lastShotKind', [0, 1, true]);
rule('debris.frequency enemy.shieldFreq', [0, FREQ_COUNT, true]);
rule('weapons.selector weapons.lastShotSelector', [0, FREQ_COUNT + WEAPON_SLOTS, true]);
rule('weapons.slot weapons.cargo weapons.lootId run.shopWeapon', [0, LOOT_WEAPON_TYPES, true]);
rule('weapons.torpedoStock', [0, TORP_CAP, true]);
rule('stations.heat', [0, HEAT_MAX, true]); rule('stations.coolant', [0, COOLANT_MAX_PER_STATION, true]);
rule('director.lastType', [-1, 3, true]); rule('run.encounter', [0, 4, true]);
rule('run.column', [0, SECTOR_COLUMNS - 1, true]); rule('run.node', [0, NODE_STRIDE - 1, true]);
rule('run.colNodes', [1, NODE_STRIDE, true]); rule('run.edgeMask', [0, (1 << NODE_STRIDE) - 1, true]);
rule('run.nodeType', [0, 4, true]); rule('run.sector', [0, SECTORS - 1, true]);
rule('run.event', [-1, EVENT_DEFS.length - 1, true]);
rule('run.vote run.eventChoice', [-1, Math.max(...EVENT_DEFS.map(e => e.choices.length)) - 1, true]);
rule('run.upgrades', [0, UPGRADE_MAX, true]); rule('run.reactorBonus', [0, REACTOR_BONUS_MAX, true]);
rule('run.boughtKind', [-1, STATION_COUNT, true]); rule('run.quirk', [0, QUIRK_COUNT - 1, true]);
rule('run.startBonus', [0, 7, true]); rule('run.jumpPending', [-1, SECTOR_COLUMNS * NODE_STRIDE, true]);
rule('crewCharacter', [0, CHARACTERS.length - 1, true]); rule('hull', [0, HULL_MAX]);
rule('rooms.fire', [0, FIRE_CAP]); rule('nextStableId', [1, Number.MAX_SAFE_INTEGER, true]);
rule('weapons.lastShotTarget', [-1, Number.MAX_SAFE_INTEGER, true]);
rule('director.sinceProductive telemetry.mannedTicks telemetry.idleRun telemetry.longestIdle telemetry.spawns telemetry.repairs telemetry.phaseEntries debris.stableId boarders.stableId', [0, 2147483647, true]);
rule('rooms.impactTick debris.impactTick enemy.sysRepairTick enemy.ionUntil boarders.nextMoveTick boarders.aloneSince', int32);
rule('enemy.sysHp', [0, ENEMY_SYS_HP]); rule('boarders.health', [0, BOARDER_HEALTH]);
rule('science.systemResult', [0, (SECTOR_COLUMNS * NODE_STRIDE << 3) | 7, true]);

function rangeFor(field: CanonicalField, layout: ShipLayout, derived: Derived, players: number, index: number): Range {
  const name = field.name, [group, key, crewKey] = field.parts;
  if (group === 'rng') return [0, 4294967295, true];
  if (key === '$targetKind') return [0, 2, true];
  if (key === '$targetId') return integer;
  if (key === '$targetRoom') return [-1, ENEMY_ROOMS - 1, true];
  if (group === 'crew') {
    switch (crewKey) {
      case 'id': return [1, Number.MAX_SAFE_INTEGER, true];
      case 'x': return [0, layout.width]; case 'y': return [0, layout.height];
      case 'health': return [0, HEALTH_MAX]; case 'life': return [0, 2, true];
      case 'bleed': return [0, BLEEDOUT_TIME]; case 'reviveProgress': return unit;
      case 'reviverPid': return [-1, players - 1, true];
      case 'station': return [-1, layout.stations.length - 1, true];
    }
  }
  if (name === 'playerCount' || name === '$crewCount') return [1, MAX_PLAYERS, true];
  if (name === 'stations.occupant' || name === 'telemetry.firstDownPid' || name === 'telemetry.firstDeathPid') return [-1, players - 1, true];
  if (name === 'debris.room' || name === 'boarders.room') return [0, layout.rooms.length - 1, true];
  if (name === 'groups.tab') return [0, derived.groupStations[index]!.length - 1, true];
  if (name === 'rooms.o2') return [0, derived.volume[index]! + 1e-9];
  if (name === 'stations.level') return [0, STATION_MAX[derived.stationKind[index]!]! + UPGRADE_MAX + STATION_OVERDRIVE, true];
  const explicit = rules.get(name); if (explicit) return explicit;
  // Tick stamps may precede the current visit, including negative historical ticks.
  if (key?.endsWith('Tick')) return signedTick;
  return integer;
}

const compiled = new WeakMap<CanonicalField[], Range[]>();
/** One bounded numeric pass; the field plan is reused by every publication. */
export function validateCanonicalValues(layout: ShipLayout, derived: Derived, players: number, values: number[]): void {
  const fields = canonicalFields(layout, players), last = fields[fields.length - 1]!;
  if (values.length !== last.offset + last.count) throw new Error('snapshot length does not match layout and player count');
  // Layout-dependent bounds are cheap and compiled only for a new layout/shape.
  let bounds = compiled.get(fields);
  if (!bounds) {
    bounds = [];
    for (const f of fields) for (let k = 0; k < f.count; k++) bounds.push(rangeFor(f, layout, derived, players, k));
    compiled.set(fields, bounds);
  }
  for (let i = 0; i < values.length; i++) {
    const value = values[i], [min, max, whole] = bounds[i]!;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (whole && !Number.isSafeInteger(value))) {
      const field = fields.find(f => i >= f.offset && i < f.offset + f.count)!;
      throw new Error(`snapshot field ${field.name} has invalid value ${String(value)}`);
    }
  }
  for (const f of fields) if (f.parts[1] === '$targetKind') {
    const kind = values[f.offset], id = values[f.offset + 1], room = values[f.offset + 2];
    if ((kind === 0 && (id !== 0 || room !== -1)) || (kind !== 0 && id === 0) || (kind === 1 && room !== -1) || (kind === 2 && room! < 0)) throw new Error('snapshot target fields disagree');
  }
}

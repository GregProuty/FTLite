import type { SimState } from './state';
import { STREAM_NAMES } from './state';
import { Position, Health, Life, Stable, Seated } from './components';
import { SIM_VERSION, DEBRIS_SLOTS, SKILL_COUNT } from './tuning';
import { STATION_COUNT } from './stationKinds';

export const FLATTEN_MANIFEST = ['header', 'rng', 'rooms', 'doors', 'breaches', 'o2Counters', 'director', 'telemetry', 'stations', 'power', 'stick', 'debris', 'weapons', 'science', 'skills', 'characters', 'crew'];
const HEADER_FIELDS = 10, COUNTER_FIELDS = 5, DIRECTOR_FIELDS = 8 + STATION_COUNT, CREW_FIELDS = 9, STATION_FIELDS = 7, POWER_FIELDS = 1, STICK_FIELDS = 2, ROOM_FIELDS = 4, DEBRIS_FIELDS = 8, WEAPONS_FIELDS = 6, SCIENCE_FIELDS = 1, SKILL_STAMP_FIELDS = 4;
const TELEMETRY_SCALARS = 10, TELEMETRY_FIXED = STATION_COUNT + 4 + 3 + 4;

/** Ship identity (id hash + content hash) and sim version as numbers, so they are part of the canonical state (spec §4). */
export function layoutHashNumber(s: SimState): number { return parseInt(s.derived.layoutHash, 16); }
export function layoutIdNumber(s: SimState): number { return parseInt(s.derived.idHash, 16); }

function size(s: SimState): number {
  return HEADER_FIELDS + STREAM_NAMES.length + s.rooms.o2.length * ROOM_FIELDS + s.doors.state.length * 3
    + s.breaches.active.length * 2 + COUNTER_FIELDS + DIRECTOR_FIELDS + TELEMETRY_SCALARS + TELEMETRY_FIXED + 3 * s.playerCount
    + s.stations.level.length * STATION_FIELDS + POWER_FIELDS + s.playerCount * STICK_FIELDS
    + DEBRIS_SLOTS * DEBRIS_FIELDS + WEAPONS_FIELDS + SCIENCE_FIELDS + s.playerCount * SKILL_COUNT + SKILL_STAMP_FIELDS + s.crew.length + s.crew.length * CREW_FIELDS;
}

/** Canonical order. Crew by PlayerId (their StableIds were allocated in that order). -0 is written as 0. */
export function flatten(s: SimState): Float64Array {
  const out = new Float64Array(size(s));
  let i = 0;
  const put = (v: number): void => { out[i++] = v === 0 ? 0 : v; };
  put(SIM_VERSION); put(layoutIdNumber(s)); put(layoutHashNumber(s)); put(s.tick); put(s.nextStableId); put(s.playerCount); put(s.hull); put(s.ended); put(s.endReason); put(s.crew.length);
  for (const n of STREAM_NAMES) put(s.rng[n].s);
  for (const v of s.rooms.o2) put(v); for (const v of s.rooms.fire) put(v); for (const v of s.rooms.fireRepair) put(v);
  for (const v of s.rooms.impactTick) put(v);
  for (const v of s.doors.state) put(v); for (const v of s.doors.closeTimer) put(v); for (const v of s.doors.sealRequested) put(v);
  for (const v of s.breaches.active) put(v); for (const v of s.breaches.repair) put(v);
  const c = s.o2Counters; put(c.injected); put(c.breathed); put(c.burned); put(c.vented); put(c.residual);
  const dr = s.director; put(dr.phase); put(dr.phaseTick); put(dr.stress); put(dr.nextStressTick); put(dr.nextSpawnTick); put(dr.budgetLeft); put(dr.lastSpawnTick); put(dr.lastType); for (const v of dr.sinceProductive) put(v);
  const tm = s.telemetry; put(tm.firstDownTick); put(tm.firstDownPid); put(tm.firstDeathTick); put(tm.firstDeathPid); put(tm.impacts); put(tm.evadeRolls); put(tm.evasions); put(tm.shots); put(tm.hits); put(tm.maxStress);
  for (const v of tm.mannedTicks) put(v); for (const v of tm.idleRun) put(v); for (const v of tm.longestIdle) put(v); for (const v of tm.prevLife) put(v);
  for (const v of tm.spawns) put(v); for (const v of tm.repairs) put(v); for (const v of tm.phaseEntries) put(v);
  for (const v of s.stations.level) put(v); for (const v of s.stations.failed) put(v); for (const v of s.stations.repair) put(v);
  for (const v of s.stations.occupant) put(v); for (const v of s.stations.cursor) put(v);
  for (const v of s.stations.heat) put(v); for (const v of s.stations.coolant) put(v);
  put(s.power.capacity);
  for (let p = 0; p < s.playerCount; p++) put(s.stick.heldDir[p]!); for (let p = 0; p < s.playerCount; p++) put(s.stick.repeat[p]!);
  const dbf = s.debris;
  for (const v of dbf.active) put(v); for (const v of dbf.stableId) put(v); for (const v of dbf.room) put(v); for (const v of dbf.impactTick) put(v); for (const v of dbf.warned) put(v);
  for (const v of dbf.frequency) put(v); for (const v of dbf.scanned) put(v); for (const v of dbf.scan) put(v);
  const w = s.weapons; put(w.charge); put(w.selector); put(w.torpedoStock); put(w.torpedoLoaded); put(w.torpedoLoad); put(w.torpedoRegen); put(s.science.scanning);
  for (const v of s.skills.xp) put(v); put(s.skills.lastEngChangeTick); put(s.skills.lastDoorToggleTick); put(s.skills.lsDeliveredTick); put(s.skills.lastShotTick);
  for (const v of s.crewCharacter) put(v);
  for (const eid of s.crew) {
    put(Stable.id[eid]!); put(Position.x[eid]!); put(Position.y[eid]!); put(Health.cur[eid]!);
    put(Life.state[eid]!); put(Life.bleed[eid]!); put(Life.reviveProgress[eid]!); put(Life.reviverPid[eid]!); put(Seated.station[eid]!);
  }
  if (i !== out.length) throw new Error(`flatten size mismatch ${i} vs ${out.length}`);
  return out;
}

/** Inverse of flatten into a state created for the same layout and playerCount. */
export function unflatten(s: SimState, v: Float64Array): void {
  let i = 0;
  const get = (): number => v[i++]!;
  const ver = get(), idh = get(), lh = get();
  if (ver !== SIM_VERSION) throw new Error(`snapshot sim version ${ver} does not match ${SIM_VERSION}`);
  if (idh !== layoutIdNumber(s) || lh !== layoutHashNumber(s)) throw new Error('snapshot layout does not match the loaded layout');
  s.tick = get(); s.nextStableId = get(); s.playerCount = get(); s.hull = get(); s.ended = get(); s.endReason = get();
  const crewCount = get();
  if (crewCount !== s.crew.length) throw new Error(`snapshot crew count ${crewCount} does not match state ${s.crew.length}`);
  for (const n of STREAM_NAMES) s.rng[n].s = get();
  for (let r = 0; r < s.rooms.o2.length; r++) s.rooms.o2[r] = get();
  for (let r = 0; r < s.rooms.fire.length; r++) s.rooms.fire[r] = get();
  for (let r = 0; r < s.rooms.fireRepair.length; r++) s.rooms.fireRepair[r] = get();
  for (let r = 0; r < s.rooms.impactTick.length; r++) s.rooms.impactTick[r] = get();
  for (let d = 0; d < s.doors.state.length; d++) s.doors.state[d] = get();
  for (let d = 0; d < s.doors.closeTimer.length; d++) s.doors.closeTimer[d] = get();
  for (let d = 0; d < s.doors.sealRequested.length; d++) s.doors.sealRequested[d] = get();
  for (let b = 0; b < s.breaches.active.length; b++) s.breaches.active[b] = get();
  for (let b = 0; b < s.breaches.repair.length; b++) s.breaches.repair[b] = get();
  s.o2Counters.injected = get(); s.o2Counters.breathed = get(); s.o2Counters.burned = get(); s.o2Counters.vented = get(); s.o2Counters.residual = get();
  for (const k of ['phase', 'phaseTick', 'stress', 'nextStressTick', 'nextSpawnTick', 'budgetLeft', 'lastSpawnTick', 'lastType'] as const) s.director[k] = get();
  for (let k = 0; k < s.director.sinceProductive.length; k++) s.director.sinceProductive[k] = get();
  const tm = s.telemetry;
  for (const k of ['firstDownTick', 'firstDownPid', 'firstDeathTick', 'firstDeathPid', 'impacts', 'evadeRolls', 'evasions', 'shots', 'hits', 'maxStress'] as const) tm[k] = get();
  for (const arr of [tm.mannedTicks, tm.idleRun, tm.longestIdle, tm.prevLife, tm.spawns, tm.repairs, tm.phaseEntries]) for (let k = 0; k < arr.length; k++) arr[k] = get();
  for (let i = 0; i < s.stations.level.length; i++) s.stations.level[i] = get();
  for (let i = 0; i < s.stations.failed.length; i++) s.stations.failed[i] = get();
  for (let i = 0; i < s.stations.repair.length; i++) s.stations.repair[i] = get();
  for (let i = 0; i < s.stations.occupant.length; i++) s.stations.occupant[i] = get();
  for (let i = 0; i < s.stations.cursor.length; i++) s.stations.cursor[i] = get();
  for (let i = 0; i < s.stations.heat.length; i++) s.stations.heat[i] = get();
  for (let i = 0; i < s.stations.coolant.length; i++) s.stations.coolant[i] = get();
  s.power.capacity = get();
  for (let p = 0; p < s.playerCount; p++) s.stick.heldDir[p] = get(); for (let p = 0; p < s.playerCount; p++) s.stick.repeat[p] = get();
  const db = s.debris;
  for (let k = 0; k < DEBRIS_SLOTS; k++) db.active[k] = get(); for (let k = 0; k < DEBRIS_SLOTS; k++) db.stableId[k] = get();
  for (let k = 0; k < DEBRIS_SLOTS; k++) db.room[k] = get(); for (let k = 0; k < DEBRIS_SLOTS; k++) db.impactTick[k] = get();
  for (let k = 0; k < DEBRIS_SLOTS; k++) db.warned[k] = get();
  for (let k = 0; k < DEBRIS_SLOTS; k++) db.frequency[k] = get(); for (let k = 0; k < DEBRIS_SLOTS; k++) db.scanned[k] = get(); for (let k = 0; k < DEBRIS_SLOTS; k++) db.scan[k] = get();
  s.weapons.charge = get(); s.weapons.selector = get(); s.weapons.torpedoStock = get(); s.weapons.torpedoLoaded = get(); s.weapons.torpedoLoad = get(); s.weapons.torpedoRegen = get();
  s.science.scanning = get();
  for (let k = 0; k < s.skills.xp.length; k++) s.skills.xp[k] = get();
  s.skills.lastEngChangeTick = get(); s.skills.lastDoorToggleTick = get(); s.skills.lsDeliveredTick = get(); s.skills.lastShotTick = get();
  for (let p = 0; p < s.crewCharacter.length; p++) s.crewCharacter[p] = get();
  for (const eid of s.crew) {
    Stable.id[eid] = get(); Position.x[eid] = get(); Position.y[eid] = get(); Health.cur[eid] = get();
    Life.state[eid] = get(); Life.bleed[eid] = get(); Life.reviveProgress[eid] = get(); Life.reviverPid[eid] = get(); Seated.station[eid] = get();
  }
  if (i !== v.length) throw new Error(`snapshot length ${v.length} does not match expected ${i}`);
}

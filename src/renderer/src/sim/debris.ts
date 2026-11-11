import type { SimState } from './state';
import { Position, Health, Life, LifeState } from './components';
import { nextFloat, nextInt } from '../../../shared/rng';
import { roomAt } from './grid';
import { StationKind } from './stationKinds';
import { stationOnline, stationOutput } from './stations';
import { igniteRoom } from './hazards/fire';
import { activateBreach } from './hazards/breach';
import { downCrew } from './crew';
import { nextTarget } from './debrisTargets';
import { Skill, addXp } from './skills';
import { XP_PER_EVADE_ROLL, TICK_HZ, DEBRIS_FLIGHT, DEBRIS_FLIGHT_JITTER, SCIENCE_LEAD_UNMANNED, SCIENCE_LEAD_BASE, SCIENCE_LEAD_SCALE, EVADE_BASE, EVADE_SCALE, DEBRIS_HULL_DAMAGE, DEBRIS_CREW_DAMAGE, FREQ_COUNT } from './tuning';

export function activeDebrisCount(state: SimState): number {
  let n = 0; for (const a of state.debris.active) if (a) n++; return n;
}

/** Spawn one hidden object: uniform target room and a jittered flight from rng.hazards (spec 2a-ii section 4). Returns the slot, or -1 if the table is full. */
export function spawnDebris(state: SimState): number {
  const db = state.debris;
  let slot = -1;
  for (let k = 0; k < db.active.length; k++) if (!db.active[k]) { slot = k; break; }
  if (slot < 0) return -1;
  const room = nextInt(state.rng.hazards, state.derived.volume.length);
  const flight = DEBRIS_FLIGHT + (2 * nextFloat(state.rng.hazards) - 1) * DEBRIS_FLIGHT_JITTER;
  const frequency = 1 + nextInt(state.rng.hazards, FREQ_COUNT);
  db.frequency[slot] = frequency; db.scanned[slot] = 0; db.scan[slot] = 0;
  db.active[slot] = 1; db.stableId[slot] = state.nextStableId++; db.room[slot] = room;
  db.impactTick[slot] = state.tick + Math.round(flight * TICK_HZ); db.warned[slot] = 0;
  return slot;
}

const TARGETING_KINDS = [StationKind.Weapons, StationKind.Science] as const;

/** Free a slot. Every targeting console's cursor is retargeted by StableId before the identity is cleared, so the target order survives removal. */
export function removeDebris(state: SimState, slot: number): void {
  const db = state.debris;
  for (const kind of TARGETING_KINDS) {
    const i = state.derived.stationOfKind[kind]!;
    if (i >= 0 && state.stations.cursor[i] === slot) state.stations.cursor[i] = nextTarget(state, db.stableId[slot]!, slot);
  }
  db.active[slot] = 0; db.warned[slot] = 0; db.stableId[slot] = 0; db.frequency[slot] = 0; db.scanned[slot] = 0; db.scan[slot] = 0;
}

/** Detection lead in seconds: the unmanned value unless Science is online and occupied. */
export function scienceLead(state: SimState): number {
  const sci = state.derived.stationOfKind[StationKind.Science]!;
  if (sci < 0 || !stationOnline(state, sci) || state.stations.occupant[sci]! < 0) return SCIENCE_LEAD_UNMANNED;
  return SCIENCE_LEAD_BASE + SCIENCE_LEAD_SCALE * stationOutput(state, sci);
}

/** Pure evasion threshold: a roll u in [0, 1) evades when below base + scale x Navigation output. */
export function evades(u: number, output: number): boolean {
  return u < EVADE_BASE + EVADE_SCALE * output;   // tests probe values clear of the float boundary (0.2 + 0.4 x 0.375 is 0.35000000000000003)
}

function resolveImpact(state: SimState, slot: number): void {
  const d = state.derived, db = state.debris, room = db.room[slot]!;
  const nav = d.stationOfKind[StationKind.Navigation]!;
  if (nav >= 0 && stationOnline(state, nav) && state.stations.occupant[nav]! >= 0) {
    addXp(state, state.stations.occupant[nav]!, Skill.Navigation, XP_PER_EVADE_ROLL);   // the roll itself is the productive act
    if (evades(nextFloat(state.rng.combat), stationOutput(state, nav))) { removeDebris(state, slot); return; }
  }
  state.hull = Math.max(0, state.hull - DEBRIS_HULL_DAMAGE);
  const breachFirst = nextFloat(state.rng.hazards) < 0.5;
  const tryBreach = (): boolean => {
    for (let s = 0; s < d.siteRoom.length; s++) if (d.siteRoom[s] === room && !state.breaches.active[s]) return activateBreach(state, s);
    return false;
  };
  const tryFire = (): boolean => igniteRoom(state, room);
  if (breachFirst) { if (!tryBreach()) tryFire(); } else if (!tryFire()) tryBreach();
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Life.state[eid] !== LifeState.Conscious) continue;
    if (roomAt(state, Position.x[eid]!, Position.y[eid]!) !== room) continue;
    Health.cur[eid] = Math.max(0, Health.cur[eid]! - DEBRIS_CREW_DAMAGE);
    if (Health.cur[eid] === 0) downCrew(state, pid);
  }
  state.rooms.impactTick[room] = state.tick;
  removeDebris(state, slot);
}

/** Step: detection for every active object, then impacts for every object due this tick, ascending slot (spec 2a-ii section 4). */
export function debrisSystem(state: SimState): void {
  const db = state.debris, lead = scienceLead(state);
  for (let k = 0; k < db.active.length; k++) {
    if (!db.active[k] || db.warned[k]) continue;
    if (db.impactTick[k]! - state.tick <= lead * TICK_HZ) {   // compare in ticks: lead x 60 is exact for the tuning values, remaining x DT is not
      db.warned[k] = 1;
      for (const kind of TARGETING_KINDS) {   // first warning auto-selects
        const i = state.derived.stationOfKind[kind]!;
        if (i >= 0 && state.stations.occupant[i]! >= 0 && state.stations.cursor[i]! < 0) state.stations.cursor[i] = k;
      }
    }
  }
  for (let k = 0; k < db.active.length; k++) if (db.active[k] && db.impactTick[k]! <= state.tick) resolveImpact(state, k);
}

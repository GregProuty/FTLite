// Duel fire (duel-fire spec §1): the crew ship's fires, kept in the interior's own rooms.fire and rooms.fireRepair (so
// the duel hash and snapshot carry them with no new field). Here: ignition from enemy hits (with Task 7's breach roll),
// the level damage cadence and the extinguish work. Growth by oxygen, shrink and spread are the sector fireStep's, run
// on the duel's hazard tick (Engineering spike spec §4).
import { chance } from '../../../../shared/rng';
import { activateBreach } from '../hazards/breach';
import { extinguishRoom, igniteRoom } from '../hazards/fire';
import type { DuelEvent } from '../tactical/state';
import type { DuelState, RepairPoint } from './state';
import { siteOfRoom } from './hazards';
import {
  DUEL_BREACH_CHANCE_LASER, DUEL_BREACH_CHANCE_MISSILE, DUEL_EXTINGUISH_RATE_SOLO, DUEL_EXTINGUISH_RATE_TEAM, DUEL_EXTINGUISH_UNITS, DUEL_FIRE_CHANCE_LASER, DUEL_FIRE_CHANCE_MISSILE, DUEL_FIRE_DAMAGE_TICKS
} from './tuning';

/** Whether a repair point's room is burning. */
export function pointBurning(d: DuelState, p: RepairPoint): boolean { return d.interior.rooms.fire[p.room]! > 0; }

/** A point's extinguish progress, 0..1 of DUEL_EXTINGUISH_UNITS. */
export function extinguishProgress(d: DuelState, p: RepairPoint): number { return d.interior.rooms.fireRepair[p.room]!; }

/** The fire chance of a tactical event that is an enemy hit on the crew ship's Room `room`, or 0: a laser that hit,
 *  fired by ship 1, or a missile that ended on ship 0. */
function hitChance(e: DuelEvent): number {
  if (e.kind !== 'laser' && e.kind !== 'missileEnd') return 0;   // Sci-1's hostile, scanDone and salvage are no hits
  if (e.room < 0) return 0;
  if (e.kind === 'laser') return e.ship === 1 && e.hit ? DUEL_FIRE_CHANCE_LASER : 0;
  return e.cause === 'ship' && e.target === 0 ? DUEL_FIRE_CHANCE_MISSILE : 0;
}

/** Engineering spike spec §4: a qualifying hit's breach chance (the hits hitChance counts), or 0. */
function breachChance(e: DuelEvent): number {
  if (hitChance(e) === 0) return 0;
  return e.kind === 'laser' ? DUEL_BREACH_CHANCE_LASER : DUEL_BREACH_CHANCE_MISSILE;
}

/** Engineering spike spec §4 (Decision 10): per qualifying hit in event order, the fire roll (none for a burning room;
 *  success ignites and pushes fireStart), then the breach roll on the room's site (none when it has no site or the site
 *  is active; success activates it). Every draw is rng.hazards. */
export function hitRolls(d: DuelState, events: readonly DuelEvent[]): void {
  for (const e of events) {
    if (e.kind !== 'laser' && e.kind !== 'missileEnd') continue;
    const p = hitChance(e);
    if (p === 0) continue;
    const point = d.points.find((q) => q.tacticalRoom === e.room);
    if (!point) continue;
    if (!pointBurning(d, point) && chance(d.interior.rng.hazards, p) && igniteRoom(d.interior, point.room)) d.events.push({ kind: 'fireStart', room: e.room });
    const site = siteOfRoom(d, point.room);
    if (site >= 0 && !d.interior.breaches.active[site] && chance(d.interior.rng.hazards, breachChance(e))) activateBreach(d.interior, site);
  }
}

/** One rng.hazards draw per qualifying hit, in event order; success ignites the Room's repair room at FIRE_START. A
 *  room that is already burning makes no roll. Pushes fireStart per ignition. */
export function igniteFromHits(d: DuelState, events: readonly DuelEvent[]): void {
  for (const e of events) {
    if (e.kind !== 'laser' && e.kind !== 'missileEnd') continue;
    const p = hitChance(e);
    if (p === 0) continue;
    const point = d.points.find((q) => q.tacticalRoom === e.room);
    if (!point || pointBurning(d, point)) continue;
    if (chance(d.interior.rng.hazards, p) && igniteRoom(d.interior, point.room)) d.events.push({ kind: 'fireStart', room: e.room });
  }
}

/** The step's fire after stepDuel (`tick` is the tick being stepped), Engineering spike spec §4: on the round's every
 *  DUEL_FIRE_DAMAGE_TICKS-th tick each burning point room raises its Room one level (to 2, the weapon-hit cap); then this
 *  tick's hits roll for new fires. Growth, shrink and spread are the sector fireStep's alone, on the hazard tick. */
export function firePhase(d: DuelState, tick: number): void {
  const rooms = d.tactical.systems[0].rooms;
  if ((tick - d.baseTick) % DUEL_FIRE_DAMAGE_TICKS === DUEL_FIRE_DAMAGE_TICKS - 1)
    for (const p of d.points) if (pointBurning(d, p) && rooms[p.tacticalRoom]! < 2) rooms[p.tacticalRoom as 0 | 1 | 2]++;
  hitRolls(d, d.tactical.events);   // Engineering spike spec §4: fire then breach, per hit
}

/** Add `workers` players' extinguish work to a burning room this tick (any room, Engineering spike spec §4); true when
 *  the fire went out. Work is whole units (fireRepair × DUEL_EXTINGUISH_UNITS, rounded back so the fraction never drifts). */
export function extinguishRoomWork(d: DuelState, room: number, workers: number): boolean {
  const done = d.interior.rooms.fireRepair, units = Math.round(done[room]! * DUEL_EXTINGUISH_UNITS) + (workers === 1 ? DUEL_EXTINGUISH_RATE_SOLO : workers * DUEL_EXTINGUISH_RATE_TEAM);
  if (units >= DUEL_EXTINGUISH_UNITS) { extinguishRoom(d.interior, room); return true; }
  done[room] = units / DUEL_EXTINGUISH_UNITS;
  return false;
}

/** A repair point's fire: extinguishRoomWork on its room. */
export function extinguishWork(d: DuelState, p: RepairPoint, workers: number): boolean { return extinguishRoomWork(d, p.room, workers); }

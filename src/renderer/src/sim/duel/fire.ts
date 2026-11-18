// Duel fire (duel-fire spec §1): the crew ship's fires, kept in the interior's own rooms.fire and rooms.fireRepair (so
// the duel hash and snapshot carry them with no new field). Only the pieces the duel uses run: ignition from enemy hits,
// growth to FIRE_CAP, the level damage cadence and the extinguish work. The sector's fireStep never runs here: no
// oxygen, no shrink and no spread, so a duel fire burns until a player puts it out.
import { chance } from '../../../../shared/rng';
import { extinguishRoom, igniteRoom } from '../hazards/fire';
import type { DuelEvent } from '../tactical/state';
import { FIRE_CAP } from '../tuning';
import type { DuelState, RepairPoint } from './state';
import {
  DUEL_EXTINGUISH_RATE_SOLO, DUEL_EXTINGUISH_RATE_TEAM, DUEL_EXTINGUISH_UNITS, DUEL_FIRE_CHANCE_LASER, DUEL_FIRE_CHANCE_MISSILE, DUEL_FIRE_DAMAGE_TICKS, DUEL_FIRE_GROW
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

/** The step's fire after stepDuel (`tick` is the tick being stepped): every burning point room grows DUEL_FIRE_GROW (to
 *  FIRE_CAP); on the round's every DUEL_FIRE_DAMAGE_TICKS-th tick each burning room raises its Room one level (to 2,
 *  the weapon-hit cap); then this tick's hits roll for new fires. */
export function firePhase(d: DuelState, tick: number): void {
  const fire = d.interior.rooms.fire, rooms = d.tactical.systems[0].rooms;
  const damage = (tick - d.baseTick) % DUEL_FIRE_DAMAGE_TICKS === DUEL_FIRE_DAMAGE_TICKS - 1;
  for (const p of d.points) {
    if (!pointBurning(d, p)) continue;
    fire[p.room] = Math.min(FIRE_CAP, fire[p.room]! + DUEL_FIRE_GROW);
    if (damage && rooms[p.tacticalRoom]! < 2) rooms[p.tacticalRoom as 0 | 1 | 2]++;
  }
  igniteFromHits(d, d.tactical.events);
}

/** Add `workers` players' extinguish work to a burning point this tick; true when the fire went out. Work is whole
 *  units (fireRepair × DUEL_EXTINGUISH_UNITS, rounded back to a whole number so the fraction never drifts). */
export function extinguishWork(d: DuelState, p: RepairPoint, workers: number): boolean {
  const done = d.interior.rooms.fireRepair, units = Math.round(done[p.room]! * DUEL_EXTINGUISH_UNITS) + (workers === 1 ? DUEL_EXTINGUISH_RATE_SOLO : workers * DUEL_EXTINGUISH_RATE_TEAM);
  if (units >= DUEL_EXTINGUISH_UNITS) { extinguishRoom(d.interior, p.room); return true; }
  done[p.room] = units / DUEL_EXTINGUISH_UNITS;
  return false;
}

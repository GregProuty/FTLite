// The duel's interior numbers (spec §8). Every value is *(start)*.
import { Room } from '../tactical/state';

/** Repair progress toward lowering a tactical room one level, in whole units so durations are exact tick counts:
 *  one repairer adds REPAIR_RATE_SOLO per tick (960 / 4 = 240 ticks = 4 s); with two or more on the same point each
 *  adds REPAIR_RATE_TEAM (1.25 × 4, today's TEAM_MULT), so two finish in 96 ticks. */
export const REPAIR_UNITS = 960;
export const REPAIR_RATE_SOLO = 4;
export const REPAIR_RATE_TEAM = 5;

/** Repair points on the Cutter (spec §8 table): the interior room id and tile of each tactical Room's point. */
export const CUTTER_REPAIR_POINTS: readonly { tacticalRoom: number; room: string; tile: readonly [number, number] }[] = [
  { tacticalRoom: Room.Weapons, room: 'W', tile: [8, 7] },
  { tacticalRoom: Room.Shields, room: 'R', tile: [16, 8] },
  { tacticalRoom: Room.Engines, room: 'E', tile: [2, 6] }
];
/** Art-iv spec section 3: the Hound's repair points, one per tactical room. */
export const HOUND_REPAIR_POINTS: readonly { tacticalRoom: number; room: string; tile: readonly [number, number] }[] = [
  { tacticalRoom: Room.Weapons, room: 'O', tile: [10, 8] },
  { tacticalRoom: Room.Shields, room: 'R', tile: [4, 11] },
  { tacticalRoom: Room.Engines, room: 'E', tile: [4, 2] }
];
/** Repair points by layout id; a duel on any other layout throws. */
/** Valkyrn spec §4.3: the Valkyrn's repair points, one per tactical Room, each on an open floor tile: Weapons in Ops (as the
 *  Hound's), Shields in the missile bay's rack half, Engines on its ramp half. */
export const VALKYRN_REPAIR_POINTS: readonly { tacticalRoom: number; room: string; tile: readonly [number, number] }[] = [
  { tacticalRoom: Room.Weapons, room: 'O', tile: [13, 4] },
  { tacticalRoom: Room.Shields, room: 'R', tile: [6, 3] },
  { tacticalRoom: Room.Engines, room: 'E', tile: [2, 3] }
];
export const DUEL_REPAIR_POINTS: Readonly<Record<string, typeof CUTTER_REPAIR_POINTS>> = { cutter: CUTTER_REPAIR_POINTS, hound: HOUND_REPAIR_POINTS, valkyrn: VALKYRN_REPAIR_POINTS };

/** Duel fire (duel-fire spec §1). Only the crew ship burns. A laser hit by the enemy rolls DUEL_FIRE_CHANCE_LASER and a
 *  missile hit on the crew ship DUEL_FIRE_CHANCE_MISSILE (rng.hazards, one draw per hit, none for a burning room); a fire
 *  grows, shrinks and spreads by the sector fireStep (Engineering spike spec §4); every DUEL_FIRE_DAMAGE_TICKS each burning room
 *  raises its tactical Room one level (to 2). Putting it out takes DUEL_EXTINGUISH_UNITS whole units, stored in
 *  rooms.fireRepair as a 0..1 fraction: one worker adds DUEL_EXTINGUISH_RATE_SOLO per tick (720 / 4 = 180 ticks), each of
 *  two or more DUEL_EXTINGUISH_RATE_TEAM (two finish in 72 ticks). */
export const DUEL_FIRE_CHANCE_LASER = 0.3;
export const DUEL_FIRE_CHANCE_MISSILE = 0.6;
export const DUEL_FIRE_DAMAGE_TICKS = 900;
export const DUEL_EXTINGUISH_UNITS = 720;
export const DUEL_EXTINGUISH_RATE_SOLO = 4;
export const DUEL_EXTINGUISH_RATE_TEAM = 5;

/** Duel health (duel-health spec §1.4): a downed character with a conscious, present, standing teammate within REACH
 *  stands up at 1 health after DUEL_REVIVE_TICKS ticks (5 s); Life.reviveProgress holds ticks / DUEL_REVIVE_TICKS. */
export const DUEL_REVIVE_TICKS = 300;

/** Engineering spike spec §4: a qualifying enemy hit (a laser hit by ship 1, a missile on ship 0) rolls a breach in the
 *  struck Room's repair room after its fire roll (rng.hazards, one draw, none if that room's site is already active). */
export const DUEL_BREACH_CHANCE_LASER = 0.2;
export const DUEL_BREACH_CHANCE_MISSILE = 0.5;
/** Engineering spike spec §4: crew in a room below this oxygen fraction lose O2_DAMAGE health a second. */
export const LOW_AIR_FRAC = 0.25;

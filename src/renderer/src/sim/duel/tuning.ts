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
export const DUEL_REPAIR_POINTS: Readonly<Record<string, typeof CUTTER_REPAIR_POINTS>> = { cutter: CUTTER_REPAIR_POINTS, hound: HOUND_REPAIR_POINTS };

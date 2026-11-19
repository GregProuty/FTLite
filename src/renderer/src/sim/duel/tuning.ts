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
 *  grows DUEL_FIRE_GROW per tick to FIRE_CAP and never goes out by itself; every DUEL_FIRE_DAMAGE_TICKS each burning room
 *  raises its tactical Room one level (to 2). Putting it out takes DUEL_EXTINGUISH_UNITS whole units, stored in
 *  rooms.fireRepair as a 0..1 fraction: one worker adds DUEL_EXTINGUISH_RATE_SOLO per tick (720 / 4 = 180 ticks), each of
 *  two or more DUEL_EXTINGUISH_RATE_TEAM (two finish in 72 ticks). */
export const DUEL_FIRE_CHANCE_LASER = 0.3;
export const DUEL_FIRE_CHANCE_MISSILE = 0.6;
export const DUEL_FIRE_GROW = 1 / 60;
export const DUEL_FIRE_DAMAGE_TICKS = 900;
export const DUEL_EXTINGUISH_UNITS = 720;
export const DUEL_EXTINGUISH_RATE_SOLO = 4;
export const DUEL_EXTINGUISH_RATE_TEAM = 5;

/** Duel health (duel-health spec §1.4): a downed character with a conscious, present, standing teammate within REACH
 *  stands up at 1 health after DUEL_REVIVE_TICKS ticks (5 s); Life.reviveProgress holds ticks / DUEL_REVIVE_TICKS. */
export const DUEL_REVIVE_TICKS = 300;

// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, §4, §4a, §5): the crew Helm's held throttle, its cold
// gas and its power split, on a newtonianHelm class. Start values, tuned in playtest.
/** §3: the held throttle in per mille, from full reverse (−250) to full forward (1000). */
export const THR_MIN = -250;
export const THR_MAX = 1000;
/** §3: per mille a tick while W or S is held (0 to 1000 in 143 ticks), and toward 0 while neither is (1000 to 0 in 30). */
export const THR_RAMP = 7;
export const THR_RETURN = 34;
/** §4: the cold gas tank, the gas one vented axis spends a tick, and the gas a boosted turn spends a tick (§4a). */
export const RCS_TANK = 1000;
export const RCS_GAS_PER_TICK = 8;
export const RCS_TURN_GAS = 4;
/** §4: the compressor's sixtieths of gas a tick at 0..3 COMPRESSOR bars (an empty tank refills in never, 20, 10, 6.7 s). */
export const COMPRESSOR_RATE: readonly number[] = [0, 50, 100, 150];
export const COMPRESSOR_MAX = 3;
/** §5: the Helm's bar budget (a stand-in until the Engineering spike's Engines bars), and the most a test may set. */
export const HELM_BARS = 4;
export const HELM_BARS_MAX = 5;
/** §4a: sin 6°: auto-face's turn is far (boosted) while its target lies outside this of the nose (about 4.27 indices). */
export const BOOST_FACE_SIN = 0.10452846326765347;

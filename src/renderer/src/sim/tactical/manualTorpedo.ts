// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3): the turn a MANUAL torpedo flies this tick, from its
// ship's Weapons input (the held heading by the Helm's hold law; W-4 spec §7: A/D steering is gone), and whether a ship's torpedo in flight
// is a MANUAL one. Pure; only the tables and sqrt (through holdTurn).
import { holdTurn } from './hunter';
import { CREW_SLOT, missileOf, type Missile, type TacticalState } from './state';
import { HEADING_COUNT } from './tuning';

/** The turn (−1, 0 or 1) MANUAL torpedo m flies this tick: toward the held heading `heading` (a heading index 0..255; −1, a
 *  non-integer or out of range is none) by holdTurn, else none. W-4 spec §7: the gunner's LMB steer sends that heading. */
export function manualTorpTurn(m: Missile, heading: number): number {
  return Number.isInteger(heading) && heading >= 0 && heading < HEADING_COUNT ? holdTurn(m.heading, heading) : 0;
}

/** Whether ship i's (default the crew's) torpedo in flight is a MANUAL one. */
export function manualTorpedoFlying(state: TacticalState, i = CREW_SLOT): boolean {
  return missileOf(state, i)?.manual === true;
}

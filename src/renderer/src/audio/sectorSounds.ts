// Audio-i spec sections 4d and 5: the sector's music rule and the hum's jump swell. Pure, read from the drawn state and
// the frame's cues.
import type { Cue } from '../events/audioCues';
import type { SimState } from '../sim/state';
import type { Mood } from './musicState';

/** Cues that mean a fight is on this frame. */
export const COMBAT_CUES: readonly Cue[] = ['shot', 'hit', 'impact'];

/** Engaged (spec section 5): an enemy ship is present, a boarder is aboard, or a shot, hit or impact cue sounded this frame. */
export function sectorEngaged(state: Pick<SimState, 'enemy' | 'boarders'>, cues: ReadonlySet<Cue>): boolean {
  if (state.enemy.present === 1) return true;
  for (const a of state.boarders.active) if (a) return true;
  return COMBAT_CUES.some((c) => cues.has(c));
}

/** How long the adventure track plays after an arrival: 20 s of the sim's 60 Hz ticks. */
export const ADVENTURE_TICKS = 20 * 60;
/** The sector's mood (music spike, 2026-11-19), first match wins. Combat: engaged, a node encounter being fought, or a
 *  room on fire. Intrigue: an event card open, an encounter pending, an object scan running, or a detected ambusher (a
 *  hidden one never changes the music). Adventure: a jump awaiting its second Confirm, or the first 20 s at a new beacon.
 *  Calm: a sector's arrival beacon before the jump out. Otherwise space. */
export function sectorMood(state: Pick<SimState, 'enemy' | 'boarders' | 'run' | 'science' | 'tick'>, cues: ReadonlySet<Cue>, fires: number): Mood {
  const run = state.run;
  if (sectorEngaged(state, cues) || run.encounter === 2 || fires > 0) return 'combat';
  if (run.event >= 0 || run.encounter === 1 || state.science.scanning === 1 || run.ambushState === 2) return 'intrigue';
  if (run.jumpPending >= 0 || (run.arrivalTick > 0 && state.tick - run.arrivalTick < ADVENTURE_TICKS)) return 'adventure';
  return run.calm === 1 ? 'calm' : 'space';
}

/** The hum's swell while the jump drive charges (0..1); 0 once it is ready (1), when the ready chime takes over. */
export function chargeSwell(jumpCharge: number): number {
  return Number.isFinite(jumpCharge) && jumpCharge < 1 ? Math.max(0, jumpCharge) : 0;
}

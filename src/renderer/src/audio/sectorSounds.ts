// Audio-i spec sections 4d and 5: the sector's music rule and the hum's jump swell. Pure, read from the drawn state and
// the frame's cues.
import type { Cue } from '../events/audioCues';
import type { SimState } from '../sim/state';

/** Cues that mean a fight is on this frame. */
export const COMBAT_CUES: readonly Cue[] = ['shot', 'hit', 'impact'];

/** Engaged (spec section 5): an enemy ship is present, a boarder is aboard, or a shot, hit or impact cue sounded this frame. */
export function sectorEngaged(state: Pick<SimState, 'enemy' | 'boarders'>, cues: ReadonlySet<Cue>): boolean {
  if (state.enemy.present === 1) return true;
  for (const a of state.boarders.active) if (a) return true;
  return COMBAT_CUES.some((c) => cues.has(c));
}

/** The hum's swell while the jump drive charges (0..1); 0 once it is ready (1), when the ready chime takes over. */
export function chargeSwell(jumpCharge: number): number {
  return Number.isFinite(jumpCharge) && jumpCharge < 1 ? Math.max(0, jumpCharge) : 0;
}

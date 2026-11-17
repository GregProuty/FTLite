// Audio-i spec section 4a: the duel's sounds, from the same per-frame ViewEvents the effects use (beside pushEvents, not
// inside it) and from two tactical state diffs (a missile launch, the round ending). Pure: the caller pans and plays.
import { hitsCrew, type ViewEvent } from '../render/tactical/fxModel';
import { HIT_FRESH_TICKS } from '../render/impactModel';
import type { Cue } from '../events/audioCues';
import type { SoundRequest } from './soundBank';

/** Copies of sim constants (types-only imports from sim/), pinned by tests/audioDuel.test.ts: the crew ship's slot and
 *  the outcomes Running and CrewWins. */
export const CREW = 0, OUTCOME_RUNNING = 0, OUTCOME_CREW_WINS = 1;
/** A hit lands this long after its shot (seconds). */
export const IMPACT_DELAY_S = 0.04;
/** World position to stereo pan (the scene's camera, or the crew-relative fallback on the interior view). */
export type Pan = (x: number, y: number) => number;
export interface EventSounds { sounds: SoundRequest[]; duck: boolean; combat: boolean }

export function duelEventSounds(events: readonly ViewEvent[], pan: Pan): EventSounds {
  const sounds: SoundRequest[] = [];
  let duck = false, combat = false;
  for (const e of events) {
    if (e.kind === 'laser') {
      combat = true;
      sounds.push({ key: e.ship === CREW ? 'laserSmall' : 'laserLarge', gain: 0.7, pan: pan(e.x1, e.y1) });
      const endPan = pan(e.x2, e.y2);
      if (e.stripped) sounds.push({ key: 'forceField', gain: 0.6, pan: endPan, at: IMPACT_DELAY_S, dur: 0.6 });
      else if (e.hit) sounds.push({ key: 'impactMetal', gain: 0.8, pan: endPan, at: IMPACT_DELAY_S });
    } else if (e.kind === 'missileEnd') {
      if (e.cause === 'edge' || e.cause === 'expired') continue;
      combat = true;
      sounds.push({ key: 'explosionCrunch', gain: e.cause === 'ship' ? 1 : 0.6, pan: pan(e.x, e.y) });
    } else {
      sounds.push({ key: 'impactMetal', gain: e.ship === CREW ? 0.6 : 0.3, rate: 0.8, pan: pan(e.x, e.y) });
    }
    if (hitsCrew(e)) { duck = true; sounds.push({ key: 'lowBoom', gain: 0.8, pan: 0 }); }
  }
  return { sounds, duck, combat };
}

/** What the state diff reads each frame: the tactical tick, the round, the outcome and each missile slot. */
export interface DuelWatchView { tick: number; round: number; outcome: number; missiles: readonly { active: boolean; x: number; y: number }[] }
export interface DuelWatch { tick: number; round: number; outcome: number; missiles: boolean[] }

/** A missile launch (a slot going active) and the round ending (victory or defeat). A missing baseline, a new round, a tick
 *  going backwards or a jump of more than HIT_FRESH_TICKS re-baselines silently (no replay after a resync or a rejoin). */
export function duelStateSounds(w: DuelWatch | null, v: DuelWatchView, pan: Pan): { watch: DuelWatch; sounds: SoundRequest[]; cues: Cue[] } {
  const watch: DuelWatch = { tick: v.tick, round: v.round, outcome: v.outcome, missiles: v.missiles.map((m) => m.active) };
  const sounds: SoundRequest[] = [], cues: Cue[] = [];
  if (!w || w.round !== v.round || v.tick < w.tick || v.tick - w.tick > HIT_FRESH_TICKS || w.missiles.length !== v.missiles.length) return { watch, sounds, cues };
  v.missiles.forEach((m, k) => { if (m.active && !w.missiles[k]) sounds.push({ key: 'thruster', gain: 0.5, dur: 0.7, pan: pan(m.x, m.y) }); });
  if (w.outcome === OUTCOME_RUNNING && v.outcome !== OUTCOME_RUNNING) cues.push(v.outcome === OUTCOME_CREW_WINS ? 'victory' : 'defeat');
  return { watch, sounds, cues };
}

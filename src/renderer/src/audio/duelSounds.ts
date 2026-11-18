// Audio-i spec section 4a: the duel's sounds, from the same per-frame ViewEvents the effects use (beside pushEvents, not
// inside it) and from two tactical state diffs (a missile launch, the round ending). Pure: the caller pans and plays.
import { hitsCrew, type ViewEvent } from '../render/tactical/fxModel';
import { HIT_FRESH_TICKS } from '../render/impactModel';
import type { Cue } from '../events/audioCues';
import type { SoundRequest } from './soundBank';
import { CUE_RECIPES } from './cueRecipes';

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
    } else if (e.kind === 'contact') {
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

// Duel polish i spec §C: sound cues for trouble. The fire alarm, a character going down or being picked up, and the local
// character's heartbeat, from state diffs (both modes see the same DuelState, so Single player and online alike).

/** A copy of render/duel/readoutModel's HEALTH_LOW (pinned by tests/audioDuel.test.ts): the heartbeat runs below it. */
export const HEARTBEAT_BELOW = 30;
/** Seconds between heartbeats, and at most one fire alarm per FIRE_ALARM_GAP_S seconds. */
export const HEARTBEAT_S = 0.8, FIRE_ALARM_GAP_S = 1;
/** The heartbeat: the low boom, softened through a 400 Hz low-pass. */
export const HEARTBEAT: SoundRequest = { key: 'lowBoom', gain: 0.35, pan: 0, filter: { type: 'lowpass', from: 400 } };
/** The fire alarm: the `alarm` cue's layers at gain 0.5 (a cue plays at its recipe's gain, so the requests are scaled here). */
export const FIRE_ALARM: readonly SoundRequest[] = (CUE_RECIPES.alarm ?? []).map((r) => ({ ...r, gain: 0.5 }));

/** Each character's health and downed state, in player order (the scene reads them from the interior's components). */
export interface CrewLife { health: readonly number[]; downed: readonly boolean[] }
/** What the crew diff reads: the tactical tick, the round, and each character's downed state, in player order. */
export interface CrewLifeView { tick: number; round: number; downed: readonly boolean[] }
export interface CrewWatch { tick: number; round: number; downed: boolean[] }

/** `alarm` when a character goes down, `ready` when one is picked up (in player order). The same re-baseline as
 *  duelStateSounds: no baseline, a new round, a tick backwards or a stale jump plays nothing. */
export function crewLifeSounds(w: CrewWatch | null, v: CrewLifeView): { watch: CrewWatch; cues: Cue[] } {
  const watch: CrewWatch = { tick: v.tick, round: v.round, downed: [...v.downed] }, cues: Cue[] = [];
  if (!w || w.round !== v.round || v.tick < w.tick || v.tick - w.tick > HIT_FRESH_TICKS || w.downed.length !== v.downed.length) return { watch, cues };
  v.downed.forEach((down, pid) => { if (down !== w.downed[pid]) cues.push(down ? 'alarm' : 'ready'); });
  return { watch, cues };
}

/** The heartbeat's clock: `next` is when the next beat is due (null: off). It beats at once when it comes on, then every
 *  HEARTBEAT_S seconds of `now` while `on`; going off clears it, so coming back on beats at once again. */
export function heartbeat(next: number | null, on: boolean, now: number): { next: number | null; beat: boolean } {
  if (!on) return { next: null, beat: false };
  if (next !== null && now < next) return { next, beat: false };
  return { next: now + HEARTBEAT_S, beat: true };
}

/** Whether the local character's heart beats: conscious, below HEARTBEAT_BELOW, the round running and not paused. */
export function heartbeatOn(v: { health: number; downed: boolean; running: boolean; paused: boolean }): boolean {
  return !v.downed && v.running && !v.paused && v.health < HEARTBEAT_BELOW;
}

/** The fire alarm's rate limit: plays when a room caught fire and none played in the last FIRE_ALARM_GAP_S seconds. */
export function fireAlarm(last: number | null, ignited: number, now: number): { last: number | null; play: boolean } {
  if (ignited <= 0 || (last !== null && now - last < FIRE_ALARM_GAP_S)) return { last, play: false };
  return { last: now, play: true };
}

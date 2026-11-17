// Audio-i spec section 5: the music state machine. Pure and time-injected: the engine runs it once per frame with the
// latest report. Calm plays by default; engaged moves to battle at once with a 2 s equal-power crossfade; 8 s with no
// engagement goes back to calm; a pause fades the mix out (and holds the calm-down count); a big hit ducks it.
import type { HumInput } from './loops';

export const CROSSFADE_S = 2, CALM_AFTER_S = 8, PAUSE_FADE_S = 0.4, DUCK_LEVEL = 0.5, DUCK_S = 0.6;
/** A report older than this (seconds) means no session is drawing (the menu): idle. */
export const REPORT_STALE_S = 0.5;
/** The longest step one frame may take (seconds), so a hitch never jumps the fade. */
export const MAX_STEP_S = 0.25;
/** The loop points (seconds), constants for the owner to tune by ear; none were measured. Battle starts at the orchestral
 *  turn (about 2:05) each time it begins, and loops from there to BATTLE_LOOP_END_S (null: the track's end). */
export const CALM_LOOP_START_S = 0, BATTLE_START_S = 125, BATTLE_LOOP_START_S = 125;
export const BATTLE_LOOP_END_S: number | null = null;

/** One frame's report from the drawing session (the duel scene or the sector session). */
export interface AudioStatus { engaged: boolean; paused: boolean; duck: boolean; hum: HumInput | null; fires: number }
export const IDLE_STATUS: AudioStatus = { engaged: false, paused: false, duck: false, hum: null, fires: 0 };
export function liveStatus(report: { status: AudioStatus; at: number } | null, now: number): AudioStatus {
  return report && now - report.at <= REPORT_STALE_S ? report.status : IDLE_STATUS;
}

export interface MusicState { mode: 'calm' | 'battle'; x: number; quietFor: number; pause: number; duckLeft: number; last: number | null }
export function createMusic(): MusicState { return { mode: 'calm', x: 0, quietFor: 0, pause: 1, duckLeft: 0, last: null }; }
export interface MusicInput { now: number; engaged: boolean; paused: boolean; duck: boolean }
/** The gains to aim for: calm and battle (equal power), the mix (pause x duck), and whether a battle source should exist. */
export interface MusicMix { calm: number; battle: number; mix: number; battleOn: boolean }

export function stepMusic(s: MusicState, i: MusicInput): MusicMix {
  const dt = s.last === null ? 0 : Math.min(MAX_STEP_S, Math.max(0, i.now - s.last));
  s.last = i.now;
  if (i.engaged) { s.mode = 'battle'; s.quietFor = 0; }
  else if (s.mode === 'battle' && !i.paused) { s.quietFor += dt; if (s.quietFor >= CALM_AFTER_S) s.mode = 'calm'; }
  const step = dt / CROSSFADE_S;
  s.x = s.mode === 'battle' ? Math.min(1, s.x + step) : Math.max(0, s.x - step);
  const fade = dt / PAUSE_FADE_S;
  s.pause = i.paused ? Math.max(0, s.pause - fade) : Math.min(1, s.pause + fade);
  s.duckLeft = i.duck ? DUCK_S : Math.max(0, s.duckLeft - dt);
  const calm = s.x === 0 ? 1 : Math.cos((s.x * Math.PI) / 2), battle = s.x === 1 ? 1 : Math.sin((s.x * Math.PI) / 2);
  return { calm, battle, mix: s.pause * (s.duckLeft > 0 ? DUCK_LEVEL : 1), battleOn: s.mode === 'battle' || s.x > 0 };
}

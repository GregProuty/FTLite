// Audio-i spec section 5, widened by the music spike (2026-11-19) from calm and battle to five moods. Pure and
// time-injected: the engine runs it once per frame with the latest report. Calm plays by default (the menu); combat takes
// over at once with a 2 s equal-power crossfade and holds 8 s after the last danger; the quiet moods (calm, space,
// intrigue, adventure) swap once the new one has been asked for 1 s; a pause fades the mix out (and holds both counts); a
// big hit ducks it.
import type { HumInput } from './loops';

/** The five moods, in the order the engine builds their gains. */
export const MOODS = ['calm', 'space', 'intrigue', 'adventure', 'combat'] as const;
export type Mood = (typeof MOODS)[number];

export const CROSSFADE_S = 2, CALM_AFTER_S = 8, PAUSE_FADE_S = 0.4, DUCK_LEVEL = 0.5, DUCK_S = 0.6;
/** A quiet mood must be asked for this long (seconds) before the music moves to it, so a one-frame flicker never swaps the track. */
export const SETTLE_S = 1;
/** A report older than this (seconds) means no session is drawing (the menu): idle. */
export const REPORT_STALE_S = 0.5;
/** The longest step one frame may take (seconds), so a hitch never jumps the fade. */
export const MAX_STEP_S = 0.25;

/** One frame's report from the drawing session (the duel scene or the sector session). */
export interface AudioStatus { mood: Mood; paused: boolean; duck: boolean; hum: HumInput | null; fires: number }
export const IDLE_STATUS: AudioStatus = { mood: 'calm', paused: false, duck: false, hum: null, fires: 0 };
export function liveStatus(report: { status: AudioStatus; at: number } | null, now: number): AudioStatus {
  return report && now - report.at <= REPORT_STALE_S ? report.status : IDLE_STATUS;
}

const perMood = <T>(f: (m: Mood) => T): Record<Mood, T> => ({ calm: f('calm'), space: f('space'), intrigue: f('intrigue'), adventure: f('adventure'), combat: f('combat') });

/** `mode`: the mood playing or fading in. `x`: each track's fade position (0 silent, 1 full). `quietFor`: seconds since
 *  the last combat report. `want`, `wantFor`: the quiet mood being asked for and for how long. */
export interface MusicState { mode: Mood; x: Record<Mood, number>; quietFor: number; want: Mood; wantFor: number; pause: number; duckLeft: number; last: number | null }
export function createMusic(): MusicState {
  return { mode: 'calm', x: { ...perMood(() => 0), calm: 1 }, quietFor: 0, want: 'calm', wantFor: 0, pause: 1, duckLeft: 0, last: null };
}
/** `idle`: no session is reporting (liveStatus returned IDLE_STATUS, e.g. back on the menu): go calm at once, still
 *  over the normal crossfade, without the CALM_AFTER_S or SETTLE_S wait. */
export interface MusicInput { now: number; mood: Mood; paused: boolean; duck: boolean; idle?: boolean }
/** The gains to aim for (equal power across a two-track crossfade), the mix (pause x duck), and which tracks need a source. */
export interface MusicMix { gains: Record<Mood, number>; on: Record<Mood, boolean>; mix: number }

export function stepMusic(s: MusicState, i: MusicInput): MusicMix {
  const dt = s.last === null ? 0 : Math.min(MAX_STEP_S, Math.max(0, i.now - s.last));
  s.last = i.now;
  if (i.idle) { s.mode = 'calm'; s.quietFor = 0; s.want = 'calm'; s.wantFor = 0; }
  else if (i.mood === 'combat') { s.mode = 'combat'; s.quietFor = 0; s.want = 'combat'; s.wantFor = 0; }
  else if (s.mode === 'combat') {
    if (!i.paused) { s.quietFor += dt; if (s.quietFor >= CALM_AFTER_S) { s.mode = i.mood; s.want = i.mood; s.wantFor = 0; } }
  } else if (i.mood === s.mode) { s.want = s.mode; s.wantFor = 0; }
  else if (i.mood !== s.want) { s.want = i.mood; s.wantFor = 0; }
  else if (!i.paused) { s.wantFor += dt; if (s.wantFor >= SETTLE_S) { s.mode = i.mood; s.wantFor = 0; } }
  const step = dt / CROSSFADE_S;
  for (const m of MOODS) s.x[m] = m === s.mode ? Math.min(1, s.x[m] + step) : Math.max(0, s.x[m] - step);
  const fade = dt / PAUSE_FADE_S;
  s.pause = i.paused ? Math.max(0, s.pause - fade) : Math.min(1, s.pause + fade);
  s.duckLeft = i.duck ? DUCK_S : Math.max(0, s.duckLeft - dt);
  return {
    gains: perMood((m) => (s.x[m] === 0 ? 0 : s.x[m] === 1 ? 1 : Math.sin((s.x[m] * Math.PI) / 2))),
    on: perMood((m) => m === s.mode || s.x[m] > 0),
    mix: s.pause * (s.duckLeft > 0 ? DUCK_LEVEL : 1)
  };
}

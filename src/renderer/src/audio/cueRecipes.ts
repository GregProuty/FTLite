// Audio-i spec sections 3-4: each cue as layered samples. null keeps the synth tones in app/audio.ts (victory, defeat:
// neither pack has a fitting sting). A cue whose keys are not all decoded plays its synth tones too, so a missing file never
// silences a cue. Cue names are unchanged: the codec and the replay format do not move.
import type { Cue } from '../events/audioCues';
import type { SoundRequest } from './soundBank';

/** The jump (spec section 4d): a charge sweep, a whoosh, then the arrival. The sim's jump is instant, so the charge is a short
 *  pre-roll here; the long charge is the hum's swell. */
export const JUMP_RECIPE: readonly SoundRequest[] = [
  { key: 'jumpCharge', gain: 0.5, dur: 0.7, rate: 0.6, rateTo: 1.8, filter: { type: 'lowpass', from: 500, to: 5000 }, detune: false },
  { key: 'thruster', at: 0.55, gain: 0.8, dur: 0.8, filter: { type: 'bandpass', from: 4000, to: 400, q: 0.8 }, detune: false },
  { key: 'lowBoom', at: 1.1, gain: 0.6 },
  { key: 'forceField', at: 1.15, gain: 0.4, rate: 0.7, dur: 0.8 }
];

export const CUE_RECIPES: Readonly<Record<Cue, readonly SoundRequest[] | null>> = {
  alarm: [{ key: 'alarm', variant: 0, gain: 0.7, detune: false }, { key: 'alarm', variant: 1, at: 0.2, gain: 0.7, detune: false }],
  impact: [{ key: 'explosionCrunch', gain: 1 }, { key: 'lowBoom', gain: 0.8 }],
  shot: [{ key: 'laserLarge', gain: 0.7 }],
  hit: [{ key: 'impactMetal', gain: 0.6 }],
  ready: [{ key: 'ready', gain: 0.6, detune: false }],
  jump: JUMP_RECIPE,
  upgrade: [{ key: 'upgrade', gain: 0.6, detune: false }],
  victory: null,
  defeat: null,
  callout: [{ key: 'callout', gain: 0.6, detune: false }]
};

/** Cues that duck the music (spec section 5): a hit on our ship. */
export const DUCK_CUES: ReadonlySet<Cue> = new Set<Cue>(['impact']);

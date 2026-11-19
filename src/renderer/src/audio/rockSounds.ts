// Spike ii §7 item 8: the rock sounds, from the same per-frame events the effects use (types only from the sim): a crack on
// a laser hit, a crunch on a break, a deep boom on a torpedo blast, a soft knock on a damaging rock-rock contact. A chain
// reaction plays at most ROCK_SOUNDS_PER_S in any second, the loudest kinds first. Volumes go through the SFX volume.
import type { ViewEvent } from '../render/tactical/fxModel';
import type { Pan } from './duelSounds';
import type { SoundRequest } from './soundBank';

export const ROCK_SOUNDS_PER_S = 6;
export const ROCK_CRACK: SoundRequest = { key: 'impactMetal', gain: 0.45, rate: 1.7, dur: 0.25 };
export const ROCK_CRUNCH: SoundRequest = { key: 'explosionCrunch', gain: 0.55, rate: 1.3 };
export const ROCK_BOOM: SoundRequest = { key: 'lowBoom', gain: 0.9 };
export const ROCK_TOUCH: SoundRequest = { key: 'impactMetal', gain: 0.15, rate: 0.5, dur: 0.15, filter: { type: 'lowpass', from: 600 } };
export const ROCK_KNOCK: SoundRequest = { key: 'impactMetal', gain: 0.25, rate: 0.6, dur: 0.2, filter: { type: 'lowpass', from: 900 } };
/** The play times (seconds of the audio clock) in the last second. */
export interface RockSoundWatch { played: number[] }

export function rockSounds(w: RockSoundWatch | null, events: readonly ViewEvent[], pan: Pan, now: number): { watch: RockSoundWatch; sounds: SoundRequest[] } {
  const played = (w?.played ?? []).filter((t) => t > now - 1), sounds: SoundRequest[] = [];
  const tiers: { sound: SoundRequest; x: number; y: number }[][] = [[], [], [], []];
  for (const e of events) {
    if (e.kind !== 'rock') continue;
    if (e.what === 'blast') tiers[0]!.push({ sound: ROCK_BOOM, x: e.x, y: e.y });
    else if ((e.what === 'split' || (e.what === 'dust' && e.rock >= 0 && !e.evicted)) && e.by !== 'planet' && e.by !== 'edge') tiers[1]!.push({ sound: ROCK_CRUNCH, x: e.x, y: e.y });
    else if (e.what === 'hit' && e.by === 'laser') tiers[2]!.push({ sound: ROCK_CRACK, x: e.x, y: e.y });
    else if (e.what === 'bump' && e.by === 'collision') tiers[3]!.push({ sound: ROCK_KNOCK, x: e.x, y: e.y });
    else if (e.what === 'touch') tiers[3]!.push({ sound: ROCK_TOUCH, x: e.x, y: e.y });   // asteroids-iii §5.6: a soft knock, the slow billiards' cue
  }
  for (const tier of tiers) for (const c of tier) {
    if (played.length >= ROCK_SOUNDS_PER_S) break;
    sounds.push({ ...c.sound, pan: pan(c.x, c.y) }); played.push(now);
  }
  return { watch: { played }, sounds };
}

// Audio-i spec sections 3-4: the cues as samples.
import { describe, it, expect } from 'vitest';
import { CUE_ORDER } from '../src/renderer/src/events/audioCues';
import { CUE_RECIPES, DUCK_CUES, JUMP_RECIPE } from '../src/renderer/src/audio/cueRecipes';
import { SFX } from '../src/renderer/src/audio/soundBank';

describe('cue recipes (Audio-i spec section 3)', () => {
  it('covers every cue; victory and defeat keep the synth', () => {
    expect(Object.keys(CUE_RECIPES).sort()).toEqual([...CUE_ORDER].sort());
    expect(CUE_RECIPES.victory).toBeNull(); expect(CUE_RECIPES.defeat).toBeNull();
    for (const cue of CUE_ORDER) for (const r of CUE_RECIPES[cue] ?? []) expect(Object.keys(SFX), `${cue} ${r.key}`).toContain(r.key);
  });
  it('the alarm is two pinned tones; impact layers the crunch and the low boom and ducks the music', () => {
    expect(CUE_RECIPES.alarm!.map((r) => [r.key, r.variant, r.at ?? 0])).toEqual([['alarm', 0, 0], ['alarm', 1, 0.2]]);
    expect(CUE_RECIPES.impact!.map((r) => r.key)).toEqual(['explosionCrunch', 'lowBoom']);
    expect([...DUCK_CUES]).toEqual(['impact']);
  });
  it('the jump is a charge sweep, a whoosh and an arrival, in time order (spec section 4d)', () => {
    expect(CUE_RECIPES.jump).toBe(JUMP_RECIPE);
    expect(JUMP_RECIPE.map((r) => r.key)).toEqual(['jumpCharge', 'thruster', 'lowBoom', 'forceField']);
    const ats = JUMP_RECIPE.map((r) => r.at ?? 0); expect(ats).toEqual([...ats].sort((a, b) => a - b));
    expect(JUMP_RECIPE[0]).toMatchObject({ rate: 0.6, rateTo: 1.8, filter: { type: 'lowpass', from: 500, to: 5000 } });
    expect(JUMP_RECIPE[1]).toMatchObject({ at: 0.55, filter: { type: 'bandpass', from: 4000, to: 400 } });
  });
});

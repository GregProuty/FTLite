// Audio-i spec section 3: the engine over a fake AudioContext.
import { describe, it, expect } from 'vitest';
import { createAudio, EFFECTS_LEVEL, MUSIC_LEVEL } from '../src/renderer/src/app/audio';
import { sfxFiles } from '../src/renderer/src/audio/soundBank';
import { fakeAudioContext, type FakeSource } from './helpers/fakeAudio';

const effectSources = (): { name: string; url: string }[] => sfxFiles().map((f) => ({ name: f.name, url: f.file }));
const bytes = (n: number) => async (url: string): Promise<ArrayBuffer> => new ArrayBuffer(url.includes('#missing') ? 0 : n);
const oneShots = (sources: FakeSource[]): FakeSource[] => sources.filter((s) => !s.loop);

describe('the audio engine (Audio-i spec section 3)', () => {
  it('is a set of no-ops without an AudioContext', async () => {
    const a = createAudio({ context: () => null });
    expect(() => { a.play('shot'); a.sounds([{ key: 'laserSmall' }]); a.unlock(); a.suspend(); a.setVolumes({ master: 0, music: 0, effects: 0 }); }).not.toThrow();
    await expect(a.load(effectSources(), bytes(1))).resolves.toBeUndefined();
  });
  it('plays a cue’s synth tones until its samples are decoded, then the samples', async () => {
    const { ctx, made } = fakeAudioContext(), logs: string[] = [];
    const a = createAudio({ context: () => ctx, random: () => 0.5, log: (m) => logs.push(m) });
    a.play('shot'); expect(made.oscillators).toBe(1); expect(oneShots(made.sources)).toHaveLength(0);
    await a.load(effectSources(), bytes(1));
    expect(logs).toEqual(['[audio] decoded 50/50 files']);
    a.play('shot'); expect(made.oscillators).toBe(1); expect(oneShots(made.sources)).toHaveLength(1);
    a.play('victory'); expect(made.oscillators).toBe(4);   // a null recipe: the three synth notes
  });
  it('falls back to the synth when a cue’s files failed to decode', async () => {
    const { ctx, made } = fakeAudioContext(), logs: string[] = [];
    const a = createAudio({ context: () => ctx, log: (m) => logs.push(m) });
    await a.load(effectSources().map((s) => (s.name.startsWith('sfx.ready.') ? { ...s, url: `${s.url}#missing` } : s)), bytes(1));
    expect(logs).toEqual(['[audio] decoded 47/50 files']);
    a.play('ready'); expect(made.oscillators).toBe(2); expect(oneShots(made.sources)).toHaveLength(0);
  });
  it('caps a key at four voices (stealing the oldest), detunes and pans', async () => {
    const { ctx, made } = fakeAudioContext();
    const a = createAudio({ context: () => ctx, random: () => 1 });
    await a.load(effectSources(), bytes(1));
    for (let k = 0; k < 5; k++) a.sounds([{ key: 'laserSmall', pan: 0.5 }]);
    const shots = oneShots(made.sources);
    expect(shots).toHaveLength(5);
    expect(shots[0]!.stops).toBe(2);   // its scheduled end, then stolen by the fifth
    expect(shots[4]!.stops).toBe(1);
    expect(shots[4]!.detune.value).toBe(50); expect(made.panners.at(-1)!.value).toBe(0.5);
    a.sounds([{ key: 'alarm', variant: 1, detune: false, pan: Number.NaN }]);
    expect(oneShots(made.sources).at(-1)!.detune.value).toBe(0); expect(made.panners.at(-1)!.value).toBe(0);
    a.sounds([{ key: 'laserSmall', dur: 0.5 }]);
    expect(oneShots(made.sources).at(-1)!.starts[0]).toEqual([0]);
  });
  it('sets the master, music and effects buses from the volumes', () => {
    const { ctx, made } = fakeAudioContext();
    const a = createAudio({ context: () => ctx });
    const [master, music, effects] = made.gains;   // created first, in this order
    a.setVolumes({ master: 0.5, music: 0.25, effects: 0 });
    expect([master!.value, music!.value, effects!.value]).toEqual([0.5, 0.25 * MUSIC_LEVEL, 0]);
    a.setVolumes({ master: Number.NaN, music: 2, effects: 1 });
    expect([master!.value, music!.value, effects!.value]).toEqual([1, MUSIC_LEVEL, EFFECTS_LEVEL]);
  });
});

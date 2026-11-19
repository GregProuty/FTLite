// Audio-i spec section 3: the engine over a fake AudioContext.
import { describe, it, expect } from 'vitest';
import { DUCK_LEVEL, type AudioStatus } from '../src/renderer/src/audio/musicState';
import { MUSIC } from '../src/renderer/src/audio/soundBank';
import { HUM_MAX_GAIN, fireGain } from '../src/renderer/src/audio/loops';
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

describe('the music and the loops (Audio-i spec sections 4-5)', () => {
  const tracks = Object.values(MUSIC).map((t) => ({ name: t.name, url: t.file }));
  const report = (o: Partial<AudioStatus> = {}): AudioStatus => ({ mood: 'calm', paused: false, duck: false, hum: null, fires: 0, ...o });
  it('loops calm from the start, starts the combat track when its mood begins, and stops it after the fade back', async () => {
    const { ctx, made } = fakeAudioContext();
    const a = createAudio({ context: () => ctx });
    await a.load([...effectSources(), ...tracks], bytes(300));
    const music = (): FakeSource[] => made.sources.filter((s) => s.loop && s.loopEnd === 300);
    expect(music()).toHaveLength(1); expect(music()[0]!.loopStart).toBe(0);
    const calm = music()[0]!;
    a.tick(0); a.status(report({ mood: 'combat' })); a.tick(0.05);
    const battle = music()[1]!;
    expect(battle.loopStart).toBe(MUSIC.combat.loopStart); expect(battle.starts[0]![1]).toBe(MUSIC.combat.start);
    let t = 0.05;
    for (; t < 3; t += 0.05) { a.status(report({ mood: 'combat' })); a.tick(t); }
    expect(calm.stops).toBe(1);   // calm faded out under combat: its source is let go
    for (; t < 14; t += 0.05) { a.status(report()); a.tick(t); }
    expect(battle.stops).toBe(1);
    expect(music()).toHaveLength(3);   // calm again, from its start
    a.status(report({ mood: 'combat' })); a.tick(t + 0.05);
    expect(music()).toHaveLength(4);   // a fresh combat source each time, from its start again
  });
  it('gives every mood its own gain, at the track level, and plays one quiet mood at a time', async () => {
    const { ctx, made } = fakeAudioContext();
    const a = createAudio({ context: () => ctx });
    await a.load([...effectSources(), ...tracks], bytes(300));
    const [, , , , , calm, space, intrigue, adventure, combat] = made.gains;   // master, music, effects, synth, mix, then the moods in order
    expect([calm!.value, space!.value, intrigue!.value, adventure!.value, combat!.value]).toEqual([MUSIC.calm.level, 0, 0, 0, 0]);
    let t = 0;
    for (; t < 5; t += 0.05) { a.status(report({ mood: 'space' })); a.tick(t); }
    expect(space!.value).toBeCloseTo(MUSIC.space.level); expect(calm!.value).toBe(0);
    for (; t < 10; t += 0.05) { a.status(report({ mood: 'intrigue' })); a.tick(t); }
    for (; t < 15; t += 0.05) { a.status(report({ mood: 'adventure' })); a.tick(t); }
    expect([calm!.value, space!.value, intrigue!.value, combat!.value]).toEqual([0, 0, 0, 0]); expect(adventure!.value).toBeCloseTo(MUSIC.adventure.level);
    expect(made.sources.filter((s) => s.loop && s.loopEnd === 300 && s.stops === 0)).toHaveLength(1);   // only the adventure track still plays
  });
  it('drives the hum and the fire loop from the report: silent while paused or with no report; ducks on impact', async () => {
    const { ctx, made } = fakeAudioContext();
    const a = createAudio({ context: () => ctx });
    await a.load(effectSources(), bytes(2));
    const [, , , , mix, , , , , , hum, fire] = made.gains;   // master, music, effects, synth, mix, the five moods, hum, fire
    a.tick(0); a.status(report({ hum: { thrust: 1, speed: 400, charge: 0 }, fires: 2 })); a.tick(0.05);
    expect(hum!.value).toBeCloseTo(HUM_MAX_GAIN); expect(fire!.value).toBeCloseTo(fireGain(2));
    a.status(report({ paused: true, hum: { thrust: 1, speed: 400, charge: 0 }, fires: 2 })); a.tick(0.1);
    expect(hum!.value).toBe(0); expect(fire!.value).toBe(0);
    a.tick(5); expect(hum!.value).toBe(0);   // 4.9 s with no report: the menu
    a.play('impact'); a.tick(5.05); expect(mix!.value).toBe(DUCK_LEVEL);
  });
});

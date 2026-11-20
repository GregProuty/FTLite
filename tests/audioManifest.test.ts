// Audio-i spec sections 1-2: the sound bank, the manifest's audio rules and the loader branch.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assetKind, parseManifest } from '../src/renderer/src/render/manifest';
import { ASSET_NAMES } from '../src/renderer/src/render/assetNames';
import { AUDIO_ASSET_NAMES, MUSIC, MUSIC_CALM, MUSIC_COMBAT, MUSIC_FILES, isAudioName, moodOf, sfxFiles, sfxKeyOf } from '../src/renderer/src/audio/soundBank';
import { MOODS } from '../src/renderer/src/audio/musicState';

const sfx = { file: 'raw/kenney-sci-fi-sounds/laserSmall_000.ogg', title: 'Sci-fi Sounds', author: 'Kenney', source: 'https://kenney.nl/assets/sci-fi-sounds', license: 'CC0-1.0', required: false, name: 'sfx.laserSmall.0' };
const music = { file: 'raw/alexandr-zhelanov/law-in-the-city.ogg', title: 'Law in the City', author: 'Alexandr Zhelanov', source: 'https://opengameart.org/content/law-in-the-city',
  archived: 'https://web.archive.org/web/20251116220120/https://opengameart.org/content/law-in-the-city', license: 'CC-BY-4.0',
  credit: "'Law in the City' by Alexandr Zhelanov (opengameart.org/users/alexandr-zhelanov), CC-BY 4.0", required: false, name: 'music.combat' };
const image = { file: 'raw/x/a.png', title: 'A', author: 'B', source: 'https://x', license: 'CC0-1.0', name: 'floor.0' };
const font = { file: 'raw/m5x7/m5x7.ttf', title: 'm5x7', author: 'Daniel Linssen', source: 'https://managore.itch.io/m5x7', license: 'CC0-1.0', name: 'font.m5x7' };

describe('the sound bank (Audio-i spec section 1)', () => {
  it('names every variant sfx.<key>.<n> from 0, as an .ogg under its pack folder', () => {
    const files = sfxFiles();
    expect(files).toHaveLength(50);
    expect(files.find((f) => f.name === 'sfx.alarm.1')!.file).toBe('raw/kenney-interface-sounds/error_005.ogg');
    expect(files.find((f) => f.name === 'sfx.lowBoom.0')!.file).toBe('raw/kenney-sci-fi-sounds/lowFrequency_explosion_000.ogg');
    expect(files.find((f) => f.name === 'sfx.upgrade.0')!.file).toBe('raw/kenney-interface-sounds/maximize_006.ogg');
    expect(AUDIO_ASSET_NAMES).toHaveLength(55);
    expect(new Set(AUDIO_ASSET_NAMES).size).toBe(55);
  });
  it('parses names back to a key and a variant, and recognises audio names', () => {
    expect(sfxKeyOf('sfx.laserLarge.4')).toEqual({ key: 'laserLarge', index: 4 });
    expect(sfxKeyOf('sfx.laserLarge.5')).toBeNull(); expect(sfxKeyOf('sfx.nope.0')).toBeNull();
    expect(sfxKeyOf('sfx.toString.0')).toBeNull(); expect(sfxKeyOf(MUSIC_CALM)).toBeNull();
    expect(isAudioName('sfx.anything.0')).toBe(true); expect(isAudioName(MUSIC_COMBAT)).toBe(true);
    expect(isAudioName('floor.0')).toBe(false); expect(isAudioName(undefined)).toBe(false);
  });
  it('has one track per mood, named music.<mood>, an .ogg with sane loop points (music spike)', () => {
    expect(MOODS.map((m) => MUSIC[m].name)).toEqual(['music.calm', 'music.space', 'music.intrigue', 'music.adventure', 'music.combat']);
    expect(new Set(Object.values(MUSIC_FILES)).size).toBe(5);
    for (const m of MOODS) {
      const t = MUSIC[m];
      expect(moodOf(t.name)).toBe(m); expect(t.file).toMatch(/^raw\/[a-z-]+\/[a-z-]+\.ogg$/);
      expect(t.start).toBeGreaterThanOrEqual(0); expect(t.loopStart).toBeGreaterThanOrEqual(0); expect(t.level).toBeGreaterThan(0);
      if (t.loopEnd !== null) expect(t.loopEnd).toBeGreaterThan(t.loopStart);
    }
    expect(moodOf('music.battle')).toBeNull(); expect(moodOf('sfx.alarm.0')).toBeNull();
  });
  it('lists every audio name as optional in the name contract', () => {
    for (const n of AUDIO_ASSET_NAMES) expect(ASSET_NAMES[n], n).toBe('optional');
  });
});

describe('audio manifest entries (Audio-i spec section 2)', () => {
  it('accepts .ogg and .mp3 audio entries that are required: false', () => {
    expect(parseManifest([sfx, music])).toHaveLength(2);
  });
  it('rejects a required audio entry, an audio name on another file type, and a sound file without an audio name', () => {
    expect(() => parseManifest([{ ...sfx, required: true }])).toThrow(/required: false/);
    expect(() => parseManifest([{ ...sfx, required: undefined }])).toThrow(/required: false/);   // required defaults to true
    expect(() => parseManifest([{ ...sfx, file: 'raw/kenney-sci-fi-sounds/laserSmall_000.png' }])).toThrow(/\.ogg or \.mp3/);
    expect(() => parseManifest([{ ...sfx, name: 'floor.0' }])).toThrow(/sfx\.\* or music\.\*/);
  });
  it('picks the loader branch: font, audio or image', () => {
    const [s, m, i, f] = parseManifest([sfx, music, image, font]);
    expect([assetKind(s!), assetKind(m!), assetKind(i!), assetKind(f!)]).toEqual(['audio', 'audio', 'image', 'font']);
  });
  it('the shipped manifest binds every bank file under its name, each on disk and never required', () => {
    const manifest = parseManifest(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
    const byName = new Map(manifest.filter((e) => isAudioName(e.name)).map((e) => [e.name!, e]));
    for (const f of sfxFiles()) { expect(byName.get(f.name)?.file, f.name).toBe(f.file); expect(existsSync(join('public/assets', f.file)), f.file).toBe(true); }
    for (const [name, file] of Object.entries(MUSIC_FILES)) { expect(byName.get(name)?.file, name).toBe(file); expect(existsSync(join('public/assets', file)), file).toBe(true); }
    expect(byName.size).toBe(55);
    for (const e of byName.values()) expect(e.required, e.file).toBe(false);
    expect(byName.get(MUSIC_COMBAT)!.credit).toBe("'Orbital Colossus' by Matthew Pablo (opengameart.org/users/matthew-pablo), CC-BY 3.0");
    expect(byName.get(MUSIC_CALM)!.license).toBe('OGA-BY-3.0');
    for (const m of MOODS) { const e = byName.get(MUSIC[m].name)!; expect(e.archived, e.file).toMatch(/^https:\/\/web\.archive\.org\/web\/\d{14}\/https:\/\/opengameart\.org\/content\//); expect(e.modifications, e.file).not.toBe('none'); }
  });
});

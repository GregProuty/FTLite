// Audio-i spec sections 1-3: the sound bank. Which Kenney file backs each effect key, the manifest names they bind, the
// music names, and the request shape the views hand the engine. Pure data: no Web Audio, no sim.

export type Pack = 'sci' | 'ui';
export const PACK_DIRS: Readonly<Record<Pack, string>> = { sci: 'raw/kenney-sci-fi-sounds', ui: 'raw/kenney-interface-sounds' };
interface SfxDef { readonly pack: Pack; readonly stem: string; readonly numbers: readonly number[] }

/** Each effect key: its pack, the Kenney file stem, and the file numbers of its variants (variant n is numbers[n]). */
export const SFX = {
  laserSmall: { pack: 'sci', stem: 'laserSmall', numbers: [0, 1, 2] },
  /** W-1 (pew pew spec 1): the pew, two of the Kenney Sci-fi laserSmall files (the manifest lists a file once, so the crew
   *  laser keeps the other three); played fast and short by duelSounds.ts. */
  pew: { pack: 'sci', stem: 'laserSmall', numbers: [3, 4] },
  laserLarge: { pack: 'sci', stem: 'laserLarge', numbers: [0, 1, 2, 3, 4] },
  impactMetal: { pack: 'sci', stem: 'impactMetal', numbers: [0, 1, 2, 3, 4] },
  explosionCrunch: { pack: 'sci', stem: 'explosionCrunch', numbers: [0, 1, 2, 3, 4] },
  lowBoom: { pack: 'sci', stem: 'lowFrequency_explosion', numbers: [0, 1] },
  forceField: { pack: 'sci', stem: 'forceField', numbers: [0, 1, 2] },
  doorOpen: { pack: 'sci', stem: 'doorOpen', numbers: [0, 1, 2] },
  doorClose: { pack: 'sci', stem: 'doorClose', numbers: [0, 1, 2] },
  thruster: { pack: 'sci', stem: 'thrusterFire', numbers: [0, 1] },
  /** Playtest2feedback §6 (Decision 13): the cold gas hiss, the thruster file the launch whoosh no longer uses. */
  rcs: { pack: 'sci', stem: 'thrusterFire', numbers: [2] },
  engineHum: { pack: 'sci', stem: 'spaceEngineLow', numbers: [0] },
  jumpCharge: { pack: 'sci', stem: 'spaceEngineSmall', numbers: [0] },
  alarm: { pack: 'ui', stem: 'error', numbers: [4, 5] },
  ready: { pack: 'ui', stem: 'confirmation', numbers: [1, 2, 3] },
  upgrade: { pack: 'ui', stem: 'maximize', numbers: [6, 7, 8] },
  callout: { pack: 'ui', stem: 'question', numbers: [1, 2, 3] },
  console: { pack: 'ui', stem: 'select', numbers: [1, 2, 3] }
} as const satisfies Readonly<Record<string, SfxDef>>;
export type SfxKey = keyof typeof SFX;
export const SFX_KEYS = Object.keys(SFX) as SfxKey[];

export interface SfxFile { name: string; file: string; key: SfxKey; index: number }
export function sfxName(key: SfxKey, index: number): string { return `sfx.${key}.${index}`; }
/** Every effect file, in table order: its manifest name and its path under public/assets. */
export function sfxFiles(): SfxFile[] {
  return SFX_KEYS.flatMap((key) => {
    const d: SfxDef = SFX[key];
    return d.numbers.map((n, index) => ({ name: sfxName(key, index), file: `${PACK_DIRS[d.pack]}/${d.stem}_${String(n).padStart(3, '0')}.ogg`, key, index }));
  });
}

/** The two tracks (spec section 5): Cobalt is calm, Time and Space is battle. */
export const MUSIC_CALM = 'music.calm', MUSIC_BATTLE = 'music.battle';
export const MUSIC_FILES: Readonly<Record<string, string>> = { [MUSIC_CALM]: 'raw/scott-buckley/cobalt.mp3', [MUSIC_BATTLE]: 'raw/scott-buckley/time-and-space.mp3' };
export const AUDIO_ASSET_NAMES: readonly string[] = [...sfxFiles().map((f) => f.name), MUSIC_CALM, MUSIC_BATTLE];

export function isAudioName(name: string | undefined): boolean { return name !== undefined && (name.startsWith('sfx.') || name.startsWith('music.')); }
/** `sfx.<key>.<n>` back to its key and variant; null for anything else. */
export function sfxKeyOf(name: string): { key: SfxKey; index: number } | null {
  const m = /^sfx\.([A-Za-z]+)\.(\d+)$/.exec(name);
  if (!m || !Object.prototype.hasOwnProperty.call(SFX, m[1]!)) return null;
  const key = m[1] as SfxKey, index = Number(m[2]);
  return index < SFX[key].numbers.length ? { key, index } : null;
}

/** One sample to play (spec section 3). Times are seconds from now; `dur` cuts the sample with a short fade; `rate` is the
 *  playback rate (1 = as recorded), ramped to `rateTo` over `sweep` (default: the voice's length), and so is the filter's
 *  frequency from `from` to `to`; `variant` pins a variant instead of rotating; `detune` (default true) adds the random
 *  pitch variation. */
export interface SoundRequest {
  key: SfxKey;
  at?: number; gain?: number; pan?: number; dur?: number;
  rate?: number; rateTo?: number; sweep?: number;
  filter?: { type: 'lowpass' | 'bandpass'; from: number; to?: number; q?: number };
  variant?: number; detune?: boolean;
}

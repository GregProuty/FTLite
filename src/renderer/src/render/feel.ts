// The feel setting (Art-i spec section 7): how hard hits land. Stored in localStorage under FEEL_KEY, read once at boot
// (app/feelBoot.ts); there is no menu in Art-i, and F9 cycles it in dev builds only. Pure: no Pixi, no DOM.

export const FEEL_KEY = 'ftlite-feel';
export const FEEL_SETTINGS = ['full', 'reduced', 'off'] as const;
export type FeelSetting = (typeof FEEL_SETTINGS)[number];
export const DEFAULT_FEEL: FeelSetting = 'full';

/** Multipliers on the impact feel: the shake's amplitude, the flash's strength and the hitstop's length. */
export interface FeelScale { shake: number; flash: number; hitstop: number }

const SCALES: Readonly<Record<FeelSetting, FeelScale>> = {
  full: { shake: 1, flash: 1, hitstop: 1 },
  reduced: { shake: 0.5, flash: 0.5, hitstop: 1 },
  off: { shake: 0, flash: 0, hitstop: 0 }
};

export function feelScale(setting: FeelSetting): FeelScale { return SCALES[setting]; }

/** A stored value back to a setting; anything unknown (or nothing stored) is the default. */
export function parseFeel(raw: string | null | undefined): FeelSetting {
  return (FEEL_SETTINGS as readonly string[]).includes(raw ?? '') ? (raw as FeelSetting) : DEFAULT_FEEL;
}

/** The F9 dev cycle: full, reduced, off, full. */
export function nextFeel(setting: FeelSetting): FeelSetting {
  return FEEL_SETTINGS[(FEEL_SETTINGS.indexOf(setting) + 1) % FEEL_SETTINGS.length]!;
}

export interface FeelStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** Reads the setting; a storage that throws (denied, private window) gives the default. */
export function loadFeel(storage: () => FeelStorage): FeelSetting {
  try { return parseFeel(storage().getItem(FEEL_KEY)); } catch { return DEFAULT_FEEL; }
}

/** Writes the setting; storage failures are ignored (the setting still applies for this session). */
export function saveFeel(storage: () => FeelStorage, setting: FeelSetting): void {
  try { storage().setItem(FEEL_KEY, setting); } catch { /* storage unavailable or full */ }
}

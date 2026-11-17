// The player's settings (main menu spec, 2026-11-16; Audio-i spec section 6): the Master, Music and Effects volumes. The
// same pattern as progressStore: read field by field, anything malformed falls back to the default, and storage failures
// never reach the game. A version 1 record (one volume) migrates: its volume becomes Master.
import type { RecordStorage } from './telemetryStore';
import type { Volumes } from './audio';

export const SETTINGS_KEY = 'ftlite-settings';
/** The volume choices Settings offers: Off, then quarters up to full. */
export const VOLUME_STEPS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];
export const VOLUME_CHANNELS = ['master', 'music', 'effects'] as const;
export type VolumeChannel = (typeof VOLUME_CHANNELS)[number];
export const VOLUME_LABELS: Readonly<Record<VolumeChannel, string>> = { master: 'Master volume', music: 'Music', effects: 'Effects' };

export interface Settings extends Volumes { version: 2 }
export const DEFAULT_SETTINGS: Settings = { version: 2, master: 1, music: 1, effects: 1 };

const step = (v: unknown, fallback: number): number => (typeof v === 'number' && VOLUME_STEPS.includes(v) ? v : fallback);

export function loadSettings(storage: RecordStorage): Settings {
  try {
    const raw = JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
    const r = raw as Record<string, unknown>;
    if (r.version === 1) return { ...DEFAULT_SETTINGS, master: step(r.volume, DEFAULT_SETTINGS.master) };
    if (r.version !== 2) return { ...DEFAULT_SETTINGS };
    return { version: 2, master: step(r.master, DEFAULT_SETTINGS.master), music: step(r.music, DEFAULT_SETTINGS.music), effects: step(r.effects, DEFAULT_SETTINGS.effects) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(storage: RecordStorage, s: Settings): void {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable or full */ }
}

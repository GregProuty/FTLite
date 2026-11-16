// The player's settings (main menu spec, 2026-11-16): today only the sound volume. The same pattern as progressStore:
// read field by field, anything malformed falls back to the default, and storage failures never reach the game.
import type { RecordStorage } from './telemetryStore';

export const SETTINGS_KEY = 'ftlite-settings';
/** The volume choices Settings offers: Off, then quarters up to full. */
export const VOLUME_STEPS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

export interface Settings { version: 1; volume: number }
export const DEFAULT_SETTINGS: Settings = { version: 1, volume: 1 };

export function loadSettings(storage: RecordStorage): Settings {
  try {
    const raw = JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || (raw as { version?: unknown }).version !== 1) return { ...DEFAULT_SETTINGS };
    const volume = (raw as { volume?: unknown }).volume;
    return { version: 1, volume: typeof volume === 'number' && VOLUME_STEPS.includes(volume) ? volume : DEFAULT_SETTINGS.volume };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(storage: RecordStorage, s: Settings): void {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable or full */ }
}

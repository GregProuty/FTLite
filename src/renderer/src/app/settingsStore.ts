// The player's settings (main menu spec, 2026-11-16; Audio-i spec section 6): the Master, Music and Effects volumes. The
// same pattern as progressStore: read field by field, anything malformed falls back to the default, and storage failures
// never reach the game. A version 1 record (one volume) migrates: its volume becomes Master.
import type { RecordStorage } from './telemetryStore';
import type { Volumes } from './audio';
import { DEFAULT_SHAKE, validShake, type ShakeSetting } from '../render/shake';
import { DEFAULT_MAP_GRID, validMapGrid, type MapGridSetting } from '../render/tactical/mapGrid';
import { DEFAULT_SOLO_SHIP, isSoloShipId, type SoloShipId } from '../sim/ship/fleet';

export const SETTINGS_KEY = 'ftlite-settings';
/** The volume choices Settings offers: Off, then quarters up to full. */
export const VOLUME_STEPS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];
export const VOLUME_CHANNELS = ['master', 'music', 'effects'] as const;
export type VolumeChannel = (typeof VOLUME_CHANNELS)[number];
export const VOLUME_LABELS: Readonly<Record<VolumeChannel, string>> = { master: 'Master volume', music: 'Music', effects: 'Effects' };
/** Helm round 2 §2.3, §6.3: the throttle tap time's choices in ms (a W or S press shorter than it is a tap), and the
 *  default. The Settings record's throttleTapMs holds one. */
export const THROTTLE_TAP_STEPS: readonly number[] = [150, 200, 250, 300];
export const DEFAULT_THROTTLE_TAP_MS = 200;

/** Feel-i: `shake`, the console maps' screen shake (off, low, full); a version 2 record without it reads full. Valkyrn spec
 *  §8, §9: `soloShip`, the Single player ship last picked, and `valkyrnLaserFit`, the developer laser fit; a record without
 *  them reads the first solo ship and the gun. `mapGrid` (owner 2026-11-19), the console map's grid; a record without it
 *  reads the gravity grid. `throttleTapMs` (helm round 2 §6.3): the throttle tap time, one of THROTTLE_TAP_STEPS; a record without it, or with any other value, reads DEFAULT_THROTTLE_TAP_MS. */
export interface Settings extends Volumes { version: 2; shake: ShakeSetting; soloShip: SoloShipId; valkyrnLaserFit: boolean; mapGrid: MapGridSetting; throttleTapMs: number }
export const DEFAULT_SETTINGS: Settings = { version: 2, master: 1, music: 0.5, effects: 1, shake: DEFAULT_SHAKE, soloShip: DEFAULT_SOLO_SHIP, valkyrnLaserFit: false, mapGrid: DEFAULT_MAP_GRID, throttleTapMs: DEFAULT_THROTTLE_TAP_MS };   // music at half (owner 2026-11-17)

const step = (v: unknown, fallback: number): number => (typeof v === 'number' && VOLUME_STEPS.includes(v) ? v : fallback);

export function loadSettings(storage: RecordStorage): Settings {
  try {
    const raw = JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
    const r = raw as Record<string, unknown>;
    if (r.version === 1) return { ...DEFAULT_SETTINGS, master: step(r.volume, DEFAULT_SETTINGS.master) };
    if (r.version !== 2) return { ...DEFAULT_SETTINGS };
    return { version: 2, master: step(r.master, DEFAULT_SETTINGS.master), music: step(r.music, DEFAULT_SETTINGS.music), effects: step(r.effects, DEFAULT_SETTINGS.effects),
      shake: validShake(r.shake) ? r.shake : DEFAULT_SETTINGS.shake,
      soloShip: isSoloShipId(r.soloShip) ? r.soloShip : DEFAULT_SETTINGS.soloShip, valkyrnLaserFit: r.valkyrnLaserFit === true,
      mapGrid: validMapGrid(r.mapGrid) ? r.mapGrid : DEFAULT_SETTINGS.mapGrid,
      throttleTapMs: typeof r.throttleTapMs === 'number' && THROTTLE_TAP_STEPS.includes(r.throttleTapMs) ? r.throttleTapMs : DEFAULT_THROTTLE_TAP_MS };   // helm round 2 §6.3
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(storage: RecordStorage, s: Settings): void {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable or full */ }
}

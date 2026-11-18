// Feel-i (spec 2026-11-17-console-feel-design §4, Settings): how hard the console maps shake on a hit. Off, low (half) or
// full; saved with the volumes (app/settingsStore.ts) and read by the duel scene each frame through the renderer.
export const SHAKE_SETTINGS = ['off', 'low', 'full'] as const;
export type ShakeSetting = (typeof SHAKE_SETTINGS)[number];
export const DEFAULT_SHAKE: ShakeSetting = 'full';
export const SHAKE_LABELS: Readonly<Record<ShakeSetting, string>> = { off: 'Off', low: 'Low', full: 'Full' };
/** The shake's strength multiplier for a setting. */
export function shakeScale(s: ShakeSetting): number { return s === 'off' ? 0 : s === 'low' ? 0.5 : 1; }
export function validShake(v: unknown): v is ShakeSetting { return typeof v === 'string' && (SHAKE_SETTINGS as readonly string[]).includes(v); }

// The CRT look of the console screens (CRT map spec sections 1, 3, 4): where it applies, the strength setting and its
// storage (mirrors render/feel.ts: localStorage under CRT_KEY, read once at boot by app/crtBoot.ts, F10 cycles it in dev
// builds only), the screen-effect strengths, the flicker wave and the bezel geometry. Pure: no Pixi, no DOM.
import type { FeelStorage } from './feel';

/** The views a CRT can show: the duel's four views and the dev flight view. */
export type CrtView = 'helm' | 'weapons' | 'science' | 'interior' | 'flight';
/** The console views (the Helm map, the Weapons map, the flight view) are amber CRT screens; the interior is not. */
export function crtActive(view: CrtView): boolean { return view !== 'interior'; }

export const CRT_KEY = 'ftlite-crt';
export const CRT_SETTINGS = ['full', 'subtle', 'off'] as const;
export type CrtSetting = (typeof CRT_SETTINGS)[number];
export const DEFAULT_CRT: CrtSetting = 'subtle';

/** Screen-effect strengths, 0..1 each. `off` zeroes them all; the amber palette, the blinks and the bezel stay. */
export interface CrtScale { glow: number; scanline: number; mask: number; flicker: number; vignette: number }

const SCALES: Readonly<Record<CrtSetting, CrtScale>> = {
  full: { glow: 1, scanline: 1, mask: 1, flicker: 1, vignette: 1 },
  subtle: { glow: 0.5, scanline: 0.5, mask: 0.4, flicker: 0.4, vignette: 0.7 },
  off: { glow: 0, scanline: 0, mask: 0, flicker: 0, vignette: 0 }
};

/** The strengths for a setting: the same object every call, so a caller can compare by reference. */
export function crtScale(setting: CrtSetting): CrtScale { return SCALES[setting]; }

/** A stored value back to a setting; anything unknown (or nothing stored) is the default. */
export function parseCrt(raw: string | null | undefined): CrtSetting {
  return (CRT_SETTINGS as readonly string[]).includes(raw ?? '') ? (raw as CrtSetting) : DEFAULT_CRT;
}

/** The F10 dev cycle: full, subtle, off, full. */
export function nextCrt(setting: CrtSetting): CrtSetting {
  return CRT_SETTINGS[(CRT_SETTINGS.indexOf(setting) + 1) % CRT_SETTINGS.length]!;
}

/** Reads the setting; a storage that throws (denied, private window) gives the default. */
export function loadCrt(storage: () => FeelStorage): CrtSetting {
  try { return parseCrt(storage().getItem(CRT_KEY)); } catch { return DEFAULT_CRT; }
}

/** Writes the setting; storage failures are ignored (the setting still applies for this session). */
export function saveCrt(storage: () => FeelStorage, setting: CrtSetting): void {
  try { storage().setItem(CRT_KEY, setting); } catch { /* storage unavailable or full */ }
}

/** The darkest the flicker gets, at strength 1: a few percent. */
export const FLICKER_DEPTH = 0.05;
/** The slow brightness flicker's darkening, 0..FLICKER_DEPTH x strength, from the presentation time in seconds. */
export function crtFlicker(t: number, strength: number): number {
  const w = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 0.37) * Math.sin(t * 2 * Math.PI * 1.3);
  return FLICKER_DEPTH * strength * w;
}

/** The bezel on the letterbox rectangle, in internal pixels: its width and the radius of its inner edge's corners. */
export const BEZEL_PX = 3, BEZEL_RADIUS = 8;
/** Whether the rectangle lies inside the bezel's inner edge (a W x H rectangle inset by BEZEL_PX, corners rounded). */
export function insideBezel(x: number, y: number, w: number, h: number, W: number, H: number): boolean {
  const l = BEZEL_PX, t = BEZEL_PX, r = W - BEZEL_PX, b = H - BEZEL_PX, R = BEZEL_RADIUS;
  if (x < l || y < t || x + w > r || y + h > b) return false;
  for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as const) {
    const cx = Math.min(Math.max(px, l + R), r - R), cy = Math.min(Math.max(py, t + R), b - R);
    if ((px - cx) ** 2 + (py - cy) ** 2 > R * R) return false;
  }
  return true;
}

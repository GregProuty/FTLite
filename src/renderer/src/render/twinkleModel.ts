// The twinkling painted stars (Art-v spec section 2) and the backdrop's cover transform and layer choice (sections 1 and 3).
// Pure: no Pixi, no DOM. Every per-star value comes from the star's index k through hash2, so it never touches the sim.
import { hash2 } from './particles/random';

/** The committed star list (art/deep-space-red.stars.json, npm run art:stars): source pixels. */
export type StarRow = readonly [x: number, y: number, size: number, peak: number];
export interface StarFile { width: number; height: number; tint: string; stars: readonly StarRow[] }

const SEED = 0x7a1c5;   // the twinkle's own hash stream
/** The top share of stars by peak that also get the slow cross glint. */
export const BRIGHT_SHARE = 0.1;

export interface TwinkleParams { freq: number; phase: number; depth: number }

/** Star k's twinkle: 0.25 to 1 Hz, a phase in [0, 2 pi), a depth (alpha swing) of 0.6 to 1. */
export function twinkleParams(k: number): TwinkleParams {
  return {
    freq: 0.25 + 0.75 * hash2(SEED, k * 4),
    phase: 2 * Math.PI * hash2(SEED, k * 4 + 1),
    depth: 0.6 + 0.4 * hash2(SEED, k * 4 + 2)
  };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 1 - depth x feelScale x (0.5 + 0.5 sin(2 pi f t + phase))^3, clamped to [0, 1]: mostly lit with brief dips; feelScale 0 is 1. */
export function twinkleAlpha(k: number, t: number, feelScale: number, p: TwinkleParams = twinkleParams(k)): number {
  if (feelScale === 0) return 1;
  const s = 0.5 + 0.5 * Math.sin(2 * Math.PI * p.freq * t + p.phase);
  return clamp01(1 - p.depth * feelScale * s * s * s);
}

/** The slow cross glint of a bright star: a 5 to 9 s pulse, (0.5 + 0.5 sin)^4 x feelScale, so it shows briefly and rests long. */
export function glintPeriod(k: number): number { return 5 + 4 * hash2(SEED, k * 4 + 3); }
export function glintAlpha(k: number, t: number, feelScale: number, period: number = glintPeriod(k)): number {
  if (feelScale === 0) return 0;
  const s = 0.5 + 0.5 * Math.sin(2 * Math.PI * (t / period + hash2(SEED ^ 0x55, k)));
  return clamp01(feelScale * s * s * s * s);
}

/** Which stars are in the top BRIGHT_SHARE by peak (ties broken by index, so the count is exact). */
export function brightFlags(stars: readonly StarRow[]): boolean[] {
  const n = Math.ceil(stars.length * BRIGHT_SHARE);
  const order = stars.map((s, k) => ({ k, peak: s[3] })).sort((a, b) => b.peak - a.peak || a.k - b.k);
  const flags = stars.map(() => false);
  for (let i = 0; i < n; i++) flags[order[i]!.k] = true;
  return flags;
}

/** Cover: scale the source to fill the stage, centred, the excess cropped. */
export function coverFit(srcW: number, srcH: number, w: number, h: number): { scale: number; x: number; y: number } {
  const scale = Math.max(w / srcW, h / srcH);
  return { scale, x: (w - srcW * scale) / 2, y: (h - srcH * scale) / 2 };
}

/** Section 3: the painted backdrop (and, with a star list, its twinkle) only when space.backdrop is loaded; else today's starfield. */
export function backdropChoice(missing: ReadonlySet<string>, stars: StarFile | null): { backdrop: boolean; twinkle: boolean; starfield: boolean } {
  const backdrop = !missing.has('space.backdrop');
  return { backdrop, twinkle: backdrop && stars !== null && stars.stars.length > 0, starfield: !backdrop };
}

/** The committed JSON to a StarFile, or null if it is not one. */
export function parseStarFile(raw: unknown): StarFile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.width !== 'number' || typeof r.height !== 'number' || typeof r.tint !== 'string' || !Array.isArray(r.stars)) return null;
  if (!(Number.isFinite(r.width) && Number.isFinite(r.height) && r.width > 0 && r.height > 0)) return null;
  if (!/^#[0-9a-f]{6}$/i.test(r.tint)) return null;
  const ok = r.stars.every((s) => Array.isArray(s) && s.length === 4 && s.every((v) => typeof v === 'number' && Number.isFinite(v)));
  return ok ? { width: r.width, height: r.height, tint: r.tint, stars: r.stars as StarRow[] } : null;
}

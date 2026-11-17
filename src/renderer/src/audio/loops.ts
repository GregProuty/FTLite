// Audio-i spec section 4 (c, d): the two loops' levels and the fire crackle's samples. Pure: no Web Audio; the random
// source is the caller's (the app's), never the sim RNG.

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** The engine hum's gain and playback rate, from idle to full (tune by ear). */
export const HUM_IDLE_GAIN = 0.1, HUM_MAX_GAIN = 0.35, HUM_IDLE_RATE = 0.85, HUM_MAX_RATE = 1.35;
/** The crew ship's speed (world units a second) that counts as full; the duel's top speed is THRUST / DRAG = 800. */
export const HUM_FULL_SPEED = 400;
export const HUM_THRUST_SHARE = 0.6, HUM_SPEED_SHARE = 0.4, HUM_SMOOTH_S = 0.25;

/** What drives the hum: thrust held (any sign, 0..1), the crew ship's speed, and the sector's jump swell (0..1). */
export interface HumInput { thrust: number; speed: number; charge: number }
export function humLevel(i: HumInput): number {
  const move = HUM_THRUST_SHARE * clamp01(Math.abs(i.thrust)) + HUM_SPEED_SHARE * clamp01(i.speed / HUM_FULL_SPEED);
  return clamp01(Math.max(move, clamp01(i.charge)));
}
export function humTarget(i: HumInput): { gain: number; rate: number } {
  const l = humLevel(i);
  return { gain: HUM_IDLE_GAIN + (HUM_MAX_GAIN - HUM_IDLE_GAIN) * l, rate: HUM_IDLE_RATE + (HUM_MAX_RATE - HUM_IDLE_RATE) * l };
}

/** The fire crackle's gain: 0 with no fire, then per burning room to a cap; smoothed and band-passed in the engine. */
export const FIRE_GAIN_ONE = 0.15, FIRE_GAIN_STEP = 0.08, FIRE_GAIN_MAX = 0.4, FIRE_SMOOTH_S = 0.6, FIRE_FILTER_HZ = 2200, FIRE_FILTER_Q = 0.6;
export function fireGain(rooms: number): number {
  return rooms >= 1 ? Math.min(FIRE_GAIN_MAX, FIRE_GAIN_ONE + FIRE_GAIN_STEP * (Math.floor(rooms) - 1)) : 0;
}

/** The crackle (spec section 4c decision: synthesised, not a processed sample): sparse random pops over a quiet noise bed,
 *  both ends faded so the loop never clicks. */
export const CRACKLE_SECONDS = 2, CRACKLE_POPS_PER_S = 40, CRACKLE_POP_S = 0.004, CRACKLE_BED = 0.08, CRACKLE_EDGE_S = 0.01;
export function crackleSamples(rate: number, random: () => number, seconds = CRACKLE_SECONDS): Float32Array {
  const n = Math.round(rate * seconds), out = new Float32Array(n), p = CRACKLE_POPS_PER_S / rate, decay = Math.exp(-1 / (CRACKLE_POP_S * rate));
  let env = 0;
  for (let k = 0; k < n; k++) {
    if (random() < p) env = 0.4 + 0.5 * random();
    out[k] = (random() * 2 - 1) * (CRACKLE_BED + env);
    env *= decay;
  }
  const edge = Math.min(n >> 1, Math.round(rate * CRACKLE_EDGE_S));
  for (let k = 0; k < edge; k++) { const f = k / edge; out[k] = out[k]! * f; out[n - 1 - k] = out[n - 1 - k]! * f; }
  return out;
}

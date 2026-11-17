// Audio-i spec section 3: the pure parts of playing a sample. The variant pick, the detune, the pan and the per-key voice
// cap. Every random draw comes from the caller (the app's random source), never from the sim RNG.

export const VOICE_CAP = 4, PITCH_SPREAD_CENTS = 50, PAN_WIDTH = 0.8, PAN_WORLD_UNITS = 600;

const clamp = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);

/** A variant of `key` out of `count`: random, but never the key's last pick when there is a choice. Remembers the pick. */
export function pickVariant(last: Map<string, number>, key: string, count: number, random: () => number): number {
  if (count <= 1) { last.set(key, 0); return 0; }
  const prev = last.get(key);
  let v: number;
  if (prev === undefined || prev >= count) v = Math.min(count - 1, Math.floor(random() * count));
  else { const r = Math.min(count - 2, Math.floor(random() * (count - 1))); v = r >= prev ? r + 1 : r; }
  last.set(key, v);
  return v;
}

/** A random detune in cents, within ±spread. */
export function detuneCents(random: () => number, spread = PITCH_SPREAD_CENTS): number { return (random() * 2 - 1) * spread; }

/** Pan from a screen x across a viewport `width` px wide: −PAN_WIDTH at the left edge, +PAN_WIDTH at the right. */
export function screenPan(sx: number, width: number): number { return width > 0 ? clamp((sx / width) * 2 - 1, -1, 1) * PAN_WIDTH : 0; }
/** Pan from a world-x offset from the listener (the crew ship), for a view with no map camera. */
export function worldPan(dx: number): number { return clamp(dx / PAN_WORLD_UNITS, -1, 1) * PAN_WIDTH; }
/** Pan from a tile column across a ship `width` tiles wide (interior doors and consoles). */
export function tilePan(column: number, width: number): number { return width > 0 ? screenPan(column + 0.5, width) : 0; }

export interface Voice { id: number; key: string; ends: number }
export interface VoicePool { next: number; voices: Voice[] }
export function createVoicePool(): VoicePool { return { next: 1, voices: [] }; }

/** Admit a voice of `key` that starts at `now` and ends at `ends` (seconds). Ended voices are forgotten; when `key` already
 *  has `cap` live voices, the oldest are returned in `steal` for the caller to stop, so the newest always sounds. */
export function admitVoice(pool: VoicePool, key: string, now: number, ends: number, cap = VOICE_CAP): { id: number; steal: number[] } {
  pool.voices = pool.voices.filter((v) => v.ends > now);
  const mine = pool.voices.filter((v) => v.key === key);
  const steal = mine.slice(0, Math.max(0, mine.length - (cap - 1))).map((v) => v.id);
  if (steal.length) pool.voices = pool.voices.filter((v) => !steal.includes(v.id));
  const id = pool.next++;
  pool.voices.push({ id, key, ends });
  return { id, steal };
}

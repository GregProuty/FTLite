// The painted-ship look (art spike): colours and helpers for code-drawn art that sits on a hand-inked watercolour battlemap
// (thick near-black ink outlines, flat muted fills). Pure: no Pixi.

/** The ink line: a warm near-black, like the battlemap's outlines. */
export const INK = 0x1b1714;
/** Fire, bright to dark: a white-hot core, yellow, orange, a deep red and the burnt edge. */
export const FLAME = [0xfff6d8, 0xffd23f, 0xf7891f, 0xc8401c, 0x7a2214] as const;
/** Smoke, light to dark (muted, a little warm, to match the painting's greys). */
export const SMOKE_TONES = [0xb8b2aa, 0x8a847e, 0x5e5a58, 0x3c3a3c] as const;
/** Skin and hair tones for the crew figures, one pair per player slot. */
export const SKIN = [0xe2b48c, 0xc68e64, 0xf0c8a0, 0x9a6844] as const;
export const HAIR = [0x6b4a2e, 0x4a3c36, 0xd8a850, 0xa8482a] as const;
/** The seated ring, the downed cross and the downed body's grey. */
export const SEAT_RING = 0xffe08a, DOWN_RED = 0xd8402e, BODY_GREY = 0x8c8a88;

const ch = (c: number, s: number): number => (c >> s) & 0xff;
/** `c` scaled toward black by `k` (0 is black, 1 unchanged). */
export function shade(c: number, k: number): number {
  return (Math.round(ch(c, 16) * k) << 16) | (Math.round(ch(c, 8) * k) << 8) | Math.round(ch(c, 0) * k);
}
/** A linear mix: 0 is `a`, 1 is `b`. */
export function mix(a: number, b: number, u: number): number {
  const m = (s: number): number => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * u);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}
/** A smooth step on [0, 1]. */
export const ease = (u: number): number => { const v = Math.min(1, Math.max(0, u)); return v * v * (3 - 2 * v); };
/** Ease-out (fast start, slow end) on [0, 1]. */
export const easeOut = (u: number): number => { const v = Math.min(1, Math.max(0, u)); return 1 - (1 - v) * (1 - v) * (1 - v); };

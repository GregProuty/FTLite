// The particle generator's own random source (Art-i spec section 6): seeded from the layout hash, never the sim's
// generator, and nothing it draws reaches the sim. Pure: no Pixi. (Named random.ts: the render guard forbids an rng module.)

/** FNV-1a over a string's UTF-16 code units, as an unsigned 32-bit seed. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** An unsigned 32-bit hash of two integers (stateless: per-object constants such as which wall tiles are vents). */
export function hashU32(a: number, b: number): number {
  let h = Math.imul(a ^ 0x27d4eb2d, 0x9e3779b1) ^ Math.imul(b + 0x165667b1, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return h >>> 0;
}

/** hashU32 as a value in [0, 1). */
export function hash2(a: number, b: number): number { return hashU32(a, b) / 4294967296; }

export interface Random {
  /** [0, 1) */
  next(): number;
  /** [lo, hi) */
  range(lo: number, hi: number): number;
  /** 0..n-1 */
  int(n: number): number;
}

/** mulberry32: small, fast, deterministic for a seed. */
export function createRandom(seed: number): Random {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (lo, hi) => lo + (hi - lo) * next(), int: (n) => Math.floor(next() * n) };
}

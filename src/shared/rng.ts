// mulberry32: tiny 32-bit PRNG with a one-number state, so every stream is trivially serializable.
export interface RngState { s: number }

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

export function nextU32(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

export function nextFloat(r: RngState): number {
  return nextU32(r) / 4294967296;
}

export function nextInt(r: RngState, n: number): number {
  return Math.floor(nextFloat(r) * n);
}

export function chance(r: RngState, p: number): boolean {
  return nextFloat(r) < p;
}

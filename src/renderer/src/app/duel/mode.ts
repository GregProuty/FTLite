// The launch mode (H-1 spec §3): `?mode=flight` starts the dev flight view; anything else, or none, starts today's
// sector game unchanged. H-1b adds `duel`. `?seed=<n>` overrides the default seed.
export type AppMode = 'sector' | 'flight';
export const DEFAULT_SEED = 2026;

export function readMode(search: string): AppMode {
  return new URLSearchParams(search).get('mode') === 'flight' ? 'flight' : 'sector';
}

/** A whole number from 0 to 2^31 − 1, or the default. */
export function readSeed(search: string, fallback = DEFAULT_SEED): number {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^\d+$/.test(raw)) return fallback;
  const n = Number(raw);
  return n <= 0x7fffffff ? n : fallback;
}

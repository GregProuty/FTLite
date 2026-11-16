/** Timing is a producer contract, independent of its transport. */
export type AdmissionPolicy = 'strict' | 'receive-time';
export const MAX_INPUT_AGE_TICKS = 120;
export const REMOTE_HELD_TIMEOUT_MS = 250;
export function inputTickAllowed(observedTick: number, tick: number, policy: AdmissionPolicy): boolean {
  return policy === 'strict' ? observedTick === tick : observedTick <= tick && tick - observedTick <= MAX_INPUT_AGE_TICKS;
}

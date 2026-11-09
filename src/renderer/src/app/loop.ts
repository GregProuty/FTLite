import { DT } from '../sim/tuning';

export const MAX_TICKS_PER_FRAME = 5;

/** Fixed-timestep accumulator. On a long frame the backlog is discarded: slow motion, not catch-up (spec §8). */
export function stepAccumulator(accumulator: number, frameDelta: number): { ticks: number; accumulator: number } {
  let acc = accumulator + frameDelta, ticks = 0;
  while (acc >= DT && ticks < MAX_TICKS_PER_FRAME) { acc -= DT; ticks++; }
  if (ticks === MAX_TICKS_PER_FRAME) acc = 0;
  return { ticks, accumulator: acc };
}

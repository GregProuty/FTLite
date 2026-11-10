import type { Facing8 } from './assetNames';

export const MOVE_EPS_PX = 1e-4;
const TAN_22_5 = 0.41421356;   // tan(22.5°): the cardinal sectors are ±22.5° wide

/** 8-way facing from a movement delta (y down). Idle keeps the previous facing (last non-zero delta). No trig: sector by slope. */
export function facingFromDelta(dx: number, dy: number, previous: Facing8): Facing8 {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < MOVE_EPS_PX && ay < MOVE_EPS_PX) return previous;
  if (ay <= ax * TAN_22_5) return dx > 0 ? 'e' : 'w';
  if (ax <= ay * TAN_22_5) return dy > 0 ? 's' : 'n';
  if (dy < 0) return dx > 0 ? 'ne' : 'nw';
  return dx > 0 ? 'se' : 'sw';
}

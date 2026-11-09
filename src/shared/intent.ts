export type PlayerId = number; // 0..MAX_PLAYERS-1
export const MAX_PLAYERS = 4;

export interface Intent {
  moveX: number;
  moveY: number;
  interactHeld: boolean;
  interactPressed: boolean;
  confirmPressed: boolean;
  cancelPressed: boolean;
}

export const NEUTRAL_INTENT: Readonly<Intent> = Object.freeze({
  moveX: 0, moveY: 0, interactHeld: false, interactPressed: false, confirmPressed: false, cancelPressed: false
});

function finite(n: number): number { return Number.isFinite(n) ? n : 0; }

/** Malformed input is clamped, never trusted (spec §9). Output never contains NaN or -0. */
export function clampIntent(i: Intent): Intent {
  let x = finite(i.moveX), y = finite(i.moveY);
  const len = Math.sqrt(x * x + y * y);
  if (len > 1) { x /= len; y /= len; }
  if (x === 0) x = 0; if (y === 0) y = 0; // normalise -0 to 0
  return {
    moveX: x, moveY: y,
    interactHeld: !!i.interactHeld, interactPressed: !!i.interactPressed,
    confirmPressed: !!i.confirmPressed, cancelPressed: !!i.cancelPressed
  };
}

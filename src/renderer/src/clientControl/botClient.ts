import type { SimState } from '../sim/state';
import { botIntent } from './botPolicy';
import type { CardUiState } from './cardController';
import type { InputFrame } from './inputFrame';

/** A host-side producer reads only the last completed replica; policy and cadence are unchanged. */
export function botFrame(view: SimState, ui: CardUiState, player: number): InputFrame {
  const input = botIntent(view, ui, player);
  return { moveX: input.moveX, moveY: input.moveY, interactHeld: input.interactHeld, interactPresses: Number(input.interactPressed), confirmPresses: Number(input.confirmPressed), cancelPresses: Number(input.cancelPressed) };
}

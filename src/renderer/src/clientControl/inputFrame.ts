export interface InputFrame {
  moveX: number; moveY: number; interactHeld: boolean;
  interactPresses: number; confirmPresses: number; cancelPresses: number;
}
export const NEUTRAL_FRAME: Readonly<InputFrame> = Object.freeze({ moveX: 0, moveY: 0, interactHeld: false, interactPresses: 0, confirmPresses: 0, cancelPresses: 0 });

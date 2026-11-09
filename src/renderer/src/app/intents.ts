import { NEUTRAL_INTENT, type Intent } from '../../../shared/intent';

export interface InputFrame {
  moveX: number; moveY: number; interactHeld: boolean;
  interactPresses: number; confirmPresses: number; cancelPresses: number;
}
export const NEUTRAL_FRAME: Readonly<InputFrame> = Object.freeze({ moveX: 0, moveY: 0, interactHeld: false, interactPresses: 0, confirmPresses: 0, cancelPresses: 0 });

/** Turns per-frame device snapshots into per-tick intents. Each press edge is delivered on exactly one tick (spec §6). */
export function createIntentFeed(playerCount: number) {
  const held: InputFrame[] = Array.from({ length: playerCount }, () => ({ ...NEUTRAL_FRAME }));
  const pending = Array.from({ length: playerCount }, () => ({ interact: false, confirm: false, cancel: false }));
  return {
    beginFrame(frames: readonly InputFrame[]): void {
      for (let p = 0; p < playerCount; p++) {
        const f = frames[p] ?? NEUTRAL_FRAME;
        held[p] = { ...f };
        if (f.interactPresses > 0) pending[p]!.interact = true;
        if (f.confirmPresses > 0) pending[p]!.confirm = true;
        if (f.cancelPresses > 0) pending[p]!.cancel = true;
      }
    },
    tick(): Intent[] {
      const out: Intent[] = [];
      for (let p = 0; p < playerCount; p++) {
        const h = held[p]!, e = pending[p]!;
        out.push({ ...NEUTRAL_INTENT, moveX: h.moveX, moveY: h.moveY, interactHeld: h.interactHeld, interactPressed: e.interact, confirmPressed: e.confirm, cancelPressed: e.cancel });
        e.interact = e.confirm = e.cancel = false;
      }
      return out;
    }
  };
}

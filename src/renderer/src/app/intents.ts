import { NEUTRAL_INTENT, type Intent } from '../../../shared/intent';

export interface InputFrame {
  moveX: number; moveY: number; interactHeld: boolean;
  interactPresses: number; confirmPresses: number; cancelPresses: number;
}
export const NEUTRAL_FRAME: Readonly<InputFrame> = Object.freeze({ moveX: 0, moveY: 0, interactHeld: false, interactPresses: 0, confirmPresses: 0, cancelPresses: 0 });

/** Turns per-frame device snapshots into per-tick intents. Each press edge is delivered on exactly one tick (spec §6): N queued presses take N consecutive ticks. */
export function createIntentFeed(playerCount: number) {
  const held: InputFrame[] = Array.from({ length: playerCount }, () => ({ ...NEUTRAL_FRAME }));
  const pending = Array.from({ length: playerCount }, () => ({ interact: 0, confirm: 0, cancel: 0 }));
  return {
    beginFrame(frames: readonly InputFrame[]): void {
      for (let p = 0; p < playerCount; p++) {
        const f = frames[p] ?? NEUTRAL_FRAME;
        held[p] = { ...f };
        pending[p]!.interact += Math.max(0, f.interactPresses);
        pending[p]!.confirm += Math.max(0, f.confirmPresses);
        pending[p]!.cancel += Math.max(0, f.cancelPresses);
      }
    },
    tick(): Intent[] {
      const out: Intent[] = [];
      for (let p = 0; p < playerCount; p++) {
        const h = held[p]!, e = pending[p]!;
        out.push({ ...NEUTRAL_INTENT, moveX: h.moveX, moveY: h.moveY, interactHeld: h.interactHeld, interactPressed: e.interact > 0, confirmPressed: e.confirm > 0, cancelPressed: e.cancel > 0 });
        if (e.interact > 0) e.interact--;
        if (e.confirm > 0) e.confirm--;
        if (e.cancel > 0) e.cancel--;
      }
      return out;
    }
  };
}

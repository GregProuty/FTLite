import { NEUTRAL_INTENT, type Intent } from '../../../shared/intent';

import { NEUTRAL_FRAME, type InputFrame } from '../clientControl/inputFrame';
export { NEUTRAL_FRAME, type InputFrame } from '../clientControl/inputFrame';

/** Legacy isolated-test adapter, removed with app/loop.ts in task 11. Runtime uses inputTimeline. */
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

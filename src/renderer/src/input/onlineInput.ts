import type { SourceSample } from './deviceManager';
import { NEUTRAL_FRAME, type InputFrame } from '../app/intents';

/** One physical producer, independent of the logical seat assigned by main. */
export function createOnlineInput() {
  let key: string | null = null, previous: SourceSample | undefined, changed = false, callouts = 0;
  return {
    get key() { return key; }, get changed() { return changed; }, get callouts() { return callouts; },
    reset() { key = null; previous = undefined; changed = false; callouts = 0; },
    sample(sources: readonly SourceSample[]): InputFrame {
      changed = false; callouts = 0;
      const eligible = sources.filter(s => s.key === 'kb:0' || s.key.startsWith('gp:'));
      let source = eligible.find(s => s.key === key);
      if (!source) {
        source = eligible.find(s => s.any);
        const next = source?.key ?? null;
        changed = key !== null && key !== next;
        key = next; previous = source;
        // Selection/replacement consumes activation buttons. Movement starts next sample.
        return { ...NEUTRAL_FRAME };
      }
      const edge = (button: 'interact' | 'confirm' | 'cancel' | 'callout'): number => source!.presses?.[button] ?? (source![button] && !previous?.[button] ? 1 : 0);
      callouts = edge('callout');
      const frame = { moveX: source.moveX, moveY: source.moveY, interactHeld: source.interact,
        interactPresses: edge('interact'), confirmPresses: edge('confirm'), cancelPresses: edge('cancel') };
      previous = source; return frame;
    }
  };
}

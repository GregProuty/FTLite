// The console-change rule (Artemis spec §6.2): UI holds drop when the drawn console's station changes or it goes.
import { expect, it, vi } from 'vitest';
import { consoleChange } from '../src/renderer/src/app/duel/consoleChange';
it('clearUi runs when the drawn console station changes or goes null, not every frame', () => {
  const clearUi = vi.fn(); const track = consoleChange(clearUi);
  track('weapons'); track('weapons'); expect(clearUi).toHaveBeenCalledTimes(1);   // the first value counts as a change from undefined
  track(null); track(null); track('helm'); expect(clearUi).toHaveBeenCalledTimes(3);
});

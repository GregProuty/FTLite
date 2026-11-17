// The console-change rule (Artemis spec §6.2): UI holds drop when the drawn console's station changes or it goes.
import type { ConsoleStation } from '../../render/duel/consoleModel';

/** Calls `clearUi` whenever the drawn console's station changes or the console goes (Artemis spec §6.2). */
export function consoleChange(clearUi: () => void): (station: ConsoleStation | null) => void {
  let last: ConsoleStation | null | undefined;
  return (station) => { if (station !== last) { last = station; clearUi(); } };
}

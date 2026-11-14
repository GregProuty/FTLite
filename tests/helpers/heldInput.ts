import type { HeldInput } from '../../src/renderer/src/net/contracts';
import type { SimState } from '../../src/renderer/src/sim/state';
import { stepCommands } from '../../src/renderer/src/sim/step';

/** Pure held-only system tests. Never used by gates, bots, parity, replay or acceptance. */
export function heldStep(state: SimState, held: readonly HeldInput[]): void {
  for (const input of held) for (const key of ['confirmPressed', 'interactPressed', 'cancelPressed']) {
    if ((input as unknown as Record<string, unknown>)[key]) throw new Error('held-only unit driver received a press');
  }
  stepCommands(state, { held, commands: [] });
}

import { NEUTRAL_INTENT, type Intent } from '../../../shared/intent';
import type { CommandEnvelope, HeldInput, LegacyInputEnvelope } from '../net/contracts';

export interface TickInput { held: readonly HeldInput[]; commands: readonly CommandEnvelope[] }
export interface MigrationTickInput extends TickInput { legacyCardInput: readonly LegacyInputEnvelope[] }
/** Control envelopes are removed at pump entry, never executed in a sim phase. */
export function isPauseControl(envelope: CommandEnvelope | LegacyInputEnvelope): envelope is CommandEnvelope & { command: { kind: 'setPaused'; paused: boolean } } {
  return !('kind' in envelope) && envelope.command.kind === 'setPaused';
}
/** Immutable temporary phase data. Only the authority bridge admits press envelopes.
 * Held axes also drive unmigrated console directions here until task 5 owns repeat.
 * No envelope means no one-shot; held movement/repair and direction remain available.
 */
export function legacyPhaseInputs(input: MigrationTickInput, players: number): Intent[] {
  const intents = Array.from({ length: players }, (_, p) => ({ ...NEUTRAL_INTENT, ...input.held[p] }));
  for (const envelope of input.legacyCardInput) {
    const target = intents[envelope.id.player];
    if (!target) continue;
    target.interactPressed ||= envelope.input.interactPressed;
    target.confirmPressed ||= envelope.input.confirmPressed;
    target.cancelPressed ||= envelope.input.cancelPressed;
  }
  return intents;
}

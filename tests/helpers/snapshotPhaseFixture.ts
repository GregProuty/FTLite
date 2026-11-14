import type { Intent } from '../../src/shared/intent';
import type { SimState } from '../../src/renderer/src/sim/state';
import { stepCommands } from '../../src/renderer/src/sim/step';

/** Serialization fuzz deliberately tests defensive sim clamping with malformed raw
 * numbers. Those values are not valid wire input. This unit-only adapter preserves
 * that coverage by constructing immutable phase data; it is never an ingress path.
 */
export function snapshotPhaseStep(state: SimState, inputs: readonly Intent[]): void {
  stepCommands(state, {
    held: inputs.map(({ moveX, moveY, interactHeld }) => ({ moveX, moveY, interactHeld })), commands: [],
    legacyCardInput: inputs.map((input, player) => ({ kind: 'legacyCardInput', runId: 'snapshot-unit', requestedTick: state.tick,
      id: { player, sequence: state.tick + 1 }, input: { ...input } }))
  });
}

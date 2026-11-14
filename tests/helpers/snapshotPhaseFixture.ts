import { clampIntent, type Intent } from '../../src/shared/intent';
import type { SimState } from '../../src/renderer/src/sim/state';
import { stepCommands } from '../../src/renderer/src/sim/step';
import { createCardUi, reconcileUi, translateTick } from '../../src/renderer/src/clientControl/cardController';
import { rawFrame } from './rawInput';

const clients = new WeakMap<SimState, ReturnType<typeof createCardUi>>();
/** Approved pure snapshot/invariant-unit exception: this adapter reads its owned
 * fixture before invoking a whole step. It does not test client ownership isolation.
 * The graph whitelist limits this adapter to snapshot/console/weapons properties
 * and the isolated impossible-fire bot self-preservation unit fixtures;
 * authority fixtures, gates, parity, acceptance and byte continuation stay isolated.
 */
export function snapshotPhaseClient(state: SimState) {
  let ui = clients.get(state);
  if (!ui) { ui = createCardUi('snapshot-unit'); clients.set(state, ui); }
  reconcileUi(state, ui, 'snapshot-unit', []);
  return { view: state, ui };
}
/** Deliberately malformed held values still exercise the original sim clamping. */
export function snapshotPhaseStep(state: SimState, inputs: readonly Intent[]): void {
  const { view, ui } = snapshotPhaseClient(state);
  const actions = translateTick(view, ui, inputs.map(i => rawFrame(clampIntent(i))), state.tick);
  stepCommands(state, { held: inputs.map(({ moveX, moveY, interactHeld }) => ({ moveX, moveY, interactHeld })), commands: actions.commands });
}

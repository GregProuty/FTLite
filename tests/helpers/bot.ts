import { botFrame } from '../../src/renderer/src/clientControl/botPolicy';
import type { SimState } from '../../src/renderer/src/sim/state';
import type { CardUiState } from '../../src/renderer/src/clientControl/cardController';
import type { InputFrame } from '../../src/renderer/src/clientControl/inputFrame';
import { decisionView, fixtureRunner } from './rawInput';
export { gunnerPid, BOT_RETREAT_HEALTH, BOT_RECOVER_HEALTH, BOT_GUN_HEAL_HEALTH } from '../../src/renderer/src/clientControl/botPolicy';
function intent(frame: InputFrame) {
  return { moveX: frame.moveX, moveY: frame.moveY, interactHeld: frame.interactHeld, interactPressed: frame.interactPresses > 0, confirmPressed: frame.confirmPresses > 0, cancelPressed: frame.cancelPresses > 0 };
}
/** Existing snapshot/held-phase fixtures explicitly supply their completed view. */
export function botPolicyIntent(view: SimState, ui: CardUiState, player: number) { return intent(botFrame(view, ui, player)); }
/** Every fixture bot decision compares the completed owner against its decoded
 * publication, with separate identical UI memory and unchanged RNG streams.
 * Independent task-1 gate traces still catch policy changes common to both. */
export function botIntent(state: SimState, player: number) {
  const replica = decisionView(state), ui = fixtureRunner(state).ui;
  const ownerUi = structuredClone(ui), replicaUi = structuredClone(ui);
  const rng = JSON.stringify(state.rng), replicaRng = JSON.stringify(replica.rng);
  const expected = botFrame(state, ownerUi, player), actual = botFrame(replica, replicaUi, player);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`bot replica divergence at tick ${state.tick}, player ${player}: owner ${JSON.stringify(expected)}, replica ${JSON.stringify(actual)}`);
  if (JSON.stringify(state.rng) !== rng || JSON.stringify(replica.rng) !== replicaRng) throw new Error(`bot RNG mutation at tick ${state.tick}, player ${player}`);
  return intent(actual);
}

import type { SimState } from '../../src/renderer/src/sim/state';
import { targetRef, weaponsTargetSlot } from '../../src/renderer/src/sim/debrisTargets';
import { fireWeaponAt, weaponRef } from '../../src/renderer/src/sim/weapons';
import { createCardUiState, reconcileUi, translateTick } from '../../src/renderer/src/clientControl/cardController';
import { NEUTRAL_FRAME } from '../../src/renderer/src/clientControl/inputFrame';
import { applyConsoleCommand } from '../../src/renderer/src/sim/commands';
import { Dir } from '../../src/renderer/src/sim/dir';

/** Pure-unit fixture setup only: numeric slots become authoritative identity.
 * No canonical UI mirrors; byte-path gates and scripted drivers send commands.
 */
export function weaponSelection(state: SimState) {
  return { get cursor() { return weaponsTargetSlot(state); }, set cursor(slot: number) { state.weapons.target = targetRef(state, slot); } };
}
/** Unit helper preserving the old hit-result assertions using explicit parameters. */
export function fireFixtureWeapon(state: SimState): boolean {
  return state.weapons.target !== null && fireWeaponAt(state, weaponRef(state), state.weapons.target);
}
/** A direct direction-edge unit invocation, translated through the real controller. */
export function weaponsDirection(state: SimState, _station: number, dir: number, confirm = false): void {
  const ui = createCardUiState('weapons-unit', state.playerCount); reconcileUi(state, ui, 'weapons-unit', []);
  const actions = translateTick(state, ui, [{ ...NEUTRAL_FRAME, moveX: dir === Dir.Right ? 1 : dir === Dir.Left ? -1 : 0, moveY: dir === Dir.Down ? 1 : dir === Dir.Up ? -1 : 0, confirmPresses: Number(confirm) }], state.tick);
  for (const command of actions.commands) applyConsoleCommand(state, command);
}

import { botIntent as policy } from '../../src/renderer/src/clientControl/botPolicy';
import type { SimState } from '../../src/renderer/src/sim/state';
import { decisionView } from './rawInput';
export { gunnerPid, BOT_RETREAT_HEALTH, BOT_RECOVER_HEALTH, BOT_GUN_HEAL_HEALTH } from '../../src/renderer/src/clientControl/botPolicy';
export function botIntent(state: SimState, player: number) { return policy(decisionView(state), player); }

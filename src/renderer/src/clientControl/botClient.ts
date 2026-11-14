import { botFrame } from './botPolicy';
import { translateTick, type CardUiState, type ClientActions } from './cardController';
import type { ClientRun } from './clientRun';
import type { InputFrame } from './inputFrame';

export { botFrame } from './botPolicy';

/** One host-side agent per player. All producers on a link share the client's UI
 * and sequence owner; a decision translates only this player's frame. */
export function createBotClient(player: number, clientRun: ClientRun) {
  return {
    decide(tick: number): ClientActions {
      const view = clientRun.state(), empty = { held: [], commands: [] };
      if (!view) return empty;
      const producer = clientRun.ui.players[player];
      if (!producer) throw new Error('invalid bot player');
      if (tick <= (producer.botDecisionTick ?? -1)) return empty;
      const frames: InputFrame[] = [];
      frames[player] = botFrame(view, clientRun.ui, player);
      const actions = translateTick(view, clientRun.ui, frames, tick, [player]);
      producer.botDecisionTick = tick;
      return actions;
    },
    /** Detached capture of the shared controller memory, including repeat and
     * sequence ownership. Portable checkpoint storage belongs to Net-1b. */
    controllerState(): CardUiState { return structuredClone(clientRun.ui); }
  };
}

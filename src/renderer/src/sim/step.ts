import type { Intent } from '../../../shared/intent';
import { NEUTRAL_INTENT, clampIntent } from '../../../shared/intent';
import type { SimState } from './state';
import { HAZARD_EVERY } from './tuning';
import { interactSystem } from './interact';
import { jumpStep, fieldSystem, decisionSystem, pursuitSystem, trackNavCursor } from './run';
import { consoleSystem } from './console';
import { movementSystem } from './movement';
import { doorSystem } from './doors';
import { oxygenStep } from './hazards/oxygen';
import { fireStep } from './hazards/fire';
import { heatStep } from './heat';
import { crewSystem } from './crew';
import { lifeSupportInjection } from './hazards/lifeSupport';
import { debrisSystem } from './debris';
import { boarderSystem } from './boarders';
import { directorSystem } from './director';
import { enemySystem } from './enemy';
import { medbayStep } from './medbay';
import { xpSystem } from './xp';
import { telemetrySystem } from './telemetry';
import { heldPhaseInputs, type MigrationTickInput } from './commands';
import type { CommandResult } from '../net/contracts';

export function intentFor(intents: readonly Intent[], pid: number): Intent {
  return clampIntent(intents[pid] ?? NEUTRAL_INTENT);
}

/** One fixed 60 Hz tick in the spec's system order (Â§4 rule 4a). */
export function stepCommands(state: SimState, input: MigrationTickInput): readonly CommandResult[] {
  if (state.ended) return [];
  const intents = heldPhaseInputs(input, state.playerCount);
  state.scratch.commandResults.length = 0;
  const hazardTick = state.tick % HAZARD_EVERY === 0;
  state.scratch.doorToggles.clear(); state.scratch.doorCycles.clear(); state.scratch.airlockToggles.clear(); state.scratch.satThisTick.fill(0); state.scratch.stoodThisTick.fill(0); state.scratch.activeThisTick.fill(0); state.scratch.voteChoices.fill(-1); state.scratch.jumpConfirm.fill(0); state.scratch.confirmUsed.fill(0);
  jumpStep(state);   // (0) the jump drive charges first, so a Confirm on the ready tick jumps (spec Run-i section 6)
  // (1) input, arbitration
  interactSystem(state, intents, input.commands);
  // (2) control mode: seated input and the tick's door toggles
  consoleSystem(state, input);
  decisionSystem(state);   // (2a) crew decisions: event votes resolve and a pending jump is confirmed or lapses (spec Coop-ii section 3)
  xpSystem(state);   // (2b) XP at the observation point: operators are seated and this tick's conditions still stand
  // (3) movement, doors
  movementSystem(state, intents);
  doorSystem(state);
  // (4) hazards and heat on the hazard tick
  if (hazardTick) {
    lifeSupportInjection(state);
    oxygenStep(state, state.injectionScratch);
    fireStep(state);
    heatStep(state);
  }
  // (5) director: stress, pacing phases and spawns, then debris detection and impacts
  directorSystem(state);
  pursuitSystem(state);   // (5a) the Pursuit overruns the beacon you are at (spec Loop-i section 3)
  fieldSystem(state);   // (5a) an asteroid field: its start, rocks and clear (spec Demo-viii section 1)
  enemySystem(state);   // (5b) the enemy: arrival, withdrawal, a due shot (spec Combat-i section 5)
  debrisSystem(state);
  boarderSystem(state);   // (5c) boarders: arrival, melee, sabotage, hunting (spec Boarders-i section 5)
  // (6) stations with per-tick effects
  medbayStep(state);
  // (7) crew lifecycle, run end
  crewSystem(state);
  telemetrySystem(state);   // (8) telemetry: final-state samples and life edges, on the ending tick too
  trackNavCursor(state);   // (9) the Navigation cursor follows its row when the list changed this tick (spec Demo-xi section 3)
  state.tick++;
  return [...state.scratch.commandResults].sort((a,b) => a.id.player-b.id.player || a.id.sequence-b.id.sequence);
}

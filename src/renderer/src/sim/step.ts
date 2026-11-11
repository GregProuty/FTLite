import type { Intent } from '../../../shared/intent';
import { NEUTRAL_INTENT, clampIntent } from '../../../shared/intent';
import type { SimState } from './state';
import { HAZARD_EVERY } from './tuning';
import { interactSystem } from './interact';
import { consoleSystem } from './console';
import { movementSystem } from './movement';
import { doorSystem } from './doors';
import { oxygenStep } from './hazards/oxygen';
import { fireStep } from './hazards/fire';
import { heatStep } from './heat';
import { crewSystem } from './crew';
import { lifeSupportInjection } from './hazards/lifeSupport';
import { debrisSystem } from './debris';
import { directorSystem } from './director';
import { medbayStep } from './medbay';
import { xpSystem } from './xp';

export function intentFor(intents: readonly Intent[], pid: number): Intent {
  return clampIntent(intents[pid] ?? NEUTRAL_INTENT);
}

/** One fixed 60 Hz tick in the spec's system order (§4 rule 4a). */
export function step(state: SimState, intents: readonly Intent[]): void {
  if (state.ended) return;
  const hazardTick = state.tick % HAZARD_EVERY === 0;
  state.scratch.doorToggles.clear(); state.scratch.satThisTick.fill(0); state.scratch.stoodThisTick.fill(0);
  // (1) input, arbitration
  interactSystem(state, intents);
  // (2) control mode: seated input and the tick's door toggles
  consoleSystem(state, intents);
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
  debrisSystem(state);
  // (6) stations with per-tick effects
  medbayStep(state);
  // (7) crew lifecycle, run end
  crewSystem(state);
  state.tick++;
}

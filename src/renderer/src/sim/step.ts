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
import { crewSystem } from './crew';
import { stubInjection, stubSpawner } from './hazards/stub';

export function intentFor(intents: readonly Intent[], pid: number): Intent {
  return clampIntent(intents[pid] ?? NEUTRAL_INTENT);
}

/** One fixed 60 Hz tick in the spec's system order (§4 rule 4a). */
export function step(state: SimState, intents: readonly Intent[]): void {
  if (state.ended) return;
  const hazardTick = state.tick % HAZARD_EVERY === 0;
  state.scratch.doorToggles.clear(); state.scratch.satThisTick.fill(0);
  // (1) input, arbitration, movement, doors
  interactSystem(state, intents);
  consoleSystem(state, intents);                      // (2) control mode
  movementSystem(state, intents);
  doorSystem(state);
  // (2) power                                       -> increment 2a
  // (3) stations                                    -> increment 2a
  // (4) hazards on the hazard tick                  -> Tasks 8, 9, 10
  if (hazardTick) {
    stubInjection(state);
    oxygenStep(state, state.injectionScratch);
    fireStep(state);
  }
  // (5) debris                                      -> increment 2a
  stubSpawner(state);
  // (7) crew lifecycle, run end
  crewSystem(state);
  state.tick++;
}

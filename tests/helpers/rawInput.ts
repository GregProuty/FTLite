import type { Intent } from '../../src/shared/intent';
import type { SimState } from '../../src/renderer/src/sim/state';
import type { InputFrame } from '../../src/renderer/src/clientControl/inputFrame';
import { createFixtureRunner } from './authorityFixture';

const runners = new WeakMap<SimState, ReturnType<typeof createFixtureRunner>>();
export function rawFrame(input: Intent): InputFrame {
  return { moveX: input.moveX, moveY: input.moveY, interactHeld: input.interactHeld, interactPresses: Number(input.interactPressed), confirmPresses: Number(input.confirmPressed), cancelPresses: Number(input.cancelPressed) };
}
export function fixtureRunner(state: SimState) {
  let runner = runners.get(state);
  if (!runner) { runner = createFixtureRunner(state); runners.set(state, runner); }
  return runner;
}
/** Publish fixture changes before every scripted decision; callers receive a separate replica. */
export function decisionView(state: SimState): SimState { const runner = fixtureRunner(state); runner.refresh(); return runner.view(); }
export function step(state: SimState, intents: readonly Intent[]): void {
  if (state.ended) return;
  const runner = fixtureRunner(state); runner.refresh(); runner.advance(intents.map(rawFrame));
}

import starter from '../../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { createSimState, type SimState } from '../../src/renderer/src/sim/state';
import { step } from '../../src/renderer/src/sim/step';
import { Position } from '../../src/renderer/src/sim/components';
import { NEUTRAL_INTENT, type Intent } from '../../src/shared/intent';
import { TICK_HZ } from '../../src/renderer/src/sim/tuning';

export const LAYOUT = parseShip(starter);

export function makeState(players = 2, seed = 1): SimState {
  return createSimState(LAYOUT, players, seed);
}

export function intents(...per: Partial<Intent>[]): Intent[] {
  return per.map((p) => ({ ...NEUTRAL_INTENT, ...p }));
}

export function run(state: SimState, ticks: number, perTick: (tick: number) => Intent[] = () => []): void {
  for (let i = 0; i < ticks; i++) step(state, perTick(state.tick));
}

export function teleport(state: SimState, pid: number, x: number, y: number): void {
  const eid = state.crew[pid]!;
  Position.x[eid] = x; Position.y[eid] = y;
}

export function seconds(n: number): number { return Math.round(n * TICK_HZ); }

export function room(state: SimState, id: string): number { return state.derived.roomIndex.get(id)!; }

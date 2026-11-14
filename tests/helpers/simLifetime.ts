import { createSimState as allocateSimState, disposeSimState, type SimState } from '../../src/renderer/src/sim/state';
import { loadSnapshot as restoreSnapshot } from '../../src/renderer/src/sim/snapshot';
export * from '../../src/renderer/src/sim/state';
export * from '../../src/renderer/src/sim/snapshot';

// Standalone fixtures own their states until the test ends. Adopted owners may
// dispose sooner; disposal is idempotent. Borrowed views are never registered.
const states = new Set<SimState>();
const cleanups = new Set<() => void>();
export function createSimState(...args: Parameters<typeof allocateSimState>): SimState {
  const state = allocateSimState(...args); states.add(state); return state;
}
export function loadSnapshot(...args: Parameters<typeof restoreSnapshot>): SimState {
  const state = restoreSnapshot(...args); states.add(state); return state;
}
export function ownTestCleanup(cleanup: () => void): void { cleanups.add(cleanup); }
export function disposeTestSimulations(): void {
  const errors: unknown[] = [];
  for (const cleanup of [...cleanups, ...[...states].map(state => () => disposeSimState(state))]) {
    try { cleanup(); } catch (error) { errors.push(error); }
  }
  cleanups.clear(); states.clear();
  if (errors.length) throw errors[0];
}

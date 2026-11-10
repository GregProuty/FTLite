import type { SimState } from './state';

/** Increment 3 replaces this with real levels. Until then every operator is level 0 (spec §1). */
export function skillLevel(_state: SimState, _pid: number, _kind: number): number { return 0; }

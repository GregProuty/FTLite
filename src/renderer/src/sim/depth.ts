import type { SimState } from './state';
import { SECTOR_COLUMNS } from './tuning';

/** Progress through the run (spec Loop-i section 1): sector x SECTOR_COLUMNS + column, 0 to 17. Every rule that scales with progress reads this. */
export function depthOf(state: SimState): number { return state.run.sector * SECTOR_COLUMNS + state.run.column; }
/** A sector's arrival beacon is peaceful while you are there (spec Loop-i section 4b): no enemy, no pursuit fight, no director spawns, no boarders. calm is 1 from the run start or a sector jump until the next jump. */
export function peaceful(state: SimState): boolean { return state.run.column === 0 && state.run.calm === 1; }

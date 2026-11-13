import type { SimState } from './state';
import { SECTOR_COLUMNS } from './tuning';

/** Progress through the run (spec Loop-i section 1): sector x SECTOR_COLUMNS + column, 0 to 17. Every rule that scales with progress reads this. */
export function depthOf(state: SimState): number { return state.run.sector * SECTOR_COLUMNS + state.run.column; }

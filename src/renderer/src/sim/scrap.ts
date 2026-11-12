import type { SimState } from './state';

/** Scrap in (spec Run-ii section 4): the balance and the earned counter. Lives apart from run.ts so enemy.ts and boarders.ts can import it without a cycle. */
export function addScrap(state: SimState, n: number): void { state.run.scrap += n; state.telemetry.scrapEarned += n; }
/** Scrap out: the balance and the spent counter. Callers check affordability. */
export function spendScrap(state: SimState, n: number): void { state.run.scrap -= n; state.telemetry.scrapSpent += n; }

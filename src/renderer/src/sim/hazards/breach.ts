import type { SimState } from '../state';

/** A breach activates one of the layout's immutable breach sites (spec §5). Venting itself is in oxygen.ts. */
export function activateBreach(state: SimState, site: number): boolean {
  if (state.breaches.active[site]) return false;
  state.breaches.active[site] = 1;
  state.breaches.repair[site] = 0;
  return true;
}

export function repairBreach(state: SimState, site: number): void {
  state.breaches.active[site] = 0;
  state.breaches.repair[site] = 0;
}

export function activeBreachCount(state: SimState): number {
  let n = 0; for (const a of state.breaches.active) if (a) n++; return n;
}

export function freeSites(state: SimState): number[] {
  const out: number[] = [];
  for (let s = 0; s < state.breaches.active.length; s++) if (!state.breaches.active[s]) out.push(s);
  return out;
}

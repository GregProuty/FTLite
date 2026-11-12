import type { SimState } from './state';
import { QUIRK_PASSAGE_MULT, QUIRK_HEAT_RISE, QUIRK_DOOR_DELAY_MULT, QUIRK_DEBRIS_OFFSET, QUIRK_LEAD_OFFSET, QUIRK_CHARGE_MULT } from './tuning';

/** The ship's quirk for this run (spec Run-iii section 5): one rule changed, drawn once at creation. Each hook is neutral for every other quirk. */
export const QUIRKS: readonly { id: string; name: string; text: string }[] = [
  { id: 'leaky-seals', name: 'Leaky Seals', text: 'Closed doors leak twice the air.' },
  { id: 'hot-reactor', name: 'Hot Reactor', text: 'Overdrive heats one unit faster.' },
  { id: 'sticky-doors', name: 'Sticky Doors', text: 'Doors close twice as slowly.' },
  { id: 'lucky-hull', name: 'Lucky Hull', text: 'Debris does two less hull damage.' },
  { id: 'twitchy-sensors', name: 'Twitchy Sensors', text: 'Four more seconds of warning.' },
  { id: 'old-drive', name: 'Old Drive', text: 'The jump drive takes 75 seconds.' }
];
export const QUIRK_NAMES: readonly string[] = QUIRKS.map((q) => q.name);
const is = (state: SimState, k: number): boolean => state.run.quirk === k;
export function quirkPassageMult(state: SimState): number { return is(state, 0) ? QUIRK_PASSAGE_MULT : 1; }
export function quirkHeatRise(state: SimState): number { return is(state, 1) ? QUIRK_HEAT_RISE : 0; }
export function quirkDoorDelayMult(state: SimState): number { return is(state, 2) ? QUIRK_DOOR_DELAY_MULT : 1; }
export function quirkDebrisHullOffset(state: SimState): number { return is(state, 3) ? QUIRK_DEBRIS_OFFSET : 0; }
export function quirkLeadOffset(state: SimState): number { return is(state, 4) ? QUIRK_LEAD_OFFSET : 0; }
export function quirkChargeMult(state: SimState): number { return is(state, 5) ? QUIRK_CHARGE_MULT : 1; }

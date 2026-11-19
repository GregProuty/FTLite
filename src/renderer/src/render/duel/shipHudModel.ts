// The ship HUD's view model and layout (duel polish i spec §E; Engineering spike §6). Pure: the crew ship's hull, its
// shields with the bars' layer cap, and the power view (one column per duel system and the reactor's spare bars, with
// heat and coolant) as JSON-plain data, built each frame by the scene on the ship view, so the sink's equality sharing
// keeps React still while nothing changes. FTL's layout idea (a segmented hull bar top left, power bars bottom left),
// original art, in the console's amber CRT ramp.
import type { DuelState } from '../../sim/duel/state';
import { capacityOf, coolantFree, COOLANT_POOL_DUEL, DUEL_SYSTEM_COUNT, isOverdriven, OVERDRIVE_SYSTEMS, REACTOR_BARS, sparesOf, SYSTEM_MAX, SYSTEM_SLOTS } from '../../sim/duel/power';
import { effectiveBars, SHIELD_LAYERS_BY_BARS } from '../../sim/tactical/bars';
import { classOf, CREW_SLOT } from '../../sim/tactical/state';
import { HEAT_MAX } from '../../sim/tuning';

/** One hull segment per HULL_PER_SEGMENT hull (`SHIP_HULL` 40: 20 segments). */
export const HULL_PER_SEGMENT = 2;

/** The layout in internal px (§E, Engineering spike §6): inside the interior band, left of the readout column, below the
 *  tab strip. The power panel's columns rest on `power.bottom`: the name, then the coolant pips, the heat bar, and the
 *  slots stacked bottom up; the reactor column stands `reactorGap` to the right of the five systems. */
export const HUD = {
  x: 12,
  hull: { labelY: 46, barY: 72, segW: 14, segH: 18, gap: 2 },
  shields: { y: 100, pip: 14, gap: 4 },
  power: { bottom: 708, pitch: 52, colW: 44, barW: 34, barH: 8, gap: 2, nameH: 24, heatH: 4, pipW: 14, pipH: 8, pipGap: 4, reactorGap: 12, pad: 6 }
} as const;

export type HullTone = 'good' | 'warn' | 'alert';
/** The column names in DuelSystem order (Engineering spike §2). */
export const POWER_NAMES: readonly string[] = ['SHLD', 'WEAP', 'ENG', 'SENS', 'O2'];
/** One system's power column (spec §6): powered `bars` of `capacity` usable of `slots` (max + the overdrive slot), heat
 *  0..heatMax, coolant 0..2; `cools`: it holds coolant and heat (not Oxygen). */
export interface PowerColumn { system: number; name: string; bars: number; capacity: number; slots: number; max: number; heat: number; heatMax: number; coolant: number; cools: boolean; failed: boolean; overdriven: boolean }
/** The power panel: the five columns, the reactor's spare bars of `reactor`, and the free coolant of `coolantPool`. */
export interface PowerView { systems: PowerColumn[]; spare: number; reactor: number; coolantFree: number; coolantPool: number }
/** `shields.cap`: the layers the Shields bars hold now (Engineering spike §2), never above `layers`. */
export interface ShipHudView {
  hull: { segments: number; lit: number; tone: HullTone };
  shields: { layers: number; up: number; cap: number };
  power: PowerView;
}

/** The hull colour (§E): good above half, warn from a quarter to half, alert below a quarter. */
export function hullTone(hull: number, max: number): HullTone {
  const f = max > 0 ? hull / max : 0;
  return f > 0.5 ? 'good' : f >= 0.25 ? 'warn' : 'alert';
}

/** The power panel (Engineering spike §6) from Part i's power state and the crew ship's bars. */
export function powerView(d: DuelState): PowerView {
  const bars = d.tactical.systems[CREW_SLOT]!.bars;
  const systems = Array.from({ length: DUEL_SYSTEM_COUNT }, (_, k): PowerColumn => ({
    system: k, name: POWER_NAMES[k]!, bars: bars[k]!, capacity: capacityOf(d, k), slots: SYSTEM_SLOTS[k]!, max: SYSTEM_MAX[k]!,
    heat: d.power.heat[k]!, heatMax: HEAT_MAX, coolant: d.power.coolant[k]!, cools: k < OVERDRIVE_SYSTEMS, failed: d.power.failed[k] === 1, overdriven: isOverdriven(d, k)
  }));
  return { systems, spare: sparesOf(d), reactor: REACTOR_BARS, coolantFree: coolantFree(d), coolantPool: COOLANT_POOL_DUEL };
}

/** The crew ship's HUD (§E; Engineering spike §6): hull segments `ceil(hull / 2)` of `ceil(max / 2)`, the shield layers
 *  up and the bars' layer cap, and the power panel. */
export function shipHud(d: DuelState): ShipHudView {
  const t = d.tactical, sys = t.systems[CREW_SLOT]!, cls = classOf(t, CREW_SLOT), hull = Math.max(0, Math.min(cls.hull, sys.hull));
  const layers = cls.shields.layers;
  return {
    hull: { segments: Math.ceil(cls.hull / HULL_PER_SEGMENT), lit: Math.ceil(hull / HULL_PER_SEGMENT), tone: hullTone(hull, cls.hull) },
    shields: { layers, up: Math.max(0, Math.min(layers, sys.shields)), cap: Math.min(layers, SHIELD_LAYERS_BY_BARS[effectiveBars(sys, 0)] ?? 0) },
    power: powerView(d)
  };
}

/** A slot's look (spec §6): powered, usable but empty, or lost to damage or a failure (crossed). */
export type SlotState = 'on' | 'empty' | 'lost';
export function slotState(c: PowerColumn, k: number): SlotState { return k < c.bars ? 'on' : k < c.capacity ? 'empty' : 'lost'; }
/** Slot k is the overdrive slot: the one above max, on a system that has one. */
export function overdriveSlot(c: PowerColumn, k: number): boolean { return c.slots > c.max && k === c.max; }

/** Column n's left edge: the five systems at `pitch`, the reactor (n = 5) `reactorGap` further right. */
export function powerColumnX(n: number): number { const P = HUD.power; return HUD.x + n * P.pitch + (n >= DUEL_SYSTEM_COUNT ? P.reactorGap : 0); }
export function powerNameY(): number { return HUD.power.bottom - HUD.power.nameH; }
export function coolantY(): number { return powerNameY() - 4 - HUD.power.pipH; }
export function heatY(): number { return coolantY() - 3 - HUD.power.heatH; }
/** The top of slot k (0 the bottom one). */
export function powerBarY(k: number): number { const P = HUD.power; return heatY() - 4 - (k + 1) * P.barH - k * P.gap; }
/** The panel's backing: around every column, from the tallest (the reactor's 10 bars and the Weapons column's 10 slots,
 *  8 px slots with 2 px gaps so they fit, spec §10.1) to the bottom. */
export function powerPanel(): { x: number; y: number; w: number; h: number } {
  const P = HUD.power, x = HUD.x - P.pad, y = powerBarY(Math.max(REACTOR_BARS, ...SYSTEM_SLOTS) - 1) - P.pad;
  return { x, y, w: powerColumnX(DUEL_SYSTEM_COUNT) + P.colW + P.pad - x, h: P.bottom + 4 - y };
}
/** The left edge of hull segment `k`. */
export function hullSegX(k: number): number { const h = HUD.hull; return HUD.x + k * (h.segW + h.gap); }

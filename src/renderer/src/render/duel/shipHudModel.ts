// The ship HUD's view model and layout (duel polish i spec §E; Engineering spike §6). Pure: the crew ship's hull, its
// shields with the bars' layer cap, and the power view (one column per duel system and the reactor's spare bars, with
// heat and coolant) as JSON-plain data, built each frame by the scene on every view (UI round §2.4), so the sink's
// equality sharing keeps React still while nothing changes. FTL's layout idea (a segmented hull bar top left, power bars bottom left),
// original art, in the console's amber CRT ramp.
import { Health, Life, LifeState } from '../../sim/components';
import { extinguishProgress, pointBurning } from '../../sim/duel/fire';
import type { DuelState } from '../../sim/duel/state';
import { REPAIR_UNITS } from '../../sim/duel/tuning';
import { capacityOf, coolantFree, COOLANT_POOL_DUEL, DUEL_SYSTEM_COUNT, DuelSystem, isOverdriven, OVERDRIVE_SYSTEMS, REACTOR_BARS, sparesOf, SYSTEM_MAX, SYSTEM_SLOTS } from '../../sim/duel/power';
import { effectiveBars, SHIELD_LAYERS_BY_BARS } from '../../sim/tactical/bars';
import { classOf, CREW_SLOT, Room } from '../../sim/tactical/state';
import { SHIP_HULL } from '../../sim/tactical/tuning';
import { HEALTH_MAX, HEAT_MAX } from '../../sim/tuning';
import { textPx } from '../theme';

/** The Cutter's hull bar in HULL_SEGMENTS segments, one per HULL_PER_SEGMENT hull. W-1: derived from `SHIP_HULL` so the
 *  bar keeps its 20 segments (and its laid-out width) when the duel hull moved 40 → 70 (3.5 hull a segment). */
export const HULL_SEGMENTS = 20;
export const HULL_PER_SEGMENT = SHIP_HULL / HULL_SEGMENTS;

/** The layout in internal px (§E, Engineering spike §6): under the tab strip. The power panel's columns rest on
 *  `power.bottom`: the name, then the coolant pips, the heat bar, and the slots stacked bottom up; the reactor column stands `reactorGap` to the right of the five systems. */
export const HUD = {
  x: 12,
  hull: { labelY: 46, barY: 72, segW: 14, segH: 18, gap: 2 },
  shields: { y: 100, pip: 14, gap: 4 },
  power: { bottom: 708, pitch: 52, colW: 44, barW: 34, barH: 8, gap: 2, nameH: 24, heatH: 4, pipW: 14, pipH: 8, pipGap: 4, reactorGap: 12, pad: 6 }
} as const;

/** UI round §2.2, §2.4a: the health row under the shields, only when the active player is hurt or downed. */
export const HEALTH_ROW = { y: 124, barX: HUD.x + textPx('SHIELDS', 2) + 8, barY: 132, barW: 120, barH: 10 } as const;

export type HullTone = 'good' | 'warn' | 'alert';
/** The column names in DuelSystem order (Engineering spike §2). */
export const POWER_NAMES: readonly string[] = ['SHLD', 'WEAP', 'ENG', 'SENS', 'O2'];
/** One system's power column (spec §6): powered `bars` of `capacity` usable of `slots` (max + the overdrive slot), heat
 *  0..heatMax, coolant 0..2; `cools`: it holds coolant and heat (not Oxygen). */
export interface PowerColumn { system: number; name: string; bars: number; capacity: number; slots: number; max: number; heat: number; heatMax: number; coolant: number; cools: boolean; failed: boolean; overdriven: boolean; room: RoomMark | null }
/** A power column's room (UI round §2.4a): ok, damaged, offline or on fire, with the repair or extinguish progress 0..1. */
export interface RoomMark { state: 'ok' | 'damaged' | 'offline' | 'fire'; progress: number }
/** The power panel: the five columns, the reactor's spare bars of `reactor`, and the free coolant of `coolantPool`. */
export interface PowerView { systems: PowerColumn[]; spare: number; reactor: number; coolantFree: number; coolantPool: number }
/** `shields.cap`: the layers the Shields bars hold now (Engineering spike §2), never above `layers`. */
export interface ShipHudView {
  hull: { segments: number; lit: number; tone: HullTone };
  shields: { layers: number; up: number; cap: number };
  power: PowerView;
  /** The active player's health (UI round §2.4a): null at full health and not downed. */
  health: { fill: number; downed: boolean } | null;
}

/** The hull colour (§E): good above half, warn from a quarter to half, alert below a quarter. */
export function hullTone(hull: number, max: number): HullTone {
  const f = max > 0 ? hull / max : 0;
  return f > 0.5 ? 'good' : f >= 0.25 ? 'warn' : 'alert';
}

/** UI round §2.4a: the tactical room behind a power column (WEAP, SHLD, ENG), or null (SENS, O2). */
const ROOM_OF: Readonly<Partial<Record<number, number>>> = { [DuelSystem.Weapons]: Room.Weapons, [DuelSystem.Shields]: Room.Shields, [DuelSystem.Engines]: Room.Engines };
export function roomMark(d: DuelState, system: number): RoomMark | null {
  const r = ROOM_OF[system];
  if (r === undefined) return null;
  const point = d.points.find((p) => p.tacticalRoom === r);
  if (point && pointBurning(d, point)) return { state: 'fire', progress: extinguishProgress(d, point) };
  const n = d.tactical.systems[CREW_SLOT]!.rooms[r]!;
  return { state: n === 0 ? 'ok' : n >= 2 ? 'offline' : 'damaged', progress: n > 0 ? d.repair[r]! / REPAIR_UNITS : 0 };
}

/** The power panel (Engineering spike §6) from Part i's power state and the crew ship's bars. */
export function powerView(d: DuelState): PowerView {
  const bars = d.tactical.systems[CREW_SLOT]!.bars;
  const systems = Array.from({ length: DUEL_SYSTEM_COUNT }, (_, k): PowerColumn => ({
    system: k, name: POWER_NAMES[k]!, bars: bars[k]!, capacity: capacityOf(d, k), slots: SYSTEM_SLOTS[k]!, max: SYSTEM_MAX[k]!,
    heat: d.power.heat[k]!, heatMax: HEAT_MAX, coolant: d.power.coolant[k]!, cools: k < OVERDRIVE_SYSTEMS, failed: d.power.failed[k] === 1, overdriven: isOverdriven(d, k), room: roomMark(d, k)
  }));
  return { systems, spare: sparesOf(d), reactor: REACTOR_BARS, coolantFree: coolantFree(d), coolantPool: COOLANT_POOL_DUEL };
}

/** The crew ship's HUD (§E; Engineering spike §6): hull segments `ceil(hull / HULL_PER_SEGMENT)` of `ceil(max / HULL_PER_SEGMENT)`, the shield layers
 *  up and the bars' layer cap, and the power panel. */
export function shipHud(d: DuelState, active: number): ShipHudView {
  const t = d.tactical, sys = t.systems[CREW_SLOT]!, cls = classOf(t, CREW_SLOT), hull = Math.max(0, Math.min(cls.hull, sys.hull));
  const layers = cls.shields.layers, eid = d.interior.crew[active]!, hp = Health.cur[eid]!, downed = Life.state[eid] === LifeState.Downed;
  return {
    hull: { segments: Math.ceil(cls.hull / HULL_PER_SEGMENT), lit: Math.ceil(hull / HULL_PER_SEGMENT), tone: hullTone(hull, cls.hull) },
    shields: { layers, up: Math.max(0, Math.min(layers, sys.shields)), cap: Math.min(layers, SHIELD_LAYERS_BY_BARS[effectiveBars(sys, 0)] ?? 0) },
    power: powerView(d),
    health: downed ? { fill: 0, downed: true } : Math.ceil(hp) < HEALTH_MAX ? { fill: hp / HEALTH_MAX, downed: false } : null
  };
}

/** A slot's look (spec §6): powered, usable but empty, or lost to damage or a failure (crossed). */
export type SlotState = 'on' | 'empty' | 'lost';
export function slotState(c: Pick<PowerColumn, 'bars' | 'capacity'>, k: number): SlotState { return k < c.bars ? 'on' : k < c.capacity ? 'empty' : 'lost'; }
/** Slot k is the overdrive slot: the one above max, on a system that has one. */
export function overdriveSlot(c: Pick<PowerColumn, 'slots' | 'max'>, k: number): boolean { return c.slots > c.max && k === c.max; }

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

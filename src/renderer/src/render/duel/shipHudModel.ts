// The ship HUD's view model and layout (duel polish i spec §E). Pure: the crew ship's hull, shields and system capacity
// as JSON-plain data, built each frame by the scene on the SHIP view only, so the sink's equality sharing keeps React
// still while nothing changes. FTL's layout idea (a segmented hull bar top left, system bars bottom left), original art.
import type { DuelState } from '../../sim/duel/state';
import { medbayOnline } from '../../sim/duel/health';
import { classOf, CREW_SLOT, Room } from '../../sim/tactical/state';

/** The highest room damage level (2: offline); a room's capacity is `ROOM_LEVELS − level` bars (§E). */
export const ROOM_LEVELS = 2;
/** One hull segment per HULL_PER_SEGMENT hull (`SHIP_HULL` 40: 20 segments). */
export const HULL_PER_SEGMENT = 2;

/** The layout in internal px (§E): inside the interior band, left of the readout column, below the tab strip. */
export const HUD = {
  x: 12,
  hull: { labelY: 46, barY: 72, segW: 14, segH: 18, gap: 2 },
  shields: { y: 100, pip: 14, gap: 4 },
  /** The system columns rest on `bottom`: name, then the 24 px icon, then the bars stacked bottom up. */
  sys: { bottom: 708, pitch: 56, colW: 44, icon: 32, barW: 34, barH: 11, gap: 3, nameH: 24 }
} as const;

export type HullTone = 'good' | 'warn' | 'alert';
export type HudSystemKey = 'helm' | 'weapons' | 'shields' | 'medbay';
/** `lit` bars green, then `damaged` bars red, the rest dark; `look`: 'offline' turns the icon and name red, 'dim' dims them. */
export interface HudSystem { key: HudSystemKey; name: string; bars: number; lit: number; damaged: number; look: 'normal' | 'offline' | 'dim' }
export interface ShipHudView {
  hull: { segments: number; lit: number; tone: HullTone };
  shields: { layers: number; up: number };
  systems: HudSystem[];
}

/** The hull colour (§E): green above half, amber from a quarter to half, red below a quarter. */
export function hullTone(hull: number, max: number): HullTone {
  const f = max > 0 ? hull / max : 0;
  return f > 0.5 ? 'good' : f >= 0.25 ? 'warn' : 'alert';
}

/** A tactical room's column: capacity lit, the damaged bars red, offline at level 2. */
function roomSystem(key: HudSystemKey, name: string, level: number): HudSystem {
  const l = Math.max(0, Math.min(ROOM_LEVELS, level));
  return { key, name, bars: ROOM_LEVELS, lit: ROOM_LEVELS - l, damaged: l, look: l >= ROOM_LEVELS ? 'offline' : 'normal' };
}

/** The crew ship's HUD (§E): hull segments `ceil(hull / 2)` of `ceil(max / 2)`, the shield layers, and left to right
 *  Helm (the Engines room), Weapons, Shields and the Medbay (one bar, lit while `medbayOnline`). */
export function shipHud(d: DuelState): ShipHudView {
  const t = d.tactical, sys = t.systems[CREW_SLOT]!, cls = classOf(t, CREW_SLOT), hull = Math.max(0, Math.min(cls.hull, sys.hull));
  const online = medbayOnline(d);
  return {
    hull: { segments: Math.ceil(cls.hull / HULL_PER_SEGMENT), lit: Math.ceil(hull / HULL_PER_SEGMENT), tone: hullTone(hull, cls.hull) },
    shields: { layers: cls.shields.layers, up: Math.max(0, Math.min(cls.shields.layers, sys.shields)) },
    systems: [
      roomSystem('helm', 'HELM', sys.rooms[Room.Engines]),
      roomSystem('weapons', 'WEAP', sys.rooms[Room.Weapons]),
      roomSystem('shields', 'SHLD', sys.rooms[Room.Shields]),
      { key: 'medbay', name: 'MED', bars: 1, lit: online ? 1 : 0, damaged: 0, look: online ? 'normal' : 'dim' }
    ]
  };
}

/** A system column's left edge and the top of its bar `k` (0 the bottom one), from the layout (§E). */
export function sysColumnX(n: number): number { return HUD.x + n * HUD.sys.pitch; }
export function sysIconY(): number { return HUD.sys.bottom - HUD.sys.nameH - 2 - HUD.sys.icon; }
export function sysBarY(k: number): number { const s = HUD.sys; return sysIconY() - 4 - (k + 1) * s.barH - k * s.gap; }
/** The left edge of hull segment `k`. */
export function hullSegX(k: number): number { const h = HUD.hull; return HUD.x + k * (h.segW + h.gap); }

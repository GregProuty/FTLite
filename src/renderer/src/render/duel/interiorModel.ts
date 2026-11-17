// The duel interior's overlay and fit (H-1 spec §8). Pure: no Pixi. Positions are ship-local pixels (TILE_PX per tile),
// drawn inside the interior's world container, which the fit scales and places.
import { INTERNAL_H, INTERNAL_W, TILE_PX } from '../../../../shared/resolution';
import type { DuelState } from '../../sim/duel/state';
import { REPAIR_UNITS } from '../../sim/duel/tuning';
import { fitInBand, fitRectInBand, type Fit } from '../worldFit';
import type { TileRect } from '../battlemapModel';

/** The readout column on the right that the interior leaves clear (spec §8). */
export const READOUT_COLUMN = 220;
/** The band the ship is fitted into: the whole screen left of the readout column. */
export const INTERIOR_BAND = { x: 0, y: 0, w: INTERNAL_W - READOUT_COLUMN, h: INTERNAL_H } as const;

/** worldFit's rules on the duel's band: never upscaled above 1x, snapped for the stage scale, centred on whole screen pixels (Art-i spec section 4). */
export function duelFit(widthTiles: number, heightTiles: number, stage: number, rect?: TileRect): Fit {
  return rect ? fitRectInBand(INTERIOR_BAND, rect, stage) : fitInBand(INTERIOR_BAND, widthTiles, heightTiles, stage);
}

/** The tactical rooms' names, in Room order (Weapons, Shields, Engines). */
export const ROOM_NAMES: readonly string[] = ['WEAPONS', 'SHIELDS', 'ENGINES'];

export interface RoomTint { tacticalRoom: number; level: number; tiles: { x: number; y: number }[] }
export interface RepairMarker { tacticalRoom: number; level: number; x: number; y: number; progress: number; label: string }
export interface ConsoleOutline { station: number; x: number; y: number; free: boolean }
export interface InteriorOverlay { tints: RoomTint[]; markers: RepairMarker[]; consoles: ConsoleOutline[] }

/**
 * Each damaged tactical room tints its repair room's tiles by level, with a marker on the repair tile and the progress
 * (0..1) toward lowering it one level; the two role consoles are outlined, free (highlighted) or occupied (dimmed).
 */
export function interiorOverlay(d: DuelState): InteriorOverlay {
  const st = d.interior, w = st.derived.width, ship = d.tactical.systems[0];
  const px = (t: number): { x: number; y: number } => { const tx = t % w; return { x: tx * TILE_PX, y: ((t - tx) / w) * TILE_PX }; };
  const tints: RoomTint[] = [], markers: RepairMarker[] = [];
  for (const p of d.points) {
    const level = ship.rooms[p.tacticalRoom]!;
    if (level === 0) continue;
    tints.push({ tacticalRoom: p.tacticalRoom, level, tiles: st.derived.roomTiles[p.room]!.map(px) });
    const at = px(p.tile);
    markers.push({ tacticalRoom: p.tacticalRoom, level, x: at.x + TILE_PX / 2, y: at.y + TILE_PX / 2, progress: d.repair[p.tacticalRoom]! / REPAIR_UNITS, label: `${ROOM_NAMES[p.tacticalRoom]} ${level}` });
  }
  const consoles = [d.nav, d.weapons].map((station) => {
    const at = px(st.derived.stationTile[station]!);
    return { station, x: at.x, y: at.y, free: st.stations.occupant[station]! < 0 };
  });
  return { tints, markers, consoles };
}

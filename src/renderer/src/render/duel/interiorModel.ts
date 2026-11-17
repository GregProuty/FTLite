// The duel interior's overlay and fit (H-1 spec §8). Pure: no Pixi. Positions are ship-local pixels (TILE_PX per tile),
// drawn inside the interior's world container, which the fit scales and places.
import { INTERNAL_H, INTERNAL_W, TILE_PX } from '../../../../shared/resolution';
import { extinguishProgress, pointBurning } from '../../sim/duel/fire';
import type { DuelState } from '../../sim/duel/state';
import { REPAIR_UNITS } from '../../sim/duel/tuning';
import { Health, Life, LifeState, Position } from '../../sim/components';
import { HEALTH_MAX } from '../../sim/tuning';
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
/** `fire`: the room is burning (duel-fire spec §2): the label says so and `progress` is the extinguish progress. */
export interface RepairMarker { tacticalRoom: number; level: number; x: number; y: number; progress: number; label: string; fire: boolean }
export interface ConsoleOutline { station: number; x: number; y: number; free: boolean }
/** A character's health mark (duel-health spec §2), centred on it (ship-local pixels, uninterpolated): `fill` the health
 *  bar 0..1, drawn below full and never while downed; `downed`; `revive` the pick-up progress 0..1; `label` the text under
 *  a downed character ('DOWNED - STAY CLOSE' while it is being picked up, else 'DOWNED'), '' otherwise. */
export interface CrewHealthMark { pid: number; x: number; y: number; fill: number; bar: boolean; downed: boolean; revive: number; label: string }
export interface InteriorOverlay { tints: RoomTint[]; markers: RepairMarker[]; consoles: ConsoleOutline[]; crew: CrewHealthMark[] }

/** Each character's health mark, in player order. */
export function crewHealthMarks(d: DuelState): CrewHealthMark[] {
  return d.interior.crew.map((eid, pid) => {
    const downed = Life.state[eid] === LifeState.Downed, hp = Health.cur[eid]!, revive = downed ? Life.reviveProgress[eid]! : 0;
    return { pid, x: Position.x[eid]! * TILE_PX, y: Position.y[eid]! * TILE_PX, fill: hp / HEALTH_MAX, bar: !downed && hp < HEALTH_MAX, downed, revive,
      label: downed ? (revive > 0 ? 'DOWNED - STAY CLOSE' : 'DOWNED') : '' };
  });
}

/**
 * Each damaged tactical room tints its repair room's tiles by level, with a marker on the repair tile and the progress
 * (0..1) toward lowering it one level. A burning room (duel-fire spec §2), damaged or not, has the marker `FIRE - HOLD E`
 * with the extinguish progress instead. The two role consoles are outlined, free (highlighted) or occupied (dimmed).
 */
export function interiorOverlay(d: DuelState): InteriorOverlay {
  const st = d.interior, w = st.derived.width, ship = d.tactical.systems[0];
  const px = (t: number): { x: number; y: number } => { const tx = t % w; return { x: tx * TILE_PX, y: ((t - tx) / w) * TILE_PX }; };
  const tints: RoomTint[] = [], markers: RepairMarker[] = [];
  for (const p of d.points) {
    const level = ship.rooms[p.tacticalRoom]!, fire = pointBurning(d, p);
    if (level === 0 && !fire) continue;
    if (level > 0) tints.push({ tacticalRoom: p.tacticalRoom, level, tiles: st.derived.roomTiles[p.room]!.map(px) });
    const at = px(p.tile), progress = fire ? extinguishProgress(d, p) : d.repair[p.tacticalRoom]! / REPAIR_UNITS;
    markers.push({ tacticalRoom: p.tacticalRoom, level, x: at.x + TILE_PX / 2, y: at.y + TILE_PX / 2, progress, label: fire ? 'FIRE - HOLD E' : `${ROOM_NAMES[p.tacticalRoom]} ${level}`, fire });
  }
  const consoles = [d.nav, d.weapons].map((station) => {
    const at = px(st.derived.stationTile[station]!);
    return { station, x: at.x, y: at.y, free: st.stations.occupant[station]! < 0 };
  });
  return { tints, markers, consoles, crew: crewHealthMarks(d) };
}

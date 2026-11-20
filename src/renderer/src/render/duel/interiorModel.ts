// The duel interior's overlay and fit (H-1 spec §8). Pure: no Pixi. Positions are ship-local pixels (TILE_PX per tile),
// drawn inside the interior's world container, which the fit scales and places.
import { INTERNAL_H, INTERNAL_W, TILE_PX } from '../../../../shared/resolution';
import { extinguishProgress, pointBurning } from '../../sim/duel/fire';
import type { DuelState } from '../../sim/duel/state';
import { REPAIR_UNITS } from '../../sim/duel/tuning';
import { Health, Life, LifeState, Position } from '../../sim/components';
import { HEALTH_MAX } from '../../sim/tuning';
import { medbayOnline } from '../../sim/duel/health';
import { Room } from '../../sim/tactical/state';
import { StationKind } from '../../sim/stationKinds';
import { fitInBand, fitRectInBand, type Fit } from '../worldFit';
import type { TileRect } from '../battlemapModel';
import { fireTileOf } from '../../sim/duel/hazards';
import { LOW_AIR_FRAC } from '../../sim/duel/tuning';
import { AMBER, WARN } from '../theme';

/** The band the ship is fitted into: the whole screen below the console tab strip (UI round §2.2: no readout column). */
export const INTERIOR_BAND = { x: 0, y: 42, w: INTERNAL_W, h: INTERNAL_H - 42 } as const;

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
    return { pid, x: Position.x[eid]! * TILE_PX, y: Position.y[eid]! * TILE_PX, fill: hp / HEALTH_MAX, bar: !downed && Math.ceil(hp) < HEALTH_MAX, downed, revive,
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

/** A working station's badge (start-aboard spec §2): the glyph kind, its label, the console tile's centre in ship pixels, and
 *  its tint: `offline` (red) when its system is off, `faint` when it does not work now, else `normal`. */
export interface StationBadge { station: number; kind: 'navigation' | 'weapons' | 'science' | 'medbay'; label: string; x: number; y: number; tint: 'normal' | 'offline' | 'faint' }

/** The Helm, Weapons, Science and Medbay badges, in that order (start-aboard spec §2; Sci-2 spec §5.4): Helm red at
 *  Engines 2, Weapons red at Weapons 2, Science always normal, the Medbay faint while it is not online. A layout without a
 *  Science or Medbay console has no badge for it. */
export function stationBadges(d: DuelState): StationBadge[] {
  const st = d.interior, w = st.derived.width, rooms = d.tactical.systems[0].rooms;
  const at = (station: number): { x: number; y: number } => { const t = st.derived.stationTile[station]!, tx = t % w; return { x: (tx + 0.5) * TILE_PX, y: ((t - tx) / w + 0.5) * TILE_PX }; };
  const out: StationBadge[] = [
    { station: d.nav, kind: 'navigation', label: 'HELM', ...at(d.nav), tint: rooms[Room.Engines] >= 2 ? 'offline' : 'normal' },
    { station: d.weapons, kind: 'weapons', label: 'WEAPONS', ...at(d.weapons), tint: rooms[Room.Weapons] >= 2 ? 'offline' : 'normal' }
  ];
  if (d.science >= 0) out.push({ station: d.science, kind: 'science', label: 'SCIENCE', ...at(d.science), tint: 'normal' });
  const mb = st.derived.stationOfKind[StationKind.Medbay]!;
  if (mb >= 0) out.push({ station: mb, kind: 'medbay', label: 'MEDBAY', ...at(mb), tint: medbayOnline(d) ? 'normal' : 'faint' });
  return out;
}

/** Engineering spike §6, Decision 7: the air fraction where the amber wash starts. */
export const AIR_TINT_FROM = 0.5;
/** A room's air tint: none at AIR_TINT_FROM or more; amber from there down to LOW_AIR_FRAC (alpha 0 → 0.3); red below
 *  it, where the air hurts (alpha 0.3 → 0.55 at none). */
export function airTint(air: number): { color: number; alpha: number } | null {
  if (!(air < AIR_TINT_FROM)) return null;
  if (air >= LOW_AIR_FRAC) return { color: AMBER, alpha: (0.3 * (AIR_TINT_FROM - air)) / (AIR_TINT_FROM - LOW_AIR_FRAC) };
  return { color: WARN, alpha: 0.3 + (0.25 * (LOW_AIR_FRAC - Math.max(0, air))) / LOW_AIR_FRAC };
}
export interface AirTint { room: number; color: number; alpha: number; tiles: { x: number; y: number }[] }
/** Every room below AIR_TINT_FROM air, in room order, with its tiles in ship-local pixels. */
export function airTints(d: DuelState): AirTint[] {
  const st = d.interior, der = st.derived, w = der.width, out: AirTint[] = [];
  for (let r = 0; r < der.volume.length; r++) {
    const t = airTint(st.rooms.o2[r]! / der.volume[r]!);
    if (t) out.push({ room: r, ...t, tiles: der.roomTiles[r]!.map((k) => ({ x: (k % w) * TILE_PX, y: Math.floor(k / w) * TILE_PX })) });
  }
  return out;
}
/** A fire outside the repair rooms or a breach (Engineering spike §4): where to work (the tile centre), the progress
 *  0..1 and the label. The repair rooms' fires keep interiorOverlay's markers. */
export interface HazardMarker { kind: 'fire' | 'breach'; room: number; x: number; y: number; progress: number; label: string }
export function hazardMarkers(d: DuelState): HazardMarker[] {
  const st = d.interior, der = st.derived, w = der.width, out: HazardMarker[] = [];
  const centre = (t: number): { x: number; y: number } => ({ x: ((t % w) + 0.5) * TILE_PX, y: (Math.floor(t / w) + 0.5) * TILE_PX });
  for (let r = 0; r < der.volume.length; r++) {
    if (!(st.rooms.fire[r]! > 0) || d.points.some((p) => p.room === r)) continue;
    out.push({ kind: 'fire', room: r, ...centre(fireTileOf(d, r)), progress: st.rooms.fireRepair[r]!, label: 'FIRE - HOLD E' });
  }
  for (let s = 0; s < der.siteRoom.length; s++) {
    if (!st.breaches.active[s]) continue;
    const c = centre(der.siteTile[s]!), shared = out.some((m) => m.kind === 'fire' && m.x === c.x && m.y === c.y);   // a fire fought at the same tile
    out.push({ kind: 'breach', room: der.siteRoom[s]!, x: c.x, y: shared ? c.y + TILE_PX / 2 : c.y, progress: st.breaches.repair[s]!, label: 'BREACH - HOLD E' });
  }
  return out;
}

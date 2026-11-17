import type { SimState } from '../sim/state';
import { STATION_IDS, StationKind } from '../sim/stationKinds';
import { TILE_PX } from '../../../shared/resolution';

/** The glyph kinds (spec Demo-iii section 4): the seven console ids plus the reactor. */
export const ICON_KINDS = ['navigation', 'weapons', 'science', 'engineering', 'lifeSupport', 'medbay', 'doors', 'reactor'] as const;
export type IconKind = (typeof ICON_KINDS)[number];
export type IconTint = 'normal' | 'failed' | 'unpowered';
export const ICON_TEXT = 0xe8e8e8, ICON_FAINT = 0x5a606c, ICON_WARN = 0xff6b5a;
export function tintColor(t: IconTint): number { return t === 'failed' ? ICON_WARN : t === 'unpowered' ? ICON_FAINT : ICON_TEXT; }
export interface RoomIcon { room: number; kind: IconKind; x: number; y: number; tint: IconTint }

/** The tint of station i: failed wins over unpowered; Engineering is never unpowered (as the HUD's OFF rule). */
export function stationTint(state: SimState, i: number): IconTint {
  if (i < 0) return 'normal';
  if (state.stations.failed[i] === 1) return 'failed';
  if (state.derived.stationKind[i] !== StationKind.Engineering && state.stations.level[i] === 0) return 'unpowered';
  return 'normal';
}

/** One glyph per room whose system is an icon kind, at the pixel centre of the room's centre tile. */
export function roomIcons(state: SimState): RoomIcon[] {
  const d = state.derived, out: RoomIcon[] = [];
  state.layout.rooms.forEach((r, room) => {
    const kind = (ICON_KINDS as readonly (string | null)[]).indexOf(r.system);
    if (kind < 0) return;
    const tiles = d.roomTiles[room]!;
    if (tiles.length === 0) return;
    let sx = 0, sy = 0;
    for (const t of tiles) { sx += t % d.width; sy += Math.floor(t / d.width); }
    const tx = Math.floor(sx / tiles.length), ty = Math.floor(sy / tiles.length);
    let tint: IconTint = 'normal';
    if (r.system !== 'reactor') {
      const k = (STATION_IDS as readonly string[]).indexOf(r.system!);
      tint = stationTint(state, d.stationOfKind[k]!);
    }
    out.push({ room, kind: ICON_KINDS[kind]!, x: (tx + 0.5) * TILE_PX, y: (ty + 0.5) * TILE_PX, tint });
  });
  return out;
}

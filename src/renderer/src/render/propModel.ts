// Set dressing (Art-iii spec sections 1-3): which rooms get props, which props, and where they stand. Pure: no Pixi.
// Rule-based from the room's name and system (the ship layouts carry no prop data); the sim never sees a prop.
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { WALL_GAP, type Side } from './consoleModel';
import { hashString, hashU32 } from './particles/random';
import type { PropName } from './assetNames';

/** Each sprite's size in art pixels (w, h), the rectangles of spec section 1. Every sprite's back is at the top (checked
 *  by eye against the sheets, Art-iii plan Decision 3), so it stands as drawn against a north wall and turns by SIDE_ROTATION. */
export const PROP_SIZE: Readonly<Record<PropName, readonly [number, number]>> = {
  'prop.bunk.a': [14, 22], 'prop.bunk.b': [14, 23], 'prop.seats': [25, 15], 'prop.couch': [23, 15],
  'prop.locker.a': [18, 33], 'prop.locker.b': [18, 33], 'prop.crate': [12, 16]
};

export type RoomKind = 'quarters' | 'galley' | 'hold' | 'medbay';
/** Each kind's props in order (spec section 2): a room gets as many as it has slots that fit, up to the list's length. */
export const ROOM_PROPS: Readonly<Record<RoomKind, readonly PropName[]>> = {
  quarters: ['prop.bunk.a', 'prop.bunk.b', 'prop.bunk.a'],
  galley: ['prop.seats', 'prop.couch', 'prop.locker.a'],
  hold: ['prop.crate', 'prop.locker.a', 'prop.crate', 'prop.locker.b'],
  medbay: ['prop.bunk.a']
};

/** The room's kind by its name (case-insensitive) or its system (spec section 2); null: an undressed room. */
export function roomKind(room: { name: string; system: string | null }): RoomKind | null {
  const n = room.name.toLowerCase();
  if (n.includes('quarters')) return 'quarters';
  if (n.includes('galley') || n.includes('mess')) return 'galley';
  if (n.includes('hold') || n.includes('store') || n.includes('cargo')) return 'hold';
  if (room.system === 'medbay') return 'medbay';
  return null;
}

export interface PropCandidate { room: number; tile: number; side: Side }
export interface PropSlot { room: number; tile: number; side: Side; name: PropName }
type Layout = Pick<SimState, 'layout' | 'derived'>;

const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];
const STEP: Readonly<Record<Side, readonly [number, number]>> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

/** How far a prop reaches past its tile's wall edge into the room (spec section 3 step 4): the turned rectangle's
 *  extent perpendicular to the wall (2 x the art height for every side) minus WALL_GAP. */
export function propDepth(name: PropName): number { return 2 * PROP_SIZE[name][1] - WALL_GAP; }

/** The room's floor depth from a candidate (spec section 3 step 4): 32 world units per consecutive floor tile of the same
 *  room, starting at the candidate and going away from its wall. */
export function floorDepth(s: Layout, tile: number, side: Side): number {
  const d = s.derived, room = d.roomOfTile[tile]!, [dx, dy] = STEP[side];
  let x = tile % d.width, y = (tile - x) / d.width, n = 0;
  while (x >= 0 && y >= 0 && x < d.width && y < d.height && d.roomOfTile[y * d.width + x] === room) { n++; x -= dx; y -= dy; }
  return TILE_PX * n;
}

const charAt = (s: Layout, x: number, y: number): string => s.layout.rows[y]?.charAt(x) ?? '';
const neighbours4 = (width: number, height: number, t: number): number[] => {
  const x = t % width, y = (t - x) / width, out: number[] = [];
  if (y > 0) out.push(t - width);
  if (x < width - 1) out.push(t + 1);
  if (y < height - 1) out.push(t + width);
  if (x > 0) out.push(t - 1);
  return out;
};

/** Spec section 3 step 1 (with the side of step 2): the dressed rooms' floor tiles with a wall ('#') 4-neighbour, less the
 *  station, door/opening and magazine tiles and their 4-neighbours, the spawns, the floor 4-neighbours of breach sites and
 *  airlocks, and each room's lamp tile (its lowest tile index, gradeModel lampPoints). In room order, then tile order. */
export function propCandidates(s: Layout): PropCandidate[] {
  const d = s.derived, W = d.width, H = d.height, banned = new Set<number>();
  const withNeighbours = (t: number): void => { banned.add(t); for (const n of neighbours4(W, H, t)) banned.add(n); };
  for (const t of d.stationTile) withNeighbours(t);
  for (const t of d.edgeTile) withNeighbours(t);
  if (d.magazineTile >= 0) withNeighbours(d.magazineTile);
  for (const [x, y] of s.layout.spawns) banned.add(y * W + x);
  for (const t of [...d.siteTile, ...d.airlockTile]) for (const n of neighbours4(W, H, t)) banned.add(n);   // both are wall tiles: their floor neighbours
  const out: PropCandidate[] = [];
  s.layout.rooms.forEach((room, r) => {
    const tiles = d.roomTiles[r] ?? [];
    if (!roomKind(room) || !tiles.length) return;
    const lamp = Math.min(...tiles);
    for (const t of tiles) {
      if (banned.has(t) || t === lamp) continue;
      const x = t % W, y = (t - x) / W, side = SIDES.find((sd) => charAt(s, x + STEP[sd][0], y + STEP[sd][1]) === '#');
      if (side) out.push({ room: r, tile: t, side });
    }
  });
  return out;
}

/** The cache key (spec section 3): the layout hash plus the joined room names and systems. */
export function propKey(s: Layout): string {
  return `${s.derived.layoutHash}|${s.layout.rooms.map((r) => `${r.name}/${r.system ?? ''}`).join('|')}`;
}

let cached: { key: string; slots: PropSlot[] } | null = null;

/** Spec section 3 steps 3-5: per dressed room, its candidates in ascending hashU32(hashString(layoutHash), tile) order (ties
 *  by tile); a candidate 4- or diagonally adjacent to a slot already taken (any room) is skipped; otherwise it takes the
 *  first not-yet-used name of the room's list that fits it (propDepth <= floorDepth), if any. Cached by propKey. */
export function propSlots(s: Layout): PropSlot[] {
  const key = propKey(s);
  if (cached && cached.key === key) return cached.slots;
  const d = s.derived, W = d.width, seed = hashString(d.layoutHash), all = propCandidates(s), taken = new Set<number>(), slots: PropSlot[] = [];
  const crowded = (t: number): boolean => {
    const x = t % W, y = (t - x) / W;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((dx || dy) && nx >= 0 && nx < W && ny >= 0 && ny < d.height && taken.has(ny * W + nx)) return true;
    }
    return false;
  };
  s.layout.rooms.forEach((room, r) => {
    const kind = roomKind(room);
    if (!kind) return;
    const list = ROOM_PROPS[kind], used = list.map(() => false);
    const order = all.filter((c) => c.room === r).map((c) => ({ c, h: hashU32(seed, c.tile) })).sort((a, b) => a.h - b.h || a.c.tile - b.c.tile);
    for (const { c } of order) {
      if (used.every(Boolean)) break;
      if (crowded(c.tile)) continue;
      const depth = floorDepth(s, c.tile, c.side), k = list.findIndex((n, i) => !used[i] && propDepth(n) <= depth);
      if (k < 0) continue;
      used[k] = true; taken.add(c.tile);
      slots.push({ room: r, tile: c.tile, side: c.side, name: list[k]! });
    }
  });
  cached = { key, slots };
  return slots;
}

/** The enemy ship drawn in the enemy window (spec Demo-viii sections 2 and 2b; Demo-x-c section 3): an original top-down layout, bow left (towards our ship), 11 x 7 tiles of 32 px, 1.6x the old 20 px tile. Render only: the sim knows the rooms by index alone. */
export const ENEMY_TILE = 32, ENEMY_COLS = 11, ENEMY_ROWS = 7;
/** The old tile, for the scale check (spec Demo-x-c section 3: about 1.6x). */
export const OLD_ENEMY_TILE = 20;

export interface TileRect { x: number; y: number; w: number; h: number }
export interface EnemyLayout {
  /** The five rooms in ENEMY_ROOMS order: 0 Weapons, 1 Engines, 2 Shields, 3 Piloting, 4 Hold. Tile coordinates. */
  rooms: readonly TileRect[];
  /** Doors as the tile pair they join (the first tile left of the second): one tile tall, on a vertical wall. */
  doors: readonly { x: number; y: number }[];
  /** The console tile of each system room (Weapons, Engines, Shields, Piloting), where the enemy crew sit. */
  consoles: readonly { x: number; y: number }[];
  /** '#' floor, '.' outside, as rows of ENEMY_COLS characters (top first). */
  tiles: readonly string[];
}

const ROOMS: readonly TileRect[] = [
  { x: 0, y: 2, w: 3, h: 3 },   // Weapons, the bow
  { x: 9, y: 1, w: 2, h: 5 },   // Engines, the stern
  { x: 6, y: 4, w: 3, h: 3 },   // Shields, below
  { x: 3, y: 1, w: 3, h: 5 },   // Piloting, the middle
  { x: 6, y: 0, w: 3, h: 3 },   // Hold, above
];

function tileRows(rooms: readonly TileRect[]): string[] {
  const rows = Array.from({ length: ENEMY_ROWS }, () => Array.from({ length: ENEMY_COLS }, () => '.'));
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) rows[y]![x] = '#';
  return rows.map((r) => r.join(''));
}

export const ENEMY_LAYOUT: EnemyLayout = {
  rooms: ROOMS,
  doors: [{ x: 2, y: 3 }, { x: 5, y: 4 }, { x: 5, y: 2 }, { x: 8, y: 5 }, { x: 8, y: 1 }],   // each joins (x, y) to (x + 1, y)
  consoles: [{ x: 0, y: 3 }, { x: 10, y: 3 }, { x: 7, y: 6 }, { x: 4, y: 1 }],
  tiles: tileRows(ROOMS),
};

/** The room index holding a tile, -1 outside. */
export function enemyRoomAt(x: number, y: number): number {
  return ROOMS.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

/** The rooms in the window's order, top to bottom and left to right within a row (by room centre): the order the Weapons card walks them (spec Demo-x-c section 4). */
export function windowOrder(): number[] {
  const c = ROOMS.map((r, k) => ({ k, x: r.x + r.w / 2, y: r.y + r.h / 2 }));
  return c.sort((a, b) => a.y - b.y || a.x - b.x).map((r) => r.k);
}

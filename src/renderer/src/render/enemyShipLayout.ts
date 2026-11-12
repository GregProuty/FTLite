/** The enemy ship drawn in the enemy window (spec Demo-viii sections 2 and 2b): an original top-down layout, bow up, 7 x 11 tiles of 20 px. Render only: the sim knows the rooms by index alone. */
export const ENEMY_TILE = 20, ENEMY_COLS = 7, ENEMY_ROWS = 11;

export interface TileRect { x: number; y: number; w: number; h: number }
export interface EnemyLayout {
  /** The five rooms in ENEMY_ROOMS order: 0 Weapons, 1 Engines, 2 Shields, 3 Bridge, 4 Hold. Tile coordinates. */
  rooms: readonly TileRect[];
  /** Doors as the tile pair they join (the first tile above the second): one tile wide, on a horizontal wall. */
  doors: readonly { x: number; y: number }[];
  /** The console tile of each system room (Weapons, Engines, Shields), where the enemy crew sit. */
  consoles: readonly { x: number; y: number }[];
  /** '#' floor, '.' outside, as rows of ENEMY_COLS characters (bow first). */
  tiles: readonly string[];
}

const ROOMS: readonly TileRect[] = [
  { x: 2, y: 0, w: 3, h: 3 },   // Weapons, the bow
  { x: 1, y: 9, w: 5, h: 2 },   // Engines, the stern
  { x: 0, y: 6, w: 3, h: 3 },   // Shields, port
  { x: 1, y: 3, w: 5, h: 3 },   // Bridge
  { x: 4, y: 6, w: 3, h: 3 },   // Hold, starboard
];

function tileRows(rooms: readonly TileRect[]): string[] {
  const rows = Array.from({ length: ENEMY_ROWS }, () => Array.from({ length: ENEMY_COLS }, () => '.'));
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) rows[y]![x] = '#';
  return rows.map((r) => r.join(''));
}

export const ENEMY_LAYOUT: EnemyLayout = {
  rooms: ROOMS,
  doors: [{ x: 3, y: 2 }, { x: 2, y: 5 }, { x: 4, y: 5 }, { x: 1, y: 8 }, { x: 5, y: 8 }],   // each joins (x, y) to (x, y + 1)
  consoles: [{ x: 3, y: 0 }, { x: 3, y: 10 }, { x: 0, y: 7 }],
  tiles: tileRows(ROOMS),
};

/** The room index holding a tile, -1 outside. */
export function enemyRoomAt(x: number, y: number): number {
  return ROOMS.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

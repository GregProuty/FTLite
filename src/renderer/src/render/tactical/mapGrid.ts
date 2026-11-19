// The console map's grid (owner 2026-11-19): 'gravity' bends the grid toward the planet, like a rubber sheet seen from
// above; 'square' is the plain lettered grid. Saved with the volumes (app/settingsStore.ts) and read by the duel scene
// each frame through the renderer. Drawing only: ships, rocks, contours and the squares' names keep their true places.
export const MAP_GRID_SETTINGS = ['gravity', 'square'] as const;
export type MapGridSetting = (typeof MAP_GRID_SETTINGS)[number];
export const DEFAULT_MAP_GRID: MapGridSetting = 'gravity';
export const MAP_GRID_LABELS: Readonly<Record<MapGridSetting, string>> = { gravity: 'Gravity well', square: 'Square' };
export function validMapGrid(v: unknown): v is MapGridSetting { return typeof v === 'string' && (MAP_GRID_SETTINGS as readonly string[]).includes(v); }

/** The well's shape: a point r from the planet is drawn at r · (1 − WELL_PULL · (c² / (r² + c²))²), c = WELL_CORE (world
 *  units). At the planet the grid shrinks to 1 − WELL_PULL of its size; the pull fades as 1/r³, so the grid is square
 *  again far out. WELL_PULL < 1 keeps the drawn radius rising with r, so lines never cross. */
export const WELL_CORE = 900, WELL_PULL = 0.75;
const C2 = WELL_CORE * WELL_CORE;
/** The scale toward the planet for a point at squared distance `q` from it: one divide, no root, no trig. */
export function wellScale(q: number): number { const s = C2 / (q + C2); return 1 - WELL_PULL * s * s; }
/** The farthest the well moves any point (world units): at r = c / √3. */
export const WELL_MAX_SHIFT = WELL_PULL * WELL_CORE * 9 / (16 * Math.sqrt(3));

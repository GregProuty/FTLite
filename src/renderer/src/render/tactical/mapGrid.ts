// The console map's grid (owner 2026-11-19): 'gravity' bends the grid toward the planet, like a rubber sheet seen from
// above; 'square' is the plain lettered grid; 'off' (UI round spec §1.3, the default) draws nothing: no lines and,
// since the owner's 2026-11-20 note, no square names either. Saved with the volumes (app/settingsStore.ts) and read by the duel scene each frame through the renderer.
// Drawing only: ships, rocks, contours and the squares' names keep their true places.
export const MAP_GRID_SETTINGS = ['off', 'gravity', 'square'] as const;
export type MapGridSetting = (typeof MAP_GRID_SETTINGS)[number];
export const DEFAULT_MAP_GRID: MapGridSetting = 'off';
export const MAP_GRID_LABELS: Readonly<Record<MapGridSetting, string>> = { off: 'Off', gravity: 'Gravity well', square: 'Square' };
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

/** A body's dent (owner 2026-11-19): ships and rocks pull a small dimple into the gravity grid that travels with them,
 *  sized by the body. For show only: they have no pull in the sim. The same shape as the well: a point at squared
 *  distance q from the body moves toward it by pull · (c2 / (q + c2))² of its offset; `reach` is how far the dent is
 *  drawn at all. The dents work on the grid as the planet's well has already drawn it, so a dimple sits exactly on its
 *  body. */
export interface Dent { x: number; y: number; c2: number; pull: number; reach: number; shift: number }
/** A dent's core is DENT_CORE_PER_R body radii; its pull rises with the radius to DENT_PULL_MAX at DENT_FULL_R; it is
 *  drawn out to DENT_REACH cores, where it moves a point by under a hundredth of its core. */
export const DENT_CORE_PER_R = 4.25, DENT_PULL_MAX = 0.65, DENT_FULL_R = 45, DENT_REACH = 4;
/** The dent of a body of radius r at (x, y); `shift` is the farthest it moves any point (world units). */
export function dentOf(x: number, y: number, r: number): Dent {
  const core = DENT_CORE_PER_R * r, pull = DENT_PULL_MAX * Math.min(1, r / DENT_FULL_R);
  return { x, y, c2: core * core, pull, reach: DENT_REACH * core, shift: pull * core * 9 / (16 * Math.sqrt(3)) };
}
/** Where dents overlap (a cluster, a burst's pieces) their pulls add, and a sum near 1 would fold the grid over itself.
 *  So the summed pull S at a point is eased to under DENT_SUM_MAX: every dent there is scaled by dentEase(S). A lone
 *  dent keeps nearly all of its pull (0.65 keeps 0.89 of it). Measured on 8 maps with 12-piece piles of debris: the
 *  grid's tightest squeeze stays above 0.08 of its area, where the plain sum folded. */
export const DENT_SUM_MAX = 0.75;
export function dentEase(sum: number): number { const u = sum / DENT_SUM_MAX, u2 = u * u; return 1 / Math.sqrt(Math.sqrt(1 + u2 * u2)); }

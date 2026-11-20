// The console map view model (H-1 spec §7, parent §10b). Pure: turns the tactical state, the previous tick's positions,
// the interpolation alpha, the console's camera and the current Helm axes into screen-space draw lists. The Pixi layer
// (tacticalLayer.ts) only draws what this returns. Render code, so it may use any Math (not under the determinism guard).
import { shipGravityAccel } from '../../sim/tactical/physics';
import { predictFlight, predictRock } from '../../sim/tactical/predict';
import { derelictPos } from '../../sim/tactical/science';
import { classOf, Contact, CREW_SLOT, missileOf, targetOf, type Axes, type TacticalState } from '../../sim/tactical/state';
import { rockAlive, rockAt, rockHpMax, rockSlots } from '../../sim/tactical/rocks';
import { AIM_STEPS, HEADING_COUNT, R_MAP, SALVAGE_TICKS, SCAN_UNITS, SHIP_RADIUS, SLING_MIN_SPEED } from '../../sim/tactical/tuning';
import { TICK_HZ } from '../../sim/tuning';
import { visibleWorld, worldToScreen, type Camera, type Follow, type Point, type Viewport } from './camera';
import { rockDrawPos, rockDrawTick, type RockTrack } from './rockTrack';
import { hullFor, type HullId } from './hullModel';
import type { HelmVent } from '../../sim/duel/helmFlight';
import type { FogView, GhostKind } from './fogModel';
import { DENT_FULL_R, dentEase, dentOf, WELL_MAX_SHIFT, wellScale, type Dent, type MapGridSetting } from './mapGrid';

/** The grid square's half-size: the smallest multiple of 500 that encloses the map circle (plan decision 4). */
export const GRID_EXTENT = Math.ceil(R_MAP / 500) * 500;
export const GRID_MAJOR = 500, GRID_MINOR = 250, GRID_MINOR_ZOOM = 0.6;
/** Gravity contours (u/s²), strongest first. */
export const CONTOUR_ACCELS: readonly number[] = [40, 10, 3];
/** Below this on-screen radius an asteroid is a dot; below DOT_MIN_PX it is skipped. */
export const ASTEROID_DOT_PX = 2, DOT_MIN_PX = 0.5;
/** Below this many pixels across, a ship is a fixed-size chevron. */
export const SHIP_CHEVRON_PX = 10, CHEVRON_SIZE = 14;
/** Hull silhouettes spec section 2: a silhouette is never drawn smaller than this many screen pixels per ship unit
 *  (the Hound at least 38 px long), so its shape reads at the default zoom. Drawing only: collision, arcs and ranges
 *  keep the true scale. */
export const SHIP_MIN_PX_PER_UNIT = 16;
/** Screen pixels per world unit for a ship's silhouette at zoom z: the zoom, but never below the minimum. */
export function shipScale(z: number): number { return Math.max(z, SHIP_MIN_PX_PER_UNIT / SHIP_RADIUS); }
/** The scale the ship's cues are placed by (the lock, the heading line): the true zoom while the ship is a fixed-size
 *  chevron, so they stay on the chevron; the silhouette's minimum scale otherwise. */
export function drawnScale(z: number): number { return 2 * SHIP_RADIUS * z < SHIP_CHEVRON_PX ? z : shipScale(z); }
/** The Helm's predicted path: 2 s at zoom ≥ 0.6, rising linearly to 8 s at zoom 0.12, a point every 4 ticks. */
export const PATH_NEAR_S = 2, PATH_FAR_S = 8, PATH_NEAR_ZOOM = 0.6, PATH_FAR_ZOOM = 0.12, PATH_STRIDE = 4;
export const BEARING_RING_ZOOM = 0.3, BEARING_RING_PX = 120;
export const ARROW_MARGIN = 28;
/** Off-screen arrows on one edge closer than this are spread apart along it so their labels never overlap: labels sit
 *  beside arrows on the left and right edges (one text line apart) and under or over them on the top and bottom. */
export const ARROW_GAP_SIDE = 20, ARROW_GAP_TOP = 110;
const SCALE_STEPS: readonly number[] = [50, 100, 200, 250, 500, 1000, 2000];
export const SCALE_BAR_MAX_PX = 160;
/** The star field's parallax (parent §10b layer 1): screen pixels the stars move per world unit the camera centre moves,
 *  at every zoom (plan decision 8). The ship at 800 u/s drifts the stars by 16 px/s. */
export const STAR_PARALLAX = 0.02;

/** A body at the previous tick. Net-4a §3.8: online while predicting, `ox, oy, oh` are a correction's decaying visual
 *  offset, added after the blend; absent (Single player, the confirmed view) the blend is unchanged. */
export interface PrevBody { x: number; y: number; h: number; ox?: number; oy?: number; oh?: number }
export interface Line { x1: number; y1: number; x2: number; y2: number }
export interface Label { text: string; x: number; y: number }
/** `curves` (the gravity grid only; `lines` is then empty): each bent line as a flat x, y, x, y… screen polyline. */
export interface GridDraw { spacing: number; lines: (Line & { major: boolean })[]; columns: Label[]; rows: Label[]; curves?: { pts: number[]; major: boolean }[] }
/** The gravity grid: a bent line gets a point about every WELL_SEG_PX screen pixels; a line the well bows by less than
 *  WELL_STRAIGHT_PX is drawn straight (two points). */
export const WELL_SEG_PX = 14, WELL_STRAIGHT_PX = 0.5;
/** The gravity grid draws this many lines per square-grid line, so the well's shape reads; every 500 units stays major. */
export const WELL_DENSITY = 2;
/** A body's dent is drawn only where it moves the grid by at least this many screen pixels. */
export const DENT_MIN_PX = 0.75;
/** How far outside the view a grid line is still worked out: the well's farthest shift plus a large body's (the same
 *  whatever is on the map, so the lines' points do not jump as bodies come and go). */
export const WELL_PAD = WELL_MAX_SHIFT + dentOf(0, 0, 2 * DENT_FULL_R).shift;
export interface CircleDraw { x: number; y: number; r: number }
/** Spike ii: `wear` 0 (whole) .. 1 from hp / hpMax, drawn as cracks only (look pass spec §2: no streak, no trail, the
 *  same fill and outline at any wear); `spin` the outline's turn. */
export interface AsteroidDraw extends CircleDraw { index: number; dot: boolean; wear?: number; spin?: number }
/** §7.2: the predicted path of the Weapons map's rock target: ticks and the dot spacing (20 s, a dot every 0.5 s). */
export const ROCK_PATH_TICKS = 1200, ROCK_PATH_EVERY = 30;
export interface ShipDraw {
  index: number; x: number; y: number;
  /** Radians clockwise from north (the screen's up). */
  angle: number;
  /** Screen pixels per world unit (the zoom) for the silhouette. */
  scale: number;
  chevron: boolean; crew: boolean;
  /** The silhouette (hull silhouettes spec section 2): the shape comes from HULLS[hull], the colours from `crew`. */
  hull: HullId;
  rooms: readonly number[]; shields: number;
}
export interface RingDraw { x: number; y: number; r: number; ticks: (Line & { major: boolean })[]; labels: Label[] }
/** Feel-ii (spec §1.1-§1.3): `collision` the predicted path's first solid contact (its last segment from `from`, an X at
 *  the point, the tag `COLLISION 2.1s`); `hold` the held heading's chevron on the bearing ring (its three points) and the
 *  dashed line from the nose toward it; `slingshot` the word's place on the path while it whips round the planet. */
export interface CollisionDraw { x: number; y: number; from: Point; label: Label; seconds: number }
export interface HoldDraw { chevron: number[]; from: Point; to: Point; preview: boolean }
export interface HelmDraw { path: Point[]; origin: Point; velocity: Point; headingFrom: Point; headingTo: Point; thrust: number; turn: number; ring: RingDraw | null;
  collision?: CollisionDraw | null; hold?: HoldDraw | null; slingshot?: Label | null;
  /** Playtest2feedback §6: the steering marker while the left button steers: from the ship to the cursor. */
  steer?: { from: Point; to: Point } | null;
  /** Helm round 2 §6.2: a small ring at the velocity line's far end (where the ship will be in 1 s), so it reads as a marker
   *  apart from the nose line; a newtonianHelm crew class only (plan Decision 13). */
  velocityRing?: CircleDraw | null }
/** Helm round 2 §6.2: the velocity marker's ring radius in screen px. */
export const VELOCITY_RING_PX = 4;
/** Playtest2feedback §6: one cold gas puff, at a screen point on the crew ship's hull edge, venting along (dx, dy) (unit). */
export interface PuffDraw { x: number; y: number; dx: number; dy: number }
/** Feel-ii §1.3: a gravity ring about the planet (where its pull is `g` of the crew ship's full thrust) and its label. */
export interface GravityDraw extends CircleDraw { g: number; label: Label }
/** `'blip'` (sensors blip spec §3): the ping of an enemy beyond sensor range. It is not the `'enemy'` arrow, so the goal
 *  glow and the FIRING SOLUTION mark (weaponsModel.ts), which read the enemy arrow, never attach to it. */
export type ArrowTarget = 'ship' | 'enemy' | 'planet' | 'missile' | 'blip';
/** `edge`: own ship window spec §3, set only on an arrow placed on the avoid rect's right or bottom side. */
/** `alpha` (sensors blip spec §3): set only on a `'blip'` arrow, the ping's alpha; `distance` is then rounded to the nearest 100. */
export interface ArrowDraw { target: ArrowTarget; x: number; y: number; angle: number; distance: number; label: string; edge?: 'avoidRight' | 'avoidBottom'; alpha?: number }
export interface OverlayDraw { zoomText: string; scaleBar: { px: number; units: number }; snapHint: boolean; paused: boolean }
/** The derelict's loot as the map and the contact window name it (Loot order). */
export const LOOT_NAMES = ['HULL', 'TORPEDOES', 'SHIELD'] as const;
/** Sci-1 spec §7.1: one map contact's mark. `unknown` (Level 0): a plain `?`, no silhouette or shield ring. `wreck`: the
 *  derelict at Level 1, with its `label` and, trapped, the `alert`. `r`: the radius of its scan ring and designation
 *  bracket. `scan`: the scanner's progress 0..1 while it scans this contact, else null. */
export interface ContactMarkDraw { contact: 0 | 1; x: number; y: number; r: number; unknown: boolean; wreck: boolean; label: string | null; alert: string | null; scan: number | null; designated: boolean }
/** The salvage hold as a ring round the crew ship, filled 0..1 over SALVAGE_TICKS. */
export interface SalvageDraw { x: number; y: number; r: number; fill: number }
/** Science's slow rotating ring on the crew laser's target (Artemis). */
export interface LockRingDraw { x: number; y: number; r: number }
/** Engineering spike §10.4: a ghost in screen space (its heading as radians clockwise from north) at its fade. */
export interface GhostDraw { kind: GhostKind; x: number; y: number; angle: number; alpha: number }
/** Sensors blip spec §3: the ping in screen pixels: its centre, its radius and its alpha (1 at age 0 down to 0.4 at age 1). */
export interface BlipDraw { x: number; y: number; r: number; alpha: number }
/** Spike ii §6.5: a bracket about a rock: a weapon's rock target, or the rock under the pointer while a weapon is picked up. */
export interface RockMarkDraw { x: number; y: number; r: number; weapon: 'laser' | 'torpedo'; hover: boolean }
export interface TacticalDraw {
  grid: GridDraw;
  contours: (CircleDraw & { accel: number })[];
  edge: CircleDraw | null;
  planet: CircleDraw | null;
  asteroids: AsteroidDraw[];
  ships: ShipDraw[];
  helm: HelmDraw | null;
  arrows: ArrowDraw[];
  overlay: OverlayDraw;
  /** The star field's offset within one screen-sized tile, 0..w × 0..h (see starOffset). */
  stars: Point;
  /** Sci-1 (only with `contacts`): the contact marks, the salvage ring, Science's lock ring. */
  marks?: ContactMarkDraw[]; salvage?: SalvageDraw | null; lockRing?: LockRingDraw | null;
  /** Feel-ii §1.3, the Helm only: the G 0.5 and G 1 rings. */
  gravity?: GravityDraw[];
  /** Engineering spike §10.4 (only with `fog`): the sensor range ring about the crew ship, and the ghosts. */
  sensor?: CircleDraw | null; ghosts?: GhostDraw[];
  /** Sensors blip spec §3 (only with `fog`): the ping's circle, or null when there is none or it is wholly off the view.
   *  Its `?` is blipMark's. */
  blip?: BlipDraw | null;
  /** Spike ii §6.5 (only with contacts): the rock brackets. */
  rockMarks?: RockMarkDraw[];
  /** Asteroids-iii §7.2: the Weapons map's rock target's predicted path (screen px). */
  rockPath?: Point[];
  /** Playtest2feedback §6: the crew ship's cold gas puffs this frame. */
  puffs?: PuffDraw[];
}

export interface TacticalModelInput {
  state: TacticalState;
  /** Each ship's position and continuous heading (heading + headingAcc) at the previous tick. */
  prev: readonly PrevBody[];
  /** Each ship's missile at the previous tick, by owner; here only its correction offset is read (Net-4a §3.8: the own
   *  torpedo's edge arrow). Absent: no offset. */
  missilePrev?: readonly (PrevBody | null)[];
  alpha: number;
  camera: Camera;
  viewport: Viewport;
  console: 'helm' | 'weapons' | 'science';
  /** The duel's contacts (Sci-1 spec §7.1): hide an unknown enemy's silhouette and draw the marks. The flight view leaves it off. */
  contacts?: boolean;
  /** Spike ii §6.5: the rock under the pointer while a weapon is picked up, for its hover bracket. UI round §1.4: the duel
   *  scene no longer sets it (rocks are not picked from the map); kept for pickRock's tests. */
  rockHover?: { rock: number; weapon: 'laser' | 'torpedo' } | null;
  /** Asteroids-iii §7.1: the scene's rock track (smooth motion); absent: rocks at their tick positions. */
  rockTrack?: RockTrack | null;
  /** The Helm's effective axes the runtime last sent to the sim. */
  axes: Axes;
  /** Ships to draw (the flight view draws only ship 0). The crew ship is index 0. */
  ships: readonly number[];
  paused: boolean;
  /** Screen pixels on the right kept clear of off-screen arrows (the readout panel). */
  reserveRight: number;
  /** Screen pixels on the left kept clear of off-screen arrows (the Artemis console's status table); default 0. */
  reserveLeft?: number;
  /** Spread crowded off-screen arrows apart (the duel views set it; the flight view keeps H-1a's exact positions). */
  spreadArrows?: boolean;
  /** Feel-ii §1.1: the held heading to mark at the Helm (a heading index, −1 or absent none), and whether it is the local
   *  right-drag's preview rather than the sim's. */
  holdHeading?: number; holdPreview?: boolean;
  /** Feel-ii: screen pixels at the top kept clear of off-screen arrows (a console's status sentence); default 0. */
  reserveTop?: number;
  /** Feel-ii §1.3: draw the gravity rings and the SLINGSHOT word (the duel's Helm; the flight view leaves it off). */
  gravity?: boolean;
  /** Presentation seconds (the SLINGSHOT blink); default 0. */
  t?: number;
  /** Valkyrn spec §4.5: the crew ship's silhouette (hullFor(true, layout.hull)); absent: the Hound's. */
  crewHull?: HullId;
  /** Playtest2feedback §6: the crew ship's vented thruster axes this tick (the puffs), and the cursor the held left
   *  button steers to (the steering marker), in screen px; absent: none. */
  vent?: HelmVent | null; steerTo?: Point | null;
  /** Engineering spike §10.4: the fog this frame (the scene's stepFog). The scene leaves the enemy out of `ships` while it
   *  is unseen; the derelict's mark needs `seen.derelict`. Absent (the flight view): no fog. */
  fog?: FogView | null;
  /** Own ship window spec §3: a console window the off-screen arrows go around (OWN_SHIP); absent: none. */
  avoid?: { x: number; y: number; w: number; h: number };
  /** The grid's style (Settings, mapGrid.ts); absent: the square grid; 'off': no lines and no names (owner 2026-11-20). */
  mapGrid?: MapGridSetting;
}

/** Radius at which the planet's pull on a ship is `accel`, by bisection on the falling side of shipGravityAccel (startup only). */
export function contourRadius(accel: number): number {
  const pull = (r: number): number => { const [gx, gy] = shipGravityAccel(r, 0); return Math.sqrt(gx * gx + gy * gy); };
  let lo = 20, hi = R_MAP;   // the pull peaks near ε/√2 ≈ 14 and falls from there
  if (pull(hi) >= accel) return hi;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (pull(mid) > accel) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
const CONTOUR_RADII = CONTOUR_ACCELS.map(contourRadius);
/** Feel-ii §1.3: the fractions of the crew ship's full thrust the two gravity rings mark. */
export const GRAVITY_RINGS: readonly number[] = [0.5, 1];
/** SLINGSHOT shows while the path passes inside the G 1 ring faster than this (u/s), with no collision; it blinks at SLINGSHOT_HZ. */
export const SLINGSHOT_SPEED = SLING_MIN_SPEED, SLINGSHOT_HZ = 3;   // the sim's slingshot speed (tuning.ts), 200
const gravityRadii = new Map<number, number>();
/** The radius where the planet's pull is `g` of `thrust` (u/s²), cached per value. */
export function gravityRadius(g: number, thrust: number): number {
  const a = g * thrust, hit = gravityRadii.get(a);
  if (hit !== undefined) return hit;
  const r = contourRadius(a); gravityRadii.set(a, r); return r;
}
/** W-1 (pew pew spec §4): the fine heading (0..AIM_STEPS − 1, a heading index × HEADING_COUNT + its fraction) of a screen
 *  direction (dx, dy), north 0 clockwise. The view's aim; the sim clamps it. */
export function fineHeadingOf(dx: number, dy: number): number {
  const a = Math.atan2(dx, -dy), k = Math.round((a / (2 * Math.PI)) * AIM_STEPS);
  return ((k % AIM_STEPS) + AIM_STEPS) % AIM_STEPS;
}

/** The heading index (0..255) of a screen direction (dx, dy), north 0 clockwise. */
export function headingOf(dx: number, dy: number): number {
  const a = Math.atan2(dx, -dy), k = Math.round((a / (2 * Math.PI)) * HEADING_COUNT);
  return ((k % HEADING_COUNT) + HEADING_COUNT) % HEADING_COUNT;
}
/** The COLLISION tag's words: the seconds to contact at one decimal. */
export function collisionTag(seconds: number): string { return `COLLISION ${seconds.toFixed(1)}s`; }

/** The star tile's offset for a camera centre: −centre × STAR_PARALLAX, wrapped into 0..w × 0..h. */
export function starOffset(centreX: number, centreY: number, vp: Viewport): Point {
  const wrap = (v: number, n: number): number => ((v % n) + n) % n;
  return { x: wrap(-centreX * STAR_PARALLAX, vp.w), y: wrap(-centreY * STAR_PARALLAX, vp.h) };
}

/** A heading in steps (any real) to radians clockwise from north. */
export function headingAngle(h: number): number { return (h / HEADING_COUNT) * Math.PI * 2; }

/** Ship i at render time: the previous tick's position and heading toward the current one by alpha (heading the short way). */
export function interpolatedShip(state: TacticalState, prev: readonly PrevBody[], alpha: number, i: number): PrevBody {
  const s = state.ships[i]!, p = prev[i], a = Math.min(1, Math.max(0, alpha)), h1 = s.heading + s.headingAcc;
  if (!p) return { x: s.x, y: s.y, h: h1 };
  let dh = h1 - p.h;
  dh -= Math.round(dh / HEADING_COUNT) * HEADING_COUNT;
  return { x: p.x + (s.x - p.x) * a + (p.ox ?? 0), y: p.y + (s.y - p.y) * a + (p.oy ?? 0), h: p.h + dh * a + (p.oh ?? 0) };   // Net-4a §3.8: the offset after the blend
}

/** The followed body's interpolated world position, or null when there is none (the camera then holds still). */
export function followTarget(state: TacticalState, prev: readonly PrevBody[], alpha: number, follow: Follow, own = 0): Point | null {
  if (follow === 'free') return null;
  if (follow === 'missile') { const m = missileOf(state, own); return m ? { x: m.x, y: m.y } : null; }
  const s = interpolatedShip(state, prev, alpha, own);
  return { x: s.x, y: s.y };
}

/** A column letter for a 0-based column (A..Z, then AA...). */
export function columnName(k: number): string {
  let n = k, out = '';
  do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return out;
}

/** Seconds of predicted path at this zoom. */
export function pathSeconds(zoom: number): number {
  if (zoom >= PATH_NEAR_ZOOM) return PATH_NEAR_S;
  const k = (PATH_NEAR_ZOOM - Math.max(PATH_FAR_ZOOM, zoom)) / (PATH_NEAR_ZOOM - PATH_FAR_ZOOM);
  return PATH_NEAR_S + (PATH_FAR_S - PATH_NEAR_S) * k;
}

/** True when a ring of radius r about (x, y) crosses the rectangle 0..w × 0..h (not wholly outside, not enclosing it). */
export function ringCrossesRect(x: number, y: number, r: number, w: number, h: number): boolean {
  const nx = Math.min(w, Math.max(0, x)), ny = Math.min(h, Math.max(0, y));
  if ((nx - x) ** 2 + (ny - y) ** 2 > r * r) return false;
  const fx = Math.max(Math.abs(x), Math.abs(w - x)), fy = Math.max(Math.abs(y), Math.abs(h - y));
  return fx * fx + fy * fy >= r * r;
}

function gridDraw(cam: Camera, vp: Viewport, well: Point | null, dents: readonly Dent[] = [], drawLines = true): GridDraw {
  const spacing = cam.zoom > GRID_MINOR_ZOOM ? GRID_MINOR : GRID_MAJOR;
  const v = visibleWorld(cam, vp), E = GRID_EXTENT;
  const x0 = Math.max(-E, v.x0), x1 = Math.min(E, v.x1), y0 = Math.max(-E, v.y0), y1 = Math.min(E, v.y1);
  const lines: GridDraw['lines'] = [], columns: Label[] = [], rows: Label[] = [];
  if (x0 > x1 || y0 > y1) return { spacing, lines, columns, rows };
  const sy0 = worldToScreen(cam, vp, 0, y0).y, sy1 = worldToScreen(cam, vp, 0, y1).y;
  const sx0 = worldToScreen(cam, vp, x0, 0).x, sx1 = worldToScreen(cam, vp, x1, 0).x;
  const curves = well ? wellCurves(cam, vp, well, spacing / WELL_DENSITY, dents) : undefined;
  if (!well && drawLines) {
    for (let k = Math.ceil((x0 + E) / spacing); -E + k * spacing <= x1; k++) {
      const wx = -E + k * spacing, sx = worldToScreen(cam, vp, wx, 0).x;
      lines.push({ x1: sx, y1: sy0, x2: sx, y2: sy1, major: (wx + E) % GRID_MAJOR === 0 });
    }
    for (let k = Math.ceil((y0 + E) / spacing); -E + k * spacing <= y1; k++) {
      const wy = -E + k * spacing, sy = worldToScreen(cam, vp, 0, wy).y;
      lines.push({ x1: sx0, y1: sy, x2: sx1, y2: sy, major: (wy + E) % GRID_MAJOR === 0 });
    }
  }
  // Labels name the 500-unit squares at every zoom, so a square keeps its name (plan decision 4); each sits in the middle
  // of the square's visible part, along the top and left edges of the screen (or of the grid, when that edge is on screen).
  // On the gravity grid a label is pulled toward the planet as the lines beside it are, so it stays between them.
  if (!drawLines) return { spacing, lines, columns, rows };   // owner 2026-11-20: 'off' drops the squares' names too
  const n = (2 * E) / GRID_MAJOR, top = Math.max(4, sy0 + 4), left = Math.max(4, sx0 + 4);
  const pulled = (x: number, y: number): Point => {
    if (!well) return worldToScreen(cam, vp, x, y);
    const dx = x - well.x, dy = y - well.y, f = wellScale(dx * dx + dy * dy);
    return worldToScreen(cam, vp, well.x + dx * f, well.y + dy * f);
  };
  for (let k = 0; k < n; k++) {
    const a = Math.max(x0, -E + k * GRID_MAJOR), b = Math.min(x1, -E + (k + 1) * GRID_MAJOR);
    if (b <= a || (b - a) * cam.zoom < 24) continue;
    columns.push({ text: columnName(k), x: pulled((a + b) / 2, y0).x, y: top });
  }
  for (let k = 0; k < n; k++) {
    const a = Math.max(y0, -E + k * GRID_MAJOR), b = Math.min(y1, -E + (k + 1) * GRID_MAJOR);
    if (b <= a || (b - a) * cam.zoom < 24) continue;
    rows.push({ text: String(k + 1), x: left, y: pulled(x0, (a + b) / 2).y });
  }
  return curves ? { spacing, lines, columns, rows, curves } : { spacing, lines, columns, rows };
}

/** The dent pass's scratch (wellCurves): per point of the line in hand, the summed dent offsets (x, y) and pulls. */
let dentScratch = new Float64Array(0);

/** The gravity grid's lines (mapGrid.ts): every grid line that can reach the screen, each point scaled toward the planet
 *  by wellScale, then moved by the bodies' dents that reach it. A line no dent reaches that runs through the planet, or
 *  that the well barely bows, stays two points. Per point: about ten multiplies and one divide for the planet; a dent
 *  costs the same again, but only on the stretch of each line inside its reach (found by a binary search: a line's
 *  points run in order along it, bent or not). */
function wellCurves(cam: Camera, vp: Viewport, well: Point, spacing: number, dents: readonly Dent[]): NonNullable<GridDraw['curves']> {
  const v = visibleWorld(cam, vp), E = GRID_EXTENT, z = cam.zoom, pad = WELL_PAD;
  // The well and the dents only pull points toward them, by at most `pad`, so a line that far outside the view can still be drawn in it.
  const lo = [Math.max(-E, v.x0 - pad), Math.max(-E, v.y0 - pad)], hi = [Math.min(E, v.x1 + pad), Math.min(E, v.y1 + pad)];
  const o = [vp.w / 2 - cam.centreX * z, vp.h / 2 - cam.centreY * z], centre = [well.x, well.y], z2 = z * z;
  const curves: NonNullable<GridDraw['curves']> = [];
  for (let axis = 0; axis < 2; axis++) {   // 0: the north-south lines (x fixed, y runs); 1: the east-west lines
    const run = 1 - axis, a = lo[run]!, b = hi[run]!;
    if (a >= b) continue;
    for (let k = Math.ceil((lo[axis]! + E) / spacing); -E + k * spacing <= hi[axis]!; k++) {
      const w = -E + k * spacing, d = w - centre[axis]!;
      // The line's nearest point to the planet moves the most: that is how far the line bows.
      let bent = Math.abs(d) * (1 - wellScale(d * d)) * z >= WELL_STRAIGHT_PX;
      for (let j = 0; !bent && j < dents.length; j++) bent = Math.abs(w - (axis === 0 ? dents[j]!.x : dents[j]!.y)) < dents[j]!.reach;
      const n = bent ? Math.max(1, Math.ceil(((b - a) * z) / WELL_SEG_PX)) : 1, step = (b - a) / n;
      const pts = new Array<number>(2 * (n + 1));
      let near = Infinity, far = -Infinity;   // the drawn line's extent across itself, in screen px
      for (let i = 0; i <= n; i++) {
        const t = a + step * i, x = axis === 0 ? w : t, y = axis === 0 ? t : w;
        const dx = x - well.x, dy = y - well.y, f = bent ? wellScale(dx * dx + dy * dy) : 1;
        const px = o[0]! + (well.x + dx * f) * z, py = o[1]! + (well.y + dy * f) * z, across = axis === 0 ? px : py;
        pts[2 * i] = px; pts[2 * i + 1] = py;
        if (across < near) near = across; if (across > far) far = across;
      }
      if (bent && dents.length > 0) dentLine(pts, n, axis, near, far, dents, o, z, z2);
      curves.push({ pts, major: (w + E) % GRID_MAJOR === 0 });
    }
  }
  return curves;
}

/** Moves one drawn line's points (screen px, in order along `1 - axis`) by the dents that reach it: each point by the
 *  sum of the dents' pulls on it, eased by dentEase so overlapping dents never fold the grid. */
function dentLine(pts: number[], n: number, axis: number, near: number, far: number, dents: readonly Dent[], o: readonly number[], z: number, z2: number): void {
  const run = 1 - axis;
  let first = n + 1, last = -1;
  for (const dent of dents) {
    const reach = dent.reach * z, ca = o[axis]! + (axis === 0 ? dent.x : dent.y) * z, cr = o[run]! + (axis === 0 ? dent.y : dent.x) * z;
    if (ca < near - reach || ca > far + reach) continue;
    // The first point at or past the dent's near edge along the line; the points run on from there to its far edge.
    let i = 0, top = n + 1;
    for (const from = cr - reach; i < top;) { const mid = (i + top) >> 1; if (pts[2 * mid + run]! < from) i = mid + 1; else top = mid; }
    if (i > n || pts[2 * i + run]! > cr + reach) continue;
    if (last < 0) { if (dentScratch.length < 3 * (n + 1)) dentScratch = new Float64Array(3 * (n + 1)); dentScratch.fill(0, 0, 3 * (n + 1)); }
    if (i < first) first = i;
    const c2 = dent.c2 * z2;
    for (const to = cr + reach; i <= n && pts[2 * i + run]! <= to; i++) {
      const da = pts[2 * i + axis]! - ca, dr = pts[2 * i + run]! - cr, s = c2 / (da * da + dr * dr + c2), g = dent.pull * s * s;
      dentScratch[3 * i] = dentScratch[3 * i]! + da * g; dentScratch[3 * i + 1] = dentScratch[3 * i + 1]! + dr * g; dentScratch[3 * i + 2] = dentScratch[3 * i + 2]! + g;
    }
    if (i - 1 > last) last = i - 1;
  }
  for (let i = first; i <= last; i++) {
    const sum = dentScratch[3 * i + 2]!;
    if (sum === 0) continue;
    const ease = dentEase(sum);
    pts[2 * i + axis] = pts[2 * i + axis]! - dentScratch[3 * i]! * ease; pts[2 * i + run] = pts[2 * i + run]! - dentScratch[3 * i + 1]! * ease;
  }
}

/** The bearing ring about a screen point: ticks every 10°, labels every 30° (north 0). */
export function ringDraw(x: number, y: number): RingDraw {
  const r = BEARING_RING_PX, ticks: RingDraw['ticks'] = [], labels: Label[] = [];
  for (let deg = 0; deg < 360; deg += 10) {
    const a = (deg * Math.PI) / 180, sx = Math.sin(a), sy = -Math.cos(a), major = deg % 30 === 0, len = major ? 10 : 5;
    ticks.push({ x1: x + sx * r, y1: y + sy * r, x2: x + sx * (r + len), y2: y + sy * (r + len), major });
    if (major) labels.push({ text: String(deg), x: x + sx * (r + 22), y: y + sy * (r + 22) });
  }
  return { x, y, r, ticks, labels };
}

/** Where the ray from the screen centre toward (x, y) leaves the inset rectangle, or null when (x, y) is inside it. */
function edgePoint(vp: Viewport, reserveLeft: number, reserveRight: number, x: number, y: number, reserveTop = 0): { x: number; y: number; angle: number } | null {
  const m = ARROW_MARGIN, l = reserveLeft + m, t = reserveTop + m, r = vp.w - reserveRight - m, b = vp.h - m;
  if (x >= l && x <= r && y >= t && y <= b) return null;
  const cx = (l + r) / 2, cy = (t + b) / 2, dx = x - cx, dy = y - cy;
  const k = Math.min(dx > 0 ? (r - cx) / dx : dx < 0 ? (l - cx) / dx : Infinity, dy > 0 ? (b - cy) / dy : dy < 0 ? (t - cy) / dy : Infinity);
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dx, -dy) };
}

type AvoidRect = { x: number; y: number; w: number; h: number };
/**
 * Own ship window spec §3: an arrow around `avoid`. A is avoid grown by ARROW_MARGIN on its right and bottom. When edgePoint's
 * point `e` lies inside A, or the object is on screen (`e` null) under the ungrown avoid, the arrow goes where the ray from
 * the inset rectangle's centre toward `p` enters A: k = max(kx, ky); the right side when kx >= ky (a corner counts as
 * right), else the bottom. Otherwise `e` is returned as it is.
 */
export function aroundAvoid(vp: Viewport, reserveLeft: number, reserveRight: number, reserveTop: number, avoid: AvoidRect, p: { x: number; y: number },
  e: { x: number; y: number; angle: number } | null): { x: number; y: number; angle: number; edge?: 'avoidRight' | 'avoidBottom' } | null {
  const m = ARROW_MARGIN, ar = avoid.x + avoid.w + m, ab = avoid.y + avoid.h + m;
  const hidden = !e && p.x >= avoid.x && p.x <= avoid.x + avoid.w && p.y >= avoid.y && p.y <= avoid.y + avoid.h;
  const onIt = !!e && e.x >= avoid.x && e.x <= ar && e.y >= avoid.y && e.y <= ab;
  if (!hidden && !onIt) return e;
  const l = reserveLeft + m, t = reserveTop + m, r = vp.w - reserveRight - m, b = vp.h - m;
  const cx = (l + r) / 2, cy = (t + b) / 2, dx = p.x - cx, dy = p.y - cy;
  const kx = dx < 0 ? (ar - cx) / dx : -Infinity, ky = dy < 0 ? (ab - cy) / dy : -Infinity;
  if (kx === -Infinity && ky === -Infinity) return e;
  const k = Math.max(kx, ky);
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dx, -dy), edge: kx >= ky ? 'avoidRight' : 'avoidBottom' };
}

const ARROW_NAMES: Readonly<Record<ArrowTarget, string>> = { ship: 'SHIP', enemy: 'ENEMY', planet: 'PLANET', missile: 'TORPEDO', blip: 'BLIP' };   // homing torpedo spec §3: on screen it is a torpedo

/**
 * Keep arrows on the same edge at least the label gap apart. Each edge's arrows are sorted along it and pushed on, from the
 * end nearer the edge's middle, by the minimum gap from the one before; any overrun past the edge's far end is shifted back.
 * Arrows that already clear each other do not move.
 */
export function spreadArrows(arrows: ArrowDraw[], vp: Viewport, reserveRight: number, reserveLeft = 0, reserveTop = 0, avoid?: AvoidRect): void {
  const m = ARROW_MARGIN, top = reserveTop + m, bottom = vp.h - m, right = vp.w - reserveRight - m, left = reserveLeft + m;
  const ar = avoid ? avoid.x + avoid.w + m : -Infinity, ab = avoid ? avoid.y + avoid.h + m : -Infinity;   // own ship window spec §3
  const groups = new Map<string, { flat: boolean; lo: number; hi: number; list: ArrowDraw[] }>();
  for (const a of arrows) {
    let key: string, flat: boolean, lo: number, hi: number;
    if (a.edge === 'avoidBottom') { key = a.edge; flat = true; lo = left; hi = ar; }
    else if (a.edge === 'avoidRight') { key = a.edge; flat = false; lo = top; hi = ab; }
    else {
      const onTop = Math.abs(a.y - top) < 0.5;
      flat = onTop || Math.abs(a.y - bottom) < 0.5; key = flat ? `y${Math.round(a.y)}` : `x${Math.round(a.x)}`;
      lo = flat ? (onTop ? Math.max(left, ar) : left) : (Math.abs(a.x - left) < 0.5 ? Math.max(top, ab) : top);
      hi = flat ? right : bottom;
    }
    const g = groups.get(key) ?? { flat, lo, hi, list: [] };
    g.list.push(a); groups.set(key, g);
  }
  for (const { flat, lo, hi, list } of groups.values()) {
    if (list.length < 2) continue;
    const gap = flat ? ARROW_GAP_TOP : ARROW_GAP_SIDE, mid = (lo + hi) / 2;
    const get = (a: ArrowDraw): number => (flat ? a.x : a.y), set = (a: ArrowDraw, v: number): void => { if (flat) a.x = v; else a.y = v; };
    const dir = list.reduce((t, a) => t + get(a), 0) / list.length > mid ? -1 : 1;   // spread toward the edge's middle
    const order = [...list].sort((p, q) => (get(p) - get(q)) * dir);
    const start = dir > 0 ? lo : hi, end = dir > 0 ? hi : lo;
    let prev: number | null = null;
    for (const a of order) {
      let v = get(a);
      if (prev !== null) v = dir > 0 ? Math.max(v, prev + gap) : Math.min(v, prev - gap);
      v = dir > 0 ? Math.max(v, start) : Math.min(v, start);
      set(a, v); prev = v;
    }
    let bound = end;   // past the far end: shift back, keeping the gaps
    for (let i = order.length - 1; i >= 0; i--) {
      const a = order[i]!, v = dir > 0 ? Math.min(get(a), bound) : Math.max(get(a), bound);
      set(a, v); bound = v - dir * gap;
    }
  }
}

export function tacticalModel(input: TacticalModelInput): TacticalDraw {
  const { state, prev, alpha, camera: cam, viewport: vp } = input;
  const v = visibleWorld(cam, vp), z = cam.zoom, map = state.map;
  const toS = (x: number, y: number): Point => worldToScreen(cam, vp, x, y);
  const onScreen = (x: number, y: number, r: number): boolean => x + r >= v.x0 && x - r <= v.x1 && y + r >= v.y0 && y - r <= v.y1;

  const contours: TacticalDraw['contours'] = [];
  const pc = toS(map.planet.x, map.planet.y);
  CONTOUR_ACCELS.forEach((accel, k) => {
    const r = CONTOUR_RADII[k]! * z;
    if (ringCrossesRect(pc.x, pc.y, r, vp.w, vp.h)) contours.push({ accel, x: pc.x, y: pc.y, r });
  });
  const edge = ringCrossesRect(pc.x, pc.y, map.rMap * z, vp.w, vp.h) ? { x: pc.x, y: pc.y, r: map.rMap * z } : null;
  const planet = onScreen(map.planet.x, map.planet.y, map.planet.r) ? { x: pc.x, y: pc.y, r: map.planet.r * z } : null;

  const asteroids: AsteroidDraw[] = [];
  for (let index = 0, n = rockSlots(state); index < n; index++) {   // SPIKE: the live rock pool, not the seeded map
    if (!rockAlive(state, index)) continue;
    const a = rockAt(state, index), r = a.r * z, w = rockDrawPos(input.rockTrack ?? null, state, index, alpha);
    if (r < DOT_MIN_PX || !onScreen(w.x, w.y, a.r)) continue;
    const p = toS(w.x, w.y);
    asteroids.push({ index, x: p.x, y: p.y, r, dot: r < ASTEROID_DOT_PX, wear: Math.max(0, Math.min(1, 1 - a.hp / rockHpMax(a.r))), spin: (asteroidSpin(index) * rockDrawTick(input.rockTrack ?? null, state, alpha)) / TICK_HZ });
  }

  const ships: ShipDraw[] = [];
  for (const i of input.ships) {
    if (input.contacts && i !== CREW_SLOT && i === targetOf(state, CREW_SLOT) && state.known[Contact.Enemy] === 0) continue;   // unknown: a ? mark only
    const b = interpolatedShip(state, prev, alpha, i), s = state.systems[i]!;
    if (!onScreen(b.x, b.y, Math.max(SHIP_RADIUS * 2, (SHIP_RADIUS * 1.9 * drawnScale(z)) / z))) continue;   // the drawn rings reach 1.9 units
    const p = toS(b.x, b.y);
    ships.push({ index: i, x: p.x, y: p.y, angle: headingAngle(b.h), scale: drawnScale(z), chevron: 2 * SHIP_RADIUS * z < SHIP_CHEVRON_PX, crew: i === 0, hull: i === 0 ? input.crewHull ?? hullFor(true) : hullFor(false), rooms: s.rooms, shields: s.shields });
  }

  // The gravity grid's dents (mapGrid.ts): every drawn ship and live rock whose dent reaches the view and shows there.
  const dents: Dent[] = [];
  if (input.mapGrid === 'gravity') {
    const add = (x: number, y: number, r: number): void => { const d = dentOf(x, y, r); if (d.shift * z >= DENT_MIN_PX && onScreen(x, y, d.reach)) dents.push(d); };
    for (let k = 0, n = rockSlots(state); k < n; k++) if (rockAlive(state, k)) { const w = rockDrawPos(input.rockTrack ?? null, state, k, alpha); add(w.x, w.y, rockAt(state, k).r); }   // where the rock is drawn
    for (const i of input.ships) { const b = interpolatedShip(state, prev, alpha, i); add(b.x, b.y, SHIP_RADIUS); }
  }

  const own = interpolatedShip(state, prev, alpha, 0), ownS = toS(own.x, own.y);
  // Playtest2feedback §6: the puffs, at the hull edge opposite each vented push (helm round 2 §3.2: no turn-boost puffs).
  const puffs: PuffDraw[] = [], vt = input.vent ?? null;
  if (vt && input.ships.includes(0) && (vt.x !== 0 || vt.y !== 0)) {
    const a = headingAngle(own.h), fx = Math.sin(a), fy = -Math.cos(a), rx = -fy, ry = fx, rr = SHIP_RADIUS * 1.3 * drawnScale(z);
    const puff = (ox: number, oy: number, dx: number, dy: number): void => { puffs.push({ x: ownS.x + ox * rr, y: ownS.y + oy * rr, dx, dy }); };
    if (vt.y !== 0) puff(-fx * vt.y, -fy * vt.y, -fx * vt.y, -fy * vt.y);
    if (vt.x !== 0) puff(-rx * vt.x, -ry * vt.x, -rx * vt.x, -ry * vt.x);
  }
  let helm: HelmDraw | null = null;
  if (input.console === 'helm' && input.ships.includes(0)) {
    const s = state.ships[0];
    // Net-4a §3.8: the path is P's, so it moves and turns with the own ship's correction offset (rotated by oh about P's
    // ship, then shifted by ox, oy), and starts where the smoothed marker is drawn. Without an offset it is unchanged.
    const o = prev[0], oh = o?.oh ?? 0, ox = o?.ox ?? 0, oy = o?.oy ?? 0, ra = headingAngle(oh), rc = Math.cos(ra), rs = Math.sin(ra);
    const placed = (q: Point): Point => {
      if (oh === 0 && ox === 0 && oy === 0) return toS(q.x, q.y);
      const dx = q.x - s.x, dy = q.y - s.y;
      return toS(s.x + dx * rc - dy * rs + ox, s.y + dx * rs + dy * rc + oy);
    };
    const flight = predictFlight(state, 0, input.axes, Math.round(pathSeconds(z) * 60), PATH_STRIDE), path = flight.points.map(placed);
    const a = headingAngle(own.h), hxs = Math.sin(a), hys = -Math.cos(a), nose = SHIP_RADIUS * 1.3 * drawnScale(z) + 4;
    // Feel-ii §1.2: the contact the path stops at, its last segment drawn hot from the point before it.
    let collision: CollisionDraw | null = null;
    if (flight.contact) {
      const p = placed(flight.contact), from = path.length > 1 ? path[path.length - 2]! : ownS, seconds = flight.contact.tick / TICK_HZ;
      collision = { x: p.x, y: p.y, from, seconds, label: { text: collisionTag(seconds), x: p.x + 10, y: p.y - 22 } };
    }
    // Feel-ii §1.1: the held heading's chevron on the bearing ring and the dashed line from the nose.
    let hold: HoldDraw | null = null;
    if (input.holdHeading !== undefined && input.holdHeading >= 0) {
      const b = headingAngle(input.holdHeading), bx = Math.sin(b), by = -Math.cos(b), r = BEARING_RING_PX, px = -by, py = bx;
      const tip = { x: ownS.x + bx * (r - 2), y: ownS.y + by * (r - 2) };
      hold = { chevron: [tip.x + bx * 12 + px * 7, tip.y + by * 12 + py * 7, tip.x, tip.y, tip.x + bx * 12 - px * 7, tip.y + by * 12 - py * 7],
        from: { x: ownS.x + bx * nose, y: ownS.y + by * nose }, to: tip, preview: input.holdPreview === true };
    }
    // Feel-ii §1.3: SLINGSHOT where the path is fastest inside the G 1 ring, above SLINGSHOT_SPEED, with no collision.
    let slingshot: Label | null = null;
    if (input.gravity && !flight.contact && flight.points.length > 1) {
      const r1 = gravityRadius(1, classOf(state, 0).thrust), pl = map.planet, dt = PATH_STRIDE / TICK_HZ;
      let best = -1, at = -1;
      for (let k = 1; k < flight.points.length; k++) {
        const q = flight.points[k]!, pq = flight.points[k - 1]!, v = Math.hypot(q.x - pq.x, q.y - pq.y) / dt;
        if (Math.hypot(q.x - pl.x, q.y - pl.y) < r1 && v > SLINGSHOT_SPEED && v > best) { best = v; at = k; }
      }
      if (at >= 0 && Math.floor((input.t ?? 0) * 2 * SLINGSHOT_HZ) % 2 === 0) { const p = path[at]!; slingshot = { text: 'SLINGSHOT', x: p.x + 10, y: p.y + 6 }; }
    }
    helm = {
      collision, hold, slingshot,
      path, origin: ownS,
      velocity: { x: ownS.x + s.vx * z, y: ownS.y + s.vy * z },   // where the ship would be in 1 s at this speed
      velocityRing: classOf(state, 0).newtonianHelm ? { x: ownS.x + s.vx * z, y: ownS.y + s.vy * z, r: VELOCITY_RING_PX } : null,   // helm round 2 §6.2
      headingFrom: { x: ownS.x + hxs * nose, y: ownS.y + hys * nose }, headingTo: { x: ownS.x + hxs * (nose + 40), y: ownS.y + hys * (nose + 40) },
      thrust: Number.isFinite(input.axes.thrust) ? Math.max(-1, Math.min(1, input.axes.thrust)) : 0, turn: Math.sign(input.axes.turn) || 0,
      ring: z >= BEARING_RING_ZOOM ? ringDraw(ownS.x, ownS.y) : null,
      steer: input.steerTo ? { from: { x: ownS.x, y: ownS.y }, to: { x: input.steerTo.x, y: input.steerTo.y } } : null   // playtest2feedback §6
    };
  }

  // Off-screen arrows: the own ship (distance from the camera centre), and the others (distance from the own ship).
  const arrows: ArrowDraw[] = [];
  const arrow = (target: ArrowTarget, wx: number, wy: number, fromX: number, fromY: number, fade?: number): void => {
    const p = toS(wx, wy), rl = input.reserveLeft ?? 0, rt = input.reserveTop ?? 0;
    let e: { x: number; y: number; angle: number; edge?: 'avoidRight' | 'avoidBottom' } | null = edgePoint(vp, rl, input.reserveRight, p.x, p.y, rt);
    if (input.avoid) e = aroundAvoid(vp, rl, input.reserveRight, rt, input.avoid, p, e);
    if (!e) return;
    // Sensors blip spec §3: every arrow's distance is the exact rounded length, but the blip's is rounded to the nearest
    // 100 and labelled `BLIP ~<n>`, as rough as the circle.
    const len = Math.sqrt((wx - fromX) ** 2 + (wy - fromY) ** 2), distance = target === 'blip' ? Math.round(len / 100) * 100 : Math.round(len);
    const name = target === 'enemy' && input.contacts && state.known[Contact.Enemy] === 0 ? 'CONTACT' : ARROW_NAMES[target];
    arrows.push({ target, x: e.x, y: e.y, angle: e.angle, distance, label: target === 'blip' ? `${name} ~${distance}` : `${name} ${distance}`, ...(fade !== undefined ? { alpha: fade } : {}), ...(e.edge ? { edge: e.edge } : {}) });
  };
  if (input.ships.includes(0)) arrow('ship', own.x, own.y, cam.centreX, cam.centreY);
  const foe = targetOf(state, CREW_SLOT);   // the crew's locked target (engine refactor Decision 15)
  if (input.ships.includes(foe)) { const en = interpolatedShip(state, prev, alpha, foe); arrow('enemy', en.x, en.y, own.x, own.y); }
  // Sensors blip spec §3: the ping. The circle is drawn when its ring crosses the view or its centre is in it (the
  // ghosts' 40 px test would drop a large circle whose centre is just off the view). While the enemy is unseen the scene
  // leaves it out of `ships`, so the 'enemy' arrow above is not built; a centre that is off screen by the helper's own
  // test gets a 'blip' arrow instead, its range from the crew ship.
  let blip: BlipDraw | null = null;
  const ping = input.fog?.blip ?? null;
  if (ping) {
    const c = toS(ping.x, ping.y), r = ping.r * z, fade = 1 - 0.6 * ping.age;
    if (ringCrossesRect(c.x, c.y, r, vp.w, vp.h) || onScreen(ping.x, ping.y, 0)) blip = { x: c.x, y: c.y, r, alpha: fade };
    arrow('blip', ping.x, ping.y, own.x, own.y, fade);
  }
  arrow('planet', map.planet.x, map.planet.y, own.x, own.y);
  const m = missileOf(state, 0);
  if (m) { const mo = input.missilePrev?.[0]; arrow('missile', m.x + (mo?.ox ?? 0), m.y + (mo?.oy ?? 0), own.x, own.y); }   // Net-4a §3.8: with the torpedo's offset
  if (input.spreadArrows) spreadArrows(arrows, vp, input.reserveRight, input.reserveLeft ?? 0, input.reserveTop ?? 0, input.avoid);

  // Sci-1 spec §7.1: the contact marks, the salvage ring and Science's ring, in the duel only.
  let marks: ContactMarkDraw[] | undefined, salvage: SalvageDraw | null = null, lockRing: LockRingDraw | null = null;
  if (input.contacts) {
    marks = [];
    const sc = state.scan, scanOf = (c: number): number | null => (sc.contact === c ? Math.min(1, sc.progress / SCAN_UNITS[sc.level]!) : null);
    const enemy = targetOf(state, CREW_SLOT), ringR = SHIP_RADIUS * 2.2 * drawnScale(z);
    if (state.ships[enemy]?.active && input.ships.includes(enemy)) {
      const b = interpolatedShip(state, prev, alpha, enemy), p = toS(b.x, b.y), unknown = state.known[Contact.Enemy] === 0;
      if (onScreen(b.x, b.y, SHIP_RADIUS * 3)) {
        marks.push({ contact: Contact.Enemy, x: p.x, y: p.y, r: unknown ? 14 : Math.max(14, ringR), unknown, wreck: false, label: null, alert: null, scan: scanOf(Contact.Enemy), designated: state.designated === Contact.Enemy });
        if (input.console === 'science') lockRing = { x: p.x, y: p.y, r: Math.max(18, ringR + 6) };
      }
    }
    const w = derelictPos(state), dr = state.derelict, known = state.known[Contact.Derelict] >= 1;
    if (onScreen(w.x, w.y, 40) && (input.fog?.seen.derelict ?? true)) {   // Engineering spike §10.4: an unseen derelict is a ghost
      const p = toS(w.x, w.y);
      marks.push({ contact: Contact.Derelict, x: p.x, y: p.y, r: 14, unknown: !known, wreck: known, label: known ? `DERELICT ${dr.salvaged ? 'SALVAGED' : LOOT_NAMES[dr.loot] ?? ''}` : null,
        alert: known && dr.trapped && !dr.salvaged ? 'TRAPPED' : null, scan: scanOf(Contact.Derelict), designated: state.designated === Contact.Derelict });
    }
    if (dr.salvage > 0 && !dr.salvaged && input.ships.includes(CREW_SLOT)) salvage = { x: ownS.x, y: ownS.y, r: Math.max(16, ringR), fill: Math.min(1, dr.salvage / SALVAGE_TICKS) };
  }

  // Feel-ii §1.3: the G 0.5 and G 1 rings about the planet, faint, each labelled at its top.
  let gravity: GravityDraw[] | undefined;
  if (input.gravity && input.console === 'helm') {
    const thrust = classOf(state, 0).thrust;
    gravity = GRAVITY_RINGS.flatMap((g) => {
      const r = gravityRadius(g, thrust) * z;
      return ringCrossesRect(pc.x, pc.y, r, vp.w, vp.h) ? [{ x: pc.x, y: pc.y, r, g, label: { text: `G ${g}`, x: pc.x + 4, y: pc.y - r - 14 } }] : [];
    });
  }

  // Spike ii §6.5: the laser's rock target, the torpedo's (the next shot's, else the one in flight) and the hover.
  let rockMarks: RockMarkDraw[] | undefined;
  if (input.contacts) {
    rockMarks = [];
    const sys = state.systems[CREW_SLOT]!, list = rockMarks;
    const mark = (k: number, weapon: 'laser' | 'torpedo', hover: boolean): void => {
      if (k < 0 || !rockAlive(state, k)) return;
      const a = rockAt(state, k);
      if (!onScreen(a.x, a.y, a.r)) return;
      const p = toS(a.x, a.y);
      list.push({ x: p.x, y: p.y, r: Math.max(a.r * z, ROCK_PICK_MIN_PX) + 5, weapon, hover });
    };
    mark(sys.laserRock, 'laser', false);
    mark(sys.torpRock >= 0 ? sys.torpRock : sys.torpRockFlying, 'torpedo', false);
    if (input.rockHover) mark(input.rockHover.rock, input.rockHover.weapon, true);
  }

  // Asteroids-iii §7.2: the Weapons map's rock target (the laser's, else the torpedo's, else the flying torpedo's) and its next 20 s.
  let rockPath: Point[] | undefined;
  if (input.contacts && input.console === 'weapons') {
    const sys = state.systems[CREW_SLOT]!, k = sys.laserRock >= 0 ? sys.laserRock : sys.torpRock >= 0 ? sys.torpRock : sys.torpRockFlying;
    if (k >= 0 && rockAlive(state, k)) rockPath = cachedRockPath(state, k).map((q) => toS(q.x, q.y));
  }

  // Engineering spike §10.4: the sensor range ring and the ghosts of contacts last seen.
  let sensor: CircleDraw | null = null, ghosts: GhostDraw[] = [];
  if (input.fog) {
    const r = input.fog.range * z;
    if (input.ships.includes(CREW_SLOT) && ringCrossesRect(ownS.x, ownS.y, r, vp.w, vp.h)) sensor = { x: ownS.x, y: ownS.y, r };
    ghosts = input.fog.ghosts.flatMap((g) => { if (!onScreen(g.x, g.y, 40)) return []; const p = toS(g.x, g.y); return [{ kind: g.kind, x: p.x, y: p.y, angle: headingAngle(g.h), alpha: g.alpha }]; });
  }
  const units = [...SCALE_STEPS].reverse().find((u) => u * z <= SCALE_BAR_MAX_PX) ?? SCALE_STEPS[0]!;
  return {
    grid: gridDraw(cam, vp, input.mapGrid === 'gravity' ? map.planet : null, dents, input.mapGrid !== 'off'), contours, edge, planet, asteroids, ships, helm, arrows,
    ...(marks ? { marks, salvage, lockRing } : {}),
    ...(gravity ? { gravity } : {}),
    ...(input.fog ? { sensor, ghosts, blip } : {}),
    ...(rockMarks ? { rockMarks } : {}),
    ...(rockPath ? { rockPath } : {}),
    ...(puffs.length > 0 ? { puffs } : {}),
    overlay: { zoomText: `ZOOM ${z.toFixed(2)}`, scaleBar: { px: units * z, units }, snapHint: cam.follow === 'free', paused: input.paused },
    stars: starOffset(cam.centreX, cam.centreY, vp)
  };
}

/** Sensors blip spec §3: where the blip's `?` goes, or null. Only while the circle is drawn and the ping's centre has no
 *  edge arrow: "off screen" is the arrow helper's own test, so the centre gets the `?` or the arrow, never both, and
 *  never neither (a point with no arrow is inside the view, where the circle is always drawn). */
export function blipMark(d: Pick<TacticalDraw, 'blip' | 'arrows'>): BlipDraw | null {
  return d.blip && !d.arrows.some((a) => a.target === 'blip') ? d.blip : null;
}

/** Enemy ship window spec §3: a map click's hit radius in internal px at zoom z, the ships loop's cull radius in screen
 *  px (2 R z, or the drawn rings' 1.9 R drawnScale(z)) with a 16 px floor for the chevron zooms. */
export const PICK_MIN_PX = 16;
export function pickRadius(z: number): number { return Math.max(PICK_MIN_PX, 2 * SHIP_RADIUS * z, 1.9 * SHIP_RADIUS * drawnScale(z)); }

/** Spec §6.2: the ship under a map click, or null. Only slots other than the crew's whose ship is active, each at the
 *  interpolated position and camera the map draws with; the nearest hit wins. Reads no reserves. */
export function pickShip(input: Pick<TacticalModelInput, 'state' | 'prev' | 'alpha' | 'camera' | 'viewport' | 'fog'>, p: Point): number | null {
  const r = pickRadius(input.camera.zoom);
  let best: number | null = null, bestD = Infinity;
  for (let i = 0; i < input.state.ships.length; i++) {
    if (i === CREW_SLOT || !input.state.ships[i]!.active) continue;
    if (input.fog && !input.fog.seen.enemy && i === targetOf(input.state, CREW_SLOT)) continue;   // Engineering spike §10.4: unseen
    const b = interpolatedShip(input.state, input.prev, input.alpha, i), s = worldToScreen(input.camera, input.viewport, b.x, b.y);
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d <= r && d < bestD) { best = i; bestD = d; }
  }
  return best;
}

/** Sci-1 spec §7.2: the contact under a map click, or null: the enemy by pickShip, the derelict at derelictPos within
 *  the same pickRadius; the nearer of the two wins. */
export function pickContact(input: Pick<TacticalModelInput, 'state' | 'prev' | 'alpha' | 'camera' | 'viewport' | 'fog'>, p: Point): 0 | 1 | null {
  const r = pickRadius(input.camera.zoom), slot = pickShip(input, p);
  let best: 0 | 1 | null = null, bestD = Infinity;
  if (slot !== null) {
    const b = interpolatedShip(input.state, input.prev, input.alpha, slot), s = worldToScreen(input.camera, input.viewport, b.x, b.y);
    best = Contact.Enemy; bestD = Math.hypot(s.x - p.x, s.y - p.y);
  }
  const w = derelictPos(input.state), s = worldToScreen(input.camera, input.viewport, w.x, w.y), dd = Math.hypot(s.x - p.x, s.y - p.y);
  if (dd <= r && dd < bestD && (input.fog?.seen.derelict ?? true)) best = Contact.Derelict;   // Engineering spike §10.4: unseen, no pick
  return best;
}

/** Spike ii §6.5: a rock drawn smaller than this (a dot at map zoom) is picked as if it were this big, in internal px. */
export const ROCK_PICK_MIN_PX = 6;
/** Spike ii §6.5: the live rock under a map click: among the rocks whose drawn circle (r · zoom, at least ROCK_PICK_MIN_PX)
 *  holds the point, the nearest centre; ties go to the lowest slot. null when none. */
export function pickRock(input: Pick<TacticalModelInput, 'state' | 'camera' | 'viewport'>, p: Point): number | null {
  let best: number | null = null, bestD = Infinity;
  for (let k = 0, n = rockSlots(input.state); k < n; k++) {
    if (!rockAlive(input.state, k)) continue;
    const a = rockAt(input.state, k), s = worldToScreen(input.camera, input.viewport, a.x, a.y), d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d <= Math.max(a.r * input.camera.zoom, ROCK_PICK_MIN_PX) && d < bestD) { best = k; bestD = d; }
  }
  return best;
}

/** §7.2: the target's predicted path in world units, kept for the tick and rock it was made for (the frames between two ticks reuse it). */
let pathCache: { state: WeakRef<TacticalState>; tick: number; k: number; pts: Point[] } | null = null;   // a WeakRef: the cache never keeps an old state alive
export function cachedRockPath(state: TacticalState, k: number): Point[] {
  if (!pathCache || pathCache.state.deref() !== state || pathCache.tick !== state.tick || pathCache.k !== k) pathCache = { state: new WeakRef(state), tick: state.tick, k, pts: predictRock(state, k, ROCK_PATH_TICKS, ROCK_PATH_EVERY) };
  return pathCache.pts;
}
const shapeCache = new Map<number, number[]>();
/** Asteroids-iii §13.5: rock `index`'s outline spin, a hashed ±0.1 to 0.5 rad/s (drawing only; the cracks turn with it). */
export function asteroidSpin(index: number): number {
  const h = Math.imul((((index + 1) * 2654435761) >>> 0) ^ 0x9e3779b9, 2246822519) >>> 0, f = (h % 10000) / 10000;
  return (h & 1 ? 1 : -1) * (0.1 + 0.4 * f);
}
/** A rough asteroid outline as radius multipliers (9 vertices, 0.72..1.08), seeded by the asteroid's index. Render-only randomness. */
export function asteroidShape(index: number): number[] {
  let out = shapeCache.get(index);
  if (out) return out;
  let h = (index + 1) * 2654435761 >>> 0;
  out = [];
  for (let k = 0; k < 9; k++) { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; out.push(0.72 + ((h % 1000) / 1000) * 0.36); }
  shapeCache.set(index, out);
  return out;
}
/** Asteroids-iii §7.3 (D10): four fixed cracks per rock, revealed by wear and drawn inside the outline. Look pass spec
 *  §2: each is one CRT.faint stroke at CRACK_ALPHA. */
export const CRACK_COUNT = 4, CRACK_INSET = 0.88, CRACK_MIN_PX = 6, CRACK_ALPHA = 0.6;
/** A crack polyline in rock-local units (unit radius; multiply by r and add the centre to draw). */
export type CrackLine = Point[];
const CRACK_TAU = Math.PI * 2, CRACK_DEG = Math.PI / 180;
/** §7.3 step 2: the outline's radius along the ray at `angle`: where the ray meets the polygon edge between the two
 *  neighbouring vertices (never one vertex's multiplier). */
export function outlineRadius(shape: readonly number[], angle: number): number {
  const n = shape.length, a = ((angle % CRACK_TAU) + CRACK_TAU) % CRACK_TAU, k = Math.min(n - 1, Math.floor(a / (CRACK_TAU / n))), k1 = (k + 1) % n;
  const a0 = (k * CRACK_TAU) / n, a1 = ((k + 1) * CRACK_TAU) / n;
  const px = shape[k]! * Math.cos(a0), py = shape[k]! * Math.sin(a0), qx = shape[k1]! * Math.cos(a1), qy = shape[k1]! * Math.sin(a1);
  const ex = qx - px, ey = qy - py, dx = Math.cos(a), dy = Math.sin(a);
  return (px * ey - py * ex) / (dx * ey - dy * ex);
}
/** The crack set's own generator (§7.3 step 1: the asteroidShape hash, salt 17), fresh per rock. */
function crackRandom(index: number): () => number {
  let h = ((((index + 1) * 2654435761) >>> 0) ^ 17) >>> 0;
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; return (h % 100000) / 100000; };
}
/** §7.3 step 3: a point pulled back inside CRACK_INSET of the outline along its own ray. */
function clampInside(shape: readonly number[], x: number, y: number): Point {
  const d = Math.hypot(x, y);
  if (d === 0) return { x, y };
  const lim = CRACK_INSET * outlineRadius(shape, Math.atan2(y, x));
  return d > lim ? { x: (x * lim) / d, y: (y * lim) / d } : { x, y };
}
function lineLength(line: CrackLine): number {
  let t = 0;
  for (let i = 1; i < line.length; i++) t += Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y);
  return t;
}
interface FullCrack { main: CrackLine; branch: CrackLine | null; forkAt: number }
const crackCache = new Map<number, FullCrack[]>();
/** §7.3 steps 1–4: crack i starts at a_i = (i + h)·2π/4 at CRACK_INSET of the outline and runs inward as 4 segments of
 *  0.16–0.22, each aimed at the centre ± 35° and clamped inside after the step; cracks 1 and 3 fork once at the end of
 *  segment 2 into a 2-segment branch of 0.12 per segment at ±40° (the second segment turns a further ±15°). */
function fullCracks(index: number): FullCrack[] {
  const cached = crackCache.get(index);
  if (cached) return cached;
  const shape = asteroidShape(index), rnd = crackRandom(index), h = rnd(), out: FullCrack[] = [];
  for (let i = 0; i < CRACK_COUNT; i++) {
    const a = ((i + h) * CRACK_TAU) / CRACK_COUNT, r0 = CRACK_INSET * outlineRadius(shape, a);
    let p: Point = { x: Math.cos(a) * r0, y: Math.sin(a) * r0 }, dir = a + Math.PI, branch: CrackLine | null = null, forkAt = 0;
    const main: CrackLine = [p];
    for (let s = 0; s < 4; s++) {
      const toCentre = Math.hypot(p.x, p.y) > 1e-9 ? Math.atan2(-p.y, -p.x) : dir;
      dir = toCentre + (rnd() * 2 - 1) * 35 * CRACK_DEG;
      const len = 0.16 + 0.06 * rnd();
      p = clampInside(shape, p.x + Math.cos(dir) * len, p.y + Math.sin(dir) * len);
      main.push(p);
      if (s === 1 && (i === 1 || i === 3)) {
        let q = p, bd = dir + (i === 1 ? 40 : -40) * CRACK_DEG;
        forkAt = lineLength(main);
        branch = [q];
        for (let b = 0; b < 2; b++) {
          if (b === 1) bd += (rnd() * 2 - 1) * 15 * CRACK_DEG;
          q = clampInside(shape, q.x + Math.cos(bd) * 0.12, q.y + Math.sin(bd) * 0.12);
          branch.push(q);
        }
      }
    }
    out.push({ main, branch, forkAt });
  }
  crackCache.set(index, out);
  return out;
}
/** The prefix of `line` of arc length `len`. */
function cutLine(line: CrackLine, len: number): CrackLine {
  const out: CrackLine = [line[0]!];
  let left = len;
  for (let i = 1; i < line.length && left > 0; i++) {
    const a = line[i - 1]!, b = line[i]!, seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg <= left) { out.push(b); left -= seg; continue; }
    const t = left / seg;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    left = 0;
  }
  return out;
}
/** §7.3 step 5: wear (0 whole .. 1) shows ceil(wear · 4) of the fixed cracks, each cut to (0.35 + 0.45 · wear) of its
 *  length; a fork's branch shows once the main cut passes the fork, cut to the same share of its own length. Higher wear
 *  always holds lower wear as a prefix. Rock-local units. */
export function crackPaths(index: number, wear: number): CrackLine[] {
  if (!(wear > 0)) return [];
  const w = Math.min(1, wear), n = Math.ceil(w * CRACK_COUNT), share = 0.35 + 0.45 * w, out: CrackLine[] = [], full = fullCracks(index);
  for (let i = 0; i < n; i++) {
    const c = full[i]!, main = share * lineLength(c.main);
    out.push(cutLine(c.main, main));
    if (c.branch && main > c.forkAt) out.push(cutLine(c.branch, share * lineLength(c.branch)));
  }
  return out;
}
/** One crack stroke in screen px. */
export interface CrackSegDraw { x1: number; y1: number; x2: number; y2: number }
/** §7.3 steps 6–7 with the look pass (spec §2): the screen strokes of a rock's cracks at centre (cx, cy) and screen
 *  radius r, one per cut segment and no highlight; none when r < CRACK_MIN_PX. `spin`: the outline's turn (§13.5). */
export function crackDraw(index: number, wear: number, cx: number, cy: number, r: number, spin = 0): CrackSegDraw[] {
  if (r < CRACK_MIN_PX) return [];
  const cuts: CrackSegDraw[] = [], c = Math.cos(spin), sn = Math.sin(spin);
  for (const line of crackPaths(index, wear)) for (let i = 1; i < line.length; i++) {
    const lx0 = line[i - 1]!.x * c - line[i - 1]!.y * sn, ly0 = line[i - 1]!.x * sn + line[i - 1]!.y * c, lx1 = line[i]!.x * c - line[i]!.y * sn, ly1 = line[i]!.x * sn + line[i]!.y * c;
    const x1 = cx + lx0 * r, y1 = cy + ly0 * r, x2 = cx + lx1 * r, y2 = cy + ly1 * r;
    if (x1 === x2 && y1 === y2) continue;
    cuts.push({ x1, y1, x2, y2 });
  }
  return cuts;
}

// The console map view model (H-1 spec §7, parent §10b). Pure: turns the tactical state, the previous tick's positions,
// the interpolation alpha, the console's camera and the current Helm axes into screen-space draw lists. The Pixi layer
// (tacticalLayer.ts) only draws what this returns. Render code, so it may use any Math (not under the determinism guard).
import { gravityAccel } from '../../sim/tactical/physics';
import { predictFlight } from '../../sim/tactical/predict';
import { derelictPos } from '../../sim/tactical/science';
import { classOf, Contact, CREW_SLOT, missileOf, targetOf, type Axes, type TacticalState } from '../../sim/tactical/state';
import { rockAlive, rockAt, rockHpMax, RockKind, rockSlots } from '../../sim/tactical/rocks';
import { AIM_STEPS, HEADING_COUNT, R_MAP, SALVAGE_TICKS, SCAN_UNITS, SHIP_RADIUS } from '../../sim/tactical/tuning';
import { TICK_HZ } from '../../sim/tuning';
import { visibleWorld, worldToScreen, type Camera, type Follow, type Point, type Viewport } from './camera';
import { hullFor, type HullId } from './hullModel';
import type { FogView, GhostKind } from './fogModel';

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

export interface PrevBody { x: number; y: number; h: number }
export interface Line { x1: number; y1: number; x2: number; y2: number }
export interface Label { text: string; x: number; y: number }
export interface GridDraw { spacing: number; lines: (Line & { major: boolean })[]; columns: Label[]; rows: Label[] }
export interface CircleDraw { x: number; y: number; r: number }
/** Spike ii: `wear` 0 (whole) .. 1 from hp / hpMax, drawn as cracks and a dimmer fill; `streak` (§7 item 3) the screen end of
 *  a moving rock's fading streak behind it, with its alpha. */
export interface AsteroidDraw extends CircleDraw { index: number; dot: boolean; wear?: number; streak?: { x: number; y: number; alpha: number } }
/** Spike ii §7 item 3: rocks faster than STREAK_MIN_SPEED (u/s) streak STREAK_S seconds of their motion, at most STREAK_MAX_U. */
export const STREAK_MIN_SPEED = 20, STREAK_S = 0.25, STREAK_MAX_U = 90;
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
  collision?: CollisionDraw | null; hold?: HoldDraw | null; slingshot?: Label | null }
/** Feel-ii §1.3: a gravity ring about the planet (where its pull is `g` of the crew ship's full thrust) and its label. */
export interface GravityDraw extends CircleDraw { g: number; label: Label }
export type ArrowTarget = 'ship' | 'enemy' | 'planet' | 'missile';
/** `edge`: own ship window spec §3, set only on an arrow placed on the avoid rect's right or bottom side. */
export interface ArrowDraw { target: ArrowTarget; x: number; y: number; angle: number; distance: number; label: string; edge?: 'avoidRight' | 'avoidBottom' }
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
  /** Spike ii §6.5 (only with contacts): the rock brackets. */
  rockMarks?: RockMarkDraw[];
}

export interface TacticalModelInput {
  state: TacticalState;
  /** Each ship's position and continuous heading (heading + headingAcc) at the previous tick. */
  prev: readonly PrevBody[];
  alpha: number;
  camera: Camera;
  viewport: Viewport;
  console: 'helm' | 'weapons' | 'science';
  /** The duel's contacts (Sci-1 spec §7.1): hide an unknown enemy's silhouette and draw the marks. The flight view leaves it off. */
  contacts?: boolean;
  /** Spike ii §6.5: the rock under the pointer while a weapon is picked up (the scene's pickRock), for its hover bracket. */
  rockHover?: { rock: number; weapon: 'laser' | 'torpedo' } | null;
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
  /** Engineering spike §10.4: the fog this frame (the scene's stepFog). The scene leaves the enemy out of `ships` while it
   *  is unseen; the derelict's mark needs `seen.derelict`. Absent (the flight view): no fog. */
  fog?: FogView | null;
  /** Own ship window spec §3: a console window the off-screen arrows go around (OWN_SHIP); absent: none. */
  avoid?: { x: number; y: number; w: number; h: number };
}

/** Radius at which the planet's pull is `accel`, by bisection on the falling side of gravityAccel (startup only). */
export function contourRadius(accel: number): number {
  const pull = (r: number): number => { const [gx, gy] = gravityAccel(r, 0); return Math.sqrt(gx * gx + gy * gy); };
  let lo = 20, hi = R_MAP;   // the pull peaks near ε/√2 ≈ 14 and falls from there
  if (pull(hi) >= accel) return hi;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (pull(mid) > accel) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
const CONTOUR_RADII = CONTOUR_ACCELS.map(contourRadius);
/** Feel-ii §1.3: the fractions of the crew ship's full thrust the two gravity rings mark. */
export const GRAVITY_RINGS: readonly number[] = [0.5, 1];
/** SLINGSHOT shows while the path passes inside the G 1 ring faster than this (u/s), with no collision; it blinks at SLINGSHOT_HZ. */
export const SLINGSHOT_SPEED = 200, SLINGSHOT_HZ = 3;
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
  return { x: p.x + (s.x - p.x) * a, y: p.y + (s.y - p.y) * a, h: p.h + dh * a };
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

function gridDraw(cam: Camera, vp: Viewport): GridDraw {
  const spacing = cam.zoom > GRID_MINOR_ZOOM ? GRID_MINOR : GRID_MAJOR;
  const v = visibleWorld(cam, vp), E = GRID_EXTENT;
  const x0 = Math.max(-E, v.x0), x1 = Math.min(E, v.x1), y0 = Math.max(-E, v.y0), y1 = Math.min(E, v.y1);
  const lines: GridDraw['lines'] = [], columns: Label[] = [], rows: Label[] = [];
  if (x0 > x1 || y0 > y1) return { spacing, lines, columns, rows };
  const sy0 = worldToScreen(cam, vp, 0, y0).y, sy1 = worldToScreen(cam, vp, 0, y1).y;
  const sx0 = worldToScreen(cam, vp, x0, 0).x, sx1 = worldToScreen(cam, vp, x1, 0).x;
  for (let k = Math.ceil((x0 + E) / spacing); -E + k * spacing <= x1; k++) {
    const wx = -E + k * spacing, sx = worldToScreen(cam, vp, wx, 0).x;
    lines.push({ x1: sx, y1: sy0, x2: sx, y2: sy1, major: (wx + E) % GRID_MAJOR === 0 });
  }
  for (let k = Math.ceil((y0 + E) / spacing); -E + k * spacing <= y1; k++) {
    const wy = -E + k * spacing, sy = worldToScreen(cam, vp, 0, wy).y;
    lines.push({ x1: sx0, y1: sy, x2: sx1, y2: sy, major: (wy + E) % GRID_MAJOR === 0 });
  }
  // Labels name the 500-unit squares at every zoom, so a square keeps its name (plan decision 4); each sits in the middle
  // of the square's visible part, along the top and left edges of the screen (or of the grid, when that edge is on screen).
  const n = (2 * E) / GRID_MAJOR, top = Math.max(4, sy0 + 4), left = Math.max(4, sx0 + 4);
  for (let k = 0; k < n; k++) {
    const a = Math.max(x0, -E + k * GRID_MAJOR), b = Math.min(x1, -E + (k + 1) * GRID_MAJOR);
    if (b <= a || (b - a) * cam.zoom < 24) continue;
    columns.push({ text: columnName(k), x: worldToScreen(cam, vp, (a + b) / 2, 0).x, y: top });
  }
  for (let k = 0; k < n; k++) {
    const a = Math.max(y0, -E + k * GRID_MAJOR), b = Math.min(y1, -E + (k + 1) * GRID_MAJOR);
    if (b <= a || (b - a) * cam.zoom < 24) continue;
    rows.push({ text: String(k + 1), x: left, y: worldToScreen(cam, vp, 0, (a + b) / 2).y });
  }
  return { spacing, lines, columns, rows };
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

const ARROW_NAMES: Readonly<Record<ArrowTarget, string>> = { ship: 'SHIP', enemy: 'ENEMY', planet: 'PLANET', missile: 'TORPEDO' };   // homing torpedo spec §3: on screen it is a torpedo

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
    const a = rockAt(state, index), r = a.r * z;
    if (r < DOT_MIN_PX || !onScreen(a.x, a.y, a.r)) continue;
    const p = toS(a.x, a.y), speed = Math.hypot(a.vx, a.vy);
    const tail = a.kind === RockKind.Moving && speed > STREAK_MIN_SPEED ? Math.min(STREAK_MAX_U, speed * STREAK_S) / speed : 0;
    const streak = tail > 0 ? { ...toS(a.x - a.vx * tail, a.y - a.vy * tail), alpha: Math.min(1, (speed - STREAK_MIN_SPEED) / 120) } : null;
    asteroids.push({ index, x: p.x, y: p.y, r, dot: r < ASTEROID_DOT_PX, wear: Math.max(0, Math.min(1, 1 - a.hp / rockHpMax(a.r))), ...(streak ? { streak } : {}) });
  }

  const ships: ShipDraw[] = [];
  for (const i of input.ships) {
    if (input.contacts && i !== CREW_SLOT && i === targetOf(state, CREW_SLOT) && state.known[Contact.Enemy] === 0) continue;   // unknown: a ? mark only
    const b = interpolatedShip(state, prev, alpha, i), s = state.systems[i]!;
    if (!onScreen(b.x, b.y, Math.max(SHIP_RADIUS * 2, (SHIP_RADIUS * 1.9 * drawnScale(z)) / z))) continue;   // the drawn rings reach 1.9 units
    const p = toS(b.x, b.y);
    ships.push({ index: i, x: p.x, y: p.y, angle: headingAngle(b.h), scale: drawnScale(z), chevron: 2 * SHIP_RADIUS * z < SHIP_CHEVRON_PX, crew: i === 0, hull: i === 0 ? input.crewHull ?? hullFor(true) : hullFor(false), rooms: s.rooms, shields: s.shields });
  }

  const own = interpolatedShip(state, prev, alpha, 0), ownS = toS(own.x, own.y);
  let helm: HelmDraw | null = null;
  if (input.console === 'helm' && input.ships.includes(0)) {
    const s = state.ships[0];
    const flight = predictFlight(state, 0, input.axes, Math.round(pathSeconds(z) * 60), PATH_STRIDE), path = flight.points.map((q) => toS(q.x, q.y));
    const a = headingAngle(own.h), hxs = Math.sin(a), hys = -Math.cos(a), nose = SHIP_RADIUS * 1.3 * drawnScale(z) + 4;
    // Feel-ii §1.2: the contact the path stops at, its last segment drawn hot from the point before it.
    let collision: CollisionDraw | null = null;
    if (flight.contact) {
      const p = toS(flight.contact.x, flight.contact.y), from = path.length > 1 ? path[path.length - 2]! : ownS, seconds = flight.contact.tick / TICK_HZ;
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
      headingFrom: { x: ownS.x + hxs * nose, y: ownS.y + hys * nose }, headingTo: { x: ownS.x + hxs * (nose + 40), y: ownS.y + hys * (nose + 40) },
      thrust: Number.isFinite(input.axes.thrust) ? Math.max(-1, Math.min(1, input.axes.thrust)) : 0, turn: Math.sign(input.axes.turn) || 0,
      ring: z >= BEARING_RING_ZOOM ? ringDraw(ownS.x, ownS.y) : null
    };
  }

  // Off-screen arrows: the own ship (distance from the camera centre), and the others (distance from the own ship).
  const arrows: ArrowDraw[] = [];
  const arrow = (target: ArrowTarget, wx: number, wy: number, fromX: number, fromY: number): void => {
    const p = toS(wx, wy), rl = input.reserveLeft ?? 0, rt = input.reserveTop ?? 0;
    let e: { x: number; y: number; angle: number; edge?: 'avoidRight' | 'avoidBottom' } | null = edgePoint(vp, rl, input.reserveRight, p.x, p.y, rt);
    if (input.avoid) e = aroundAvoid(vp, rl, input.reserveRight, rt, input.avoid, p, e);
    if (!e) return;
    const distance = Math.round(Math.sqrt((wx - fromX) ** 2 + (wy - fromY) ** 2));
    arrows.push({ target, x: e.x, y: e.y, angle: e.angle, distance, label: `${target === 'enemy' && input.contacts && state.known[Contact.Enemy] === 0 ? 'CONTACT' : ARROW_NAMES[target]} ${distance}`, ...(e.edge ? { edge: e.edge } : {}) });
  };
  if (input.ships.includes(0)) arrow('ship', own.x, own.y, cam.centreX, cam.centreY);
  const foe = targetOf(state, CREW_SLOT);   // the crew's locked target (engine refactor Decision 15)
  if (input.ships.includes(foe)) { const en = interpolatedShip(state, prev, alpha, foe); arrow('enemy', en.x, en.y, own.x, own.y); }
  arrow('planet', map.planet.x, map.planet.y, own.x, own.y);
  const m = missileOf(state, 0);
  if (m) arrow('missile', m.x, m.y, own.x, own.y);
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

  // Engineering spike §10.4: the sensor range ring and the ghosts of contacts last seen.
  let sensor: CircleDraw | null = null, ghosts: GhostDraw[] = [];
  if (input.fog) {
    const r = input.fog.range * z;
    if (input.ships.includes(CREW_SLOT) && ringCrossesRect(ownS.x, ownS.y, r, vp.w, vp.h)) sensor = { x: ownS.x, y: ownS.y, r };
    ghosts = input.fog.ghosts.flatMap((g) => { if (!onScreen(g.x, g.y, 40)) return []; const p = toS(g.x, g.y); return [{ kind: g.kind, x: p.x, y: p.y, angle: headingAngle(g.h), alpha: g.alpha }]; });
  }
  const units = [...SCALE_STEPS].reverse().find((u) => u * z <= SCALE_BAR_MAX_PX) ?? SCALE_STEPS[0]!;
  return {
    grid: gridDraw(cam, vp), contours, edge, planet, asteroids, ships, helm, arrows,
    ...(marks ? { marks, salvage, lockRing } : {}),
    ...(gravity ? { gravity } : {}),
    ...(input.fog ? { sensor, ghosts } : {}),
    ...(rockMarks ? { rockMarks } : {}),
    overlay: { zoomText: `ZOOM ${z.toFixed(2)}`, scaleBar: { px: units * z, units }, snapHint: cam.follow === 'free', paused: input.paused },
    stars: starOffset(cam.centreX, cam.centreY, vp)
  };
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

const shapeCache = new Map<number, number[]>();
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

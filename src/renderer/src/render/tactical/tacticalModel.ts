// The console map view model (H-1 spec §7, parent §10b). Pure: turns the tactical state, the previous tick's positions,
// the interpolation alpha, the console's camera and the current Helm axes into screen-space draw lists. The Pixi layer
// (tacticalLayer.ts) only draws what this returns. Render code, so it may use any Math (not under the determinism guard).
import { gravityAccel } from '../../sim/tactical/physics';
import { predictPath } from '../../sim/tactical/predict';
import { missileOf, type Axes, type TacticalState } from '../../sim/tactical/state';
import { HEADING_COUNT, R_MAP, SHIP_RADIUS } from '../../sim/tactical/tuning';
import { visibleWorld, worldToScreen, type Camera, type Follow, type Point, type Viewport } from './camera';

/** The grid square's half-size: the smallest multiple of 500 that encloses the map circle (plan decision 4). */
export const GRID_EXTENT = Math.ceil(R_MAP / 500) * 500;
export const GRID_MAJOR = 500, GRID_MINOR = 250, GRID_MINOR_ZOOM = 0.6;
/** Gravity contours (u/s²), strongest first. */
export const CONTOUR_ACCELS: readonly number[] = [40, 10, 3];
/** Below this on-screen radius an asteroid is a dot; below DOT_MIN_PX it is skipped. */
export const ASTEROID_DOT_PX = 2, DOT_MIN_PX = 0.5;
/** Below this many pixels across, a ship is a fixed-size chevron. */
export const SHIP_CHEVRON_PX = 10, CHEVRON_SIZE = 14;
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
export interface AsteroidDraw extends CircleDraw { index: number; dot: boolean }
export interface ShipDraw {
  index: number; x: number; y: number;
  /** Radians clockwise from north (the screen's up). */
  angle: number;
  /** Screen pixels per world unit (the zoom) for the silhouette. */
  scale: number;
  chevron: boolean; crew: boolean;
  rooms: readonly number[]; shields: number;
}
export interface RingDraw { x: number; y: number; r: number; ticks: (Line & { major: boolean })[]; labels: Label[] }
export interface HelmDraw { path: Point[]; origin: Point; velocity: Point; headingFrom: Point; headingTo: Point; thrust: number; turn: number; ring: RingDraw | null }
export type ArrowTarget = 'ship' | 'enemy' | 'planet' | 'missile';
export interface ArrowDraw { target: ArrowTarget; x: number; y: number; angle: number; distance: number; label: string }
export interface OverlayDraw { zoomText: string; scaleBar: { px: number; units: number }; snapHint: boolean; paused: boolean }
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
}

export interface TacticalModelInput {
  state: TacticalState;
  /** Each ship's position and continuous heading (heading + headingAcc) at the previous tick. */
  prev: readonly PrevBody[];
  alpha: number;
  camera: Camera;
  viewport: Viewport;
  console: 'helm' | 'weapons';
  /** The Helm's effective axes the runtime last sent to the sim. */
  axes: Axes;
  /** Ships to draw (the flight view draws only ship 0). The crew ship is index 0. */
  ships: readonly number[];
  paused: boolean;
  /** Screen pixels on the right kept clear of off-screen arrows (the readout panel). */
  reserveRight: number;
  /** Spread crowded off-screen arrows apart (the duel views set it; the flight view keeps H-1a's exact positions). */
  spreadArrows?: boolean;
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
function edgePoint(vp: Viewport, reserveRight: number, x: number, y: number): { x: number; y: number; angle: number } | null {
  const m = ARROW_MARGIN, l = m, t = m, r = vp.w - reserveRight - m, b = vp.h - m;
  if (x >= l && x <= r && y >= t && y <= b) return null;
  const cx = (l + r) / 2, cy = (t + b) / 2, dx = x - cx, dy = y - cy;
  const k = Math.min(dx > 0 ? (r - cx) / dx : dx < 0 ? (l - cx) / dx : Infinity, dy > 0 ? (b - cy) / dy : dy < 0 ? (t - cy) / dy : Infinity);
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dx, -dy) };
}

const ARROW_NAMES: Readonly<Record<ArrowTarget, string>> = { ship: 'SHIP', enemy: 'ENEMY', planet: 'PLANET', missile: 'MISSILE' };

/**
 * Keep arrows on the same edge at least the label gap apart. Each edge's arrows are sorted along it and pushed on, from the
 * end nearer the edge's middle, by the minimum gap from the one before; any overrun past the edge's far end is shifted back.
 * Arrows that already clear each other do not move.
 */
export function spreadArrows(arrows: ArrowDraw[], vp: Viewport, reserveRight: number): void {
  const m = ARROW_MARGIN, top = m, bottom = vp.h - m, right = vp.w - reserveRight - m;
  const groups = new Map<string, { flat: boolean; list: ArrowDraw[] }>();
  for (const a of arrows) {
    const flat = Math.abs(a.y - top) < 0.5 || Math.abs(a.y - bottom) < 0.5, key = flat ? `y${Math.round(a.y)}` : `x${Math.round(a.x)}`;
    const g = groups.get(key) ?? { flat, list: [] };
    g.list.push(a); groups.set(key, g);
  }
  for (const { flat, list } of groups.values()) {
    if (list.length < 2) continue;
    const gap = flat ? ARROW_GAP_TOP : ARROW_GAP_SIDE, lo = flat ? m : top, hi = flat ? right : bottom, mid = (lo + hi) / 2;
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
  map.asteroids.forEach((a, index) => {
    const r = a.r * z;
    if (r < DOT_MIN_PX || !onScreen(a.x, a.y, a.r)) return;
    const p = toS(a.x, a.y);
    asteroids.push({ index, x: p.x, y: p.y, r, dot: r < ASTEROID_DOT_PX });
  });

  const ships: ShipDraw[] = [];
  for (const i of input.ships) {
    const b = interpolatedShip(state, prev, alpha, i), s = state.systems[i]!;
    if (!onScreen(b.x, b.y, SHIP_RADIUS * 2)) continue;
    const p = toS(b.x, b.y);
    ships.push({ index: i, x: p.x, y: p.y, angle: headingAngle(b.h), scale: z, chevron: 2 * SHIP_RADIUS * z < SHIP_CHEVRON_PX, crew: i === 0, rooms: s.rooms, shields: s.shields });
  }

  const own = interpolatedShip(state, prev, alpha, 0), ownS = toS(own.x, own.y);
  let helm: HelmDraw | null = null;
  if (input.console === 'helm' && input.ships.includes(0)) {
    const s = state.ships[0];
    const path = predictPath(state, 0, input.axes, Math.round(pathSeconds(z) * 60), PATH_STRIDE).map((q) => toS(q.x, q.y));
    const a = headingAngle(own.h), hxs = Math.sin(a), hys = -Math.cos(a), nose = SHIP_RADIUS * 1.3 * z + 4;
    helm = {
      path, origin: ownS,
      velocity: { x: ownS.x + s.vx * z, y: ownS.y + s.vy * z },   // where the ship would be in 1 s at this speed
      headingFrom: { x: ownS.x + hxs * nose, y: ownS.y + hys * nose }, headingTo: { x: ownS.x + hxs * (nose + 40), y: ownS.y + hys * (nose + 40) },
      thrust: Math.sign(input.axes.thrust) || 0, turn: Math.sign(input.axes.turn) || 0,
      ring: z >= BEARING_RING_ZOOM ? ringDraw(ownS.x, ownS.y) : null
    };
  }

  // Off-screen arrows: the own ship (distance from the camera centre), and the others (distance from the own ship).
  const arrows: ArrowDraw[] = [];
  const arrow = (target: ArrowTarget, wx: number, wy: number, fromX: number, fromY: number): void => {
    const p = toS(wx, wy), e = edgePoint(vp, input.reserveRight, p.x, p.y);
    if (!e) return;
    const distance = Math.round(Math.sqrt((wx - fromX) ** 2 + (wy - fromY) ** 2));
    arrows.push({ target, x: e.x, y: e.y, angle: e.angle, distance, label: `${ARROW_NAMES[target]} ${distance}` });
  };
  if (input.ships.includes(0)) arrow('ship', own.x, own.y, cam.centreX, cam.centreY);
  if (input.ships.includes(1)) { const en = interpolatedShip(state, prev, alpha, 1); arrow('enemy', en.x, en.y, own.x, own.y); }
  arrow('planet', map.planet.x, map.planet.y, own.x, own.y);
  const m = missileOf(state, 0);
  if (m) arrow('missile', m.x, m.y, own.x, own.y);
  if (input.spreadArrows) spreadArrows(arrows, vp, input.reserveRight);

  const units = [...SCALE_STEPS].reverse().find((u) => u * z <= SCALE_BAR_MAX_PX) ?? SCALE_STEPS[0]!;
  return {
    grid: gridDraw(cam, vp), contours, edge, planet, asteroids, ships, helm, arrows,
    overlay: { zoomText: `ZOOM ${z.toFixed(2)}`, scaleBar: { px: units * z, units }, snapHint: cam.follow === 'free', paused: input.paused },
    stars: starOffset(cam.centreX, cam.centreY, vp)
  };
}

/** The wedge silhouette in ship units (forward f, right s; the nose at +f), split into the three room segments of
 *  parent §5: Weapons (nose), Shields (flanks), Engines (stern). Each is a flat [f, s, f, s, ...] polygon. */
export const WEDGE_NOSE = 1.3, WEDGE_TAIL = -0.9, WEDGE_HALF = 0.85;
function halfWidth(f: number): number { return (WEDGE_HALF * (WEDGE_NOSE - f)) / (WEDGE_NOSE - WEDGE_TAIL); }
export function wedgeSegments(): { room: number; poly: number[] }[] {
  const a = 0.3, b = -0.5, wa = halfWidth(a), wb = halfWidth(b);
  return [
    { room: 0, poly: [WEDGE_NOSE, 0, a, wa, a, -wa] },
    { room: 1, poly: [a, -wa, a, wa, b, wb, b, -wb] },
    { room: 2, poly: [b, -wb, b, wb, WEDGE_TAIL, WEDGE_HALF, WEDGE_TAIL, -WEDGE_HALF] }
  ];
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

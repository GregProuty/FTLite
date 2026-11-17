// The dev flight view's feel panel (H-1 spec §9): the numbers parent §6's feel targets talk about. Pure. The runtime
// records one sample per sim tick; the panel reads the readout every frame.
import { hx, hy } from '../../sim/tactical/direction';
import type { Circle } from '../../sim/tactical/map';
import { gravityAccel } from '../../sim/tactical/physics';
import type { Ship } from '../../sim/tactical/state';
import { HEADING_COUNT } from '../../sim/tactical/tuning';
import { TICK_HZ } from '../../sim/tuning';
import { LINE, PAD } from '../theme';

/** The minimum planet distance is kept over this many ticks (10 s). */
export const FEEL_WINDOW_TICKS = 10 * TICK_HZ;

export interface FeelTracker {
  /** Ring buffer of the planet distance at each of the last FEEL_WINDOW_TICKS ticks. */
  dist: Float64Array; head: number; count: number;
  /** The continuous heading (heading + headingAcc) at the last sample, and the turn rate it gave, in degrees per second. */
  lastH: number | null; turnRate: number;
}

export interface FeelReadout {
  /** u/s. */
  speed: number;
  /** Sideways speed (perpendicular to the heading), u/s, unsigned. */
  skid: number;
  /** Degrees per second, + clockwise. */
  turnRate: number;
  /** Pull at the ship, u/s². */
  gravity: number;
  /** From the planet's centre (parent §6 speaks of r ≈ 150), units. */
  planet: number;
  /** The least `planet` over the last 10 s. */
  minPlanet: number;
}

export function createFeelTracker(): FeelTracker {
  return { dist: new Float64Array(FEEL_WINDOW_TICKS), head: 0, count: 0, lastH: null, turnRate: 0 };
}

export function resetFeel(t: FeelTracker): void { t.head = 0; t.count = 0; t.lastH = null; t.turnRate = 0; }

function planetDistance(s: Ship, planet: Circle): number { return Math.sqrt((s.x - planet.x) ** 2 + (s.y - planet.y) ** 2); }

/** Call once after every sim tick. */
export function recordFeel(t: FeelTracker, s: Ship, planet: Circle): void {
  const h = s.heading + s.headingAcc;
  if (t.lastH !== null) {
    let dh = h - t.lastH;
    dh -= Math.round(dh / HEADING_COUNT) * HEADING_COUNT;
    t.turnRate = (dh * 360 / HEADING_COUNT) * TICK_HZ;
  }
  t.lastH = h;
  t.dist[t.head] = planetDistance(s, planet);
  t.head = (t.head + 1) % FEEL_WINDOW_TICKS;
  t.count = Math.min(FEEL_WINDOW_TICKS, t.count + 1);
}

export function feelReadout(t: FeelTracker, s: Ship, planet: Circle): FeelReadout {
  const px = -hy(s.heading), py = hx(s.heading);
  const [gx, gy] = gravityAccel(s.x - planet.x, s.y - planet.y);
  const here = planetDistance(s, planet);
  let min = here;
  for (let k = 0; k < t.count; k++) min = Math.min(min, t.dist[k]!);
  return {
    speed: Math.sqrt(s.vx * s.vx + s.vy * s.vy), skid: Math.abs(s.vx * px + s.vy * py), turnRate: t.turnRate,
    gravity: Math.sqrt(gx * gx + gy * gy), planet: here, minPlanet: min
  };
}

/** The panel's rows as label and value pairs. */
export function feelRows(r: FeelReadout): [string, string][] {
  return [
    ['SPEED', `${Math.round(r.speed)} u/s`],
    ['SKID', `${Math.round(r.skid)} u/s`],
    ['TURN', `${Math.round(r.turnRate)} deg/s`],
    ['GRAVITY', `${r.gravity.toFixed(1)} u/s2`],
    ['PLANET r', `${Math.round(r.planet)}`],
    ['MIN r 10s', `${Math.round(r.minPlanet)}`]
  ];
}

/** The feel panel box and help (H-1 spec 9), shared by the flight mode (its reserve) and the React FeelPanel. */
export const FEEL_PANEL_W = 250, FEEL_PANEL_MARGIN = 8, FEEL_ROWS = 6, FEEL_HELP_LINE = 14;
export const FEEL_HELP: readonly string[] = ['W/S  THRUST / REVERSE', 'A/D  TURN', 'WHEEL  - =  ZOOM', 'RIGHT DRAG  PAN', 'C  SNAP BACK', 'ESC  PAUSE'];
export const FEEL_PANEL_H = PAD + LINE * (FEEL_ROWS + 1) + PAD + FEEL_HELP.length * FEEL_HELP_LINE + PAD;

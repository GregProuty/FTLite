// The duel's combat draw lists for both console map views (H-1 spec §7 items 6 to 8): missiles with trails, the lock
// marker on the enemy's locked room (both consoles, parent §7a), the Weapons layer (bearing ring, both laser arcs, the
// enemy's bearing and range, the missile's predicted path) and the event effects. Pure, like tacticalModel, which it
// sits beside: the layer draws TacticalDraw and CombatDraw together.
import { laserEligible } from '../../sim/tactical/weapons';
import { LASER_ARC_COS, LASER_RANGE, SHIP_RADIUS } from '../../sim/tactical/tuning';
import { ROOM_NAMES } from '../duel/interiorModel';
import { worldToScreen, type Point } from './camera';
import { interpolatedMissile, type FxState } from './fxModel';
import { predictMissilePath } from './missilePath';
import {
  BEARING_RING_ZOOM, headingAngle, interpolatedShip, ringDraw, SHIP_CHEVRON_PX, wedgeSegments, type Label, type PrevBody, type RingDraw,
  type TacticalModelInput
} from './tacticalModel';

/** The laser arc's half-angle in radians: ±60° (cos 0.5). */
export const ARC_HALF = Math.acos(LASER_ARC_COS);

export interface ArcDraw { x: number; y: number; r: number; /** Radians clockwise from north. */ angle: number; half: number }
export interface WeaponsDraw {
  ownArc: ArcDraw; enemyArc: ArcDraw | null; ring: RingDraw | null;
  /** The enemy's bearing and range from the own ship, and whether the laser would hit now (top centre of the view). */
  info: Label; inArc: boolean;
  /** In missile mode: the missile's predicted path, its first point the drawn glyph position. */
  missilePath: Point[]; missileOrigin: Point | null;
}
export interface LockDraw { x: number; y: number; r: number; room: number; label: Label }
export interface MissileDraw { x: number; y: number; angle: number; crew: boolean; trail: Point[] }
export interface EffectDraw { kind: 'beam' | 'burst' | 'spark'; x1: number; y1: number; x2: number; y2: number; r: number; colour: number; alpha: number }
export interface CombatDraw { weapons: WeaponsDraw | null; lock: LockDraw | null; missiles: MissileDraw[]; effects: EffectDraw[] }

export interface CombatModelInput extends TacticalModelInput {
  /** Each ship's missile at the previous tick (null when none flew). */
  missilePrev: readonly (PrevBody | null)[];
  /** The gunner's effective missile steering the runtime last sent (0 when Weapons is empty). */
  steer: number;
  fx: FxState;
}

/** Bearing in whole degrees, 0 to 359, north 0, clockwise. */
export function bearingDeg(dx: number, dy: number): number {
  const deg = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
  return ((deg % 360) + 360) % 360;
}

/** A room segment's centre in ship units (forward f, right s): the mean of its polygon's vertices. */
export function segmentCentre(room: number): { f: number; s: number } {
  const poly = wedgeSegments()[room]!.poly;
  let f = 0, s = 0;
  for (let i = 0; i < poly.length; i += 2) { f += poly[i]!; s += poly[i + 1]!; }
  return { f: f / (poly.length / 2), s: s / (poly.length / 2) };
}

export function combatModel(input: CombatModelInput): CombatDraw {
  const { state, prev, alpha, camera: cam, viewport: vp } = input, z = cam.zoom;
  const toS = (x: number, y: number): Point => worldToScreen(cam, vp, x, y);
  const own = interpolatedShip(state, prev, alpha, 0), ownS = toS(own.x, own.y);
  const enemy = interpolatedShip(state, prev, alpha, 1), enemyS = toS(enemy.x, enemy.y);
  const onScreen = (p: Point, r: number): boolean => p.x + r >= 0 && p.x - r <= vp.w && p.y + r >= 0 && p.y - r <= vp.h;

  const missiles: MissileDraw[] = [];
  for (let i = 0; i < 2; i++) {
    const m = interpolatedMissile(state, input.missilePrev, alpha, i);
    if (!m) continue;
    const p = toS(m.x, m.y);
    missiles.push({ x: p.x, y: p.y, angle: headingAngle(m.h), crew: i === 0, trail: input.fx.trails[i as 0 | 1].map((q) => toS(q.x, q.y)) });
  }

  // The lock marker sits on the enemy's locked room segment, or on the chevron when the ship is drawn as one.
  let lock: LockDraw | null = null;
  const room = state.ships[0].lock;
  if (onScreen(enemyS, SHIP_RADIUS * 2 * z + 40)) {
    const chevron = 2 * SHIP_RADIUS * z < SHIP_CHEVRON_PX, a = headingAngle(enemy.h), fx = Math.sin(a), fy = -Math.cos(a), rx = -fy, ry = fx;
    const c = chevron ? { f: 0, s: 0 } : segmentCentre(room), k = SHIP_RADIUS * z;
    const x = enemyS.x + (fx * c.f + rx * c.s) * k, y = enemyS.y + (fy * c.f + ry * c.s) * k, r = Math.max(7, k * 0.45);
    lock = { x, y, r, room, label: { text: `LOCK ${ROOM_NAMES[room]}`, x: enemyS.x + Math.max(14, k * 1.6) + 6, y: enemyS.y - 8 } };
  }

  let weapons: WeaponsDraw | null = null;
  if (input.console === 'weapons') {
    const dx = enemy.x - own.x, dy = enemy.y - own.y, range = Math.round(Math.sqrt(dx * dx + dy * dy)), inArc = laserEligible(state, 0, 1);
    const flying = state.missiles[0], drawn = interpolatedMissile(state, input.missilePrev, alpha, 0);
    weapons = {
      ownArc: { x: ownS.x, y: ownS.y, r: LASER_RANGE * z, angle: headingAngle(own.h), half: ARC_HALF },
      enemyArc: input.ships.includes(1) ? { x: enemyS.x, y: enemyS.y, r: LASER_RANGE * z, angle: headingAngle(enemy.h), half: ARC_HALF } : null,
      ring: z >= BEARING_RING_ZOOM ? ringDraw(ownS.x, ownS.y) : null,
      info: { text: `ENEMY BRG ${String(bearingDeg(dx, dy)).padStart(3, '0')}  RNG ${range}  ${inArc ? 'IN ARC' : 'NO SHOT'}`, x: (vp.w - input.reserveRight) / 2, y: 12 },
      inArc,
      missileOrigin: drawn ? toS(drawn.x, drawn.y) : null,
      // The path starts at the drawn (interpolated) glyph and continues through the sim's predicted points.
      missilePath: flying && drawn ? [toS(drawn.x, drawn.y), ...predictMissilePath(state, flying, input.steer).map((q) => toS(q.x, q.y))] : []
    };
  }

  const effects: EffectDraw[] = input.fx.items.map((it) => {
    const k = Math.min(1, it.age / it.life), a = toS(it.x1, it.y1), b = toS(it.x2, it.y2);
    const r = it.kind === 'burst' ? 6 + 30 * k : it.kind === 'spark' ? 4 + 12 * k : 0;
    return { kind: it.kind, x1: a.x, y1: a.y, x2: b.x, y2: b.y, r, colour: it.colour, alpha: 1 - k };
  });
  return { weapons, lock, missiles, effects };
}

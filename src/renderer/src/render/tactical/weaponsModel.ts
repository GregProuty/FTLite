// The duel's combat draw lists for both console map views (H-1 spec §7 items 6 to 8): torpedoes as dots with trails
// (homing torpedo spec §3), the lock marker on the enemy's locked room (both consoles, parent §7a), the Weapons layer
// (bearing ring, both laser arcs, the enemy's bearing and range) and the event effects. Pure, like tacticalModel, which it
// sits beside: the layer draws TacticalDraw and CombatDraw together.
import { targetOf } from '../../sim/tactical/state';
import { laserEligible } from '../../sim/tactical/weapons';
import { LASER_ARC_COS, LASER_RANGE, MISSILE_RADIUS, SHIP_RADIUS } from '../../sim/tactical/tuning';
import { ROOM_NAMES } from '../duel/interiorModel';
import { worldToScreen, type Point } from './camera';
import { interpolatedMissile, type FxState } from './fxModel';
import {
  BEARING_RING_ZOOM, headingAngle, interpolatedShip, drawnScale, ringDraw, SHIP_CHEVRON_PX, type Label, type PrevBody, type RingDraw,
  type TacticalModelInput
} from './tacticalModel';
import { hullFor, roomCentre } from './hullModel';
import { calloutDraws, CHARGE_COLOUR, CHARGE_RING_MIN_PX, CHARGE_RING_RADII, chargePulse, ENEMY_SLOT, enemyCharge, type CalloutDraw } from './hitModel';

/** The laser arc's half-angle in radians: ±60° (cos 0.5). */
export const ARC_HALF = Math.acos(LASER_ARC_COS);

export interface ArcDraw { x: number; y: number; r: number; /** Radians clockwise from north. */ angle: number; half: number }
export interface WeaponsDraw {
  ownArc: ArcDraw; enemyArc: ArcDraw | null; ring: RingDraw | null;
  /** The enemy's bearing and range from the own ship, and whether the laser would hit now (top centre of the view). */
  info: Label; inArc: boolean;
}
export interface LockDraw { x: number; y: number; r: number; room: number; label: Label }
/** A torpedo in flight (homing torpedo spec §3): a filled dot of radius `r` screen px (TORPEDO_DOT_PX or more), the
 *  crew's or the Hunter's, with its short fading trail. */
export interface MissileDraw { x: number; y: number; r: number; crew: boolean; trail: Point[] }
/** A torpedo's dot radius in screen px at any zoom, at least (homing torpedo spec §3). */
export const TORPEDO_DOT_PX = 4;
export interface EffectDraw { kind: 'beam' | 'burst' | 'spark'; x1: number; y1: number; x2: number; y2: number; r: number; colour: number; alpha: number }
/** Duel polish i spec §A: the Hunter's held charge as a ring about its drawn marker, the arc from 12 o'clock clockwise
 *  `fill` of the way round; at a full charge the whole ring at the pulse `alpha` and the label FIRING. */
export interface ChargeDraw { x: number; y: number; r: number; fill: number; full: boolean; alpha: number; colour: number; label: Label }
/** `charge` and `callouts` (duel polish i spec §A, §B) are optional so a hand-built frame may leave them out. */
export interface CombatDraw { weapons: WeaponsDraw | null; lock: LockDraw | null; missiles: MissileDraw[]; effects: EffectDraw[]; charge?: ChargeDraw | null; callouts?: CalloutDraw[] }

/** How far inward of the enemy's edge arrow its off-screen charge label and callouts sit, in screen px. */
const OFFSCREEN_INSET = 120;

export interface CombatModelInput extends TacticalModelInput {
  /** Presentation seconds, for the full charge's pulse (duel polish i spec §A); default 0. */
  t?: number;
  /** The enemy's off-screen edge arrow, when it has one (tacticalModel's arrows): the telegraph and the callouts follow it
   *  while the enemy is off screen, as it usually is at the default zoom (duel polish i spec §A, §B). */
  enemyArrow?: Point | null;
  /** Each ship's missile at the previous tick (null when none flew). */
  missilePrev: readonly (PrevBody | null)[];
  fx: FxState;
}

/** Bearing in whole degrees, 0 to 359, north 0, clockwise. */
export function bearingDeg(dx: number, dy: number): number {
  const deg = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
  return ((deg % 360) + 360) % 360;
}

export function combatModel(input: CombatModelInput): CombatDraw {
  const { state, prev, alpha, camera: cam, viewport: vp } = input, z = cam.zoom;
  const toS = (x: number, y: number): Point => worldToScreen(cam, vp, x, y);
  const own = interpolatedShip(state, prev, alpha, 0), ownS = toS(own.x, own.y);
  const target = targetOf(state, 0), enemy = interpolatedShip(state, prev, alpha, target), enemyS = toS(enemy.x, enemy.y);
  const onScreen = (p: Point, r: number): boolean => p.x + r >= 0 && p.x - r <= vp.w && p.y + r >= 0 && p.y - r <= vp.h;

  const missiles: MissileDraw[] = [];
  for (let i = 0; i < 2; i++) {
    const m = interpolatedMissile(state, input.missilePrev, alpha, i);
    if (!m) continue;
    const p = toS(m.x, m.y);
    missiles.push({ x: p.x, y: p.y, r: Math.max(TORPEDO_DOT_PX, MISSILE_RADIUS * z), crew: i === 0, trail: input.fx.trails[i as 0 | 1].map((q) => toS(q.x, q.y)) });
  }

  // The lock marker sits on the locked room of the enemy's hull (the scout), or on the chevron when the ship is drawn as one.
  let lock: LockDraw | null = null;
  const room = state.systems[0].lock;
  if (onScreen(enemyS, SHIP_RADIUS * 2 * z + 40)) {
    const chevron = 2 * SHIP_RADIUS * z < SHIP_CHEVRON_PX, a = headingAngle(enemy.h), fx = Math.sin(a), fy = -Math.cos(a), rx = -fy, ry = fx;
    const c = chevron ? { f: 0, s: 0 } : roomCentre(hullFor(false), room), k = SHIP_RADIUS * drawnScale(z);
    const x = enemyS.x + (fx * c.f + rx * c.s) * k, y = enemyS.y + (fy * c.f + ry * c.s) * k, r = Math.max(7, k * 0.45);
    lock = { x, y, r, room, label: { text: `LOCK ${ROOM_NAMES[room]}`, x: enemyS.x + Math.max(14, k * 1.6) + 6, y: enemyS.y - 8 } };
  }

  let weapons: WeaponsDraw | null = null;
  if (input.console === 'weapons') {
    const dx = enemy.x - own.x, dy = enemy.y - own.y, range = Math.round(Math.sqrt(dx * dx + dy * dy)), inArc = laserEligible(state, 0, target);
    weapons = {
      ownArc: { x: ownS.x, y: ownS.y, r: LASER_RANGE * z, angle: headingAngle(own.h), half: ARC_HALF },
      enemyArc: input.ships.includes(target) ? { x: enemyS.x, y: enemyS.y, r: LASER_RANGE * z, angle: headingAngle(enemy.h), half: ARC_HALF } : null,
      ring: z >= BEARING_RING_ZOOM ? ringDraw(ownS.x, ownS.y) : null,
      info: { text: `ENEMY BRG ${String(bearingDeg(dx, dy)).padStart(3, '0')}  RNG ${range}  ${inArc ? 'IN ARC' : 'NO SHOT'}`, x: ((input.reserveLeft ?? 0) + vp.w - input.reserveRight) / 2, y: 12 },
      inArc
    };
  }

  const effects: EffectDraw[] = input.fx.items.map((it) => {
    const k = Math.min(1, it.age / it.life), a = toS(it.x1, it.y1), b = toS(it.x2, it.y2);
    const r = it.kind === 'burst' ? 6 + 30 * k : it.kind === 'spark' ? 4 + 12 * k : 0;
    return { kind: it.kind, x1: a.x, y1: a.y, x2: b.x, y2: b.y, r, colour: it.colour, alpha: 1 - k };
  });
  // Duel polish i spec §A, §B: the telegraph ring and the hit callouts, about the Hunter's drawn (interpolated) marker.
  let charge: ChargeDraw | null = null, callouts: CalloutDraw[] = [];
  if (input.ships.includes(ENEMY_SLOT) && state.ships[ENEMY_SLOT]?.active) {
    const hb = interpolatedShip(state, prev, alpha, ENEMY_SLOT), hs = toS(hb.x, hb.y);
    const r = Math.max(CHARGE_RING_MIN_PX, CHARGE_RING_RADII * SHIP_RADIUS * drawnScale(z)), ec = enemyCharge(state);
    const alphaNow = ec?.full ? chargePulse(input.t ?? 0) : 1, label = ec?.full ? 'FIRING' : 'CHARGING';
    if (input.enemyArrow) {   // tacticalModel drew the enemy's edge arrow: the same off-screen test, insets and reserves included (review)
      // Off screen: a small ring about the edge arrow, the label and the callouts inward of it, toward the screen's centre.
      const a = input.enemyArrow, dx = vp.w / 2 - a.x, dy = vp.h / 2 - a.y, n = Math.hypot(dx, dy) || 1, ix = dx / n, iy = dy / n;
      const lx = a.x + ix * OFFSCREEN_INSET, ly = a.y + iy * OFFSCREEN_INSET;
      if (ec) charge = { x: a.x, y: a.y, r: CHARGE_RING_MIN_PX, fill: ec.fill, full: ec.full, alpha: alphaNow, colour: CHARGE_COLOUR, label: { text: label, x: lx, y: ly } };
      callouts = calloutDraws(input.fx.callouts, { x: lx, y: ly - 16 });
    } else if (onScreen(hs, r + 16)) {
      if (ec) charge = { x: hs.x, y: hs.y, r, fill: ec.fill, full: ec.full, alpha: alphaNow, colour: CHARGE_COLOUR, label: { text: label, x: hs.x, y: hs.y - r - 12 } };
      callouts = calloutDraws(input.fx.callouts, { x: hs.x, y: hs.y - r - 26 });   // above the ring's label
    }
  }
  return { weapons, lock, missiles, effects, charge, callouts };
}

// Valkyrn spec §7.4: the minigun's lead pip, Elite Dangerous style. A fixed gun hits a target moving at constant velocity
// when the nose points where the target will be, in the shooter's frame, after the round's flight. Pure: no Pixi; only
// leadPipFor reads a state.
import { DT, HEADING_COUNT } from '../../sim/tactical/tuning';
import { classOf, CREW_SLOT, Outcome, targetOf, type TacticalState } from '../../sim/tactical/state';
import { worldToScreen, type Camera, type Point, type Viewport } from '../tactical/camera';
import { interpolatedShip, type Label, type PrevBody } from '../tactical/tacticalModel';

/** The aim point (x, y) in world units and the round's flight time t in seconds. */
export interface Lead { x: number; y: number; t: number }

/**
 * The lead pip for a round of speed `speed` (relative to the shooter, which adds its own velocity, spec §7.1) fired now from
 * (sx, sy) moving (svx, svy) at a target at (tx, ty) moving (tvx, tvy): the target's place in the shooter's frame after the
 * flight, (tx + (tvx − svx)·t, ty + (tvy − svy)·t), with t the least positive root of |r + v·t| = speed·t. A round fired at
 * it meets the target's world position (tx + tvx·t, ty + tvy·t). Null when there is no positive root (the target outruns
 * the round) or the target sits on the shooter.
 */
export function leadPip(sx: number, sy: number, svx: number, svy: number, tx: number, ty: number, tvx: number, tvy: number, speed: number): Lead | null {
  const rx = tx - sx, ry = ty - sy, vx = tvx - svx, vy = tvy - svy;
  const a = vx * vx + vy * vy - speed * speed, b = 2 * (rx * vx + ry * vy), c = rx * rx + ry * ry;
  let t: number;
  if (Math.abs(a) < 1e-9) { if (b >= 0) return null; t = -c / b; }
  else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const q = Math.sqrt(disc), t1 = (-b - q) / (2 * a), t2 = (-b + q) / (2 * a), lo = Math.min(t1, t2), hi = Math.max(t1, t2);
    t = lo > 0 ? lo : hi;
  }
  if (!(t > 0) || !Number.isFinite(t)) return null;
  return { x: tx + vx * t, y: ty + vy * t, t };
}

/** Ship `i`'s lead pip on its target from the state's bodies (no interpolation): the form the scripted pilot's agreement
 *  test reads (Valkyrn Part iii). Null when the class has no gun, or the target is itself or inactive. */
export function leadPipFor(state: TacticalState, i: number): Lead | null {
  const gun = classOf(state, i).slots.gun, j = targetOf(state, i), s = state.ships[i], t = state.ships[j];
  if (!gun || j === i || !s || !t?.active) return null;
  return leadPip(s.x, s.y, s.vx, s.vy, t.x, t.y, t.vx, t.vy, gun.speed);
}

/** Whether the nose line from (x, y) along heading `h` (a heading index, continuous allowed; 0 north, clockwise) passes
 *  within `r` of (px, py), forward only: the pip's "on target" (spec §7.4). */
export function onTarget(x: number, y: number, h: number, px: number, py: number, r: number): boolean {
  const a = (h / HEADING_COUNT) * Math.PI * 2, fx = Math.sin(a), fy = -Math.cos(a), dx = px - x, dy = py - y;
  if (dx * fx + dy * fy <= 0) return false;
  return Math.abs(dx * fy - dy * fx) <= r;
}

/** The crosshair's arm length and the pip diamond's half-size, in screen px; the OVERHEAT blink; a tracer's length in seconds of flight. */
export const CROSS_PX = 10, PIP_PX = 7, OVERHEAT_BLINK_HZ = 4, TRACER_S = 0.02;

/** Spec §7.4: the crosshair (screen px), the lead pip with the enemy's drawn place (null with no solution or no enemy) and
 *  whether the nose is on it, and the heat bar under the crosshair: its fill 0..1, locked, and its word (HEAT, or OVERHEAT
 *  in the blink's on phase; null in the off phase). */
export interface GunSightDraw {
  cross: Point;
  pip: { x: number; y: number; on: boolean; enemy: Point } | null;
  heat: { x: number; y: number; w: number; fill: number; locked: boolean; label: Label | null };
}

/** The crew ship's gun sight on a map, or null when its class has no gun or the round is decided. */
export function gunSightDraw(i: { state: TacticalState; prev: readonly PrevBody[]; alpha: number; camera: Camera; viewport: Viewport; t?: number }): GunSightDraw | null {
  const st = i.state, gun = classOf(st, CREW_SLOT).slots.gun;
  if (!gun || st.outcome !== Outcome.Running) return null;
  const toS = (x: number, y: number): Point => worldToScreen(i.camera, i.viewport, x, y);
  const own = interpolatedShip(st, i.prev, i.alpha, CREW_SLOT), body = st.ships[CREW_SLOT]!, a = (own.h / HEADING_COUNT) * Math.PI * 2;
  const reach = gun.speed * gun.lifeTicks * DT, cross = toS(own.x + Math.sin(a) * reach, own.y - Math.cos(a) * reach);
  const target = targetOf(st, CREW_SLOT), e = st.ships[target];
  let pip: GunSightDraw['pip'] = null;
  if (e?.active && target !== CREW_SLOT) {
    const eb = interpolatedShip(st, i.prev, i.alpha, target), lead = leadPip(own.x, own.y, body.vx, body.vy, eb.x, eb.y, e.vx, e.vy, gun.speed);
    if (lead) { const p = toS(lead.x, lead.y); pip = { x: p.x, y: p.y, on: onTarget(own.x, own.y, own.h, lead.x, lead.y, classOf(st, target).radius), enemy: toS(eb.x, eb.y) }; }
  }
  const sys = st.systems[CREW_SLOT]!, locked = sys.gunLocked === true, blinkOn = Math.floor((i.t ?? 0) * 2 * OVERHEAT_BLINK_HZ) % 2 === 0;
  const fill = Math.max(0, Math.min(1, sys.gunHeat / gun.heatMax)), w = 40;
  return { cross, pip, heat: { x: cross.x - w / 2, y: cross.y + 14, w, fill, locked, label: locked && !blinkOn ? null : { text: locked ? 'OVERHEAT' : 'HEAT', x: cross.x, y: cross.y + 22 } } };
}

/** The rounds in flight as short tracers (screen px), TRACER_S of flight long, ending at the round. */
export function roundDraws(state: TacticalState, toS: (x: number, y: number) => Point): { x1: number; y1: number; x2: number; y2: number }[] {
  const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const r of state.rounds) if (r.active) { const a = toS(r.x - r.vx * TRACER_S, r.y - r.vy * TRACER_S), b = toS(r.x, r.y); out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }
  return out;
}

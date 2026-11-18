// The duel's combat draw lists for both console map views (H-1 spec §7 items 6 to 8): torpedoes as dots with trails
// (homing torpedo spec §3), the lock marker on the enemy's locked room (both consoles, parent §7a), the torpedo's range
// circle (both consoles, weapons update spec §2), the Weapons layer (bearing ring, both laser arcs, the enemy's bearing
// and range) and the event effects. Pure, like tacticalModel, which it
// sits beside: the layer draws TacticalDraw and CombatDraw together.
import { Contact, Outcome, targetOf } from '../../sim/tactical/state';
import { predictMissile } from '../../sim/tactical/predict';
import { laserEligible, torpedoInRange } from '../../sim/tactical/weapons';
import { LASER_ARC_COS, LASER_RANGE, MISSILE_RADIUS, MISSILE_RANGE, SHIP_RADIUS } from '../../sim/tactical/tuning';
import { ROOM_NAMES } from '../duel/interiorModel';
import { alertSentence, evadeDir, laserSituation, linedUp, type FlightAlert } from '../duel/situationModel';
import { pingDraws, type Ping, type PingDraw } from '../duel/pingModel';
import { CRT } from './crtTheme';
import { FONT_NATIVE, FONT_SIZE, textPx } from '../theme';
import { worldToScreen, type Point } from './camera';
import { rockEffectDraw } from './rockFx';
import { CORE_S, FLOAT_RISE_PX, FLOAT_S, FLOAT_STEP_PX, interpolatedMissile, KILL_S, type FxState } from './fxModel';
import {
  BEARING_RING_ZOOM, headingAngle, interpolatedShip, drawnScale, ringDraw, SHIP_CHEVRON_PX, type Label, type PrevBody, type RingDraw,
  type TacticalModelInput
} from './tacticalModel';
import { HULLS, hullFor, roomCentre } from './hullModel';
import { calloutDraws, CHARGE_COLOUR, CHARGE_RING_MIN_PX, CHARGE_RING_RADII, chargePulse, ENEMY_SLOT, enemyCharge, type CalloutDraw } from './hitModel';

/** The laser arc's half-angle in radians: ±60° (cos 0.5). */
export const ARC_HALF = Math.acos(LASER_ARC_COS);

/** `bright` (Feel-i, console feel spec §2): the enemy is inside the arc and the laser is ready, so the wedge lights up. */
export interface ArcDraw { x: number; y: number; r: number; /** Radians clockwise from north. */ angle: number; half: number; bright?: boolean }
export interface WeaponsDraw {
  ownArc: ArcDraw; enemyArc: ArcDraw | null; ring: RingDraw | null;
  /** The enemy's bearing and range from the own ship and whether the torpedo can reach (weapons update spec §2), as a
   *  small line under the status sentence; `inArc` whether the laser would hit now. */
  info: Label; inArc: boolean; torpedoInRange: boolean;
}
/** Feel-i (console feel spec §1): the status sentence, the same words on every seat, at the top of the map; its ramp colour. */
export interface StatusDraw { label: Label; colour: number }
/** Feel-i (spec §2): the FIRING SOLUTION bracket about the enemy (its marker, or its edge arrow off screen), closing from
 *  wide to `r` as the shot lines up; `bright` while the laser is ready or firing, with the label under it. */
export interface SolutionDraw { x: number; y: number; r: number; alpha: number; bright: boolean; label: Label | null }
/** Feel-i (spec §1): the goal glow, a pulsing ring about the one control that matters (the Helm's enemy edge arrow). */
export interface GoalDraw { x: number; y: number; r: number; alpha: number }
/** A floating damage number (Feel-i spec §3), in screen px with its fade. */
export interface FloatDraw { text: string; x: number; y: number; alpha: number }
/** Weapons update spec §2: the torpedo's range circle about the own ship, radius MISSILE_RANGE · zoom. `lit` (CRT.mid)
 *  on the Weapons map while the target is in range; otherwise, and always on the Helm map, CRT.dim. */
export interface RangeDraw { x: number; y: number; r: number; lit: boolean }
export interface LockDraw { x: number; y: number; r: number; room: number; label: Label }
/** A torpedo in flight (homing torpedo spec §3): a filled dot of radius `r` screen px (TORPEDO_DOT_PX or more), the
 *  crew's or the Hunter's, with its short fading trail. */
export interface MissileDraw { x: number; y: number; r: number; crew: boolean; trail: Point[] }
/** A torpedo's dot radius in screen px at any zoom, at least (homing torpedo spec §3). */
export const TORPEDO_DOT_PX = 4;
/** `width` the stroke (Feel-i: a crew beam 5, else 3); `core` a crew beam's white-hot core while it lasts. A `shard` is
 *  one edge of the destroyed enemy's hull flying apart (x1, y1 to x2, y2). */
export interface EffectDraw { kind: 'beam' | 'burst' | 'spark' | 'flare' | 'pop' | 'boom' | 'shard' | 'chip' | 'speck' | 'shock' | 'core'; x1: number; y1: number; x2: number; y2: number; r: number; colour: number; alpha: number; width?: number; core?: boolean }
/** Duel polish i spec §A: the Hunter's held charge as a ring about its drawn marker, the arc from 12 o'clock clockwise
 *  `fill` of the way round; at a full charge the whole ring at the pulse `alpha` and the label FIRING. */
export interface ChargeDraw { x: number; y: number; r: number; fill: number; full: boolean; alpha: number; colour: number; label: Label }
/** `charge`, `callouts` (duel polish i spec §A, §B) and `torpedoRange` (weapons update spec §2) are optional so a
 *  hand-built frame may leave them out. */
export interface CombatDraw {
  weapons: WeaponsDraw | null; lock: LockDraw | null; missiles: MissileDraw[]; effects: EffectDraw[]; charge?: ChargeDraw | null; callouts?: CalloutDraw[];
  torpedoRange?: RangeDraw | null;
  /** Feel-i: the status sentence (on a console), the Helm's own laser arc, the FIRING SOLUTION bracket, the goal glow and
   *  the floating numbers. */
  status?: StatusDraw | null; helmArc?: ArcDraw | null; solution?: SolutionDraw | null; goal?: GoalDraw | null; floats?: FloatDraw[];
  /** Feel-ii (spec §1.6, §2.7): the enemy torpedo's short predicted path, the Helm's EVADE arrow and the crew pings. */
  torpedoPath?: Point[]; evade?: EvadeDraw | null; pings?: PingDraw[];
}
/** Feel-ii §1.6: the EVADE arrow beside the own ship (its tip, the way it points in radians clockwise from north) and its word. */
export interface EvadeDraw { x: number; y: number; angle: number; label: Label }
/** The enemy torpedo's predicted path: 2 s, a point every 4 ticks. */
export const TORPEDO_PATH_TICKS = 120, TORPEDO_PATH_STRIDE = 4;
/** How far from the own ship (screen px) the EVADE arrow's tip sits. */
export const EVADE_PX = 70;

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
  /** The top row's clear span in screen px (on a console: from the tab strip's end to the side column); the info line,
   *  centred between the reserves, shifts to stay inside it. Absent: centred only. */
  infoBand?: { left: number; right: number };
  /** Feel-i (spec §1): pulse the goal glow on the Helm's enemy edge arrow (the scene stops it once the Helm acts). */
  goal?: boolean;
  /** Whether a present player sits at Weapons (situationModel's gunnerPresent); default true. Without one the laser cannot
   *  fire, so there is no solution: NO GUNNER, no bracket, no bright arc. */
  gunner?: boolean;
  /** Feel-ii §1.2, §1.6: the flight alert that outranks the laser's words (situationModel's flightAlert); absent none. */
  alert?: FlightAlert;
  /** Feel-ii §2.7: the crew pings to show. */
  pings?: readonly Ping[];
}

/** Bearing in whole degrees, 0 to 359, north 0, clockwise. */
export function bearingDeg(dx: number, dy: number): number {
  const deg = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
  return ((deg % 360) + 360) % 360;
}

/** Internal px the info line keeps clear of its band's ends. */
export const INFO_BAND_PAD = 8;
/** Feel-i: the status sentence's top (FONT_SIZE, as the old info line), and the Weapons info line's, stacked under it at
 *  FONT_NATIVE (clear of the sentence's descenders and above the status table's first row at the band's ends). */
export const STATUS_Y = 12, INFO_Y = 44;
/** A top-row label (anchored at its centre) at `y` and text scale `scale`: at `centre`, shifted to stay inside `band`. */
function bandLabel(text: string, centre: number, band: { left: number; right: number } | undefined, y: number, scale: number): Label {
  if (!band) return { text, x: centre, y };
  const half = textPx(text, scale) / 2, lo = band.left + INFO_BAND_PAD + half, hi = band.right - INFO_BAND_PAD - half;
  return { text, x: lo > hi ? (band.left + band.right) / 2 : Math.min(hi, Math.max(lo, centre)), y };
}

/** The Weapons map's info line (FTL targeting fix; Feel-i moved the arc's words into the status sentence): bearing, range
 *  and the torpedo's range state, e.g. `BRG 263  RNG 3987  TORP OUT`. */
export function weaponsInfoText(bearing: number, range: number, torpedoInRange: boolean): string {
  return `BRG ${String(bearing).padStart(3, '0')}  RNG ${range}  TORP ${torpedoInRange ? 'IN' : 'OUT'}`;
}
/** The bracket's closing (Feel-i): it starts SOLUTION_OPEN times wide and closes over SOLUTION_CLOSE_S. */
export const SOLUTION_OPEN = 2.2, SOLUTION_CLOSE_S = 0.25, GOAL_PULSE_HZ = 1.2;
const TONE: Readonly<Record<'hot' | 'main' | 'mid', number>> = { hot: CRT.hot, main: CRT.main, mid: CRT.mid };

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
  if (!(input.contacts && state.known[Contact.Enemy] === 0) && onScreen(enemyS, SHIP_RADIUS * 2 * z + 40)) {   // Sci-1: no lock mark on an unknown contact
    const chevron = 2 * SHIP_RADIUS * z < SHIP_CHEVRON_PX, a = headingAngle(enemy.h), fx = Math.sin(a), fy = -Math.cos(a), rx = -fy, ry = fx;
    const c = chevron ? { f: 0, s: 0 } : roomCentre(hullFor(false), room), k = SHIP_RADIUS * drawnScale(z);
    const x = enemyS.x + (fx * c.f + rx * c.s) * k, y = enemyS.y + (fy * c.f + ry * c.s) * k, r = Math.max(7, k * 0.45);
    lock = { x, y, r, room, label: { text: `LOCK ${ROOM_NAMES[room]}`, x: enemyS.x + Math.max(14, k * 1.6) + 6, y: enemyS.y - 8 } };
  }

  const inRange = torpedoInRange(state, 0);
  const torpedoRange: RangeDraw | null = (input.console === 'weapons' || input.console === 'helm') && input.ships.includes(0)
    ? { x: ownS.x, y: ownS.y, r: MISSILE_RANGE * z, lit: input.console === 'weapons' && inRange } : null;
  // Feel-i (console feel spec §1, §2): the laser's situation drives the sentence, the bright arc and the bracket.
  const situation = laserSituation(state, input.fx.sinceShot, input.gunner ?? true), lined = linedUp(situation), ready = situation.kind === 'solution';
  const centre = ((input.reserveLeft ?? 0) + vp.w - input.reserveRight) / 2;
  const sentence = alertSentence(input.alert ?? null, situation);   // Feel-ii: COLLISION, then TORPEDO INBOUND, then the laser's words
  const status: StatusDraw | null = input.infoBand && sentence.text ? { label: bandLabel(sentence.text, centre, input.infoBand, STATUS_Y, FONT_SIZE / FONT_NATIVE), colour: TONE[sentence.tone] } : null;
  const ownArc: ArcDraw = { x: ownS.x, y: ownS.y, r: LASER_RANGE * z, angle: headingAngle(own.h), half: ARC_HALF, bright: ready };
  let weapons: WeaponsDraw | null = null;
  if (input.console === 'weapons') {
    const dx = enemy.x - own.x, dy = enemy.y - own.y, range = Math.round(Math.sqrt(dx * dx + dy * dy)), inArc = laserEligible(state, 0, target);
    weapons = {
      ownArc,
      enemyArc: input.ships.includes(target) ? { x: enemyS.x, y: enemyS.y, r: LASER_RANGE * z, angle: headingAngle(enemy.h), half: ARC_HALF } : null,
      ring: z >= BEARING_RING_ZOOM ? ringDraw(ownS.x, ownS.y) : null,
      info: bandLabel(weaponsInfoText(bearingDeg(dx, dy), range, inRange), centre, input.infoBand, input.infoBand ? INFO_Y : 12, input.infoBand ? 1 : FONT_SIZE / FONT_NATIVE),
      inArc, torpedoInRange: inRange
    };
  }
  const helmArc: ArcDraw | null = input.console === 'helm' && input.ships.includes(0) ? ownArc : null;   // Feel-i §2: Helm sees the arc it gives
  // The bracket closes about the enemy's drawn marker, or its edge arrow off screen, while the shot is lined up.
  let solution: SolutionDraw | null = null;
  const enemyShown = input.ships.includes(target) && state.ships[target]?.active === true;
  if (lined && input.fx.solutionAge >= 0 && enemyShown && input.console !== 'science' && state.systems[0]!.laserRock < 0) {   // spike ii: no enemy bracket while the laser aims at a rock
    const k = Math.min(1, input.fx.solutionAge / SOLUTION_CLOSE_S), ease = 1 - (1 - k) * (1 - k), base = Math.max(18, SHIP_RADIUS * drawnScale(z) * 2.2);
    const at = input.enemyArrow ?? (onScreen(enemyS, base) ? enemyS : null);
    if (at) {
      const r = (input.enemyArrow ? 18 : base) * (1 + (SOLUTION_OPEN - 1) * (1 - ease));
      const below = at.y + r + 12, ly = below > vp.h - 20 ? at.y - r - 12 : below;   // above the bracket near the bottom edge
      solution = { x: at.x, y: at.y, r, alpha: 0.35 + 0.65 * ease, bright: ready, label: ready && k >= 1 ? { text: 'FIRING SOLUTION', x: at.x, y: ly } : null };
    }
  }
  const goal: GoalDraw | null = input.goal && input.enemyArrow
    ? { x: input.enemyArrow.x, y: input.enemyArrow.y, r: 20, alpha: 0.35 + 0.65 * (0.5 + 0.5 * Math.cos((input.t ?? 0) * 2 * Math.PI * GOAL_PULSE_HZ)) } : null;
  const floats: FloatDraw[] = input.fx.floats.map((f) => {
    const p = toS(f.x, f.y), k = Math.min(1, f.age / FLOAT_S);
    return { text: f.text, x: p.x + 44 + FLOAT_STEP_PX * f.slot, y: p.y - 14 - FLOAT_RISE_PX * k, alpha: 1 - k * k };   // right of the bracket, each in its own column
  });

  const shieldR = SHIP_RADIUS * drawnScale(z) * 1.9;   // the enemy's shield bubble's drawn size (tacticalLayer: 1.6 + 0.25 a layer)
  const effects: EffectDraw[] = input.fx.items.map((it) => {
    const rockDraw = rockEffectDraw(it, toS, z);   // spike ii §7: chips, specks, the shockwave, the core flash, sized bursts
    if (rockDraw) return rockDraw;
    const k = Math.min(1, it.age / it.life), a = toS(it.x1, it.y1), b = toS(it.x2, it.y2);
    if (it.kind === 'beam' && it.crew) {   // Feel-i: thicker, the burst's beams side by side, a white-hot core at first
      const dx = b.x - a.x, dy = b.y - a.y, n = Math.hypot(dx, dy) || 1, off = 3 * (it.side ?? 0), ox = (-dy / n) * off, oy = (dx / n) * off;
      return { kind: 'beam', x1: a.x + ox, y1: a.y + oy, x2: b.x + ox, y2: b.y + oy, r: 0, colour: it.colour, alpha: 1 - k * k, width: 5, core: it.age < CORE_S };
    }
    const r = it.kind === 'burst' ? 6 + 30 * k : it.kind === 'spark' ? 4 + 12 * k : it.kind === 'flare' ? 5 + 22 * k : it.kind === 'pop' ? shieldR * (1 + 0.5 * k)
      : it.kind === 'boom' ? 12 + Math.max(60, SHIP_RADIUS * drawnScale(z) * 6) * k : 0;
    return { kind: it.kind, x1: a.x, y1: a.y, x2: b.x, y2: b.y, r, colour: it.colour, alpha: 1 - k };
  });
  // Feel-i §3: the kill breaks the enemy's hull apart, each outline edge flying out from the centre and spinning.
  const kill = input.fx.kill;
  if (kill && kill.age < KILL_S) {
    const c = toS(kill.x, kill.y), ks = SHIP_RADIUS * drawnScale(z), ang = headingAngle(kill.h), fx = Math.sin(ang), fy = -Math.cos(ang), rx = -fy, ry = fx;
    const o = HULLS[hullFor(false)].outline, n = o.length / 2, spread = 1 + 2.6 * kill.age, k = Math.min(1, kill.age / KILL_S);
    for (let e = 0; e < n; e++) {
      const f1 = o[2 * e]!, s1 = o[2 * e + 1]!, f2 = o[(2 * e + 2) % o.length]!, s2 = o[(2 * e + 3) % o.length]!;
      const mf = (f1 + f2) / 2, ms = (s1 + s2) / 2, spin = (e % 2 === 0 ? 1 : -1) * (1.5 + (e % 3)) * kill.age;
      const cs = Math.cos(spin), sn = Math.sin(spin), end = (f: number, s: number): Point => {
        const df = f - mf, ds = s - ms, pf = mf * spread + df * cs - ds * sn, ps = ms * spread + df * sn + ds * cs;
        return { x: c.x + (fx * pf + rx * ps) * ks, y: c.y + (fy * pf + ry * ps) * ks };
      };
      const p = end(f1, s1), q = end(f2, s2);
      effects.push({ kind: 'shard', x1: p.x, y1: p.y, x2: q.x, y2: q.y, r: 0, colour: CRT.main, alpha: 1 - k });
    }
  }
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
  // Feel-ii §1.6: an enemy torpedo in flight draws its own 2 s path (the sim's flight on a copy), on every console; at the
  // Helm an EVADE arrow points the way to dodge, beside the own ship.
  const torpedoPath = state.outcome === Outcome.Running ? predictMissile(state, target, TORPEDO_PATH_TICKS, TORPEDO_PATH_STRIDE).map((q) => toS(q.x, q.y)) : [];
  let evade: EvadeDraw | null = null;
  const dodge = input.console === 'helm' && input.ships.includes(0) ? evadeDir(state) : null;
  if (dodge) {
    const x = ownS.x + dodge.x * EVADE_PX, y = ownS.y + dodge.y * EVADE_PX;
    evade = { x, y, angle: Math.atan2(dodge.x, -dodge.y), label: { text: 'EVADE', x: x + dodge.x * 30, y: y + dodge.y * 22 } };
  }
  // Feel-ii §2.7: the pings, target pings riding on the enemy's drawn marker while it is shown.
  const pings = pingDraws(input.pings ?? [], toS, enemyShown ? enemyS : null);
  return { weapons, lock, missiles, effects, charge, callouts, torpedoRange, status, helmArc, solution, goal, floats, torpedoPath, evade, pings };
}

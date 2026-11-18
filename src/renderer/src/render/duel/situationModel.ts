// Feel-i (spec 2026-11-17-console-feel-design §1, §2, §3): the crew laser's situation in plain words, the one sentence both
// seats read at the top of their map, the Weapons card's why-not, and whether the shot is lined up (the FIRING SOLUTION
// bracket and the bright arc). Pure reads of the tactical state with the sim's own rules (laserEligible's range, arc and
// line of sight), so the words never disagree with what the laser does. Presentation only.
import { inArc, lineOfSight, sideOf } from '../../sim/tactical/geometry';
import { rockAlive, rockAt } from '../../sim/tactical/rocks';
import { predictFlight, touchesSolid } from '../../sim/tactical/predict';
import { classOf, CREW_SLOT, missileOf, NO_AXES, Outcome, Room, targetOf, type Axes, type TacticalState } from '../../sim/tactical/state';
import type { DuelState } from '../../sim/duel/state';
import { throttleThrust } from '../../sim/duel/throttle';
import { helmTurn } from '../../sim/duel/step';
import { laserEligible, laserFull, laserOffline, torpedoInRange } from '../../sim/tactical/weapons';
import { TICK_HZ } from '../../sim/tuning';

/** Seconds a released shot keeps the solution lit, so a volley that auto-fires the tick it is ready still reads FIRING. */
export const SOLUTION_HOLD_S = 0.6;

/** Whether a present player sits at Weapons (the sim's attendant rule, sim/duel/step.ts): without one the laser neither
 *  charges nor auto-fires (laserFrozen). */
export function gunnerPresent(d: DuelState): boolean {
  const pid = d.interior.stations.occupant[d.weapons]!;
  return pid >= 0 && d.present[pid as 0 | 1];
}

/** The laser's situation, by the sentence's priority: `none` once the round is decided; out of range, out of arc, no line
 *  of sight, Weapons offline; a burst under way or a shot just released (`solution`, the shot is real); no gunner, then a
 *  torpedo in flight holding the laser (`frozen`), each of which stops auto-fire (laserFrozen); then lined up and ready
 *  (`solution`) or `charging`. */
export type LaserSituation =
  | { kind: 'range'; range: number; reach: number; rock?: true }
  | { kind: 'arc'; turn: 'LEFT' | 'RIGHT'; rock?: true }
  | { kind: 'blocked' } | { kind: 'offline' } | { kind: 'frozen' } | { kind: 'nogunner' }
  | { kind: 'solution'; targeted: boolean } | { kind: 'charging'; targeted: boolean }
  | { kind: 'none' };

/** `sinceShot`: seconds since the crew laser's last release on this screen (Infinity when none); `gunner`: whether Weapons
 *  is attended (gunnerPresent). */
export function laserSituation(t: TacticalState, sinceShot = Infinity, gunner = true): LaserSituation {
  if (t.outcome !== Outcome.Running) return { kind: 'none' };   // decided: no sentence, bracket or bright arc behind the end card
  const own = t.ships[CREW_SLOT], sysRock = t.systems[CREW_SLOT];
  if (sysRock.laserRock >= 0 && rockAlive(t, sysRock.laserRock)) {   // spike ii §6.2: the laser aims at its rock target
    const r = rockAt(t, sysRock.laserRock), reach = classOf(t, CREW_SLOT).slots.laser, rx = r.x - own.x, ry = r.y - own.y, surface = Math.sqrt(rx * rx + ry * ry) - r.r;
    if (surface > reach.range) return { kind: 'range', range: Math.round(surface), reach: reach.range, rock: true };
    if (!inArc(own.heading, rx, ry, reach.arcCos)) return { kind: 'arc', turn: (sideOf(own.heading, rx, ry) || 1) > 0 ? 'RIGHT' : 'LEFT', rock: true };
    if (laserOffline(t, CREW_SLOT)) return { kind: 'offline' };
    if (sysRock.laserBurst > 0 || sinceShot < SOLUTION_HOLD_S) return { kind: 'solution', targeted: sysRock.laserTargeted };
    if (!gunner) return { kind: 'nogunner' };
    if (missileOf(t, CREW_SLOT)) return { kind: 'frozen' };
    return laserFull(t, CREW_SLOT) ? { kind: 'solution', targeted: sysRock.laserTargeted } : { kind: 'charging', targeted: sysRock.laserTargeted };
  }
  const me = t.ships[CREW_SLOT], target = targetOf(t, CREW_SLOT), e = t.ships[target], sys = t.systems[CREW_SLOT];
  if (!e || !e.active || target === CREW_SLOT) return { kind: 'none' };
  const laser = classOf(t, CREW_SLOT).slots.laser, dx = e.x - me.x, dy = e.y - me.y, range = Math.round(Math.sqrt(dx * dx + dy * dy));
  if (dx * dx + dy * dy > laser.range * laser.range) return { kind: 'range', range, reach: laser.range };
  if (!inArc(me.heading, dx, dy, laser.arcCos)) return { kind: 'arc', turn: (sideOf(me.heading, dx, dy) || 1) > 0 ? 'RIGHT' : 'LEFT' };
  if (!lineOfSight(t, me.x, me.y, e.x, e.y)) return { kind: 'blocked' };
  if (laserOffline(t, CREW_SLOT)) return { kind: 'offline' };
  const targeted = sys.laserTargeted;
  if (sys.laserBurst > 0 || sinceShot < SOLUTION_HOLD_S) return { kind: 'solution', targeted };   // the burst fires attended or not
  if (!gunner) return { kind: 'nogunner' };
  if (missileOf(t, CREW_SLOT)) return { kind: 'frozen' };
  if (laserFull(t, CREW_SLOT) && laserEligible(t, CREW_SLOT, target)) return { kind: 'solution', targeted };
  return { kind: 'charging', targeted };
}

/** Whether the enemy sits inside the laser's range, arc and line of sight with a gunner aboard Weapons (the bracket
 *  closes; the laser may still charge). No gunner, no bracket. */
export function linedUp(s: LaserSituation): boolean { return s.kind === 'solution' || s.kind === 'charging' || s.kind === 'frozen' || s.kind === 'offline'; }

/** The status sentence (§1), the same on both seats: plain words a crew can say to each other. */
export function statusSentence(s: LaserSituation): string {
  switch (s.kind) {
    case 'range': return s.rock ? `ROCK OUT OF RANGE: CLOSE TO ${s.reach}` : `ENEMY OUT OF RANGE: CLOSE TO ${s.reach}`;
    case 'arc': return s.rock ? `ROCK OUT OF ARC: TURN ${s.turn}` : `ENEMY OUT OF ARC: TURN ${s.turn}`;
    case 'blocked': return 'NO LINE OF SIGHT: CLEAR THE ROCK';
    case 'offline': return 'WEAPONS OFFLINE: REPAIR';
    case 'frozen': return 'LASER HOLDS: TORPEDO FLYING';
    case 'nogunner': return 'NO GUNNER: SIT AT WEAPONS';
    case 'solution': return s.targeted ? 'FIRING SOLUTION' : 'FIRING SOLUTION: PICK A ROOM';
    case 'charging': return 'LASER CHARGING';
    case 'none': return '';
  }
}

/** How loud the sentence is on the ramp: `hot` for the solution, `main` for what Helm must fix, `mid` while charging. */
export function sentenceTone(s: LaserSituation): 'hot' | 'main' | 'mid' {
  return s.kind === 'solution' ? 'hot' : s.kind === 'charging' || s.kind === 'none' ? 'mid' : 'main';
}

/** The LASER card's why-not (§3): what stops the shot, in words, or FIRING; null while it simply charges. Weapons offline
 *  comes first on the card (`offline`, laserOffline): nothing else matters to the gunner until it is repaired. */
export function laserCardReason(s: LaserSituation, offline = false): string | null {
  if (offline) return 'WEAPONS OFFLINE';
  switch (s.kind) {
    case 'range': return `OUT OF RANGE ${s.range}/${s.reach}`;
    case 'arc': return `OUT OF ARC: HELM TURN ${s.turn}`;
    case 'blocked': return 'NO LINE OF SIGHT';
    case 'offline': return 'WEAPONS OFFLINE';
    case 'frozen': return 'HOLDS: TORPEDO FLYING';
    case 'nogunner': return 'NO GUNNER';
    case 'solution': return s.targeted ? 'FIRING' : 'PICK A ROOM TO FIRE';
    default: return null;
  }
}

// Feel-ii (spec 2026-11-18-feel-ii-design §1.2, §1.6, §2.8): the flight alerts above the laser's words, the EVADE side and
// the dead-click reasons. Pure reads with the sim's own rules (predictFlight is the Helm's predicted path, the refusals
// are canCharge's and canLaunch's checks in their order), so the words never disagree with what the sim will do.

/** The status sentence's COLLISION line shows while the predicted contact is under this many seconds away. */
export const COLLISION_WARN_S = 2;
/** The ticks the sentence's collision check predicts (the warning's horizon, whatever the map's zoom). */
export const COLLISION_TICKS = Math.round(COLLISION_WARN_S * TICK_HZ);

/** The Helm's axes as the duel state alone tells them (an online seat away from the Helm sees no held A/D or Space): the
 *  held heading's turn and the throttle's thrust while the Helm is attended, else none (the sim flies no axes then). */
export function stateAxes(d: DuelState): Axes {
  const pid = d.interior.stations.occupant[d.nav]!;
  if (pid < 0 || !d.present[pid as 0 | 1] || d.tactical.outcome !== Outcome.Running) return NO_AXES;
  return { turn: helmTurn(d, { moveX: 0, moveY: 0, interactHeld: false }), thrust: throttleThrust(d.throttle) };
}

/** Seconds until the crew ship's predicted path with `axes` meets a planet or asteroid within `ticks`, or null. */
export function collisionIn(t: TacticalState, axes: Axes, ticks = COLLISION_TICKS): number | null {
  if (t.outcome !== Outcome.Running || !t.ships[CREW_SLOT]?.active) return null;
  const c = predictFlight(t, CREW_SLOT, axes, ticks, ticks).contact;
  return c ? c.tick / TICK_HZ : null;
}

/** The flight alert that outranks the laser's words: a collision inside COLLISION_WARN_S, then an enemy torpedo in flight. */
export type FlightAlert = { kind: 'collision'; seconds: number } | { kind: 'torpedo' } | null;
export function flightAlert(t: TacticalState, axes: Axes): FlightAlert {
  if (t.outcome !== Outcome.Running) return null;
  const s = collisionIn(t, axes);
  if (s !== null && s < COLLISION_WARN_S) return { kind: 'collision', seconds: s };
  return missileOf(t, targetOf(t, CREW_SLOT)) ? { kind: 'torpedo' } : null;
}

/** The sentence with the flight alerts first (Feel-ii §1.2, §1.6): COLLISION, then TORPEDO INBOUND, then the laser's. */
export function alertSentence(alert: FlightAlert, s: LaserSituation): { text: string; tone: 'hot' | 'main' | 'mid' } {
  if (alert?.kind === 'collision') return { text: 'COLLISION: TURN OR BRAKE', tone: 'hot' };
  if (alert?.kind === 'torpedo') return { text: 'TORPEDO INBOUND: EVADE', tone: 'hot' };
  return { text: statusSentence(s), tone: sentenceTone(s) };
}

/** How far ahead (world units) the EVADE side looks for room, in EVADE_STEP steps. */
export const EVADE_LOOK = 600, EVADE_STEP = 50;
/** Feel-ii §1.6: the unit direction the crew ship should dodge an inbound enemy torpedo: perpendicular to its approach (its
 *  velocity relative to the ship, else the line from it to the ship), on the side with more clear room (the distance to the
 *  first planet or asteroid along each side, up to EVADE_LOOK); a tie takes the right of the approach. Null with none
 *  inbound. */
export function evadeDir(t: TacticalState): { x: number; y: number } | null {
  const m = missileOf(t, targetOf(t, CREW_SLOT)), s = t.ships[CREW_SLOT];
  if (!m || !s || t.outcome !== Outcome.Running) return null;
  let ax = m.vx - s.vx, ay = m.vy - s.vy;
  if (Math.hypot(ax, ay) < 1e-6) { ax = s.x - m.x; ay = s.y - m.y; }
  const n = Math.hypot(ax, ay);
  if (n < 1e-6) return null;
  ax /= n; ay /= n;
  const r = classOf(t, CREW_SLOT).radius;
  const room = (dx: number, dy: number): number => {
    for (let k = EVADE_STEP; k <= EVADE_LOOK; k += EVADE_STEP) if (touchesSolid(t, s.x + dx * k, s.y + dy * k, r)) return k;
    return EVADE_LOOK + EVADE_STEP;
  };
  const right = { x: -ay, y: ax }, left = { x: ay, y: -ax };   // screen y is down: (−ay, ax) is the approach's right
  return room(left.x, left.y) > room(right.x, right.y) ? left : right;
}

/** The console controls a refusal can name (the buttons, and their keys). */
export type RefusedControl = 'fire' | 'launch' | 'turn' | 'auto-face' | 'throttle' | 'heading';
/** Feel-ii §2.8: why the sim would refuse a control's command (or do nothing with it), or null when it would act. FIRE is
 *  laserCharge (the gunner, then canCharge: no torpedo flying, then Weapons offline, where it is admitted to no effect);
 *  LAUNCH is missileLaunch (the gunner, then canLaunch's checks in its order: flying, the magazine, Weapons, range); the
 *  Helm's turn, auto-face, throttle and heading fly nothing while Engines are off (level 2). */
export function refusal(d: DuelState, control: RefusedControl): string | null {
  const t = d.tactical, sys = t.systems[CREW_SLOT];
  if (control === 'fire' || control === 'launch') {
    if (!gunnerPresent(d)) return 'NO GUNNER';
    if (missileOf(t, CREW_SLOT)) return 'TORPEDO FLYING';
    if (control === 'fire') return laserOffline(t, CREW_SLOT) ? 'WEAPONS OFFLINE' : null;
    if (sys.magazine <= 0) return 'NO TORPEDOES';
    if (sys.rooms[Room.Weapons] >= 2) return 'WEAPONS OFFLINE';
    return torpedoInRange(t, CREW_SLOT) ? null : 'OUT OF RANGE';
  }
  return sys.rooms[Room.Engines] >= 2 ? 'ENGINES OFFLINE' : null;
}

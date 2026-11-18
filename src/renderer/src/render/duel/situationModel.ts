// Feel-i (spec 2026-11-17-console-feel-design §1, §2, §3): the crew laser's situation in plain words, the one sentence both
// seats read at the top of their map, the Weapons card's why-not, and whether the shot is lined up (the FIRING SOLUTION
// bracket and the bright arc). Pure reads of the tactical state with the sim's own rules (laserEligible's range, arc and
// line of sight), so the words never disagree with what the laser does. Presentation only.
import { inArc, lineOfSight, sideOf } from '../../sim/tactical/geometry';
import { classOf, CREW_SLOT, missileOf, Outcome, targetOf, type TacticalState } from '../../sim/tactical/state';
import type { DuelState } from '../../sim/duel/state';
import { laserEligible, laserFull, laserOffline } from '../../sim/tactical/weapons';

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
  | { kind: 'range'; range: number; reach: number }
  | { kind: 'arc'; turn: 'LEFT' | 'RIGHT' }
  | { kind: 'blocked' } | { kind: 'offline' } | { kind: 'frozen' } | { kind: 'nogunner' }
  | { kind: 'solution'; targeted: boolean } | { kind: 'charging'; targeted: boolean }
  | { kind: 'none' };

/** `sinceShot`: seconds since the crew laser's last release on this screen (Infinity when none); `gunner`: whether Weapons
 *  is attended (gunnerPresent). */
export function laserSituation(t: TacticalState, sinceShot = Infinity, gunner = true): LaserSituation {
  if (t.outcome !== Outcome.Running) return { kind: 'none' };   // decided: no sentence, bracket or bright arc behind the end card
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
    case 'range': return `ENEMY OUT OF RANGE: CLOSE TO ${s.reach}`;
    case 'arc': return `ENEMY OUT OF ARC: TURN ${s.turn}`;
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

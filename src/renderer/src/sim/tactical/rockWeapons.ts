// Spike ii §4.1, §6.2 (asteroids-iii §5.3: the push capped at 0.25 · v_esc(ρ); a rail is freed first) (docs/superpowers/specs/2026-11-18-asteroids-ii-design.md): the laser and rocks. A rock target is
// on target when its centre is inside the laser's arc and its surface within range. The shot's line runs to the rock's
// centre and firstBlocker decides what it meets: the planet (a miss), another rock (an accident) or the target. A shot
// that meets a rock pushes it LASER_ROCK_PUSH along the line (Δv = J / m, waking a static rock), then does LASER_ROCK_DAMAGE.
import { inArc } from './geometry';
import { escapeSpeed } from './rails';
import { hitRock, pushRock } from './rockBreak';
import { firstBlocker, rockAlive, rockAt, rockMassOf } from './rocks';
import { LASER_PUSH_CAP, LASER_ROCK_DAMAGE, LASER_ROCK_PUSH } from './rockTuning';
import { classOf, type TacticalState } from './state';

/** §6.2: whether rock k is alive with its centre in ship i's laser arc and its surface within the laser's range. */
export function rockOnTarget(state: TacticalState, i: number, k: number): boolean {
  if (k < 0 || !rockAlive(state, k)) return false;
  const a = state.ships[i]!, r = rockAt(state, k), laser = classOf(state, i).slots.laser, dx = r.x - a.x, dy = r.y - a.y;
  if (!laser) return false;   // Valkyrn spec §6.1: a class without a laser
  return Math.sqrt(dx * dx + dy * dy) - r.r <= laser.range && inArc(a.heading, dx, dy, laser.arcCos);
}

/** §6.2: what the line from ship i to rock k's centre meets first, with the impact point: rock −1 the planet, else a rock
 *  slot (k, or one in the way); null when nothing (the line ends inside k, so only a gone k gives null). */
export function rockShotLine(state: TacticalState, i: number, k: number): { rock: number; x: number; y: number } | null {
  const a = state.ships[i]!, c = rockAt(state, k), f = firstBlocker(state, a.x, a.y, c.x, c.y);
  if (!f) return null;
  return { rock: f.rock, x: a.x + (c.x - a.x) * f.t, y: a.y + (c.y - a.y) * f.t };
}

/** §4.1: ship i's laser shot meets rock k at (x, y): push first, then damage (a fan break along the line at hp ≤ 0). */
export function laserStrikesRock(state: TacticalState, i: number, k: number, x: number, y: number): void {
  const a = state.ships[i]!, dx = x - a.x, dy = y - a.y, d = Math.sqrt(dx * dx + dy * dy), ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : -1;
  const r = rockAt(state, k), j = Math.min(LASER_ROCK_PUSH / rockMassOf(state, k), LASER_PUSH_CAP * escapeSpeed(Math.sqrt(r.x * r.x + r.y * r.y)));   // §5.3: capped
  pushRock(state, k, ux * j, uy * j);
  hitRock(state, k, LASER_ROCK_DAMAGE, ux, uy, 'laser', i);
}

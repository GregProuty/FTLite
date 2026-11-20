// Spike ii §4.2 (asteroids-iii §5.3: the push capped at 0.5 · v_esc(ρ)) (docs/superpowers/specs/2026-11-18-asteroids-ii-design.md): a torpedo that touches a rock detonates. The
// rocks whose nearest cell's surface lies within BLAST_RADIUS of the blast point are listed once, ascending, before
// anything changes; then the blast event, the touched rock's shatter at its cell nearest the blast (whatever its hp), each
// listed rock in order (skipping any slot now born or gone: push first, then damage, a cut through its nearest cell along
// the blast-to-cell line), then every active ship in the radius is pushed away. The caller ends the torpedo with cause 'asteroid'.
import { escapeSpeed } from './rails';
import { breakRock, hitRock, pushRock } from './rockBreak';
import { rockAlive, rockAt, rockMassOf, rocksNear } from './rocks';
import { rockNearestCell, rockSurfaceDistance, type NearCell } from './rockShape';
import { BLAST_PUSH, BLAST_PUSH_CAP, BLAST_RADIUS, BLAST_ROCK_DAMAGE_MAX, BLAST_ROCK_DAMAGE_MIN, BLAST_SHIP_PUSH } from './rockTuning';
import { classOf, type TacticalState } from './state';

/** §4.2: the fall-off for a surface distance d: 1 − d / BLAST_RADIUS inside the radius, 0 at and beyond it. */
export function blastFall(d: number): number { return d < BLAST_RADIUS ? 1 - d / BLAST_RADIUS : 0; }

const cell: NearCell = { x: 0, y: 0, d: 0, r: 0 };   // detonateTorpedo's nearest-cell scratch
const blastNear: number[] = [];   // detonateTorpedo's rocksNear scratch (its loop only reads; the breaks come after it)
/** §4.2: ship `owner`'s torpedo at (x, y), velocity (mvx, mvy), touched rock `rock`. */
export function detonateTorpedo(s: TacticalState, owner: number, x: number, y: number, mvx: number, mvy: number, rock: number): void {
  const near: number[] = [];
  const nn = rocksNear(s, x, y, BLAST_RADIUS, blastNear);   // taken once, ascending, before the direct hit's pieces exist
  for (let ii = 0; ii < nn; ii++) {
    const k = blastNear[ii]!;
    if (k === rock || !rockAlive(s, k) || s.rockBorn[k] === 1) continue;
    if (rockSurfaceDistance(s, k, x, y) < BLAST_RADIUS) near.push(k);   // asteroids-iv spec §6: to the nearest cell's surface
  }
  s.rockBlasts++;
  s.events.push({ kind: 'rock', what: 'blast', by: 'torpedo', rock, x, y, r: BLAST_RADIUS, vx: mvx, vy: mvy, ship: owner });
  const t = rockAt(s, rock);
  rockNearestCell(s, rock, x, y, cell);   // §10a 5: the shatter's point is the struck cell's centre
  breakRock(s, rock, cell.x, cell.y, mvx - t.vx, mvy - t.vy, 'torpedo', owner, 'shatter');
  for (const k of near) {
    if (!rockAlive(s, k) || s.rockBorn[k] === 1) continue;   // evicted, or reused for a piece of this blast
    const a = rockAt(s, k), dx = a.x - x, dy = a.y - y, dist = Math.sqrt(dx * dx + dy * dy);
    rockNearestCell(s, k, x, y, cell);
    const cx = cell.x, cy = cell.y;
    const fall = blastFall(Math.max(0, cell.d - cell.r)), ux = dist > 0 ? dx / dist : 0, uy = dist > 0 ? dy / dist : -1, dv = Math.min((BLAST_PUSH * fall) / rockMassOf(s, k), BLAST_PUSH_CAP * escapeSpeed(Math.sqrt(a.x * a.x + a.y * a.y)));
    pushRock(s, k, ux * dv, uy * dv);
    hitRock(s, k, BLAST_ROCK_DAMAGE_MIN + (BLAST_ROCK_DAMAGE_MAX - BLAST_ROCK_DAMAGE_MIN) * fall, cx, cy, cx - x, cy - y, 'torpedo', owner);   // spec §5.2: a cut through its nearest cell, away from the blast
  }
  s.ships.forEach((ship, i) => {
    if (!ship.active) return;
    const dx = ship.x - x, dy = ship.y - y, dist = Math.sqrt(dx * dx + dy * dy), fall = blastFall(Math.max(0, dist - classOf(s, i).radius));
    if (fall <= 0) return;
    const ux = dist > 0 ? dx / dist : 0, uy = dist > 0 ? dy / dist : -1;
    ship.vx += ux * BLAST_SHIP_PUSH * fall; ship.vy += uy * BLAST_SHIP_PUSH * fall;
  });
}

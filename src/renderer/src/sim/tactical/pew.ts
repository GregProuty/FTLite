// Pew pew (spec 2026-11-18-pew-pew-weapons-design §1, §4; W-1): the crew Cutter's and the Hunter's skill-shot gun, on a
// class whose pew slot is not null. Its charge is ticks on the systems record: a third of the bar per rechargeTicks, shots
// thirds, a round spending one; it refills every tick, attended or not, whatever the Weapons damage (spec §6 decision 4).
// The aim is a fine heading (AIM_STEPS to the turn: a heading index times HEADING_COUNT plus its fraction), clamped in
// that space into ±arcSteps about the heading at the moment of firing. A round leaves the nose at the round speed along
// the aim, ignoring the ship's velocity, into the shared pool tactical.pew (gun.ts placeRound's pick). firePew runs from
// applyWeaponsInput (before anything moves); stepPew (Task 3) after the gun rounds. Only + − × ÷ and sqrt.
import type { PewDef } from './defs';
import { dirBetween, hx, hy } from './direction';
import { queryGrid } from './grid';
import { placeRound, segmentEntry } from './gun';
import { interceptTime, nearestHeading } from './lead';
import { shootDown } from './missiles';
import { classOf, emptyRound, type TacticalState } from './state';
import { AIM_STEPS, DT, HEADING_COUNT } from './tuning';

/** A full charge in ticks: every third stored. */
export function pewFull(def: PewDef): number { return def.shots * def.rechargeTicks; }

/** Whether ship i's pew holds at least one full third (a round can fire); never for a class without the pew. */
export function pewReady(state: TacticalState, i: number): boolean {
  const def = classOf(state, i).slots.pew;
  return def !== null && state.systems[i]!.pewCharge >= def.rechargeTicks;
}

/** A pewFire command's aim (spec §4): a heading index 0..255 and its fraction aimAcc 0..255, both integers. */
export function validAim(aim: unknown, aimAcc: unknown): boolean {
  return typeof aim === 'number' && typeof aimAcc === 'number' && Number.isInteger(aim) && Number.isInteger(aimAcc)
    && aim >= 0 && aim < HEADING_COUNT && aimAcc >= 0 && aimAcc < HEADING_COUNT;
}

/** The fine aim `aim` clamped into ±arcSteps about heading index `heading` (spec §1), in fine heading space: the signed
 *  difference d = ((aim − heading·256 + 1.5·AIM_STEPS) mod AIM_STEPS) − AIM_STEPS/2, clamped, added back and wrapped.
 *  Integers in, an integer 0..AIM_STEPS − 1 out. */
export function clampAim(heading: number, aim: number, arcSteps: number): number {
  const base = heading * HEADING_COUNT, d = ((aim - base + AIM_STEPS + AIM_STEPS / 2) % AIM_STEPS) - AIM_STEPS / 2;
  const c = d > arcSteps ? arcSteps : d < -arcSteps ? -arcSteps : d;
  return (base + c + AIM_STEPS) % AIM_STEPS;
}

/** The unit direction of fine aim `aim`, between its two heading table entries. */
export function aimDir(aim: number): [number, number] {
  return dirBetween(Math.floor(aim / HEADING_COUNT), (aim % HEADING_COUNT) / HEADING_COUNT);
}

/** Ship i's muzzle: its centre plus the nose offset along its heading. */
export function pewMuzzle(state: TacticalState, i: number): { x: number; y: number } {
  const s = state.ships[i]!, f = classOf(state, i).slots.pew?.muzzleForward ?? 0;
  return { x: s.x + hx(s.heading) * f, y: s.y + hy(s.heading) * f };
}

/** Fire ship i's pew along fine aim `aim` (spec §1): with the pew, a valid aim (an integer 0..AIM_STEPS − 1) and at least
 *  a third stored, a round leaves the muzzle at the round speed along the clamped aim, a third is spent, the shot is
 *  counted and a pewFire event pushed; returns whether it fired. */
export function firePew(state: TacticalState, i: number, aim: number): boolean {
  const def = classOf(state, i).slots.pew, s = state.systems[i]!;
  if (!def || !Number.isInteger(aim) || aim < 0 || aim >= AIM_STEPS || s.pewCharge < def.rechargeTicks) return false;
  const [ux, uy] = aimDir(clampAim(state.ships[i]!.heading, aim, def.arcSteps)), m = pewMuzzle(state, i);
  placeRound(state, { x: m.x, y: m.y, vx: ux * def.speed, vy: uy * def.speed, age: 0, owner: i }, state.pew);
  s.pewCharge -= def.rechargeTicks; s.pewShots++;
  state.events.push({ kind: 'pewFire', ship: i, x: m.x, y: m.y });
  return true;
}

/** One tick of ship i's pew recharge (spec §1): one tick of charge while below full, every tick. */
export function tickPew(state: TacticalState, i: number): void {
  const def = classOf(state, i).slots.pew, s = state.systems[i]!;
  if (def && s.pewCharge < pewFull(def)) s.pewCharge++;
}

/** Owner's pew round hit ship k at (x, y) (spec §1): with a shield layer up it strips one (the shield clock and the gun's
 *  wear go to 0, as any strip); else it costs the owner's pew hull. Never a room level. The owner counts the hit; a pewHit
 *  event marks it. */
function pewHit(state: TacticalState, owner: number, k: number, x: number, y: number): void {
  const def = classOf(state, owner).slots.pew, t = state.systems[k]!;
  if (!def) return;
  state.systems[owner]!.pewHits++;
  const stripped = t.shields > 0;
  if (stripped) { t.shields--; t.shieldClock = 0; t.gunWear = 0; }
  else t.hull = Math.max(0, t.hull - def.hull);
  state.events.push({ kind: 'pewHit', ship: k, owner, stripped, hull: !stripped, x, y });
}

/**
 * Every pew round in flight, in pool order (spec §1): it flies straight one tick (no gravity, no drag; it also moves on its
 * spawn tick) and ages; its segment from the old to the new position is swept (gun.ts segmentEntry) against the asteroids,
 * the planet, every torpedo in flight that another ship owns (its post-move position) and every other active ship (its
 * post-move circle). The smallest entry wins; on a tie the earlier of rock, planet, torpedo, ship (strict <, in that order).
 * A torpedo is shot down (missiles.ts shootDown), a ship takes pewHit at the entry point, a rock or the planet only stops
 * it. A round that hit anything, or reached its life, ends; an ended entry holds zeros. Never its own ship or torpedo.
 */
export function stepPew(state: TacticalState): void {
  for (const r of state.pew) {
    if (!r.active) continue;
    const ox = r.x, oy = r.y, life = classOf(state, r.owner).slots.pew?.lifeTicks ?? 0;
    r.x += r.vx * DT; r.y += r.vy * DT; r.age++;
    let best = 2, hit: 'none' | 'solid' | 'torpedo' | 'ship' = 'none', k = -1;   // entry parameters are at most 1
    const half = Math.max(Math.abs(r.x - ox), Math.abs(r.y - oy)) / 2;
    for (const a of queryGrid(state.grid, (ox + r.x) / 2, (oy + r.y) / 2, half)) {
      const rock = state.map.asteroids[a]!, t = segmentEntry(ox, oy, r.x, r.y, rock.x, rock.y, rock.r);
      if (t >= 0 && t < best) { best = t; hit = 'solid'; }
    }
    const p = state.map.planet, tp = segmentEntry(ox, oy, r.x, r.y, p.x, p.y, p.r);
    if (tp >= 0 && tp < best) { best = tp; hit = 'solid'; }
    for (const m of state.missiles) {
      if (!m.active || m.owner === r.owner) continue;
      const t = segmentEntry(ox, oy, r.x, r.y, m.x, m.y, classOf(state, m.owner).slots.missile.radius);
      if (t >= 0 && t < best) { best = t; hit = 'torpedo'; k = m.owner; }
    }
    for (let j = 0; j < state.ships.length; j++) {   // a loop, not forEach: TypeScript would narrow `hit` past a closure's assignment
      const s = state.ships[j]!;
      if (!s.active || j === r.owner) continue;
      const t = segmentEntry(ox, oy, r.x, r.y, s.x, s.y, classOf(state, j).radius);
      if (t >= 0 && t < best) { best = t; hit = 'ship'; k = j; }
    }
    if (hit === 'torpedo') shootDown(state, k);
    else if (hit === 'ship') pewHit(state, r.owner, k, ox + (r.x - ox) * best, oy + (r.y - oy) * best);
    if (hit !== 'none' || r.age >= life) Object.assign(r, emptyRound());
  }
}

/** W-1 (pew pew spec §1): ship i's lead on a target at (tx, ty) moving at (tvx, tvy): the fine aim (a whole heading index ×
 *  HEADING_COUNT) from its muzzle to where a round fired now meets the target holding its velocity. A pew round does not
 *  inherit the ship's velocity, so the target's own velocity is used. −1 without the pew or an intercept. */
export function pewLead(state: TacticalState, i: number, tx: number, ty: number, tvx: number, tvy: number): number {
  const def = classOf(state, i).slots.pew;
  if (!def) return -1;
  const m = pewMuzzle(state, i), rx = tx - m.x, ry = ty - m.y, t = interceptTime(rx, ry, tvx, tvy, def.speed);
  if (t < 0) return -1;
  const h = nearestHeading(rx + tvx * t, ry + tvy * t);
  return h < 0 ? -1 : h * HEADING_COUNT;
}

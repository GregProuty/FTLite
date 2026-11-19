// The gun (Valkyrn spec 2026-11-18-valkyrn-solo-ship-design §7.1, §7.2): a fixed minigun on a class whose gun slot is
// not null. tickGun runs from applyWeaponsInput every tick, before anything moves (where the laser fires): it cools the
// heat and counts the cooldown down, then fires a round from the pre-move pose while the trigger is held at an attended
// Weapons station. Rounds live in the fixed pool tactical.rounds. stepRounds moves the rounds after the ships fly and
// contacts resolve and sweeps each as a segment (spec §7.2). Only + − × ÷ and sqrt (the determinism guard).
import type { GunDef } from './defs';
import { hx, hy } from './direction';
import { rockAt, rocksNear } from './rocks';
import { classOf, emptyRound, Room, type GunRound, type TacticalState } from './state';
import { DT } from './tuning';
import type { ShipInput } from './weapons';

/** Put a round in the pool (spec §7.2): the lowest free entry, else the active round with the highest age, the lowest
 *  index on a tie. Returns its entry. */
export function placeRound(state: TacticalState, r: Omit<GunRound, 'active'>): GunRound {
  let k = state.rounds.findIndex((e) => !e.active);
  if (k < 0) { k = 0; for (let j = 1; j < state.rounds.length; j++) if (state.rounds[j]!.age > state.rounds[k]!.age) k = j; }
  const e = state.rounds[k]!;
  Object.assign(e, { x: r.x, y: r.y, vx: r.vx, vy: r.vy, age: r.age, owner: r.owner, active: true });
  return e;
}

/** One round from ship i's next muzzle: `muzzleForward` ahead of the centre and `muzzleLateral` to starboard (90°
 *  clockwise of the nose, (−hy, hx)) or port, at `speed` along the nose plus the ship's velocity; the muzzles alternate,
 *  the cooldown restarts, and the heat rises, locking the gun when it reaches heatMax. */
function fireRound(state: TacticalState, i: number, g: GunDef): void {
  const ship = state.ships[i]!, s = state.systems[i]!, h0 = hx(ship.heading), h1 = hy(ship.heading), side = s.gunMuzzle === 0 ? 1 : -1;
  placeRound(state, {
    x: ship.x + h0 * g.muzzleForward - h1 * g.muzzleLateral * side, y: ship.y + h1 * g.muzzleForward + h0 * g.muzzleLateral * side,
    vx: ship.vx + h0 * g.speed, vy: ship.vy + h1 * g.speed, age: 0, owner: i
  });
  state.events.push({ kind: 'gunFire', ship: i, muzzle: s.gunMuzzle });
  s.gunMuzzle = 1 - s.gunMuzzle; s.gunCooldown = g.intervalTicks; s.gunShots++;
  s.gunHeat = Math.min(g.heatMax, s.gunHeat + g.heatPerShot);
  if (s.gunHeat >= g.heatMax) s.gunLocked = true;
}

/**
 * One tick of ship i's gun (spec §7.1), every tick whether or not anyone is at Weapons: the heat cools by `cool` (by
 * `coolLocked` while locked; both halved while Weapons is damaged, Decision 7) and a locked gun unlocks at 0; the
 * cooldown counts down; then a round fires when the trigger is held at an attended Weapons station, the gun is not
 * locked, Weapons is below level 2 and the cooldown is 0. A class without a gun does nothing.
 */
export function tickGun(state: TacticalState, i: number, input: ShipInput): void {
  const g = classOf(state, i).slots.gun;
  if (g === null) return;
  const s = state.systems[i]!, cool = s.gunLocked ? g.coolLocked : g.cool;
  s.gunHeat = Math.max(0, s.gunHeat - (s.rooms[Room.Weapons] >= 1 ? cool / 2 : cool));
  if (s.gunLocked && s.gunHeat === 0) s.gunLocked = false;
  if (s.gunCooldown > 0) s.gunCooldown--;
  if (!input.weapons || !input.gunHeld || s.gunLocked || s.rooms[Room.Weapons] >= 2 || s.gunCooldown > 0) return;
  fireRound(state, i, g);
}

/** The entry parameter t in [0, 1] of the segment (ox, oy) → (nx, ny) into the circle at (cx, cy) of radius r: 0 when
 *  it starts inside, −1 when it misses. */
function segmentEntry(ox: number, oy: number, nx: number, ny: number, cx: number, cy: number, r: number): number {
  const fx = ox - cx, fy = oy - cy, c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const ex = nx - ox, ey = ny - oy, a = ex * ex + ey * ey;
  if (a === 0) return -1;
  const b = fx * ex + fy * ey, disc = b * b - a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : -1;
}

/** The point of the infinite line through (ox, oy) and (nx, ny) closest to (cx, cy). */
function closest(ox: number, oy: number, nx: number, ny: number, cx: number, cy: number): [number, number] {
  const ex = nx - ox, ey = ny - oy, len2 = ex * ex + ey * ey, t = len2 > 0 ? ((cx - ox) * ex + (cy - oy) * ey) / len2 : 0;
  return [ox + ex * t, oy + ey * t];
}

/**
 * The Room a round on the line (ox, oy) → (nx, ny) strikes on ship `target` (spec §7.2): the closest approach of that
 * infinite line to the target's centre (the middle of the chord it cuts, so aim decides it, not where it crossed the
 * edge), projected on the target's nose axis, p. p > r/3 Weapons, p < −r/3 Engines, else Shields (exactly ±r/3 is
 * Shields). Reads the target as it stands: stepRounds calls it after the tick's flight, so the post-move centre and
 * heading count.
 */
export function gunRoomOf(state: TacticalState, target: number, ox: number, oy: number, nx: number, ny: number): 0 | 1 | 2 {
  const s = state.ships[target]!, [px, py] = closest(ox, oy, nx, ny, s.x, s.y), third = classOf(state, target).radius / 3;
  const p = (px - s.x) * hx(s.heading) + (py - s.y) * hy(s.heading);
  return p > third ? Room.Weapons : p < -third ? Room.Engines : Room.Shields;
}

/** Owner's round on (ox, oy) → (nx, ny) hit ship k (spec §7.2). Shielded: one wear toward a layer; at hitsPerLayer the
 *  layer goes (shieldClock 0) and the wear is 0. Unshielded: one hull wear (every hitsPerHull, hull −1) and one wear on
 *  the struck Room (every hitsPerLevel, its level +1 to 2; at level 2 its wear stays 0). The owner counts the hit; a
 *  gunHit event marks the closest-approach point, and `level` says whether it raised the struck Room's level. */
function gunHit(state: TacticalState, owner: number, k: number, ox: number, oy: number, nx: number, ny: number): void {
  const g = classOf(state, owner).slots.gun, t = state.systems[k]!, b = state.ships[k]!;
  if (!g) return;
  const [x, y] = closest(ox, oy, nx, ny, b.x, b.y);
  state.systems[owner]!.gunHits++;
  if (t.shields > 0) {
    const stripped = ++t.gunWear >= g.hitsPerLayer;
    if (stripped) { t.shields--; t.shieldClock = 0; t.gunWear = 0; }
    state.events.push({ kind: 'gunHit', ship: k, room: -1, stripped, hull: false, level: false, x, y });
    return;
  }
  const room = gunRoomOf(state, k, ox, oy, nx, ny);
  const hull = ++t.gunHull >= g.hitsPerHull;   // this hit takes a hull point (spec §7.3: only it is the terminal cause gun)
  if (hull) { t.hull = Math.max(0, t.hull - 1); t.gunHull = 0; }
  let level = false;   // this hit raised the Room's level (the view's ROOM HIT / OFFLINE callout)
  if (t.rooms[room] < 2) { if (++t.gunRoomWear[room] >= g.hitsPerLevel) { t.rooms[room]++; t.gunRoomWear[room] = 0; level = true; } }
  else t.gunRoomWear[room] = 0;
  state.events.push({ kind: 'gunHit', ship: k, room, stripped: false, hull, level, x, y });
}

/**
 * Every round in flight, in pool order (spec §7.2): it flies straight one tick (no gravity, no drag; it also moves on
 * its spawn tick) and ages; its segment from the old to the new position is swept against every other active ship's
 * circle (as it stands after this tick's flight), the live rocks and the planet; the first contact along the segment ends
 * it (ties: ship, then rocks by ascending slot, then the planet; a ship contact is a hit). A round reaching its gun's life
 * ends. An ended round's entry holds zeros. Never its own ship.
 * Merge with asteroids-ii (spike ii §8 as-built, Valkyrn spec §12): the rocks are the live pool `state.rocks` as it
 * stands when this runs (after stepRocks moved them this tick), found with rocksNear as the laser's firstBlocker does,
 * and like it a piece born this tick is not in the way. A round that meets a rock is absorbed: it ends and the rock is
 * untouched (no push, no wear, no event).
 */
export function stepRounds(state: TacticalState): void {
  for (const r of state.rounds) {
    if (!r.active) continue;
    const ox = r.x, oy = r.y, life = classOf(state, r.owner).slots.gun?.lifeTicks ?? 0;
    r.x += r.vx * DT; r.y += r.vy * DT; r.age++;
    let best = 2, ship = -1;   // entry parameters are at most 1
    state.ships.forEach((s, k) => {
      if (!s.active || k === r.owner) return;
      const t = segmentEntry(ox, oy, r.x, r.y, s.x, s.y, classOf(state, k).radius);
      if (t >= 0 && t < best) { best = t; ship = k; }
    });
    const half = Math.max(Math.abs(r.x - ox), Math.abs(r.y - oy)) / 2;
    for (const k of rocksNear(state, (ox + r.x) / 2, (oy + r.y) / 2, half)) {
      if (state.rockBorn[k] === 1) continue;   // as firstBlocker: a piece made earlier this tick is not in the way
      const a = rockAt(state, k), t = segmentEntry(ox, oy, r.x, r.y, a.x, a.y, a.r);
      if (t >= 0 && t < best) { best = t; ship = -1; }
    }
    const p = state.map.planet, tp = segmentEntry(ox, oy, r.x, r.y, p.x, p.y, p.r);
    if (tp >= 0 && tp < best) { best = tp; ship = -1; }
    if (ship >= 0) gunHit(state, r.owner, ship, ox, oy, r.x, r.y);
    if (best <= 1 || r.age >= life) Object.assign(r, emptyRound());
  }
}

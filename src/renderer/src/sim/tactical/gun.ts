// The gun (Valkyrn spec 2026-11-18-valkyrn-solo-ship-design §7.1, §7.2): a fixed minigun on a class whose gun slot is
// not null. tickGun runs from applyWeaponsInput every tick, before anything moves (where the laser fires): it cools the
// heat and counts the cooldown down, then fires a round from the pre-move pose while the trigger is held at an attended
// Weapons station. Rounds live in the fixed pool tactical.rounds. stepRounds moves the rounds after the ships fly and
// contacts resolve and sweeps each as a segment (spec §7.2). Only + − × ÷ and sqrt (the determinism guard).
import type { GunDef, GunRockDef } from './defs';
import { roomLevel, weaponBars, WeaponSlot } from './bars';
import { dirBetween, hx, hy } from './direction';
import { hitRock, pushRock } from './rockBreak';
import { rockEntry, rockMassOf, rocksNear } from './rocks';
import { classOf, CREW_SLOT, emptyRound, handControl, Room, roundRoom, type GunRound, type TacticalState } from './state';
import { interceptTime, nearestHeading } from './lead';
import { AIM_STEPS, DT, GUN_AUTO_HEAT_STOP, HEADING_COUNT } from './tuning';
import type { ShipInput } from './weapons';

/** Put a round in a pool (spec §7.2; W-1: the gun's `state.rounds` by default, or the pew's `state.pew`): the lowest free
 *  entry, else the active round with the highest age, the lowest index on a tie. Returns its entry. W-4 amendment §3.3:
 *  `room` the round's tag (absent 0, none). */
export function placeRound(state: TacticalState, r: Omit<GunRound, 'active' | 'room'> & { room?: number }, pool: GunRound[] = state.rounds): GunRound {
  let k = pool.findIndex((e) => !e.active);
  if (k < 0) { k = 0; for (let j = 1; j < pool.length; j++) if (pool[j]!.age > pool[k]!.age) k = j; }
  const e = pool[k]!;
  Object.assign(e, { x: r.x, y: r.y, vx: r.vx, vy: r.vy, age: r.age, owner: r.owner, active: true, room: r.room ?? 0 });   // W-4 amendment §3.3: a recycled entry takes the new round's tag (none unless given)
  return e;
}

/** W-4 spec §2, §4.4: ship i's gun interval now: a turret gun's table row by its trimmed slot-1 bars (0: no round), else
 *  its class's intervalTicks. `manual`: the autocannon is in hand this tick (handControl, the caller's), read when a round fires. */
export function gunInterval(state: TacticalState, i: number, manual = false): number {
  const g = classOf(state, i).slots.gun;
  if (!g) return 0;
  if (g.intervalByBars === null) return g.intervalTicks;
  return g.intervalByBars[manual ? 1 : 0]![weaponBars(state.systems[i]!, WeaponSlot.Autocannon)] ?? 0;   // W-4 spec §4.4: MAN's row for the gun in hand (W-4b)
}
/** W-4 spec §3.2, §5: ship i's turret gun's world aim, a fine aim 0..AIM_STEPS − 1: the nose plus gunTurret (W-4 spec §3.2). */
export function gunAimFine(state: TacticalState, i: number): number {
  return (((state.ships[i]!.heading * HEADING_COUNT + state.systems[i]!.gunTurret) % AIM_STEPS) + AIM_STEPS) % AIM_STEPS;   // turret.ts turretWorldAim's formula (no import: turret.ts imports this file)
}
/** W-4 spec §4.2: ship i's autocannon lead on a target at (tx, ty) moving at (tvx, tvy): the fine aim (a whole heading
 *  index × HEADING_COUNT) from the nose point between its muzzles to where a round fired now meets the target holding its
 *  velocity. A gun round inherits the ship's velocity (fireRound), so the velocity relative to ship i is used. −1 without a
 *  gun, without an intercept, or when the intercept comes after the round's life (lifeTicks · DT, in seconds as
 *  interceptTime's). */
export function gunLead(state: TacticalState, i: number, tx: number, ty: number, tvx: number, tvy: number): number {
  const g = classOf(state, i).slots.gun;
  if (!g) return -1;
  const s = state.ships[i]!, mx = s.x + hx(s.heading) * g.muzzleForward, my = s.y + hy(s.heading) * g.muzzleForward;
  const rx = tx - mx, ry = ty - my, vx = tvx - s.vx, vy = tvy - s.vy, t = interceptTime(rx, ry, vx, vy, g.speed);
  if (t < 0 || t > g.lifeTicks * DT) return -1;   // no intercept, or one the round would not live to reach
  const h = nearestHeading(rx + vx * t, ry + vy * t);
  return h < 0 ? -1 : h * HEADING_COUNT;
}

/** One round from ship i's next muzzle: `muzzleForward` ahead of the centre and `muzzleLateral` to starboard (90°
 *  clockwise of the nose, (−hy, hx)) or port, at `speed` along the nose plus the ship's velocity; the muzzles alternate,
 *  the cooldown restarts, and the heat rises, locking the gun when it reaches heatMax. W-4 amendment §3.3: `room` tags the
 *  round (the autocannon in hand: its ship's lock + 1). */
function fireRound(state: TacticalState, i: number, g: GunDef, manual = false, room = 0): void {
  const ship = state.ships[i]!, s = state.systems[i]!, h0 = hx(ship.heading), h1 = hy(ship.heading), side = s.gunMuzzle === 0 ? 1 : -1;
  // W-4 spec §5: the muzzles stay on the hull (the nose frame); a turret gun's round flies along its aim (pew.ts aimDir's
  // arithmetic), the Valkyrn's along the nose as before.
  const a = g.turret === null ? 0 : gunAimFine(state, i), [ux, uy] = g.turret === null ? [h0, h1] : dirBetween(Math.floor(a / HEADING_COUNT), (a % HEADING_COUNT) / HEADING_COUNT);
  placeRound(state, {
    x: ship.x + h0 * g.muzzleForward - h1 * g.muzzleLateral * side, y: ship.y + h1 * g.muzzleForward + h0 * g.muzzleLateral * side,
    vx: ship.vx + ux * g.speed, vy: ship.vy + uy * g.speed, age: 0, owner: i, room
  });
  state.events.push({ kind: 'gunFire', ship: i, muzzle: s.gunMuzzle });
  s.gunMuzzle = 1 - s.gunMuzzle; s.gunCooldown = g.turret === null ? g.intervalTicks : gunInterval(state, i, manual); s.gunShots++;
  s.gunHeat = Math.min(g.heatMax, s.gunHeat + g.heatPerShot);
  if (s.gunHeat >= g.heatMax) s.gunLocked = true;
}

/**
 * One tick of ship i's gun (spec §7.1), every tick whether or not anyone is at Weapons: the heat cools by `cool` (by
 * `coolLocked` while locked; both halved while Weapons is damaged, Decision 7) and a locked gun unlocks at 0; the
 * cooldown counts down; then a round fires when the trigger is held at an attended Weapons station, the gun is not
 * locked, Weapons is below level 2 and the cooldown is 0. A class without a gun does nothing. W-4 spec §5: a turret gun's
 * interval is gunInterval (its bars), and it fires nothing on 0 bars. W-4 spec §4.3: a turret gun in hand fires on the
 * trigger, an AUTO-driven one on `auto` (on solution and hostile) below GUN_AUTO_HEAT_STOP.
 */
export function tickGun(state: TacticalState, i: number, input: ShipInput, auto = false): void {
  const g = classOf(state, i).slots.gun;
  if (g === null) return;
  const s = state.systems[i]!, cool = s.gunLocked ? g.coolLocked : g.cool;
  s.gunHeat = Math.max(0, s.gunHeat - (roomLevel(s, Room.Weapons) >= 1 ? cool / 2 : cool));   // hacking spike: roomLevel
  if (s.gunLocked && s.gunHeat === 0) s.gunLocked = false;
  if (s.gunCooldown > 0) s.gunCooldown--;
  if (!input.weapons || s.gunLocked || roomLevel(s, Room.Weapons) >= 2 || s.gunCooldown > 0) return;
  if (g.turret === null) { if (input.gunHeld) fireRound(state, i, g); return; }   // the Valkyrn: its trigger, as before
  const hand = handControl(state, i, input.weaponSel, WeaponSlot.Autocannon);   // W-4 spec §3.4: in hand (its own switch on MAN, and selected), else AUTO-driven
  if (gunInterval(state, i, hand) === 0) return;   // W-4 spec §5: a turret gun on 0 bars fires nothing
  // W-4 spec §4.3, §5: in hand it fires on the held trigger (the step sets it only with the autocannon selected); AUTO-driven
  // (on AUTO, or on MAN but not selected: owner 2026-11-19) it fires on solution once hostile (`auto`, applyWeaponsInput) while
  // below the 80 % heat stop, so it never locks; no hysteresis. A held trigger does nothing to an AUTO-driven gun.
  if (hand ? input.gunHeld : auto && s.gunHeat < GUN_AUTO_HEAT_STOP) fireRound(state, i, g, hand, hand ? s.lock + 1 : 0);   // W-4 amendment §3.3: a round fired by hand carries the target room; an AUTO-driven gun's carries none
}

/** W-1: shared with the pew's rounds (pew.ts). The entry parameter t in [0, 1] of the segment (ox, oy) → (nx, ny) into the circle at (cx, cy) of radius r: 0 when
 *  it starts inside, −1 when it misses. */
export function segmentEntry(ox: number, oy: number, nx: number, ny: number, cx: number, cy: number, r: number): number {
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
 *  a Room (every hitsPerLevel, its level +1 to 2; at level 2 its wear stays 0): W-4 amendment §3.4, a turret gun wears the
 *  round's tagged room (`tag`; none for an untagged round), the Valkyrn's gun (no turret) the Room under the round
 *  (gunRoomOf). The owner counts the hit; a gunHit event marks the closest-approach point, and `level` says whether it
 *  raised that Room's level. */
function gunHit(state: TacticalState, owner: number, k: number, ox: number, oy: number, nx: number, ny: number, tag = 0): void {
  const g = classOf(state, owner).slots.gun, t = state.systems[k]!, b = state.ships[k]!;
  if (!g) return;
  const [x, y] = closest(ox, oy, nx, ny, b.x, b.y);
  state.systems[owner]!.gunHits++;
  if (t.shields > 0) {
    // W-4 spec §5.2: the crew's autocannon (weakHitsPerLayer set) on the weak frequency takes a layer in 4; the threshold is the moment's.
    const perLayer = owner === CREW_SLOT && g.weakHitsPerLayer !== null && state.systems[owner]!.freq === state.weakFreq ? g.weakHitsPerLayer : g.hitsPerLayer;
    const stripped = ++t.gunWear >= perLayer;
    if (stripped) { t.shields--; t.shieldClock = 0; t.gunWear = 0; }
    state.events.push({ kind: 'gunHit', ship: k, room: -1, stripped, hull: false, level: false, x, y });
    return;
  }
  // W-4 amendment §3.4: a turret gun's round wears the room it was fired at (its tag, wherever on the ship it lands), and an
  // untagged one (AUTO's) wears no room: room −1, level false. The Valkyrn's gun (no turret) keeps the room under the round.
  const room = g.turret === null ? gunRoomOf(state, k, ox, oy, nx, ny) : roundRoom(tag);
  const hull = ++t.gunHull >= g.hitsPerHull;   // this hit takes a hull point (spec §7.3: only it is the terminal cause gun)
  if (hull) { t.hull = Math.max(0, t.hull - 1); t.gunHull = 0; }
  let level = false;   // this hit raised the Room's level (the view's ROOM HIT / OFFLINE callout)
  if (room !== -1) {
    if (t.rooms[room] < 2) { if (++t.gunRoomWear[room] >= g.hitsPerLevel) { t.rooms[room]++; t.gunRoomWear[room] = 0; level = true; } }
    else t.gunRoomWear[room] = 0;
  }
  state.events.push({ kind: 'gunHit', ship: k, room, stripped: false, hull, level, x, y });
}

/** W-4 spec §5.1: owner's round on (ox, oy) -> (nx, ny) meets rock k first: push it pushPerRound / m along the round's
 *  segment (waking a static rock), then wear it 1 / roundsPerHp hp (a `hit` event by 'gun', rockHits + 1, a cut along
 *  the round through the point it struck (the segment's entry parameter t) at 0 hp, the owner's rocksBroken), as the
 *  laser's laserStrikesRock does: push first, then damage. */
function roundStrikesRock(state: TacticalState, owner: number, k: number, ox: number, oy: number, nx: number, ny: number, t: number, rd: GunRockDef): void {
  const dx = nx - ox, dy = ny - oy, d = Math.sqrt(dx * dx + dy * dy), ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : -1;
  const j = rd.pushPerRound / rockMassOf(state, k);
  pushRock(state, k, ux * j, uy * j);
  hitRock(state, k, 1 / rd.roundsPerHp, ox + dx * t, oy + dy * t, ux, uy, 'gun', owner);
}

const roundNear: number[] = [];   // stepRounds rocksNear scratch (the loop body never re-enters it)
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
 * W-4 spec §5.1: a round of a gun with `rock` (the autocannon) that meets a rock first wears and pushes it
 * (roundStrikesRock); the Valkyrn's (rock null) is absorbed as before. The ties are unchanged: a ship wins, then rocks
 * by slot, then the planet.
 */
export function stepRounds(state: TacticalState): void {
  for (const r of state.rounds) {
    if (!r.active) continue;
    const ox = r.x, oy = r.y, g = classOf(state, r.owner).slots.gun, life = g?.lifeTicks ?? 0;
    r.x += r.vx * DT; r.y += r.vy * DT; r.age++;
    let best = 2, ship = -1, rock = -1;   // entry parameters are at most 1; W-4 spec §5.1: rock is the rock that is the first contact
    state.ships.forEach((s, k) => {
      if (!s.active || k === r.owner) return;
      const t = segmentEntry(ox, oy, r.x, r.y, s.x, s.y, classOf(state, k).radius);
      if (t >= 0 && t < best) { best = t; ship = k; }
    });
    const half = Math.max(Math.abs(r.x - ox), Math.abs(r.y - oy)) / 2;
    const nn = rocksNear(state, (ox + r.x) / 2, (oy + r.y) / 2, half, roundNear);
    for (let ii = 0; ii < nn; ii++) {
      const k = roundNear[ii]!;
      if (state.rockBorn[k] === 1) continue;   // as firstBlocker: a piece made earlier this tick is not in the way
      const t = rockEntry(state, k, ox, oy, r.x, r.y, segmentEntry);
      if (t >= 0 && t < best) { best = t; ship = -1; rock = k; }
    }
    const p = state.map.planet, tp = segmentEntry(ox, oy, r.x, r.y, p.x, p.y, p.r);
    if (tp >= 0 && tp < best) { best = tp; ship = -1; rock = -1; }
    if (ship >= 0) gunHit(state, r.owner, ship, ox, oy, r.x, r.y, r.room);
    else if (rock >= 0 && g !== null && g !== undefined && g.rock !== null) roundStrikesRock(state, r.owner, rock, ox, oy, r.x, r.y, best, g.rock);   // W-4 spec §5.1; GUN.rock is null: absorbed, as before
    if (best <= 1 || r.age >= life) Object.assign(r, emptyRound());
  }
}

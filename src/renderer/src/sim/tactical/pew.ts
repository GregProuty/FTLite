// Pew pew (spec 2026-11-18-pew-pew-weapons-design §1, §4; W-1): the crew Cutter's and the Hunter's skill-shot gun, on a
// class whose pew slot is not null. Its charge is units on the systems record (defs.ts pewThird: rechargeTicks ×
// PEW_CHARGE_SCALE to a third), shots thirds, a round spending one; it refills every tick, attended or not, whatever the
// Weapons damage (spec §6 decision 4). Engineering spike §11 (merge decision 1a): the crew's refill rate is its pew pew
// bars' (bars.ts PEW_TICKS_BY_BARS, the trimmed bars, so damage gates at once); at 0 bars it neither refills nor fires.
// The aim is a fine heading (AIM_STEPS to the turn: a heading index times HEADING_COUNT plus its fraction), clamped in
// that space into ±arcSteps about the heading at the moment of firing. A round leaves the nose at the round speed along
// the aim, ignoring the ship's velocity, into the shared pool tactical.pew (gun.ts placeRound's pick). firePew runs from
// applyWeaponsInput (before anything moves); stepPew (Task 3) after the gun rounds. Only + − × ÷ and sqrt.
import { PEW_MAN_GAIN_BY_BARS, PEW_TICKS_BY_BARS, weaponBars, WeaponSlot } from './bars';
import { pewFullCharge, pewThird, type PewDef } from './defs';
import { dirBetween, hx, hy } from './direction';
import { placeRound, segmentEntry } from './gun';
import { interceptTime, nearestHeading } from './lead';
import { shootDown } from './missiles';
import { rockEntry, rocksNear } from './rocks';
import { classOf, CREW_SLOT, emptyRound, Room, roundRoom, type TacticalState } from './state';
import { AIM_STEPS, DT, HEADING_COUNT, PEW_ROOM_WEAR } from './tuning';

/** A full charge in charge units: every third stored. */
export function pewFull(def: PewDef): number { return pewFullCharge(def); }

/** Engineering spike §11: whether ship i's pew pew is powered: the crew's with at least one (trimmed) pew pew bar, any
 *  other ship's always. */
export function pewPowered(state: TacticalState, i: number): boolean {
  return i !== CREW_SLOT ? state.systems[i]!.hacked[Room.Weapons] === 0 : weaponBars(state.systems[i]!, WeaponSlot.Pew) >= 1;   // hacking spike: a hacked Weapons room unpowers a non-crew pew (damage alone still does not, as before)
}

/** The charge units ship i's pew gains a tick: the crew's by its pew pew bars (a third per PEW_TICKS_BY_BARS ticks, 0 at
 *  0 bars), any other ship's one tick at its class's rate (PEW_CHARGE_SCALE units); 0 without the pew. W-4 spec §4.4:
 *  `manual` (the pew in hand this tick, handControl) reads PEW_MAN_GAIN_BY_BARS on the Hound's turret pew. */
export function pewGain(state: TacticalState, i: number, manual = false): number {
  const def = classOf(state, i).slots.pew;
  if (!def) return 0;
  if (i !== CREW_SLOT) return pewThird(def) / def.rechargeTicks;
  const bars = weaponBars(state.systems[i]!, WeaponSlot.Pew);
  if (manual && def.turret !== null) return PEW_MAN_GAIN_BY_BARS[bars]!;   // W-4 spec §4.4: the Hound's pew in hand, about +20 %
  const ticks = PEW_TICKS_BY_BARS[bars]!;
  return ticks > 0 ? pewThird(def) / ticks : 0;
}

/** Whether ship i's pew can fire a round now: powered (pewPowered) and at least one full third stored; never for a class
 *  without the pew. */
export function pewReady(state: TacticalState, i: number): boolean {
  const def = classOf(state, i).slots.pew;
  return def !== null && state.systems[i]!.pewCharge >= pewThird(def) && pewPowered(state, i);
}

/** W-4 spec §4.3 (Decision 4): whether ship i's AUTO pew may fire now: pewReady, and either full or a third completed by
 *  the last tickPew (the charge sits within one tick's gain above a whole third). So AUTO fires one round each time a third
 *  has charged and never bursts the stored thirds. Integers on AUTO's gains (they divide the third). */
export function pewAutoReady(state: TacticalState, i: number): boolean {
  const def = classOf(state, i).slots.pew, c = state.systems[i]!.pewCharge;
  return def !== null && pewReady(state, i) && (c >= pewFull(def) || c % pewThird(def) < pewGain(state, i));
}

/** A laserFire command's aim (W-2, pew pew spec §4; its only reader since W-4 spec §6 dropped pewFire's aim): a heading
 *  index 0..255 and its fraction aimAcc 0..255, both integers. */
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
 *  counted and a pewFire event pushed; returns whether it fired. W-4 amendment §3.3: `room` tags the round (0: none). */
export function firePew(state: TacticalState, i: number, aim: number, room = 0): boolean {
  const def = classOf(state, i).slots.pew, s = state.systems[i]!;
  if (!def || !Number.isInteger(aim) || aim < 0 || aim >= AIM_STEPS || !pewReady(state, i)) return false;
  const [ux, uy] = aimDir(clampAim(state.ships[i]!.heading, aim, def.arcSteps)), m = pewMuzzle(state, i);
  placeRound(state, { x: m.x, y: m.y, vx: ux * def.speed, vy: uy * def.speed, age: 0, owner: i, room }, state.pew);
  s.pewCharge -= pewThird(def); s.pewShots++;
  state.events.push({ kind: 'pewFire', ship: i, x: m.x, y: m.y });
  return true;
}

/** W-4 spec §3.2, §6: ship i's pew turret's world aim, a fine aim 0..AIM_STEPS − 1: the nose plus pewTurret (W-4 spec §3.2). */
export function pewAimFine(state: TacticalState, i: number): number {
  return (((state.ships[i]!.heading * HEADING_COUNT + state.systems[i]!.pewTurret) % AIM_STEPS) + AIM_STEPS) % AIM_STEPS;   // turret.ts turretWorldAim's formula
}
/** W-4 spec §6: an admitted pewFire: a round along the turret (firePew's clamp leaves an aim inside the arc as it is). */
export function firePewTrigger(state: TacticalState, i: number, room = 0): boolean { return firePew(state, i, pewAimFine(state, i), room); }

/** One tick of ship i's pew recharge (spec §1; Engineering spike §11): pewGain units while below full, to full, every tick. */
export function tickPew(state: TacticalState, i: number, manual = false): void {
  const def = classOf(state, i).slots.pew, s = state.systems[i]!;
  if (def && s.pewCharge < pewFull(def) && (i === CREW_SLOT || pewPowered(state, i))) s.pewCharge = Math.min(pewFull(def), s.pewCharge + pewGain(state, i, manual));
}

/** Owner's pew round hit ship k at (x, y) (spec §1): with a shield layer up it strips one (the shield clock and the gun's
 *  wear go to 0, as any strip; W-4 spec §5.2: two on the weak frequency from the crew's turret pew); else it costs the owner's
 *  pew hull. W-4 amendment §3.4: an unshielded hit by a tagged round (`tag`, a round the crew fired by hand) of the crew's
 *  turret pew also adds PEW_ROOM_WEAR to its target room's gunRoomWear, the autocannon's counter: at the owner's gun's
 *  hitsPerLevel the room's level rises and the wear goes to 0, and on a level-2 room the wear is held at 0. An untagged round,
 *  the Hunter's pew and a class with no gun never wear a room. The owner counts the hit; a pewHit event marks it, with the
 *  room worn (−1 none) and whether its level rose. */
function pewHit(state: TacticalState, owner: number, k: number, x: number, y: number, tag = 0): void {
  const cls = classOf(state, owner), def = cls.slots.pew, gun = cls.slots.gun, t = state.systems[k]!;
  if (!def) return;
  state.systems[owner]!.pewHits++;
  const stripped = t.shields > 0;
  // W-4 spec §5.2: the crew's turret pew (the Hound's) on the enemy's weak frequency strips 2 layers (as many as are up).
  const weak = owner === CREW_SLOT && def.turret !== null && state.systems[owner]!.freq === state.weakFreq;
  let room: -1 | 0 | 1 | 2 = -1, level = false;
  if (stripped) { t.shields -= weak ? Math.min(2, t.shields) : 1; t.shieldClock = 0; t.gunWear = 0; }
  else {
    t.hull = Math.max(0, t.hull - def.hull);
    if (owner === CREW_SLOT && def.turret !== null && gun !== null) room = roundRoom(tag);   // W-4 amendment §3.4
    if (room !== -1 && gun !== null) {
      if (t.rooms[room] < 2) { if ((t.gunRoomWear[room] += PEW_ROOM_WEAR) >= gun.hitsPerLevel) { t.rooms[room]++; t.gunRoomWear[room] = 0; level = true; } }
      else t.gunRoomWear[room] = 0;
    }
  }
  state.events.push({ kind: 'pewHit', ship: k, owner, stripped, hull: !stripped, room, level, x, y });
}

const pewNear: number[] = [];   // stepPew rocksNear scratch
/**
 * Every pew round in flight, in pool order (spec §1): it flies straight one tick (no gravity, no drag; it also moves on its
 * spawn tick) and ages; its segment from the old to the new position is swept (gun.ts segmentEntry) against the live rocks
 * (the asteroids-ii pool as it stands after this tick's rock step; a piece born this tick is skipped),
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
    // Merge with asteroids-ii (spike ii §8; owner decision): the rocks are the live pool `state.rocks` as it stands when this
    // runs (after stepRocks moved them this tick), found with rocksNear as gun.ts stepRounds does, and a piece born this tick
    // is not in the way. A pew round that meets a rock stops on it with no effect on the rock (no chip, split, push or event).
    const nq = rocksNear(state, (ox + r.x) / 2, (oy + r.y) / 2, half, pewNear);
    for (let ii = 0; ii < nq; ii++) {
      const q = pewNear[ii]!;
      if (state.rockBorn[q] === 1) continue;   // as stepRounds and firstBlocker: a piece made earlier this tick is not in the way
      const t = rockEntry(state, q, ox, oy, r.x, r.y, segmentEntry);
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
    else if (hit === 'ship') pewHit(state, r.owner, k, ox + (r.x - ox) * best, oy + (r.y - oy) * best, r.room);
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

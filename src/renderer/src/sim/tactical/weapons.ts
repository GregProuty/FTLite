// Laser, shields and the magazine (spec §5, §7a, the §7 weapons state transitions table), on each ship's systems record
// and its class's weapon definitions. A ship's laser fires at its locked target (engine refactor spec §5). W-2 (pew pew spec
// §2): the crew's laser in MANUAL fires only on laserFire, as an instant beam along its aim (shootAlong).
// Commands arrive as one ShipInput per ship per tick; the duel step builds these from the authority's admitted commands.
import { inArc, lineOfSight, roomAtImpact } from './geometry';
import { launchMissile } from './missiles';
import { firstBlocker, rockAlive, rockAt, rockSlots, segmentEntry } from './rocks';
import { AUTO_DIG } from './rockTuning';
import { laserStrikesRock, rockOnTarget, rockShotLine } from './rockWeapons';
import { hx, hy } from './direction';
import { tickGun } from './gun';
import { BEAM_RATE_BY_BARS, BEAM_SHOTS_BY_BARS, DuelSystem, effectiveBars, MAGAZINE_REGEN_UNITS, SHIELD_LAYERS_BY_BARS, SHIELD_RATE_BY_BARS, TORPEDO_RELOAD_BY_BARS, weaponBars, WeaponSlot } from './bars';
import { aimDir, clampAim, firePew, firePewTrigger, tickPew } from './pew';
import { classOf, CREW_SLOT, missileOf, Room, type Axes, type TacticalState } from './state';
import { shipSeen } from './science';
import { AIM_STEPS, LASER_ARC_STEPS } from './tuning';

/** One ship's inputs for one tick. `helm` / `weapons`: a present player is seated at that console ("attended", spec §8). */
export interface ShipInput {
  helm: boolean;
  weapons: boolean;
  /** Turn and thrust, read only while `helm`. */
  axes: Axes;
  /** `laserLock {room}`: the target Room to lock, −1 to clear the crew laser's target (FTL targeting spec §2), or null
   *  for no command this tick. */
  laserLock: number | null;
  /** `torpLock {room}` (FTL targeting spec §2, the crew only): the torpedo's target Room, −1 to clear, or null. */
  torpLock: number | null;
  /** Spike ii §6.1: `rockLock {weapon, rock}` folded per weapon: a slot, −1 to clear, or null for no command this tick
   *  (the crew only). Applied after laserLock and torpLock, so it wins over a same-tick room lock for its weapon. */
  rockLock: { laser: number | null; torpedo: number | null };
  /** `laserCharge {held}`: true = press, false = release, null = no command this tick. The crew's laser charges by
   *  itself, so for the crew a press fires a full laser and a release does nothing (FTL targeting spec §2). */
  laserCharge: boolean | null;
  /** `missileLaunch`. */
  missileLaunch: boolean;
  /** Valkyrn spec §7.1: the gun's trigger, held at the Weapons station by its attendant (the duel step computes it from
   *  the held input; every other input sets false). Read only by a class with a gun. */
  gunHeld: boolean;
  /** W-1 (pew pew spec §1, §4): the pew's fine aim this tick (a heading index × HEADING_COUNT + its fraction, 0..65535),
   *  or −1 for no shot. At most one a tick; the duel step admits the first pewFire, the Hunter decides its own. */
  pewAim: number;
  /** W-2 (pew pew spec §2, §4): the MANUAL laser's fine aim this tick (pewAim's format, 0..65535), or −1 for no shot. Read
   *  only by the crew's laser in MANUAL; the duel step admits the first laserFire, the Hunter never sends one. */
  laserFire: number;
  /** W-3 (pew pew spec §3): the Weapons attendant's steering of a MANUAL torpedo in flight this tick: `torpTurn` A/D (−1,
   *  0 or 1) and `torpHeading` the heading it holds (a heading index 0..255, −1 none). The duel step reads them from the
   *  held input; every other input sets 0 and −1. Read only while the ship's torpedo in flight is MANUAL (duel.ts). */
  torpTurn: number; torpHeading: number;
  /** W-4 spec §8: the Weapons attendant's selected slot (0..2), −1 none (every other input). */
  weaponSel: number;
  /** W-4 spec §8: the Weapons attendant's reticle, a fine aim 0..65535, −1 none (every other input). The selected MAN gun's
   *  turret slews toward it (turret.ts slewTurrets). */
  turretAim: number;
  /** W-4 spec §6: an admitted pewFire this tick: the pew fires along its turret (W-4a: the nose). The Hunter uses pewAim. */
  pewTrigger: boolean;
  /** Sci-1 spec §4.6: whether the station running the ship's scan is attended (true when no scan runs). The duel step
   *  computes it for the crew; every other input sets true. */
  scanner: boolean;
}

/** A crew that sits at both consoles and does nothing. */
export const IDLE_INPUT: ShipInput = { helm: true, weapons: true, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, rockLock: { laser: null, torpedo: null }, laserCharge: null, missileLaunch: false, gunHeld: false, pewAim: -1, laserFire: -1, torpTurn: 0, torpHeading: -1, weaponSel: -1, turretAim: -1, pewTrigger: false, scanner: true };
/** Nobody at either console: a ship nobody flies. */
export const UNCREWED_INPUT: ShipInput = { helm: false, weapons: false, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, rockLock: { laser: null, torpedo: null }, laserCharge: null, missileLaunch: false, gunHeld: false, pewAim: -1, laserFire: -1, torpTurn: 0, torpHeading: -1, weaponSel: -1, turretAim: -1, pewTrigger: false, scanner: true };

/** Engineering spike spec §10.3: the shots one release of ship i's laser fires: the crew's by the beam's bars (1/2/2,
 *  0 off), any other ship's by its class. 0 without a laser. */
export function beamShots(state: TacticalState, i: number): number {
  const laser = classOf(state, i).slots.laser;
  if (!laser) return 0;
  return i === CREW_SLOT ? BEAM_SHOTS_BY_BARS[weaponBars(state.systems[i]!, WeaponSlot.Beam)]! : laser.shots;
}

/** Whether ship i's laser is fully charged; never for a class without a laser (Valkyrn spec §6.1). */
export function laserFull(state: TacticalState, i: number): boolean {
  const laser = classOf(state, i).slots.laser;
  return laser !== null && state.systems[i]!.laserCharge >= laser.chargeUnits;
}

/** Admission (spec §7 table; the duel step uses these to give reject reasons): laserCharge is accepted only with no missile in flight. */
export function canCharge(state: TacticalState, i: number): boolean { return missileOf(state, i) === null; }
/** Weapons update spec §2: whether ship i's target ship is active and its centre within the class's torpedo range of
 *  ship i's, from any bearing. Spike ii §6.4: with a rock target (`torpRock` ≥ 0, default the stored one) the rock's
 *  centre is tested instead. */
export function torpedoInRange(state: TacticalState, i: number, torpRock = state.systems[i]!.torpRock): boolean {
  const a = state.ships[i]!, range = classOf(state, i).slots.missile.range;
  if (torpRock >= 0) {
    if (!rockAlive(state, torpRock)) return false;
    const r = rockAt(state, torpRock), dx = r.x - a.x, dy = r.y - a.y;
    return dx * dx + dy * dy <= range * range;
  }
  const j = state.systems[i]!.target, b = state.ships[j];
  if (!b || !b.active || j === i) return false;
  const dx = b.x - a.x, dy = b.y - a.y;
  return dx * dx + dy * dy <= range * range;
}
/** missileLaunch is accepted only with no missile in flight, a missile in the magazine, the torpedo up (the crew's: a
 *  torpedo bar, Engineering spike spec §10.3; any other ship's: Weapons below level 2) and the target (spike ii: the rock
 *  target, `torpRock`) within torpedo range (weapons update spec §2). W-3 (pew pew spec §3): in MANUAL (`manual`, default the ship's torpedo mode) there is no target and no range test. */
export function canLaunch(state: TacticalState, i: number, torpRock = state.systems[i]!.torpRock, manual = state.systems[i]!.torpManual): boolean {
  const s = state.systems[i]!;
  const up = i === CREW_SLOT ? weaponBars(s, WeaponSlot.Torpedo) >= 1 : s.rooms[Room.Weapons] < 2;   // spec §10.3: the crew's torpedo bars
  return missileOf(state, i) === null && s.magazine > 0 && up && (manual || torpedoInRange(state, i, torpRock));
}
/** A lock target must be a Room index. */
export function validLock(room: number): boolean { return Number.isInteger(room) && room >= 0 && room <= 2; }
/** FTL targeting spec §2: a `laserLock` or `torpLock` command's room, a Room index or −1 (clear the target). */
export function validTarget(room: number): boolean { return room === -1 || validLock(room); }
/** Spike ii §6.1: a rockLock command's weapon is the laser or the torpedo, and its rock a whole slot −1 .. rockSlots − 1. */
export function validRockLock(state: TacticalState, weapon: unknown, rock: number): boolean {
  return (weapon === 'laser' || weapon === 'torpedo') && Number.isInteger(rock) && rock >= -1 && rock < rockSlots(state);
}

/** Whether ship i's laser is off: the crew's with 0 beam bars (Engineering spike spec §10.3), any other ship's at Weapons
 *  damage level 2 (owner 2026-11-17, FTL-style). Off, the laser cannot charge, hold or fire and keeps no charge (and a
 *  non-crew ship's canLaunch refuses missiles). A laserCharge command is still admitted (canCharge): it is held, to no
 *  effect, and the laser starts charging again once the beam has a bar (the crew) or the room is repaired to 1. */
export function laserOffline(state: TacticalState, i: number): boolean {
  return i === CREW_SLOT ? beamShots(state, i) === 0 : state.systems[i]!.rooms[Room.Weapons] >= 2;   // spec §10.3: the beam's bars
}

/** W-2 (pew pew spec §2): whether ship i's MANUAL laser would fire on a laserFire now, a torpedo in flight aside
 *  (laserFrozen): a full charge, no burst shot pending, the laser not offline (the crew's: a beam bar, Engineering spike
 *  §10.3, merge decision 1b; any other ship's: Weapons below level 2). No sight test (firing blind is allowed). */
export function manualLaserReady(state: TacticalState, i: number): boolean {
  return laserFull(state, i) && state.systems[i]!.laserBurst === 0 && !laserOffline(state, i);
}

/** The laser cannot charge, hold or fire while its ship's missile flies or its Weapons console is empty (spec §7 table). */
export function laserFrozen(state: TacticalState, i: number, input: ShipInput): boolean {
  return missileOf(state, i) !== null || !input.weapons;
}

/** Whether ship i's laser would hit ship j now: j an active slot inside the ±60° arc and range, with line of sight (spec §7a). */
export function laserEligible(state: TacticalState, i: number, j: number): boolean {
  const a = state.ships[i]!, b = state.ships[j], laser = classOf(state, i).slots.laser;
  if (!laser || !b || !b.active || j === i) return false;   // Valkyrn spec §6.1: no laser, no shot
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx * dx + dy * dy > laser.range * laser.range) return false;
  return inArc(a.heading, dx, dy, laser.arcCos) && lineOfSight(state, a.x, a.y, b.x, b.y);
}

/** SPIKE (destructible asteroids): whether ship j is an active slot inside ship i's laser arc and range (no line of sight). */
function inLaserReach(state: TacticalState, i: number, j: number): boolean {
  const a = state.ships[i]!, b = state.ships[j], laser = classOf(state, i).slots.laser;
  if (!laser || !b || !b.active || j === i) return false;
  const dx = b.x - a.x, dy = b.y - a.y;
  return dx * dx + dy * dy <= laser.range * laser.range && inArc(a.heading, dx, dy, laser.arcCos);
}

/** SPIKE: the rock a shot of ship i that misses its target strikes instead, with the impact point, or null. The line to
 *  an in-arc, in-range target when a rock is its first blocker (the planet first: nothing); else, the target out of reach,
 *  the first rock along the nose within laser range. */
export function laserRockTarget(state: TacticalState, i: number): { rock: number; x: number; y: number } | null {
  const laser = classOf(state, i).slots.laser;
  if (!laser) return null;   // Valkyrn spec §6.1: no laser, no laser rock target
  const a = state.ships[i]!, j = state.systems[i]!.target, range = laser.range;
  const b = state.ships[j];
  const [ex, ey] = b && inLaserReach(state, i, j) ? [b.x, b.y] : [a.x + hx(a.heading) * range, a.y + hy(a.heading) * range];
  const f = firstBlocker(state, a.x, a.y, ex, ey);
  if (!f || f.rock < 0) return null;
  return { rock: f.rock, x: a.x + (ex - a.x) * f.t, y: a.y + (ey - a.y) * f.t };
}

/** SPIKE: the crew laser's auto-dig, a rock between it and its in-arc, in-range target. */
export function laserDiggable(state: TacticalState, i: number): boolean {
  return AUTO_DIG && inLaserReach(state, i, state.systems[i]!.target) && laserRockTarget(state, i) !== null;
}

/** One laser shot of ship i landing on ship j (spec §7a), the hit counted: with a shield layer up it strips one (the crew
 *  laser on the weak frequency two, Sci-1 spec §4.4), else it raises Room `room` one level (capped at 2) and costs the
 *  laser's hull. W-2 (pew pew spec §2): shared by the AUTO shot (its lock room) and the MANUAL beam (the room under its hit
 *  point); returns whether it stripped and the Room struck (−1 on a strip). */
function laserStrike(state: TacticalState, i: number, j: number, room: number): { stripped: boolean; room: number } {
  const as = state.systems[i]!, bs = state.systems[j]!, laser = classOf(state, i).slots.laser!;
  as.laserHits++;
  if (bs.shields > 0) {   // Sci-1 spec §4.4: the crew laser tuned to the weak frequency strips 2 layers (as many as are up)
    const n = i === CREW_SLOT && as.freq === state.weakFreq ? Math.min(2, bs.shields) : 1;
    bs.shields -= n; bs.shieldClock = 0; bs.gunWear = 0; as.layersStripped += n;   // Valkyrn spec §7.2: any strip zeroes the gun wear
    return { stripped: true, room: -1 };
  }
  if (bs.rooms[room]! < 2) bs.rooms[room as 0 | 1 | 2]++;
  bs.hull = Math.max(0, bs.hull - laser.hull);
  return { stripped: false, room };
}

/** One laser shot of ship i at its target and lock room as they stand now (spec §7a; weapons update spec §1: every shot of a
 *  burst re-checks eligibility, strips shields or strikes the room, counts and pushes its own `laser` event). */
function shoot(state: TacticalState, i: number): void {
  const laser = classOf(state, i).slots.laser;
  if (!laser) return;
  if (state.systems[i]!.laserRock >= 0) { shootRock(state, i); return; }   // spike ii §6.2: a rock target
  const a = state.ships[i]!, as = state.systems[i]!, j = as.target, b = state.ships[j] ?? a, bs = state.systems[j], hit = laserEligible(state, i, j);
  let stripped = false, room = -1;
  as.shots++;
  if (hit && bs) ({ stripped, room } = laserStrike(state, i, j, as.lock));   // W-2: the strike the MANUAL beam shares, unchanged
  if (!hit) {   // spike i, kept (spec §6.3): a blocked or aimless shot strikes the first rock on its line instead
    const r = laserRockTarget(state, i);
    if (r) {
      state.events.push({ kind: 'laser', ship: i, hit: false, stripped: false, room: -1, x1: a.x, y1: a.y, x2: r.x, y2: r.y, rock: r.rock });
      laserStrikesRock(state, i, r.rock, r.x, r.y);
      return;
    }
  }
  state.events.push({ kind: 'laser', ship: i, hit, stripped, room, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
}

/** W-2 (pew pew spec §2): one MANUAL laser shot of ship i along fine aim `aim`, clamped into the laser's ±60° about its
 *  heading now: an instant beam from its centre to the laser's range. The first solid body (firstBlocker: the planet, or a
 *  rock; a piece born this tick is not in the way) stops it, unless another active ship's circle is entered strictly
 *  before it; a torpedo is never in the way. On ship j it strikes the room under the entry point (roomAtImpact, as a
 *  torpedo's self-hit) through laserStrike; on a rock it does what the AUTO laser does (laserStrikesRock: a push, then the
 *  damage); on the planet, or with nothing met, it only ends. Counts a shot and pushes its `laser` event (x2, y2 where it
 *  ended). */
function shootAlong(state: TacticalState, i: number, aim: number): void {
  const laser = classOf(state, i).slots.laser;
  if (!laser) return;
  const a = state.ships[i]!, as = state.systems[i]!, [ux, uy] = aimDir(clampAim(a.heading, aim, LASER_ARC_STEPS));
  const ex = a.x + ux * laser.range, ey = a.y + uy * laser.range, f = firstBlocker(state, a.x, a.y, ex, ey);
  let best = f ? f.t : 2, j = -1;   // entry parameters are at most 1
  for (let k = 0; k < state.ships.length; k++) {
    const b = state.ships[k]!;
    if (!b.active || k === i) continue;
    const t = segmentEntry(a.x, a.y, ex, ey, b.x, b.y, classOf(state, k).radius);
    if (t >= 0 && t < best) { best = t; j = k; }
  }
  as.shots++;
  const t = best <= 1 ? best : 1, x = a.x + (ex - a.x) * t, y = a.y + (ey - a.y) * t;
  if (j >= 0) {
    const { stripped, room } = laserStrike(state, i, j, roomAtImpact(state.ships[j]!, x, y));
    state.events.push({ kind: 'laser', ship: i, hit: true, stripped, room, x1: a.x, y1: a.y, x2: x, y2: y });
    return;
  }
  if (f && f.rock >= 0) {
    state.events.push({ kind: 'laser', ship: i, hit: false, stripped: false, room: -1, x1: a.x, y1: a.y, x2: x, y2: y, rock: f.rock });
    laserStrikesRock(state, i, f.rock, x, y);
    return;
  }
  state.events.push({ kind: 'laser', ship: i, hit: false, stripped: false, room: -1, x1: a.x, y1: a.y, x2: x, y2: y });
}

/** Spike ii §6.2: one shot of ship i with a rock target. On target, the line to the rock's centre decides what it meets
 *  (the planet: a miss; another rock: that rock); off target, spike i's miss path (the blocked enemy line or the nose ray).
 *  A shot that meets no rock is a miss beam to the planet's entry point or the nose ray's end. */
function shootRock(state: TacticalState, i: number): void {
  const a = state.ships[i]!, as = state.systems[i]!, range = classOf(state, i).slots.laser?.range ?? 0;   // shoot() returns first without a laser
  as.shots++;
  const line = rockOnTarget(state, i, as.laserRock) ? rockShotLine(state, i, as.laserRock) : laserRockTarget(state, i);
  if (line && line.rock >= 0) {
    state.events.push({ kind: 'laser', ship: i, hit: false, stripped: false, room: -1, x1: a.x, y1: a.y, x2: line.x, y2: line.y, rock: line.rock });
    laserStrikesRock(state, i, line.rock, line.x, line.y);
    return;
  }
  const end = line ?? { x: a.x + hx(a.heading) * range, y: a.y + hy(a.heading) * range };
  state.events.push({ kind: 'laser', ship: i, hit: false, stripped: false, room: -1, x1: a.x, y1: a.y, x2: end.x, y2: end.y });
}

/** A full charge's release: the first shot now, the rest of the class's burst queued a burst gap apart. */
function fireLaser(state: TacticalState, i: number): void {
  const as = state.systems[i]!, laser = classOf(state, i).slots.laser;
  if (!laser) return;
  shoot(state, i);
  as.laserCharge = 0; as.laserHold = 0;
  as.laserBurst = Math.max(0, beamShots(state, i) - 1); as.laserBurstClock = as.laserBurst > 0 ? laser.burstGapTicks : 0;   // spec §10.3
}

/** W-2 (pew pew spec §2): a full charge's MANUAL release along fine aim `aim` (an integer 0..AIM_STEPS − 1, else nothing):
 *  the first shot now along the aim clamped about the heading, the rest of the burst queued a burst gap apart, each to
 *  fire along that same clamped aim (laserAim). Engineering spike §10.3 (merge decision 1b): the burst is the beam's bars'
 *  (beamShots), as AUTO's; no sight test: firing blind along an aim is allowed. */
function fireLaserAlong(state: TacticalState, i: number, aim: number): void {
  const as = state.systems[i]!, laser = classOf(state, i).slots.laser;
  if (!laser || !Number.isInteger(aim) || aim < 0 || aim >= AIM_STEPS) return;
  const clamped = clampAim(state.ships[i]!.heading, aim, LASER_ARC_STEPS);
  shootAlong(state, i, clamped);
  as.laserCharge = 0; as.laserHold = 0;
  as.laserBurst = Math.max(0, beamShots(state, i) - 1); as.laserBurstClock = as.laserBurst > 0 ? laser.burstGapTicks : 0;   // spec §10.3
  as.laserAim = as.laserBurst > 0 ? clamped : -1;
}

/** Weapons update spec §1: a pending burst shot fires a burst gap after the one before, attended or not, whatever flies;
 *  only Weapons at damage level 2 drops it. W-2 (pew pew spec §2): a MANUAL burst's shots (laserAim ≥ 0) fire along the
 *  aim the burst was fired with, from where the ship is and re-clamped about its heading at their own tick, whatever the
 *  mode is now; the aim clears with the burst's last shot. */
function stepBurst(state: TacticalState, i: number): void {
  const s = state.systems[i]!;
  if (s.laserBurst === 0) return;
  if (laserOffline(state, i)) { s.laserBurst = 0; s.laserBurstClock = 0; s.laserAim = -1; return; }
  if (s.laserBurst > beamShots(state, i) - 1) {   // spec §10.3: a shot whose bar is gone never fires
    s.laserBurst = Math.max(0, beamShots(state, i) - 1);
    if (s.laserBurst === 0) { s.laserBurstClock = 0; s.laserAim = -1; return; }
  }
  if (--s.laserBurstClock > 0) return;
  if (s.laserAim >= 0) shootAlong(state, i, s.laserAim); else shoot(state, i);
  s.laserBurst--; s.laserBurstClock = s.laserBurst > 0 ? classOf(state, i).slots.laser?.burstGapTicks ?? 0 : 0;
  if (s.laserBurst === 0) s.laserAim = -1;
}

/** Apply ship i's weapon commands for this tick, before anything moves (spec §7 table). The crew's ship (FTL targeting
 *  spec §2): `laserLock` sets the laser's target (−1 clears it, keeping the lock room for a manual shot) and `torpLock`
 *  the torpedo's, and an accepted room lock clears the matching rock target; `rockLock` sets that weapon's rock target (a rock lock clears its room lock); a charge press fires a full laser; then, attended, the laser with a target fires its burst when full
 *  and eligible, and a torpedo with a target launches when the launch is legal (launchMissile clears torpLock). W-2 (pew pew spec §2): in MANUAL the laser fires neither on a charge press nor by itself. W-3 (pew pew spec §3): in MANUAL a torpedo lock never auto-launches, missileLaunch needs no range, and a stored rock target breaking this call does not cancel a launch. */
export function applyWeaponsInput(state: TacticalState, i: number, input: ShipInput): void {
  const s = state.systems[i]!, crew = i === CREW_SLOT, armed = classOf(state, i).slots.laser !== null;   // Valkyrn spec §6.1: a null laser skips lock, charge and auto-fire
  if (armed && input.weapons && input.laserLock !== null && validTarget(input.laserLock)) {   // first: a burst shot reads this tick's lock
    s.laserRock = -1;   // spike ii §6.1: an accepted laserLock clears the laser's rock target first
    if (validLock(input.laserLock)) { s.lock = input.laserLock; if (crew) s.laserTargeted = true; }
    else if (crew) s.laserTargeted = false;
  }
  if (input.weapons && crew && input.torpLock !== null && validTarget(input.torpLock)) { s.torpRock = -1; s.torpLock = input.torpLock; }
  if (input.weapons && crew) {   // spike ii §6.1: rockLock, after laserLock and torpLock, before the burst
    const rl = input.rockLock, live = (k: number): boolean => k >= 0 && k < rockSlots(state) && rockAlive(state, k);
    // Merge (Valkyrn spec §6.1): a class without a laser takes no laser rock target.
    if (armed && rl.laser !== null) { if (live(rl.laser)) { s.laserRock = rl.laser; s.laserTargeted = true; } else if (rl.laser === -1) { s.laserRock = -1; s.laserTargeted = false; } }
    if (rl.torpedo !== null) { if (live(rl.torpedo)) { s.torpRock = rl.torpedo; s.torpLock = -1; } else if (rl.torpedo === -1) s.torpRock = -1; }
  }
  const torpOnRock = s.torpRock >= 0;   // impl review R1-F3: a shot below that breaks this rock must not turn the launch on the enemy
  stepBurst(state, i);
  tickGun(state, i, input);   // Valkyrn spec §7.1: before anything moves; its clocks run attended or not (Decision 8)
  if (!input.weapons) { s.fireHeld = false; return; }   // unattended: Fire lets go without firing or discarding
  if (laserOffline(state, i)) { s.laserCharge = 0; s.laserHold = 0; }   // a hit after its clock ran last tick: no shot
  if (armed && input.laserCharge !== null && canCharge(state, i)) {
    if (crew) { if (input.laserCharge && !s.laserManual && s.laserBurst === 0 && laserFull(state, i)) fireLaser(state, i); }   // a single press; W-2: never in MANUAL
    else if (input.laserCharge) s.fireHeld = true;
    else if (s.fireHeld) {
      s.fireHeld = false;
      if (laserFull(state, i)) fireLaser(state, i);
      else { s.laserCharge = 0; s.laserHold = 0; }
    }
  }
  // Auto-fire: on the enemy when eligible; spike ii §6.2: on a rock target when it is on target (AUTO_DIG is false). W-2: AUTO only.
  if (armed && crew && !s.laserManual && s.laserTargeted && s.laserBurst === 0 && laserFull(state, i) && !laserFrozen(state, i, input) && (s.laserRock >= 0 ? rockOnTarget(state, i, s.laserRock) : (laserEligible(state, i, s.target) || laserDiggable(state, i)) && shipSeen(state, s.target))) fireLaser(state, i);   // Task 10, spec §10.4: the enemy only when seen (rocks are always shown)
  // W-2 (pew pew spec §2): the MANUAL laser fires only on laserFire, along its aim, with a full charge, no burst pending,
  // Weapons online and no torpedo of its own in flight (laserFrozen).
  if (armed && crew && s.laserManual && input.laserFire >= 0 && manualLaserReady(state, i) && !laserFrozen(state, i, input)) fireLaserAlong(state, i, input.laserFire);
  // W-1 merge: the torpedo launch is skipped when this call broke its rock target (impl review R1-F3), but the pew still fires.
  if (s.torpManual || !(torpOnRock && s.torpRock < 0)) {   // AUTO: the torpedo's rock broke this call: no launch this tick (the command can still read 'applied'); W-3: a MANUAL launch needs no rock, so it still launches
    if (input.missileLaunch && canLaunch(state, i)) {
      launchMissile(state, i);
      s.fireHeld = false;
    }
    if (crew && !s.torpManual && (s.torpLock >= 0 || s.torpRock >= 0) && canLaunch(state, i) && (s.torpRock >= 0 || shipSeen(state, s.target))) launchMissile(state, i);   // auto-launch, once (spike ii: or on a rock target); W-3: never in MANUAL; Task 10: the enemy only when seen
  }
  if (input.pewTrigger) firePewTrigger(state, i);   // W-4 spec §6, §8: the crew's pewFire, along the turret; last, as before
  else if (input.pewAim >= 0) firePew(state, i, input.pewAim);   // W-1 (pew pew spec §1): the Hunter's aim; attended (above)
}

/** Advance ship i's laser charge and hold timer, shields and magazine by one tick (spec §5, §7). */
export function tickWeapons(state: TacticalState, i: number, input: ShipInput): void {
  const s = state.systems[i]!, c = classOf(state, i), laser = c.slots.laser;
  if (laserOffline(state, i)) { s.laserCharge = 0; s.laserHold = 0; s.laserBurst = 0; s.laserBurstClock = 0; s.laserAim = -1; }   // off: every tick, frozen or not (W-2: a MANUAL burst's aim with it)
  else if (laser !== null && s.laserBurst === 0 && !laserFrozen(state, i, input)) {   // no charging while a burst shot is pending, nor without a laser
    // FTL targeting spec §2: the crew's laser charges by itself, with no hold, and stays full (no vent) until it fires.
    if (i === CREW_SLOT) { if (!laserFull(state, i)) s.laserCharge = Math.min(laser.chargeUnits, s.laserCharge + BEAM_RATE_BY_BARS[weaponBars(s, WeaponSlot.Beam)]!); }   // spec §10.3
    else if (s.fireHeld && !laserFull(state, i)) s.laserCharge = Math.min(laser.chargeUnits, s.laserCharge + laser.chargeRate[s.rooms[Room.Weapons]]!);
    else if (laserFull(state, i) && ++s.laserHold >= laser.holdTicks) { s.laserCharge = 0; s.laserHold = 0; }   // vents; recharges if still held
  }
  if (i === CREW_SLOT) {   // Engineering spike spec §2: the crew's shields by bars; layers above the cap drop at once
    const bars = effectiveBars(s, DuelSystem.Shields), cap = Math.min(c.shields.layers, SHIELD_LAYERS_BY_BARS[bars]!);
    if (s.shields > cap) { s.shields = cap; s.shieldClock = 0; }
    if (s.shields >= cap) s.shieldClock = 0;
    else if ((s.shieldClock += SHIELD_RATE_BY_BARS[bars]!) >= c.shields.rechargeUnits) { s.shields++; s.shieldClock = 0; }   // rate 0: held
  } else if (s.shields >= c.shields.layers) s.shieldClock = 0;
  else if ((s.shieldClock += c.shields.rate[s.rooms[Room.Shields]]!) >= c.shields.rechargeUnits) { s.shields++; s.shieldClock = 0; }   // rate 0: held
  if (s.magazine >= c.slots.missile.magazine) s.magazineClock = 0;
  else if (i === CREW_SLOT) {   // spec §10.3: the torpedo's reload by its bars on a units clock; 0 bars holds the clock
    const rate = TORPEDO_RELOAD_BY_BARS[weaponBars(s, WeaponSlot.Torpedo)]!;
    if (rate > 0 && (s.magazineClock += rate) >= MAGAZINE_REGEN_UNITS) { s.magazine++; s.magazineClock = 0; }
  } else if (++s.magazineClock >= c.slots.missile.regenTicks) { s.magazine++; s.magazineClock = 0; }
  tickPew(state, i);   // W-1: the pew refills every tick, attended or not (spec §6 decision 4); the crew's at its pew pew bars' rate (Engineering spike §11)
}

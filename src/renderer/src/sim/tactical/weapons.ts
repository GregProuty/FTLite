// Laser, shields and the magazine (spec §5, §7a, the §7 weapons state transitions table), on each ship's systems record
// and its class's weapon definitions. A ship's laser fires at its locked target (engine refactor spec §5).
// Commands arrive as one ShipInput per ship per tick; the duel step builds these from the authority's admitted commands.
import { inArc, lineOfSight } from './geometry';
import { launchMissile } from './missiles';
import { classOf, CREW_SLOT, missileOf, Room, type Axes, type TacticalState } from './state';

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
  /** `laserCharge {held}`: true = press, false = release, null = no command this tick. The crew's laser charges by
   *  itself, so for the crew a press fires a full laser and a release does nothing (FTL targeting spec §2). */
  laserCharge: boolean | null;
  /** `missileLaunch`. */
  missileLaunch: boolean;
  /** Sci-1 spec §4.6: whether the station running the ship's scan is attended (true when no scan runs). The duel step
   *  computes it for the crew; every other input sets true. */
  scanner: boolean;
}

/** A crew that sits at both consoles and does nothing. */
export const IDLE_INPUT: ShipInput = { helm: true, weapons: true, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, laserCharge: null, missileLaunch: false, scanner: true };
/** Nobody at either console: a ship nobody flies. */
export const UNCREWED_INPUT: ShipInput = { helm: false, weapons: false, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, laserCharge: null, missileLaunch: false, scanner: true };

/** Whether ship i's laser is fully charged. */
export function laserFull(state: TacticalState, i: number): boolean { return state.systems[i]!.laserCharge >= classOf(state, i).slots.laser.chargeUnits; }

/** Admission (spec §7 table; the duel step uses these to give reject reasons): laserCharge is accepted only with no missile in flight. */
export function canCharge(state: TacticalState, i: number): boolean { return missileOf(state, i) === null; }
/** Weapons update spec §2: whether ship i's target ship is active and its centre within the class's torpedo range of
 *  ship i's, from any bearing. */
export function torpedoInRange(state: TacticalState, i: number): boolean {
  const a = state.ships[i]!, j = state.systems[i]!.target, b = state.ships[j], range = classOf(state, i).slots.missile.range;
  if (!b || !b.active || j === i) return false;
  const dx = b.x - a.x, dy = b.y - a.y;
  return dx * dx + dy * dy <= range * range;
}
/** missileLaunch is accepted only with no missile in flight, a missile in the magazine, Weapons below level 2 and the
 *  target within torpedo range (weapons update spec §2). */
export function canLaunch(state: TacticalState, i: number): boolean {
  const s = state.systems[i]!;
  return missileOf(state, i) === null && s.magazine > 0 && s.rooms[Room.Weapons] < 2 && torpedoInRange(state, i);
}
/** A lock target must be a Room index. */
export function validLock(room: number): boolean { return Number.isInteger(room) && room >= 0 && room <= 2; }
/** FTL targeting spec §2: a `laserLock` or `torpLock` command's room, a Room index or −1 (clear the target). */
export function validTarget(room: number): boolean { return room === -1 || validLock(room); }

/** Weapons at damage level 2 is off (owner 2026-11-17, FTL-style): the laser cannot charge, hold or fire and keeps no
 *  charge; canLaunch refuses missiles. A laserCharge command is still admitted (canCharge): it is held, to no effect,
 *  and the laser starts charging again once the room is repaired to 1. */
export function laserOffline(state: TacticalState, i: number): boolean { return state.systems[i]!.rooms[Room.Weapons] >= 2; }

/** The laser cannot charge, hold or fire while its ship's missile flies or its Weapons console is empty (spec §7 table). */
export function laserFrozen(state: TacticalState, i: number, input: ShipInput): boolean {
  return missileOf(state, i) !== null || !input.weapons;
}

/** Whether ship i's laser would hit ship j now: j an active slot inside the ±60° arc and range, with line of sight (spec §7a). */
export function laserEligible(state: TacticalState, i: number, j: number): boolean {
  const a = state.ships[i]!, b = state.ships[j], laser = classOf(state, i).slots.laser;
  if (!b || !b.active || j === i) return false;
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx * dx + dy * dy > laser.range * laser.range) return false;
  return inArc(a.heading, dx, dy, laser.arcCos) && lineOfSight(state, a.x, a.y, b.x, b.y);
}

/** One laser shot of ship i at its target and lock room as they stand now (spec §7a; weapons update spec §1: every shot of a
 *  burst re-checks eligibility, strips shields or strikes the room, counts and pushes its own `laser` event). */
function shoot(state: TacticalState, i: number): void {
  const a = state.ships[i]!, as = state.systems[i]!, j = as.target, b = state.ships[j] ?? a, bs = state.systems[j], hit = laserEligible(state, i, j);
  let stripped = false, room = -1;
  as.shots++;
  if (hit && bs) {
    as.laserHits++;
    if (bs.shields > 0) {   // Sci-1 spec §4.4: the crew laser tuned to the weak frequency strips 2 layers (as many as are up)
      const n = i === CREW_SLOT && as.freq === state.weakFreq ? Math.min(2, bs.shields) : 1;
      bs.shields -= n; bs.shieldClock = 0; as.layersStripped += n; stripped = true;
    }
    else {
      room = as.lock;
      if (bs.rooms[as.lock]! < 2) bs.rooms[as.lock as 0 | 1 | 2]++;
      bs.hull = Math.max(0, bs.hull - classOf(state, i).slots.laser.hull);
    }
  }
  state.events.push({ kind: 'laser', ship: i, hit, stripped, room, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
}

/** A full charge's release: the first shot now, the rest of the class's burst queued a burst gap apart. */
function fireLaser(state: TacticalState, i: number): void {
  const as = state.systems[i]!, laser = classOf(state, i).slots.laser;
  shoot(state, i);
  as.laserCharge = 0; as.laserHold = 0;
  as.laserBurst = laser.shots - 1; as.laserBurstClock = as.laserBurst > 0 ? laser.burstGapTicks : 0;
}

/** Weapons update spec §1: a pending burst shot fires a burst gap after the one before, attended or not, whatever flies;
 *  only Weapons at damage level 2 drops it. */
function stepBurst(state: TacticalState, i: number): void {
  const s = state.systems[i]!;
  if (s.laserBurst === 0) return;
  if (laserOffline(state, i)) { s.laserBurst = 0; s.laserBurstClock = 0; return; }
  if (--s.laserBurstClock > 0) return;
  shoot(state, i);
  s.laserBurst--; s.laserBurstClock = s.laserBurst > 0 ? classOf(state, i).slots.laser.burstGapTicks : 0;
}

/** Apply ship i's weapon commands for this tick, before anything moves (spec §7 table). The crew's ship (FTL targeting
 *  spec §2): `laserLock` sets the laser's target (−1 clears it, keeping the lock room for a manual shot) and `torpLock`
 *  the torpedo's; a charge press fires a full laser; then, attended, the laser with a target fires its burst when full
 *  and eligible, and a torpedo with a target launches when the launch is legal (launchMissile clears torpLock). */
export function applyWeaponsInput(state: TacticalState, i: number, input: ShipInput): void {
  const s = state.systems[i]!, crew = i === CREW_SLOT;
  if (input.weapons && input.laserLock !== null) {   // first: a burst shot reads this tick's lock
    if (validLock(input.laserLock)) { s.lock = input.laserLock; if (crew) s.laserTargeted = true; }
    else if (input.laserLock === -1 && crew) s.laserTargeted = false;
  }
  if (input.weapons && crew && input.torpLock !== null && validTarget(input.torpLock)) s.torpLock = input.torpLock;
  stepBurst(state, i);
  if (!input.weapons) { s.fireHeld = false; return; }   // unattended: Fire lets go without firing or discarding
  if (laserOffline(state, i)) { s.laserCharge = 0; s.laserHold = 0; }   // a hit after its clock ran last tick: no shot
  if (input.laserCharge !== null && canCharge(state, i)) {
    if (crew) { if (input.laserCharge && s.laserBurst === 0 && laserFull(state, i)) fireLaser(state, i); }   // a single press
    else if (input.laserCharge) s.fireHeld = true;
    else if (s.fireHeld) {
      s.fireHeld = false;
      if (laserFull(state, i)) fireLaser(state, i);
      else { s.laserCharge = 0; s.laserHold = 0; }
    }
  }
  if (crew && s.laserTargeted && s.laserBurst === 0 && laserFull(state, i) && !laserFrozen(state, i, input) && laserEligible(state, i, s.target)) fireLaser(state, i);   // auto-fire
  if (input.missileLaunch && canLaunch(state, i)) {
    launchMissile(state, i);
    s.fireHeld = false;
  }
  if (crew && s.torpLock >= 0 && canLaunch(state, i)) launchMissile(state, i);   // auto-launch, once
}

/** Advance ship i's laser charge and hold timer, shields and magazine by one tick (spec §5, §7). */
export function tickWeapons(state: TacticalState, i: number, input: ShipInput): void {
  const s = state.systems[i]!, c = classOf(state, i), laser = c.slots.laser;
  if (laserOffline(state, i)) { s.laserCharge = 0; s.laserHold = 0; s.laserBurst = 0; s.laserBurstClock = 0; }   // off: every tick, frozen or not
  else if (s.laserBurst === 0 && !laserFrozen(state, i, input)) {   // no charging while a burst shot is pending
    // FTL targeting spec §2: the crew's laser charges by itself, with no hold, and stays full (no vent) until it fires.
    if (i === CREW_SLOT) { if (!laserFull(state, i)) s.laserCharge = Math.min(laser.chargeUnits, s.laserCharge + laser.chargeRate[s.rooms[Room.Weapons]]!); }
    else if (s.fireHeld && !laserFull(state, i)) s.laserCharge = Math.min(laser.chargeUnits, s.laserCharge + laser.chargeRate[s.rooms[Room.Weapons]]!);
    else if (laserFull(state, i) && ++s.laserHold >= laser.holdTicks) { s.laserCharge = 0; s.laserHold = 0; }   // vents; recharges if still held
  }
  if (s.shields >= c.shields.layers) s.shieldClock = 0;
  else if ((s.shieldClock += c.shields.rate[s.rooms[Room.Shields]]!) >= c.shields.rechargeUnits) { s.shields++; s.shieldClock = 0; }   // rate 0: held
  if (s.magazine >= c.slots.missile.magazine) s.magazineClock = 0;
  else if (++s.magazineClock >= c.slots.missile.regenTicks) { s.magazine++; s.magazineClock = 0; }
}

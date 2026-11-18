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
  /** Missile steering turn axis, read only while `weapons` and a missile flies. */
  steer: number;
  /** `laserLock {room}`: the target Room to lock, or null for no command this tick. */
  laserLock: number | null;
  /** `laserCharge {held}`: true = press, false = release, null = no command this tick. */
  laserCharge: boolean | null;
  /** `missileLaunch`. */
  missileLaunch: boolean;
  /** Sci-1 spec §4.6: whether the station running the ship's scan is attended (true when no scan runs). The duel step
   *  computes it for the crew; every other input sets true. */
  scanner: boolean;
}

/** A crew that sits at both consoles and does nothing. */
export const IDLE_INPUT: ShipInput = { helm: true, weapons: true, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false, scanner: true };
/** Nobody at either console: a ship nobody flies. */
export const UNCREWED_INPUT: ShipInput = { helm: false, weapons: false, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false, scanner: true };

/** Whether ship i's laser is fully charged. */
export function laserFull(state: TacticalState, i: number): boolean { return state.systems[i]!.laserCharge >= classOf(state, i).slots.laser.chargeUnits; }

/** Admission (spec §7 table; the duel step uses these to give reject reasons): laserCharge is accepted only with no missile in flight. */
export function canCharge(state: TacticalState, i: number): boolean { return missileOf(state, i) === null; }
/** missileLaunch is accepted only with no missile in flight, a missile in the magazine and Weapons below level 2. */
export function canLaunch(state: TacticalState, i: number): boolean {
  const s = state.systems[i]!;
  return missileOf(state, i) === null && s.magazine > 0 && s.rooms[Room.Weapons] < 2;
}
/** A lock target must be a Room index. */
export function validLock(room: number): boolean { return Number.isInteger(room) && room >= 0 && room <= 2; }

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

function fireLaser(state: TacticalState, i: number): void {
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
  as.laserCharge = 0; as.laserHold = 0;
}

/** Apply ship i's weapon commands for this tick, before anything moves (spec §7 table). */
export function applyWeaponsInput(state: TacticalState, i: number, input: ShipInput): void {
  const s = state.systems[i]!;
  if (!input.weapons) { s.fireHeld = false; return; }   // unattended: Fire lets go without firing or discarding
  if (input.laserLock !== null && validLock(input.laserLock)) s.lock = input.laserLock;
  if (laserOffline(state, i)) { s.laserCharge = 0; s.laserHold = 0; }   // a hit after its clock ran last tick: no shot
  if (input.laserCharge !== null && canCharge(state, i)) {
    if (input.laserCharge) s.fireHeld = true;
    else if (s.fireHeld) {
      s.fireHeld = false;
      if (laserFull(state, i)) fireLaser(state, i);
      else { s.laserCharge = 0; s.laserHold = 0; }
    }
  }
  if (input.missileLaunch && canLaunch(state, i)) {
    launchMissile(state, i);
    s.fireHeld = false;
  }
}

/** Advance ship i's laser charge and hold timer, shields and magazine by one tick (spec §5, §7). */
export function tickWeapons(state: TacticalState, i: number, input: ShipInput): void {
  const s = state.systems[i]!, c = classOf(state, i), laser = c.slots.laser;
  if (laserOffline(state, i)) { s.laserCharge = 0; s.laserHold = 0; }   // off: every tick, frozen or not
  else if (!laserFrozen(state, i, input)) {
    if (s.fireHeld && !laserFull(state, i)) s.laserCharge = Math.min(laser.chargeUnits, s.laserCharge + laser.chargeRate[s.rooms[Room.Weapons]]!);
    else if (laserFull(state, i) && ++s.laserHold >= laser.holdTicks) { s.laserCharge = 0; s.laserHold = 0; }   // vents; recharges if still held
  }
  const patrolling = state.hostileAt < 0 && i !== CREW_SLOT && c.ai === 'hunter';   // Sci-1 spec §4.2: no layer regained in Patrol
  if (s.shields >= c.shields.layers || patrolling) s.shieldClock = 0;
  else if ((s.shieldClock += c.shields.rate[s.rooms[Room.Shields]]!) >= c.shields.rechargeUnits) { s.shields++; s.shieldClock = 0; }   // rate 0: held
  if (s.magazine >= c.slots.missile.magazine) s.magazineClock = 0;
  else if (++s.magazineClock >= c.slots.missile.regenTicks) { s.magazine++; s.magazineClock = 0; }
}

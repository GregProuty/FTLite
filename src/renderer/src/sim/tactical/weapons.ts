// Laser, shields and the magazine (spec §5, §7a, the §7 weapons state transitions table).
// Commands arrive as one ShipInput per ship per tick; H-0c builds these from the authority's admitted commands.
import { inArc, lineOfSight } from './geometry';
import { launchMissile } from './missiles';
import { Room, type Axes, type TacticalState } from './state';
import {
  LASER_ARC_COS, LASER_CHARGE_RATE, LASER_CHARGE_UNITS, LASER_HOLD_TICKS, LASER_HULL, LASER_RANGE, MAGAZINE, MAGAZINE_REGEN_TICKS, SHIELD_LAYERS,
  SHIELD_RATE, SHIELD_RECHARGE_UNITS
} from './tuning';

/** One ship's inputs for one tick. `helm` / `weapons`: a present player is seated at that console ("attended", spec §8). */
export interface ShipInput {
  helm: boolean;
  weapons: boolean;
  /** Turn and thrust, read only while `helm`. */
  axes: Axes;
  /** Missile steering turn axis, read only while `weapons` and a missile flies. */
  steer: number;
  /** `laserLock {room}`: the enemy Room to lock, or null for no command this tick. */
  laserLock: number | null;
  /** `laserCharge {held}`: true = press, false = release, null = no command this tick. */
  laserCharge: boolean | null;
  /** `missileLaunch`. */
  missileLaunch: boolean;
}

/** A crew that sits at both consoles and does nothing. */
export const IDLE_INPUT: ShipInput = { helm: true, weapons: true, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false };

/** Whether ship i's laser is fully charged. */
export function laserFull(state: TacticalState, i: number): boolean { return state.ships[i]!.laserCharge >= LASER_CHARGE_UNITS; }

/** The laser cannot charge, hold or fire while its ship's missile flies or its Weapons console is empty (spec §7 table). */
export function laserFrozen(state: TacticalState, i: number, input: ShipInput): boolean {
  return state.missiles[i] !== null || !input.weapons;
}

/** Whether ship i's laser would hit ship j now: inside the ±60° arc and range, with line of sight (spec §7a). */
export function laserEligible(state: TacticalState, i: number, j: number): boolean {
  const a = state.ships[i]!, b = state.ships[j]!, dx = b.x - a.x, dy = b.y - a.y;
  if (dx * dx + dy * dy > LASER_RANGE * LASER_RANGE) return false;
  return inArc(a.heading, dx, dy, LASER_ARC_COS) && lineOfSight(state, a.x, a.y, b.x, b.y);
}

function fireLaser(state: TacticalState, i: number): void {
  const a = state.ships[i]!, j = 1 - i, b = state.ships[j]!, hit = laserEligible(state, i, j);
  a.shots++;
  if (hit) {
    a.laserHits++;
    if (b.shields > 0) { b.shields--; b.shieldClock = 0; a.layersStripped++; }
    else {
      if (b.rooms[a.lock]! < 2) b.rooms[a.lock as 0 | 1 | 2]++;
      b.hull = Math.max(0, b.hull - LASER_HULL);
    }
  }
  state.events.push({ kind: 'laser', ship: i, hit, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  a.laserCharge = 0; a.laserHold = 0;
}

/** Apply ship i's weapon commands for this tick, before anything moves (spec §7 table). */
export function applyWeaponsInput(state: TacticalState, i: number, input: ShipInput): void {
  const s = state.ships[i]!;
  if (!input.weapons) { s.fireHeld = false; return; }   // unattended: Fire lets go without firing or discarding
  if (input.laserLock !== null && input.laserLock >= 0 && input.laserLock <= 2) s.lock = input.laserLock;
  if (input.laserCharge !== null && state.missiles[i] === null) {
    if (input.laserCharge) s.fireHeld = true;
    else if (s.fireHeld) {
      s.fireHeld = false;
      if (laserFull(state, i)) fireLaser(state, i);
      else { s.laserCharge = 0; s.laserHold = 0; }
    }
  }
  if (input.missileLaunch && state.missiles[i] === null && s.magazine > 0 && s.rooms[Room.Weapons] < 2) {
    launchMissile(state, i);
    s.fireHeld = false;
  }
}

/** Advance ship i's laser charge and hold timer, shields and magazine by one tick (spec §5, §7). */
export function tickWeapons(state: TacticalState, i: number, input: ShipInput): void {
  const s = state.ships[i]!;
  if (!laserFrozen(state, i, input)) {
    if (s.fireHeld && !laserFull(state, i)) s.laserCharge = Math.min(LASER_CHARGE_UNITS, s.laserCharge + LASER_CHARGE_RATE[s.rooms[Room.Weapons]]!);
    else if (laserFull(state, i) && ++s.laserHold >= LASER_HOLD_TICKS) { s.laserCharge = 0; s.laserHold = 0; }   // vents; recharges if still held
  }
  if (s.shields >= SHIELD_LAYERS) s.shieldClock = 0;
  else if ((s.shieldClock += SHIELD_RATE[s.rooms[Room.Shields]]!) >= SHIELD_RECHARGE_UNITS) { s.shields++; s.shieldClock = 0; }   // rate 0: held
  if (s.magazine >= MAGAZINE) s.magazineClock = 0;
  else if (++s.magazineClock >= MAGAZINE_REGEN_TICKS) { s.magazine++; s.magazineClock = 0; }
}

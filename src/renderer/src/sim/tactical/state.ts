// Tactical state (spec §3 to §9; engine refactor spec §5, R-2): N ship slots, each a body in space (`ships[i]`) and a
// systems record (`systems[i]`), a missile pool, the hunter's brain and the outcome. The duel fills two slots: the
// crew's Cutter in slot 0 and the hunter in slot 1; slots always update in slot order. A slot's weapons fire at its
// locked target (`systems[i].target`). All fields are flat scalars or arrays, so the flatten and the clone stay simple.
import { createRng, nextInt, type RngState } from '../../../../shared/rng';
import { DUEL_CLASSES, pewFullCharge, SHIP_CLASSES, ShipClass, type ShipClassDef } from './defs';
import { DUEL_SYSTEM_COUNT, SHIELD_LAYERS_BY_BARS, START_BARS, START_WEAPON_POWER, WEAPON_SLOTS } from './bars';
import { dirBetween } from './direction';
import { buildGrid, type BroadPhase } from './grid';
import { generateMap, type MapDef, type Spawn } from './map';
import { cloneTacticalFromModule } from './hash';
import { initRocks, rockCapacity } from './rocks';
import { DERELICT_FAR_MIN, DERELICT_NEAR_MIN, DERELICT_PHASE_DRAWS, DERELICT_SPAWN_CLEAR, GUN_POOL, HEADING_COUNT, HUNTER_MISSILE_COOLDOWN_TICKS, HUNTER_TRAIL_TICKS, PEW_POOL } from './tuning';

/** Tactical rooms (spec §5); the index into ShipSystems.rooms. */
export const Room = { Weapons: 0, Shields: 1, Engines: 2 } as const;

/** At least two ship slots: an encounter always has the crew's ship and one other (engine refactor spec §5). */
export type Slots<T> = [T, T, ...T[]];

/** A ship in space: kinematics, contact grace and the contact counters (engine refactor spec §5: the tactical layer keeps
 *  only kinematics plus a ship index, the slot). An inactive slot holds zeros. */
export interface Ship {
  active: boolean;
  x: number; y: number; vx: number; vy: number;
  /** Heading index 0..255 and the fractional turn accumulator (spec §4). */
  heading: number; headingAcc: number;
  /** Tick from which contact with body id k may cost hull again: 0 the planet, 1..n asteroid k − 1, then the other ship
   *  slots in slot order, skipping its own (shipBody). */
  graceUntil: Int32Array;
  planetHits: number; asteroidHits: number; shipHits: number;
  /** Stabilise (spec §6): true while both axes were zero last tick; the skid captured at release and still to remove, and its side (±1). */
  released: boolean; skidBudget: number; skidSign: number;
}

/** A ship's systems record (engine refactor spec §5, R-2): its class, its locked target, hull, room damage, shields, the
 *  laser, the magazine and the weapon counters. The duel's rules are unchanged: repair acts on `rooms`, and interior power
 *  is not coupled (R-2b links them). An inactive slot holds zeros. */
export interface ShipSystems {
  /** Index into SHIP_CLASSES. */
  cls: number;
  /** The ship slot its weapons fire at. */
  target: number;
  hull: number;
  /** Damage level 0..2 per Room. */
  rooms: [number, number, number];
  /** Shield layers and the recharge clock in the class's recharge units (spec §5). */
  shields: number; shieldClock: number;
  /** Laser (spec §7a): charge 0..chargeUnits (full), ticks a full charge has been held, whether Fire is held, the locked target Room. */
  laserCharge: number; laserHold: number; fireHeld: boolean; lock: number;
  /** FTL targeting spec §2 (the crew only): whether the laser has a target (`lock`), on which it auto-fires; the
   *  torpedo's target Room (−1 none), cleared by its launch; the Room the torpedo in flight strikes (−1: the lock room).
   *  An inactive slot holds zeros. */
  laserTargeted: boolean; torpLock: number; torpRoom: number;
  /** Weapons update spec §1: the burst's shots still to fire after the first, and the ticks until the next one. */
  laserBurst: number; laserBurstClock: number;
  /** Sci-1 spec §4.4: the laser's tuned frequency 0..2 (A..C); only the crew's ever changes (laserFrequency). */
  freq: number;
  /** Missiles in the magazine and the regain clock in ticks (spec §7b). */
  magazine: number; magazineClock: number;
  /** Spike ii §6.1: the laser's rock target (a slot, −1 none); the next torpedo's rock target (a slot, −1 none, a single
   *  shot like torpLock); the flying torpedo's rock (a slot, −1 none: today's rules, −2 its rock broke: unguided). §8:
   *  the rocks this ship broke this round (its laser, its torpedo's direct hit or blast, its ram). */
  laserRock: number; torpRock: number; torpRockFlying: number; rocksBroken: number;
  /** Telemetry counters (spec §13). */
  shots: number; laserHits: number; layersStripped: number; missilesLaunched: number; missileHits: number; missilesLost: number;
  /** Valkyrn spec §7.1, §7.2 (the gun; all zero on a class without one and on a ship nobody fires at): its heat
   *  0..heatMax, whether the lockout holds, the ticks until it may fire again, the next muzzle (0 starboard, 1 port); as a
   *  target, the round hits toward a shield layer, toward a hull point and toward each Room's next level; and the
   *  telemetry counters (rounds fired, rounds that hit). */
  gunHeat: number; gunLocked: boolean; gunCooldown: number; gunMuzzle: number;
  gunWear: number; gunHull: number; gunRoomWear: [number, number, number];
  gunShots: number; gunHits: number;
  /** Engineering spike spec §2: the crew ship's powered reactor bars per system (Shields, Weapons, Engines, Sensors,
   *  Oxygen; sim/tactical/bars.ts). START_BARS on the crew slot at a round's start, zeros on every other slot (never read). */
  bars: number[];
  /** Engineering spike spec §10.3: the Weapons bars the officer gave each weapon (pew pew, beam, torpedo; 0..3, or 4 with
   *  the overdrive bar). The crew slot starts at START_WEAPON_POWER, every other slot at zeros (never read). Readers trim it. */
  weaponPower: number[];
  /** W-1 (pew pew spec §1, §4): the pew's charge in units, 0..shots × pewThird (Engineering spike §11: a third is
   *  rechargeTicks × PEW_CHARGE_SCALE units; the crew's refills at its pew pew bars' rate; a round spends one third), and its telemetry counters (rounds fired, rounds that hit a ship). All zero on a class
   *  without the pew. */
  pewCharge: number; pewShots: number; pewHits: number;
  /** W-2 (pew pew spec §2, §4): the laser's mode, false AUTO (it fires at its target by itself, as before) or true MANUAL
   *  (it charges as before but fires only on laserFire, along an aim); only the crew's is ever MANUAL (laserMode), and every
   *  round starts AUTO. `laserAim`: the fine aim (0..AIM_STEPS − 1) a MANUAL burst's pending shots fire along, −1 while no
   *  MANUAL burst is pending. An inactive slot holds zeros. */
  laserManual: boolean; laserAim: number;
  /** W-3 (pew pew spec §3, §4): the torpedo's mode, false AUTO (launched on a lock in range, homing, as before) or true
   *  MANUAL (launched by missileLaunch alone, with no lock or range, and flown by the Weapons seat); only the crew's is
   *  ever MANUAL (torpMode), and every round starts AUTO. A launch copies it onto the torpedo (Missile.manual). */
  torpManual: boolean;
  /** W-4 spec §3.1: the Hound's turrets, each a signed offset from the nose in fine heading steps (AIM_STEPS to the turn),
   *  within ± its class's turret arcSteps (0 on a class without that turret). W-4 amendment §2.1: each gun's own mode,
   *  pew pew's and the autocannon's, false AUTO, true MAN (gunMode {slot}; only the crew slot of a class whose weapon in
   *  that slot has a turret is ever MAN). Every round starts 0 / 0 / AUTO / AUTO. */
  pewTurret: number; gunTurret: number; pewManual: boolean; gunManual: boolean;
}

/** A cruise missile's flight (spec §7b). */
export interface MissileFlight { x: number; y: number; vx: number; vy: number; heading: number; headingAcc: number; age: number }
/** A missile pool entry: in flight or free, and the ship slot that launched it. At most one in flight per ship; a free
 *  entry holds zeros. W-3 (pew pew spec §3): `manual`, the launcher's torpedo mode at launch (a MANUAL torpedo flies its
 *  ship's Weapons input and strikes the room under its impact point); a toggle during the flight never changes it. */
export interface Missile extends MissileFlight { active: boolean; owner: number; manual: boolean }
/** Valkyrn spec §7.2: a gun round in the pool: its position, velocity (u/s) and ticks flown, the ship slot that fired
 *  it, and whether it flies. W-4 amendment §3.3: `room`, the target room it was fired at: 0 for none, else the Room index
 *  + 1 (1 Weapons, 2 Shields, 3 Engines); set only on a round the crew fires by hand from a turret, and never changed in
 *  flight. A free entry holds zeros. */
export interface GunRound { x: number; y: number; vx: number; vy: number; age: number; owner: number; active: boolean; room: number }
/** A free round pool entry. */
export function emptyRound(): GunRound { return { x: 0, y: 0, vx: 0, vy: 0, age: 0, owner: 0, active: false, room: 0 }; }
/** W-4 amendment §3.3: the Room a round's tag names (tag − 1), or −1 for an untagged round (0) or any other value. */
export function roundRoom(tag: number): -1 | 0 | 1 | 2 { return tag === 1 ? 0 : tag === 2 ? 1 : tag === 3 ? 2 : -1; }

export const HunterMode = { Hunt: 0, Repair: 1 } as const;
/** The enemy's brain (spec §9). */
export interface Hunter {
  mode: number;
  /** Repair: the Room being repaired, ticks left in this phase, and whether the walk is over. */
  room: number; timer: number; working: boolean;
  /** Tick on which the jittered release is due, or −1 when none is scheduled. */
  fireAt: number;
  lastLaunch: number;
  /** Ring buffer of its target's last HUNTER_TRAIL_TICKS positions (x, y pairs); trailHead is the oldest entry. */
  trail: Float64Array; trailHead: number;
  /** W-1 (pew pew spec §1): the pew rounds still to fire in this attack burst (0: none, it waits for a full charge), and
   *  the ticks until the burst's next round may go. */
  pewBurst: number; pewClock: number;
}

export const Outcome = { Running: 0, CrewWins: 1, EnemyWins: 2, Draw: 3 } as const;

/** Map contacts (Sci-1 spec §4): ids, not ship slots. The enemy is drawn and aimed through the hunter's slot; the
 *  derelict has no slot. */
export const Contact = { Enemy: 0, Derelict: 1 } as const;
/** The derelict's loot (spec §4.5). */
export const Loot = { Hull: 0, Missiles: 1, Shield: 2 } as const;
/** The highest level each contact can be known to: the enemy Level 2, the derelict Level 1. */
export const CONTACT_MAX_LEVEL: readonly [number, number] = [2, 1];
/** The ship's one scanner (spec §4.3): the contact and level it scans, its progress in scan units, its rate per tick and
 *  the station index it runs from. Idle: contact −1 and the other four 0. */
export interface Scan { contact: number; level: number; progress: number; rate: number; by: number }
/** The derelict (spec §4.5): its orbit radius and starting phase (a heading index), its loot, whether it is trapped,
 *  the salvage hold in ticks and whether it has been salvaged. */
export interface Derelict { orbitR: number; phase: number; loot: number; trapped: boolean; salvage: number; salvaged: boolean }
/** An idle scanner. */
export function idleScan(): Scan { return { contact: -1, level: 0, progress: 0, rate: 0, by: 0 }; }

/** Per-tick events for the views (shots and missile endings). Reset every tick and not hashed. */
export type DuelEvent =
  /** A laser release. `stripped`: it took a shield layer; `room`: the Room it struck (its level may already have been 2), or −1 (a miss or a stripped layer).
   *  SPIKE: `rock`, the rock slot the shot struck instead (x2, y2 the impact point), when present and ≥ 0. */
  | { kind: 'laser'; ship: number; hit: boolean; stripped: boolean; room: number; x1: number; y1: number; x2: number; y2: number; rock?: number }
  /** A missile ended. `target`: the ship it landed on (its own ship for a self-hit), or −1; `room`: the Room it struck, or −1. */
  | { kind: 'missileEnd'; ship: number; cause: 'ship' | 'planet' | 'asteroid' | 'edge' | 'expired' | 'missile' | 'shot'; target: number; room: number; x: number; y: number }
  /** Sci-1 spec §4.6: the enemy turned hostile this tick, and why (laser before gun before missile before clock; Valkyrn spec §7.2). */
  | { kind: 'hostile'; cause: 'clock' | 'laser' | 'gun' | 'pew' | 'missile' }
  /** Valkyrn spec §7.1: ship `ship` fired a gun round from muzzle `muzzle` (0 starboard, 1 port). */
  | { kind: 'gunFire'; ship: number; muzzle: number }
  /** Valkyrn spec §7.2: a round hit ship `ship` (the target) at the closest-approach point (x, y): `room` the Room it
   *  struck, or −1 on a shield hit; `stripped` when that hit took a layer. */
  | { kind: 'gunHit'; ship: number; room: number; stripped: boolean; hull: boolean; level: boolean; x: number; y: number }   // level: the hit raised the Room's level (Valkyrn spec §7.4)
  /** W-1 (pew pew spec §1): ship `ship` fired a pew round from its muzzle (x, y). */
  | { kind: 'pewFire'; ship: number; x: number; y: number }
  /** W-1: ship `owner`'s pew round hit ship `ship` at (x, y): `stripped` it took a shield layer, `hull` it cost hull.
   *  W-4 amendment §3.4: `room` the Room a round fired by hand wore (−1 for none, and on a shield hit) and `level` whether
   *  that raised its level, as gunHit has. */
  | { kind: 'pewHit'; ship: number; owner: number; stripped: boolean; hull: boolean; room: number; level: boolean; x: number; y: number }
  /** A scan finished: `contact` is now known to `level`. */
  | { kind: 'scanDone'; contact: number; level: number }
  /** The derelict was salvaged: its loot, and whether it was trapped. */
  | { kind: 'salvage'; loot: number; trapped: boolean }
  /** Spike ii §8: rock slot `rock` was hit, split (its `pieces`, piece 0 in its own slot), turned to dust (`rock` −1: a
   *  piece that found no slot), was the torpedo's detonation (`blast`: x, y the blast point, r the radius), or took a
   *  damaging contact (`bump`: x, y the contact point; `other` the second rock of a rock-rock contact). `ship`: the ship
   *  whose laser, torpedo or ram caused it (absent for collisions, the planet, the edge and eviction). */
  | { kind: 'rock'; what: 'hit' | 'split' | 'dust' | 'blast' | 'bump'; by: RockCause; rock: number; x: number; y: number; r: number; vx: number; vy: number; ship?: number; pieces?: number[]; other?: number; evicted?: true };

/** Spike ii §8: what caused a rock event. */
export type RockCause = 'laser' | 'torpedo' | 'collision' | 'ram' | 'planet' | 'edge' | 'gun';   // W-4 spec §5.1: the autocannon's rounds

export interface TacticalState {
  tick: number; seed: number; rng: RngState; map: MapDef; grid: BroadPhase;
  /** Spike ii (rocks.ts): the mutable rock pool and its counters (§8), then the per-tick transient masks (§3.1, §3.3: not
   *  hashed, not snapshotted, cleared at the start and the end of every stepDuel tick). */
  rocks: Float64Array; rockHits: number; rockSplits: number; rockDust: number; rockBlasts: number; rockCollisions: number; rockEvictions: number;
  rockBorn: Uint8Array; rockDone: Uint8Array;
  /** Each slot's body in space. */
  ships: Slots<Ship>;
  /** Each slot's systems record (the ship module's, sim/tactical/hash.ts). */
  systems: Slots<ShipSystems>;
  /** The missile pool: one entry per ship slot. */
  missiles: Slots<Missile>;
  /** Valkyrn spec §7.2: the gun round pool, GUN_POOL entries. */
  rounds: GunRound[];
  /** W-1 (pew pew spec §1): the pew round pool, PEW_POOL entries shared by every ship (the GunRound shape). */
  pew: GunRound[];
  hunter: Hunter;
  outcome: number;
  events: DuelEvent[];
  /** The science module (Sci-1 spec §4, §6.2). `startTick`: the tactical tick the round began on; every round-relative
   *  rule reads rt = tick − startTick. `hostileAt`: the rt the enemy turned hostile, −1 while it holds. `known`: the
   *  level each contact is known to (Contact order). `scan`: the ship's scanner. `designated`: the contact Science
   *  points out, −1 none (no rule reads it). `weakFreq`: the enemy's weak shield frequency 0..2. `derelict`: the wreck. */
  startTick: number; hostileAt: number; known: [number, number]; scan: Scan; designated: number; weakFreq: number; derelict: Derelict;
}

/** Held axes for one ship: turn (+ clockwise) and thrust (+ forward). flyShip quantises the turn by sign and rounds the
 *  thrust to thousandths in −1..1 (NaN counts as 0; playtest2feedback §3). Playtest2feedback §4, §4a: `turnBoost` (1 or 2,
 *  absent 1) multiplies the turn step; `rcsX` (−1 port, 1 starboard) and `rcsY` (−1 aft, 1 forward) are the cold gas
 *  axes that vented this tick (absent 0). */
export interface Axes { turn: number; thrust: number; turnBoost?: number; rcsX?: number; rcsY?: number }
export const NO_AXES: Axes = { turn: 0, thrust: 0 };

/** The crew's ship slot. */
export const CREW_SLOT = 0;

/** Body id of ship slot k in ship i's graceUntil: after the planet and the asteroids, the other slots in slot order. */
export function shipBody(map: MapDef, i: number, k: number): number { return rockCapacity(map) + 1 + (k < i ? k : k - 1); }

function shipAt(s: Spawn, bodies: number): Ship {
  return { active: true, x: s.x, y: s.y, vx: s.vx, vy: s.vy, heading: s.heading, headingAcc: 0, graceUntil: new Int32Array(bodies),
    planetHits: 0, asteroidHits: 0, shipHits: 0, released: false, skidBudget: 0, skidSign: 0 };
}
function emptyShip(bodies: number): Ship {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, graceUntil: new Int32Array(bodies),
    planetHits: 0, asteroidHits: 0, shipHits: 0, released: false, skidBudget: 0, skidSign: 0 };
}
/** A slot's systems at the round's start; the crew's laser starts full (FTL targeting spec §2: the first shot is ready)
 *  and targeted at the enemy's Shields (Feel-i, console feel spec §3: the FTL opener, so the first firing solution fires
 *  with no setup); a class without a laser (Valkyrn spec §6.1) starts empty and untargeted. Every round, the rematch's
 *  included, is built here. */
function systemsFor(cls: number, target: number, crew = false): ShipSystems {
  const c = SHIP_CLASSES[cls]!, laser = c.slots.laser, pew = c.slots.pew;
  return {
    cls, target, hull: c.hull, rooms: [0, 0, 0], shields: crew ? Math.min(c.shields.layers, SHIELD_LAYERS_BY_BARS[START_BARS[0]!]!) : c.shields.layers, shieldClock: 0, laserCharge: crew && laser ? laser.chargeUnits : 0, laserHold: 0, fireHeld: false, lock: Room.Shields,
    laserTargeted: crew && laser !== null, torpLock: -1, torpRoom: -1, laserBurst: 0, laserBurstClock: 0, freq: 0,
    magazine: c.slots.missile.magazine, magazineClock: 0, laserRock: -1, torpRock: -1, torpRockFlying: -1, rocksBroken: 0, shots: 0, laserHits: 0, layersStripped: 0, missilesLaunched: 0, missileHits: 0, missilesLost: 0,
    gunHeat: 0, gunLocked: false, gunCooldown: 0, gunMuzzle: 0, gunWear: 0, gunHull: 0, gunRoomWear: [0, 0, 0], gunShots: 0, gunHits: 0,
    pewCharge: pew ? pewFullCharge(pew) : 0, pewShots: 0, pewHits: 0,   // W-1: a pew starts the round full
    laserManual: false, laserAim: -1,   // W-2: every round starts AUTO, with no MANUAL burst pending
    torpManual: false,   // W-3: and the torpedo too
    pewTurret: 0, gunTurret: 0, pewManual: false, gunManual: false,   // W-4 spec §3.1, amendment §2.1: the turrets on the nose, each gun AUTO
    bars: crew ? [...START_BARS] : Array<number>(DUEL_SYSTEM_COUNT).fill(0),   // Engineering spike spec §2
    weaponPower: crew ? [...START_WEAPON_POWER] : Array<number>(WEAPON_SLOTS).fill(0)   // spec §10.3
  };
}
function emptySystems(): ShipSystems {
  return { cls: 0, target: 0, hull: 0, rooms: [0, 0, 0], shields: 0, shieldClock: 0, laserCharge: 0, laserHold: 0, fireHeld: false, lock: 0, laserTargeted: false, torpLock: 0, torpRoom: 0, laserBurst: 0, laserBurstClock: 0, freq: 0,
    magazine: 0, magazineClock: 0, laserRock: 0, torpRock: 0, torpRockFlying: 0, rocksBroken: 0, shots: 0, laserHits: 0, layersStripped: 0, missilesLaunched: 0, missileHits: 0, missilesLost: 0,
    gunHeat: 0, gunLocked: false, gunCooldown: 0, gunMuzzle: 0, gunWear: 0, gunHull: 0, gunRoomWear: [0, 0, 0], gunShots: 0, gunHits: 0, pewCharge: 0, pewShots: 0, pewHits: 0, laserManual: false, laserAim: 0, torpManual: false, pewTurret: 0, gunTurret: 0, pewManual: false, gunManual: false,
    bars: Array<number>(DUEL_SYSTEM_COUNT).fill(0), weaponPower: Array<number>(WEAPON_SLOTS).fill(0) };
}
/** A free missile pool entry. */
export function emptyMissile(): Missile { return { active: false, owner: 0, x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0, manual: false }; }

function hunterFor(crew: Spawn): Hunter {
  const trail = new Float64Array(2 * HUNTER_TRAIL_TICKS);
  for (let k = 0; k < HUNTER_TRAIL_TICKS; k++) { trail[2 * k] = crew.x; trail[2 * k + 1] = crew.y; }
  return { mode: HunterMode.Hunt, room: 0, timer: 0, working: false, fireAt: -1, lastLaunch: -HUNTER_MISSILE_COOLDOWN_TICKS, trail, trailHead: 0, pewBurst: 0, pewClock: 0 };
}

/** Sci-1 spec §4.5's draws, in order, from the tactical rng right after the map: the enemy's weak frequency; the
 *  derelict's orbit (u ≤ 300 the near band 700..1000, else the far band 1400..1599); its phase, redrawn while it would
 *  start within DERELICT_SPAWN_CLEAR of either spawn, at most DERELICT_PHASE_DRAWS draws in all (the last stands); its
 *  loot; whether it is trapped (one in three). */
function scienceDraws(rng: RngState, map: MapDef): { weakFreq: number; derelict: Derelict } {
  const weakFreq = nextInt(rng, 3), u = nextInt(rng, 501);
  const orbitR = u <= 300 ? DERELICT_NEAR_MIN + u : DERELICT_FAR_MIN + (u - 301);
  const near = (phase: number): boolean => map.spawns.some((s) => {
    const [ux, uy] = dirBetween(phase, 0), dx = ux * orbitR - s.x, dy = uy * orbitR - s.y;   // derelictPos at rt 0
    return dx * dx + dy * dy < DERELICT_SPAWN_CLEAR * DERELICT_SPAWN_CLEAR;
  });
  let phase = nextInt(rng, HEADING_COUNT);
  for (let draws = 1; draws < DERELICT_PHASE_DRAWS && near(phase); draws++) phase = nextInt(rng, HEADING_COUNT);
  const loot = nextInt(rng, 3), trapped = nextInt(rng, 3) === 0;
  return { weakFreq, derelict: { orbitR, phase, loot, trapped, salvage: 0, salvaged: false } };
}

/** A fill of `slots` ship slots (at least 2): the duel's two at the map's spawns, the crew's ship (class `crewClass`,
 *  Valkyrn spec §6.1; the Cutter by default) in slot 0 locked on the hunter in slot 1 and back; any further slot is
 *  inactive (R-5's encounters fill them). The round starts holding (hostileAt −1, full shields) with the science draws
 *  (Sci-1 spec §4.1, §4.5; owner decision 2026-11-17). Throws for a slot count under 2 or a class that is not a crew class. */
export function createTacticalState(seed: number, slots = DUEL_CLASSES.length, crewClass: number = ShipClass.Cutter): TacticalState {
  if (!Number.isInteger(slots) || slots < 2) throw new Error(`a tactical state needs at least 2 ship slots, not ${slots}`);
  if (!Number.isInteger(crewClass) || SHIP_CLASSES[crewClass]?.ai !== 'crew') throw new Error(`invalid crew ship class ${String(crewClass)}`);   // never the Hunter's
  const rng = createRng(seed);
  const map = generateMap(rng);
  const science = scienceDraws(rng, map);   // Sci-1 spec §4.5: right after the map, before anything else reads the rng
  const bodies = rockCapacity(map) + slots, extra = Array.from({ length: slots - 2 });
  return {
    tick: 0, seed, rng, map, grid: buildGrid(map.asteroids, map.rMap), rocks: initRocks(map), rockHits: 0, rockSplits: 0, rockDust: 0, rockBlasts: 0, rockCollisions: 0, rockEvictions: 0,
    rockBorn: new Uint8Array(rockCapacity(map)), rockDone: new Uint8Array(rockCapacity(map)),
    ships: [shipAt(map.spawns[0], bodies), shipAt(map.spawns[1], bodies), ...extra.map(() => emptyShip(bodies))],
    systems: [systemsFor(crewClass, 1, true),systemsFor(DUEL_CLASSES[1]!, 0), ...extra.map(emptySystems)],
    missiles: [emptyMissile(), emptyMissile(), ...extra.map(emptyMissile)],
    rounds: Array.from({ length: GUN_POOL }, emptyRound),
    pew: Array.from({ length: PEW_POOL }, emptyRound),   // W-1 (pew pew spec §1)
    hunter: hunterFor(map.spawns[0]), outcome: Outcome.Running, events: [],
    // Sci-1 (spec §4): the round starts with the enemy unidentified and holding, the scanner idle.
    startTick: 0, hostileAt: -1, known: [0, 0], scan: idleScan(), designated: -1, weakFreq: science.weakFreq, derelict: science.derelict
  };
}

/** Ship slot i's class. */
export function classOf(state: TacticalState, i: number): ShipClassDef { return SHIP_CLASSES[state.systems[i]!.cls]!; }
/** The ship slot ship i's weapons are locked on (engine refactor spec §5: weapons fire at the locked target). */
export function targetOf(state: TacticalState, i: number): number { return state.systems[i]!.target; }

/** Ship i's missile in flight, or null (at most one per ship). */
export function missileOf(state: TacticalState, i: number): Missile | null {
  for (const m of state.missiles) if (m.active && m.owner === i) return m;
  return null;
}
/** W-4 spec §3.4, amendment §2.3 (owner 2026-11-19): whether ship i's gun `slot` (0 pew pew, 1 the autocannon; bars.ts
 *  WeaponSlot) is in the gunner's hands this tick: that gun's own switch is MAN (pewManual, gunManual), and it is the Weapons
 *  seat's selected weapon (`weaponSel`, held input, −1 none). The gun in hand follows the reticle, fires on the trigger and
 *  takes MAN's rates; every other powered gun is AUTO-driven, a MAN one that is not selected too. Only the crew slot of a
 *  turret class is ever MAN (hash.ts), so this is false elsewhere, and for any other slot. W-4c: never while the ship's
 *  MANUAL torpedo flies. */
export function handControl(state: TacticalState, i: number, weaponSel: number, slot: number): boolean {
  const s = state.systems[i]!, manual = slot === 0 ? s.pewManual : slot === 1 && s.gunManual;
  // W-4 spec §3.4, §7 (owner 2026-11-19): while the ship's own MANUAL torpedo flies, no gun is in hand: the reticle is
  // ignored and every powered gun, a MAN one included, slews and fires on AUTO ("guns left on auto keep firing; can't aim or
  // fire guns by hand"). AUTO itself is untouched.
  return manual && weaponSel === slot && missileOf(state, i)?.manual !== true;
}
/** Put a missile in flight for ship i with these flight values: in the entry it already flies in, or the first free one
 *  (the launch, and tests). W-3: `manual` its mode (default AUTO). Returns it. */
export function placeMissile(state: TacticalState, i: number, f: MissileFlight, manual = false): Missile {
  const m = missileOf(state, i) ?? state.missiles.find((e) => !e.active);
  if (!m) throw new Error(`no free missile pool entry for ship ${i}`);
  Object.assign(m, { active: true, owner: i, x: f.x, y: f.y, vx: f.vx, vy: f.vy, heading: f.heading, headingAcc: f.headingAcc, age: f.age, manual });
  return m;
}
/** Free ship i's missile entry, with no event (a missile ending goes through the missile step). */
export function removeMissile(state: TacticalState, i: number): void {
  const m = missileOf(state, i);
  if (m) Object.assign(m, emptyMissile());
}

/** Deep copy of the whole tactical state for snapshots, rollback and replay checks, derived from the space and ship
 *  modules' fields (sim/tactical/hash.ts): a field the modules declare is copied without anything listed here. The map
 *  and broad-phase grid are immutable after creation and are shared. */
export function cloneTactical(s: TacticalState): TacticalState { return cloneTacticalFromModule(s); }

/** Deep copy of a ship's body. Any new nested Ship state (arrays, typed arrays) must be copied here. */
export function cloneShip(s: Ship): Ship {
  return { ...s, graceUntil: new Int32Array(s.graceUntil) };
}

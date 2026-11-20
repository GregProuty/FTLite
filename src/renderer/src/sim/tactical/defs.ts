// Ship classes and weapons as definitions, not one-off constants (engine refactor spec §5, R-2). Today's numbers are
// the `cutter` (the crew's ship) and `hunter` (the enemy's) entries and the `laser` and `missile` weapons, so the change
// is golden-neutral: tuning.ts keeps the numbers as these records' inputs (and for the views), and the sim reads them
// through the records. A ship slot names its class by index into SHIP_CLASSES. Valkyrn-i (Valkyrn spec
// 2026-11-18-valkyrn-solo-ship-design §6.1, §7.1): the `gun` weapon and the two Valkyrn classes, appended so no existing
// class index moves; a class's laser or gun slot may be null.
import {
  CUTTER_LASER_SHOTS, ENGINE_FACTOR, GUN_COOL, GUN_COOL_LOCKED, GUN_HEAT_MAX, GUN_HEAT_PER_SHOT, GUN_HITS_PER_HULL, GUN_HITS_PER_LAYER, GUN_HITS_PER_LEVEL, GUN_INTERVAL_TICKS, GUN_LIFE_TICKS,
  GUN_MUZZLE_LATERAL, GUN_SPEED, HUNTER_HULL, HUNTER_LASER_SHOTS, LASER_ARC_COS, LASER_CHARGE_RATE, LASER_CHARGE_UNITS, LASER_HOLD_TICKS, LASER_BURST_GAP_TICKS, LASER_HULL, LASER_RANGE, MAGAZINE, MAGAZINE_REGEN_TICKS,
  MISSILE_ARM_TICKS, MISSILE_FUEL_TICKS, MISSILE_HULL, MISSILE_BOOST_TICKS, MISSILE_LAUNCH_SPEED, MISSILE_LIFE_TICKS, MISSILE_RADIUS, MISSILE_RANGE, MISSILE_SPAWN_OFFSET, MISSILE_THRUST,
  MISSILE_TURN_STEPS_PER_TICK, REVERSE_FRACTION, SHIELD_LAYERS, SHIELD_RATE, SHIELD_RECHARGE_UNITS, SHIP_HULL, SHIP_RADIUS, THRUST, TURN_STEPS_PER_TICK, VALKYRN_HULL, VALKYRN_THRUST,
  VALKYRN_TURN_STEPS_PER_TICK, PEW_ARC_STEPS, PEW_HULL, PEW_LIFE, PEW_RECHARGE_TICKS, PEW_CHARGE_SCALE, HUNTER_PEW_RECHARGE_TICKS, PEW_SHOTS, PEW_SPEED,
  BOOST_FAR, RCS_TURN_BOOST, AUTOCANNON_ARC_STEPS, AUTOCANNON_TURRET_TRAVERSE, PEW_TURRET_TRAVERSE, AUTOCANNON_HITS_PER_HULL
} from './tuning';
import { AUTOCANNON_INTERVAL_BY_BARS, AUTOCANNON_MAN_INTERVAL_BY_BARS, AUTOCANNON_WEAK_HITS_PER_LAYER } from './bars';   // bars.ts imports only types from state.ts
import { AUTOCANNON_ROCK_PUSH, AUTOCANNON_ROUNDS_PER_ROCK_HP } from './rockTuning';

/** The laser (spec §7a): range and arc, charge in whole units per Weapons damage level, the hold before it vents, hull per
 *  hit, and the shots a full charge fires (weapons update spec §1), each after the burst gap. */
export interface LaserDef {
  readonly kind: 'laser';
  readonly range: number; readonly arcCos: number;
  readonly chargeUnits: number; readonly chargeRate: readonly number[]; readonly holdTicks: number;
  readonly hull: number;
  readonly shots: number; readonly burstGapTicks: number;
}
/** W-4 spec §2, §3: a turret: its arc either side of the nose in fine heading steps (AIM_STEPS to the turn), and its
 *  traverse in fine steps a tick, [AUTO, MAN]. */
export interface TurretDef { readonly arcSteps: number; readonly traverse: readonly [number, number] }
/** W-4 spec §5.1: a gun whose rounds wear rocks: rounds per rock hp, and the push (J) per round. */
export interface GunRockDef { readonly roundsPerHp: number; readonly pushPerRound: number }
/** The minigun (Valkyrn spec §7.1, §7.2): a round every intervalTicks at `speed` (u/s) along the nose plus the ship's
 *  velocity, for lifeTicks, from two muzzles `muzzleForward` ahead of the centre (radius + 1) and `muzzleLateral` either
 *  side; heat per round, the cooling per tick (coolLocked while locked) up to heatMax, where it locks; and the hits its
 *  target takes per shield layer, per hull point and per Room level. */
export interface GunDef {
  readonly kind: 'gun';
  readonly intervalTicks: number; readonly speed: number; readonly lifeTicks: number;
  readonly muzzleForward: number; readonly muzzleLateral: number;
  readonly heatPerShot: number; readonly cool: number; readonly coolLocked: number; readonly heatMax: number;
  readonly hitsPerLayer: number; readonly hitsPerHull: number; readonly hitsPerLevel: number;
  /** W-4 spec §2 (null on the Valkyrn's GUN, which keeps today's code byte for byte): the turret; the fire interval by
   *  [manual ? 1 : 0][trimmed slot-1 bars] (replacing intervalTicks); the rock wear (null: a round is absorbed); the hits a
   *  layer on the crew's weak frequency (null: always hitsPerLayer). */
  readonly turret: TurretDef | null;
  readonly intervalByBars: readonly (readonly number[])[] | null;
  readonly rock: GunRockDef | null;
  readonly weakHitsPerLayer: number | null;
}
/** The cruise missile (spec §7b): the magazine and its regain time, the body, its flight and its hull per hit. */
export interface MissileDef {
  readonly kind: 'missile';
  /** Weapons update spec §2: the launch range to the target's centre, and the unguided ticks after launch. */
  readonly range: number; readonly boostTicks: number;
  readonly magazine: number; readonly regenTicks: number;
  readonly radius: number; readonly spawnOffset: number; readonly launchSpeed: number;
  readonly thrust: number; readonly turnStepsPerTick: number; readonly fuelTicks: number; readonly lifeTicks: number; readonly armTicks: number;
  readonly hull: number;
}
/** W-1 (pew pew spec §1): the pew pew: shots thirds of charge, a third back every rechargeTicks; a round at `speed` (u/s)
 *  for lifeTicks from `muzzleForward` ahead of the centre (radius + 1), along an aim clamped to ±arcSteps fine heading
 *  units about the heading; `hull` per unshielded hit. */
export interface PewDef {
  readonly kind: 'pew';
  readonly shots: number; readonly rechargeTicks: number;
  readonly speed: number; readonly lifeTicks: number; readonly hull: number;
  readonly arcSteps: number; readonly muzzleForward: number;
  /** W-4 spec §2, §3: the Hound's pew turret (null on PEW and HUNTER_PEW: no turret, no weak-frequency strip). */
  readonly turret: TurretDef | null;
}
export type WeaponDef = LaserDef | GunDef | MissileDef | PewDef;

/** A ship class (spec §5): hull, flight, radius, shields, power, weapon slots and its AI profile. */
export interface ShipClassDef {
  readonly id: string;
  readonly hull: number; readonly radius: number;
  /** Forward thrust (u/s²), the reverse share of it, turn steps per tick, and the factor per Engines damage level. */
  readonly thrust: number; readonly reverseFraction: number; readonly turnStepsPerTick: number; readonly engineFactor: readonly number[];
  /** Shield layers, the recharge clock's units per layer, and units per tick per Shields damage level. */
  readonly shields: { readonly layers: number; readonly rechargeUnits: number; readonly rate: readonly number[] };
  /** Reactor power for the interior link; null while interior power is not coupled to the fight (R-2b couples it). */
  readonly power: number | null;
  /** A laser slot, a gun slot and a pew slot, any of which may be null (Valkyrn spec §6.1; W-1: the Cutter and the Hunter
   *  carry the pew), and the missile slot. */
  readonly slots: { readonly laser: LaserDef | null; readonly gun: GunDef | null; readonly pew: PewDef | null; readonly missile: MissileDef };
  /** Who flies it when no player does: nobody ('crew') or the hunter's state machine (sim/tactical/hunter.ts). */
  readonly ai: 'crew' | 'hunter';
  /** Playtest2feedback §1: the crew Helm flies Newtonian (no drag, the held throttle, cold gas, mouse steering, the
   *  ENGINE / COMPRESSOR split) in the crew slot. True only on the Cutter. */
  readonly newtonianHelm: boolean;
}

function laser(shots: number): LaserDef {
  return Object.freeze({
    kind: 'laser', range: LASER_RANGE, arcCos: LASER_ARC_COS, chargeUnits: LASER_CHARGE_UNITS, chargeRate: LASER_CHARGE_RATE, holdTicks: LASER_HOLD_TICKS, hull: LASER_HULL,
    shots, burstGapTicks: LASER_BURST_GAP_TICKS
  });
}
/** The crew's double laser and the Hunter's single one (weapons update spec §1). */
export const LASER: LaserDef = laser(CUTTER_LASER_SHOTS);
export const HUNTER_LASER: LaserDef = laser(HUNTER_LASER_SHOTS);
export const MISSILE: MissileDef = Object.freeze({
  kind: 'missile', range: MISSILE_RANGE, boostTicks: MISSILE_BOOST_TICKS, magazine: MAGAZINE, regenTicks: MAGAZINE_REGEN_TICKS, radius: MISSILE_RADIUS, spawnOffset: MISSILE_SPAWN_OFFSET, launchSpeed: MISSILE_LAUNCH_SPEED,
  thrust: MISSILE_THRUST, turnStepsPerTick: MISSILE_TURN_STEPS_PER_TICK, fuelTicks: MISSILE_FUEL_TICKS, lifeTicks: MISSILE_LIFE_TICKS, armTicks: MISSILE_ARM_TICKS, hull: MISSILE_HULL
});
/** The Valkyrn's minigun (Valkyrn spec §7.1). */
export const GUN: GunDef = Object.freeze({
  kind: 'gun', intervalTicks: GUN_INTERVAL_TICKS, speed: GUN_SPEED, lifeTicks: GUN_LIFE_TICKS, muzzleForward: SHIP_RADIUS + 1, muzzleLateral: GUN_MUZZLE_LATERAL,
  heatPerShot: GUN_HEAT_PER_SHOT, cool: GUN_COOL, coolLocked: GUN_COOL_LOCKED, heatMax: GUN_HEAT_MAX,
  hitsPerLayer: GUN_HITS_PER_LAYER, hitsPerHull: GUN_HITS_PER_HULL, hitsPerLevel: GUN_HITS_PER_LEVEL, turret: null, intervalByBars: null, rock: null, weakHitsPerLayer: null
});

/** W-1 (pew pew spec §1): the pew pew, with no turret; the Hound's HOUND_PEW and the Hunter's HUNTER_PEW spread it (W-4 spec §2). */
export const PEW: PewDef = Object.freeze({
  kind: 'pew', shots: PEW_SHOTS, rechargeTicks: PEW_RECHARGE_TICKS, speed: PEW_SPEED, lifeTicks: PEW_LIFE, hull: PEW_HULL, arcSteps: PEW_ARC_STEPS, muzzleForward: SHIP_RADIUS + 1, turret: null
});
/** W-1 (Task 6 tuning): the Hunter's pew pew, the crew's but refilling a third every HUNTER_PEW_RECHARGE_TICKS. */
export const HUNTER_PEW: PewDef = Object.freeze({ ...PEW, rechargeTicks: HUNTER_PEW_RECHARGE_TICKS });
/** W-4 spec §3.3: the Hound's turrets. */
export const PEW_TURRET: TurretDef = Object.freeze({ arcSteps: PEW_ARC_STEPS, traverse: PEW_TURRET_TRAVERSE });
export const AUTOCANNON_TURRET: TurretDef = Object.freeze({ arcSteps: AUTOCANNON_ARC_STEPS, traverse: AUTOCANNON_TURRET_TRAVERSE });
/** W-4 spec §2, §5: the Valkyrn's gun moved onto the Hound: its numbers, a ±30° turret, the interval by bars, the rock
 *  wear and the weak-frequency layer. Gate tuning moves only these copies, never GUN's. */
export const AUTOCANNON: GunDef = Object.freeze({
  ...GUN, hitsPerHull: AUTOCANNON_HITS_PER_HULL, turret: AUTOCANNON_TURRET, intervalByBars: Object.freeze([AUTOCANNON_INTERVAL_BY_BARS, AUTOCANNON_MAN_INTERVAL_BY_BARS]),
  rock: Object.freeze({ roundsPerHp: AUTOCANNON_ROUNDS_PER_ROCK_HP, pushPerRound: AUTOCANNON_ROCK_PUSH }), weakHitsPerLayer: AUTOCANNON_WEAK_HITS_PER_LAYER
});
/** W-4 spec §2: the Hound's pew pew, on its turret. */
export const HOUND_PEW: PewDef = Object.freeze({ ...PEW, turret: PEW_TURRET });
/** W-4 spec §1: a class whose gun or pew has a turret (the Hound only): the new Weapons seat, keys and fences. */
export function hasTurret(cls: ShipClassDef): boolean { return (cls.slots.gun?.turret ?? null) !== null || (cls.slots.pew?.turret ?? null) !== null; }
/** Engineering spike §11: one third of a pew's charge in charge units (rechargeTicks × PEW_CHARGE_SCALE), and a full charge. */
export function pewThird(def: PewDef): number { return def.rechargeTicks * PEW_CHARGE_SCALE; }
export function pewFullCharge(def: PewDef): number { return def.shots * pewThird(def); }

/** A class's flight numbers that differ between classes: forward thrust and turn steps per tick. */
interface Flight { readonly thrust: number; readonly turnStepsPerTick: number }
const STANDARD: Flight = { thrust: THRUST, turnStepsPerTick: TURN_STEPS_PER_TICK };
const FIGHTER: Flight = { thrust: VALKYRN_THRUST, turnStepsPerTick: VALKYRN_TURN_STEPS_PER_TICK };   // Valkyrn spec §6.1

function shipClass(id: string, ai: ShipClassDef['ai'], hull: number, laser: LaserDef | null, gun: GunDef | null = null, flight: Flight = STANDARD, pew: PewDef | null = null): ShipClassDef {
  return Object.freeze({
    id, hull, radius: SHIP_RADIUS, thrust: flight.thrust, reverseFraction: REVERSE_FRACTION, turnStepsPerTick: flight.turnStepsPerTick, engineFactor: ENGINE_FACTOR,
    shields: Object.freeze({ layers: SHIELD_LAYERS, rechargeUnits: SHIELD_RECHARGE_UNITS, rate: SHIELD_RATE }), power: null,
    slots: Object.freeze({ laser, gun, pew, missile: MISSILE }), ai, newtonianHelm: false
  });
}
/** The crew's ship and the enemy's: the same flight and shields but the hull, told apart by their AI profile. The Hunter
 *  keeps its single laser and the pew pew (refilling slower, HUNTER_PEW); the Hound has no laser.
 *  W-4 spec §2: the Hound: pew pew and the autocannon on turrets and the torpedo; its laser slot is null (the beam left;
 *  every slots.laser reader already guards null, Valkyrn spec §6.1). Playtest2feedback §1: the crew Helm's Newtonian flight. */
export const CUTTER_CLASS: ShipClassDef = Object.freeze({ ...shipClass('cutter', 'crew', SHIP_HULL, null, AUTOCANNON, STANDARD, HOUND_PEW), newtonianHelm: true });
export const HUNTER_CLASS = shipClass('hunter', 'hunter', HUNTER_HULL, HUNTER_LASER, null, STANDARD, HUNTER_PEW);
/** Valkyrn spec §6.1, §8: the solo fighter (the gun and the torpedo, no laser) and its developer laser fit (the Cutter's
 *  double laser and torpedo on the Valkyrn's hull and flight). */
export const VALKYRN_CLASS = shipClass('valkyrn', 'crew', VALKYRN_HULL, null, GUN, FIGHTER);
export const VALKYRN_LASER_CLASS = shipClass('valkyrnLaser', 'crew', VALKYRN_HULL, LASER, null, FIGHTER);
/** Every ship class by index (a ship slot's class index). */
export const SHIP_CLASSES: readonly ShipClassDef[] = Object.freeze([CUTTER_CLASS, HUNTER_CLASS, VALKYRN_CLASS, VALKYRN_LASER_CLASS]);
export const ShipClass = { Cutter: 0, Hunter: 1, Valkyrn: 2, ValkyrnLaser: 3 } as const;
/** The duel's slots: the crew's Cutter in slot 0, the hunter in slot 1 (the crew slot's class can differ: createTacticalState). */
export const DUEL_CLASSES: readonly number[] = Object.freeze([ShipClass.Cutter, ShipClass.Hunter]);

/** A class's index by its id (a layout's `shipClass`, Valkyrn spec §3.1). Throws on an unknown id. */
export function classIndexById(id: string): number {
  const k = SHIP_CLASSES.findIndex((c) => c.id === id);
  if (k < 0) throw new Error(`unknown ship class ${id}`);
  return k;
}

// Valkyrn spec §6.2: the aim's dead band is three heading indices wide, so a class that turns 3 or more steps a tick
// could step across it and chatter. Valkyrn spec §7.1: Weapons damage halves the gun's coolings in whole units.
for (const c of SHIP_CLASSES) if (!(c.turnStepsPerTick < 3)) throw new Error(`ship class ${c.id} turns ${c.turnStepsPerTick} heading steps a tick; the aim band needs fewer than 3`);
// Playtest2feedback §4a: a boosted turn (RCS_TURN_BOOST × the class turn) must stay inside the far band, so it never
// steps across the normal turn's own bands and the nose never chatters.
for (const c of SHIP_CLASSES) if (c.newtonianHelm && !(RCS_TURN_BOOST * c.turnStepsPerTick < BOOST_FAR)) throw new Error(`ship class ${c.id} turns ${RCS_TURN_BOOST * c.turnStepsPerTick} boosted heading steps a tick; the far band needs fewer than ${BOOST_FAR}`);
if (!Number.isInteger(GUN.cool / 2) || !Number.isInteger(GUN.coolLocked / 2)) throw new Error('the gun\'s coolings must be even, so Weapons damage halves them exactly');

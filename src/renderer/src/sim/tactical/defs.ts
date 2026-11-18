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
  VALKYRN_TURN_STEPS_PER_TICK
} from './tuning';

/** The laser (spec §7a): range and arc, charge in whole units per Weapons damage level, the hold before it vents, hull per
 *  hit, and the shots a full charge fires (weapons update spec §1), each after the burst gap. */
export interface LaserDef {
  readonly kind: 'laser';
  readonly range: number; readonly arcCos: number;
  readonly chargeUnits: number; readonly chargeRate: readonly number[]; readonly holdTicks: number;
  readonly hull: number;
  readonly shots: number; readonly burstGapTicks: number;
}
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
export type WeaponDef = LaserDef | GunDef | MissileDef;

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
  /** A laser slot and a gun slot, either of which may be null (Valkyrn spec §6.1), and the missile slot. */
  readonly slots: { readonly laser: LaserDef | null; readonly gun: GunDef | null; readonly missile: MissileDef };
  /** Who flies it when no player does: nobody ('crew') or the hunter's state machine (sim/tactical/hunter.ts). */
  readonly ai: 'crew' | 'hunter';
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
  hitsPerLayer: GUN_HITS_PER_LAYER, hitsPerHull: GUN_HITS_PER_HULL, hitsPerLevel: GUN_HITS_PER_LEVEL
});

/** A class's flight numbers that differ between classes: forward thrust and turn steps per tick. */
interface Flight { readonly thrust: number; readonly turnStepsPerTick: number }
const STANDARD: Flight = { thrust: THRUST, turnStepsPerTick: TURN_STEPS_PER_TICK };
const FIGHTER: Flight = { thrust: VALKYRN_THRUST, turnStepsPerTick: VALKYRN_TURN_STEPS_PER_TICK };   // Valkyrn spec §6.1

function shipClass(id: string, ai: ShipClassDef['ai'], hull: number, laser: LaserDef | null, gun: GunDef | null = null, flight: Flight = STANDARD): ShipClassDef {
  return Object.freeze({
    id, hull, radius: SHIP_RADIUS, thrust: flight.thrust, reverseFraction: REVERSE_FRACTION, turnStepsPerTick: flight.turnStepsPerTick, engineFactor: ENGINE_FACTOR,
    shields: Object.freeze({ layers: SHIELD_LAYERS, rechargeUnits: SHIELD_RECHARGE_UNITS, rate: SHIELD_RATE }), power: null,
    slots: Object.freeze({ laser, gun, missile: MISSILE }), ai
  });
}
/** The crew's ship and the enemy's: the same numbers but the hull and the laser's shots, told apart by their AI profile. */
export const CUTTER_CLASS = shipClass('cutter', 'crew', SHIP_HULL, LASER);
export const HUNTER_CLASS = shipClass('hunter', 'hunter', HUNTER_HULL, HUNTER_LASER);
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
if (!Number.isInteger(GUN.cool / 2) || !Number.isInteger(GUN.coolLocked / 2)) throw new Error('the gun\'s coolings must be even, so Weapons damage halves them exactly');

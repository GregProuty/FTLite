// Ship classes and weapons as definitions, not one-off constants (engine refactor spec §5, R-2). Today's numbers are
// the `cutter` (the crew's ship) and `hunter` (the enemy's) entries and the `laser` and `missile` weapons, so the change
// is golden-neutral: tuning.ts keeps the numbers as these records' inputs (and for the views), and the sim reads them
// through the records. A ship slot names its class by index into SHIP_CLASSES.
import {
  ENGINE_FACTOR, LASER_ARC_COS, LASER_CHARGE_RATE, LASER_CHARGE_UNITS, LASER_HOLD_TICKS, LASER_HULL, LASER_RANGE, MAGAZINE, MAGAZINE_REGEN_TICKS,
  MISSILE_ARM_TICKS, MISSILE_FUEL_TICKS, MISSILE_HULL, MISSILE_LAUNCH_SPEED, MISSILE_LIFE_TICKS, MISSILE_RADIUS, MISSILE_SPAWN_OFFSET, MISSILE_THRUST,
  MISSILE_TURN_STEPS_PER_TICK, REVERSE_FRACTION, SHIELD_LAYERS, SHIELD_RATE, SHIELD_RECHARGE_UNITS, SHIP_HULL, SHIP_RADIUS, THRUST, TURN_STEPS_PER_TICK
} from './tuning';

/** The laser (spec §7a): range and arc, charge in whole units per Weapons damage level, the hold before it vents, hull per hit. */
export interface LaserDef {
  readonly kind: 'laser';
  readonly range: number; readonly arcCos: number;
  readonly chargeUnits: number; readonly chargeRate: readonly number[]; readonly holdTicks: number;
  readonly hull: number;
}
/** The cruise missile (spec §7b): the magazine and its regain time, the body, its flight and its hull per hit. */
export interface MissileDef {
  readonly kind: 'missile';
  readonly magazine: number; readonly regenTicks: number;
  readonly radius: number; readonly spawnOffset: number; readonly launchSpeed: number;
  readonly thrust: number; readonly turnStepsPerTick: number; readonly fuelTicks: number; readonly lifeTicks: number; readonly armTicks: number;
  readonly hull: number;
}
export type WeaponDef = LaserDef | MissileDef;

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
  /** One laser and one missile slot, as today. */
  readonly slots: { readonly laser: LaserDef; readonly missile: MissileDef };
  /** Who flies it when no player does: nobody ('crew') or the hunter's state machine (sim/tactical/hunter.ts). */
  readonly ai: 'crew' | 'hunter';
}

export const LASER: LaserDef = Object.freeze({
  kind: 'laser', range: LASER_RANGE, arcCos: LASER_ARC_COS, chargeUnits: LASER_CHARGE_UNITS, chargeRate: LASER_CHARGE_RATE, holdTicks: LASER_HOLD_TICKS, hull: LASER_HULL
});
export const MISSILE: MissileDef = Object.freeze({
  kind: 'missile', magazine: MAGAZINE, regenTicks: MAGAZINE_REGEN_TICKS, radius: MISSILE_RADIUS, spawnOffset: MISSILE_SPAWN_OFFSET, launchSpeed: MISSILE_LAUNCH_SPEED,
  thrust: MISSILE_THRUST, turnStepsPerTick: MISSILE_TURN_STEPS_PER_TICK, fuelTicks: MISSILE_FUEL_TICKS, lifeTicks: MISSILE_LIFE_TICKS, armTicks: MISSILE_ARM_TICKS, hull: MISSILE_HULL
});

function shipClass(id: string, ai: ShipClassDef['ai']): ShipClassDef {
  return Object.freeze({
    id, hull: SHIP_HULL, radius: SHIP_RADIUS, thrust: THRUST, reverseFraction: REVERSE_FRACTION, turnStepsPerTick: TURN_STEPS_PER_TICK, engineFactor: ENGINE_FACTOR,
    shields: Object.freeze({ layers: SHIELD_LAYERS, rechargeUnits: SHIELD_RECHARGE_UNITS, rate: SHIELD_RATE }), power: null,
    slots: Object.freeze({ laser: LASER, missile: MISSILE }), ai
  });
}
/** The crew's ship and the enemy's: the same numbers today, told apart by their AI profile. */
export const CUTTER_CLASS = shipClass('cutter', 'crew');
export const HUNTER_CLASS = shipClass('hunter', 'hunter');
/** Every ship class by index (a ship slot's class index). */
export const SHIP_CLASSES: readonly ShipClassDef[] = Object.freeze([CUTTER_CLASS, HUNTER_CLASS]);
export const ShipClass = { Cutter: 0, Hunter: 1 } as const;
/** The duel's slots: the crew's Cutter in slot 0, the hunter in slot 1. */
export const DUEL_CLASSES: readonly number[] = Object.freeze([ShipClass.Cutter, ShipClass.Hunter]);

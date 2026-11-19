// Engineering spike spec §2, §3, §7 (docs/superpowers/specs/2026-11-18-engineering-spike-design.md): the crew ship's
// reactor, overdrive, heat and coolant. The powered bars are tactical state (systems[0].bars, sim/tactical/bars.ts);
// this duel module holds the rest (DuelState.power: heat, coolant, failed) and every rule that moves bars. Heat steps
// on the hazard tick with heat.ts's numbers and no quirk term; an overheat draws once on rng.hazards.
import { chance } from '../../../../shared/rng';
import { igniteRoom } from '../hazards/fire';
import { vector, type ModuleField, type SimModule } from '../module';
import { damageCapacity, DUEL_SYSTEM_COUNT, OVERDRIVE_SYSTEMS, REACTOR_BARS, SYSTEM_MAX } from '../tactical/bars';
import { HEAT_COOL_IDLE, HEAT_COOL_UNIT, HEAT_MAX, HEAT_RISE, OVERHEAT_FIRE_CHANCE } from '../tuning';
import { clampThrottle } from './engines';
import { clampWeaponPower } from './weaponSlots';
import type { DuelState } from './state';
export {
  DuelSystem, DUEL_SYSTEM_COUNT, OVERDRIVE_SYSTEMS, SYSTEM_MAX, SYSTEM_SLOTS, SYSTEM_TACTICAL_ROOM, REACTOR_BARS, START_BARS, knock, damageCapacity, effectiveBars
} from '../tactical/bars';

/** Spec §3: Artemis's 8 shared coolant units; each overdrivable system holds 0..2. */
export const COOLANT_POOL_DUEL = 8;
export const COOLANT_MAX_PER_SYSTEM = 2;
/** The power module's canonical values: heat, coolant and failed, 5 each. */
export const POWER_VALUES = 3 * DUEL_SYSTEM_COUNT;

/** Spec §7: per system the heat (0..HEAT_MAX, integer), the coolant (0..2; Oxygen 0) and failed (0 or 1; Oxygen 0). */
export interface PowerState { heat: number[]; coolant: number[]; failed: number[] }
export function createPowerState(): PowerState {
  return { heat: Array<number>(DUEL_SYSTEM_COUNT).fill(0), coolant: Array<number>(DUEL_SYSTEM_COUNT).fill(0), failed: Array<number>(DUEL_SYSTEM_COUNT).fill(0) };
}

const barsOf = (d: DuelState): number[] => d.tactical.systems[0].bars;

/** A system index 0..4. */
export function validSystem(k: number): boolean { return Number.isInteger(k) && k >= 0 && k < DUEL_SYSTEM_COUNT; }
/** Spec §2: system k's capacity: 0 while failed, else max(0, slots − damage × knock). */
export function capacityOf(d: DuelState, k: number): number { return d.power.failed[k] ? 0 : damageCapacity(d.tactical.systems[0], k); }
/** The reactor's spare bars. */
export function sparesOf(d: DuelState): number { let used = 0; for (const b of barsOf(d)) used += b; return REACTOR_BARS - used; }
/** The coolant pool's free units. */
export function coolantFree(d: DuelState): number { let used = 0; for (const c of d.power.coolant) used += c; return COOLANT_POOL_DUEL - used; }
/** Spec §3: overdriven while the powered bars exceed the max (only the overdrive bar does); never Oxygen. */
export function isOverdriven(d: DuelState, k: number): boolean { return k < OVERDRIVE_SYSTEMS && barsOf(d)[k]! > SYSTEM_MAX[k]!; }

/** Spec §7 `shipPower`: +1 needs a spare bar and room under capacity; −1 needs a bar. `system` and `delta` are valid. */
export function applyPower(d: DuelState, system: number, delta: number): 'applied' | 'unavailable' {
  const b = barsOf(d), now = b[system]!;
  if (delta === 1) {
    if (sparesOf(d) < 1 || now >= capacityOf(d, system)) return 'unavailable';
    b[system] = now + 1;
    return 'applied';
  }
  if (now <= 0) return 'unavailable';
  b[system] = now - 1;
  return 'applied';
}

/** Spec §3 `shipCoolant` (system 0..3): 0 → 1 → 2 → 0; a step the pool cannot supply wraps to 0, as cycleCoolant does.
 *  'noop' when the value does not change. */
export function cycleDuelCoolant(d: DuelState, system: number): 'applied' | 'noop' {
  const c = d.power.coolant, now = c[system]!, next = now >= COOLANT_MAX_PER_SYSTEM ? 0 : now + 1;
  const value = next > now && coolantFree(d) < next - now ? 0 : next;
  if (value === now) return 'noop';
  c[system] = value;
  return 'applied';
}

/** Spec §7: lower every system's bars to its capacity; the excess returns to the pool (a count of bars, so the
 *  overdrive bar is the first to go). */
export function clampToCapacity(d: DuelState): void {
  const b = barsOf(d);
  for (let k = 0; k < DUEL_SYSTEM_COUNT; k++) { const cap = capacityOf(d, k); if (b[k]! > cap) b[k] = cap; }
  clampThrottle(d);   // Task 8, spec §10.2
  clampWeaponPower(d);   // Task 9a, spec §10.3
}

/** Spec §3, one hazard tick, systems 0..3 in ascending index: overdriven +HEAT_RISE − coolant; idle −HEAT_COOL_IDLE;
 *  failed −HEAT_COOL_UNIT × (1 + coolant) and clears at 0. Reaching HEAT_MAX fails the system (heat held at HEAT_MAX, its
 *  bars to the pool at once) and draws once at OVERHEAT_FIRE_CHANCE, always, igniting the system's room when there is
 *  one (igniteRoom is a no-op on a burning room). */
export function duelHeatStep(d: DuelState): void {
  const p = d.power;
  for (let k = 0; k < OVERDRIVE_SYSTEMS; k++) {
    const cool = p.coolant[k]! * HEAT_COOL_UNIT;
    if (p.failed[k]) {
      p.heat[k] = Math.max(0, p.heat[k]! - HEAT_COOL_UNIT - cool);
      if (p.heat[k] === 0) p.failed[k] = 0;
      continue;
    }
    p.heat[k] = Math.max(0, p.heat[k]! + (isOverdriven(d, k) ? HEAT_RISE - cool : -HEAT_COOL_IDLE));
    if (p.heat[k]! < HEAT_MAX) continue;
    p.heat[k] = HEAT_MAX; p.failed[k] = 1;
    barsOf(d)[k] = 0;   // the clamp, inline (spec §7): a failed system's capacity is 0
    const lit = chance(d.interior.rng.hazards, OVERHEAT_FIRE_CHANCE), room = d.systemRooms[k]!;
    if (lit && room >= 0) igniteRoom(d.interior, room);
  }
}

/** Check the power module's 15 values (heat, coolant, failed) without writing them; throws naming the first bad one. */
export function validatePowerValues(values: ArrayLike<number>): void {
  if (values.length !== POWER_VALUES) throw new Error(`duel snapshot power: ${values.length} values, expected ${POWER_VALUES}`);
  let coolant = 0;
  for (let k = 0; k < DUEL_SYSTEM_COUNT; k++) {
    const heat = values[k]!, c = values[DUEL_SYSTEM_COUNT + k]!, f = values[2 * DUEL_SYSTEM_COUNT + k]!, over = k < OVERDRIVE_SYSTEMS;
    if (!Number.isInteger(heat) || heat < 0 || heat > HEAT_MAX || (!over && heat !== 0)) throw new Error(`duel snapshot power heat ${k}: ${heat} is out of range`);
    if (!Number.isInteger(c) || c < 0 || c > COOLANT_MAX_PER_SYSTEM || (!over && c !== 0)) throw new Error(`duel snapshot power coolant ${k}: ${c} is out of range`);
    if ((f !== 0 && f !== 1) || (!over && f !== 0)) throw new Error(`duel snapshot power failed ${k}: ${f} is not 0 or 1`);
    coolant += c;
  }
  if (coolant > COOLANT_POOL_DUEL) throw new Error(`duel snapshot power coolant: ${coolant} units, the pool is ${COOLANT_POOL_DUEL}`);
}

/** Spec §7: the `power` duel module (after `helm`, before `interior`): heat, coolant and failed per system. The bars
 *  are the `ship` module's (systems.0.bars). Snapshot validation is validatePowerValues (sim/duel/snapshot.ts). */
const POWER: ModuleField<DuelState>[] = [
  vector('power.heat', DUEL_SYSTEM_COUNT, (d) => d.power.heat),
  vector('power.coolant', DUEL_SYSTEM_COUNT, (d) => d.power.coolant),
  vector('power.failed', DUEL_SYSTEM_COUNT, (d) => d.power.failed)
];
export const powerModule: SimModule<DuelState> = {
  id: 'power',
  fields: () => POWER,
  notSnapshotted: {},
  commands: ['shipPower', 'shipCoolant', 'shipDoor', 'shipAirlock', 'weaponPower'],
  reasons: ['stale-tick', 'not-at-weapons', 'malformed', 'unavailable', 'duel-decided']
};

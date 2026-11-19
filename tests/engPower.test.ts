// Engineering spike spec §2, §3, §7: the duel power module: capacity from damage and failure, moving bars, coolant
// cycling, clampToCapacity, the heat rules per hazard tick, overheat, the module's fields and the snapshot.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { applyPower, capacityOf, clampToCapacity, coolantFree, cycleDuelCoolant, duelHeatStep, DuelSystem, isOverdriven, sparesOf, validatePowerValues } from '../src/renderer/src/sim/duel/power';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { HEAT_MAX } from '../src/renderer/src/sim/tuning';
import { nextFloat } from '../src/shared/rng';

const HOUND = parseShip(hound);
const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const bars = (d: DuelState) => d.tactical.systems[0].bars;
/** Move bars so Engines holds its overdrive bar (5): the spare bar, then Sensors' (spec §10.1 start: Engines 3, 1 spare). */
function overdriveEngines(d: DuelState): void {
  expect(applyPower(d, DuelSystem.Engines, 1)).toBe('applied');
  expect(applyPower(d, DuelSystem.Sensors, -1)).toBe('applied');
  expect(applyPower(d, DuelSystem.Engines, 1)).toBe('applied');
}
function withDuel(f: (d: DuelState) => void): void { const d = createDuel(HOUND, 7); try { f(d); } finally { disposeDuel(d); } }

describe('engineering spike: the power module (spec §2, §3)', () => {
  it('a fresh duel: 9 bars used, 1 spare, 8 coolant free; the Hound system rooms are R, O, E, O, L', () => withDuel((d) => {
    expect(sparesOf(d)).toBe(1); expect(coolantFree(d)).toBe(8);
    const id = (r: number) => (r < 0 ? '-' : HOUND.rooms[r]!.id);
    expect(d.systemRooms.map(id)).toEqual(['R', 'O', 'E', 'O', 'L']);
  }));
  it('bars never exceed the reactor or capacity; −1 at 0 and +1 with no spare are unavailable', () => withDuel((d) => {
    expect(applyPower(d, DuelSystem.Shields, 1)).toBe('applied');        // the one spare bar
    expect(applyPower(d, DuelSystem.Weapons, 1)).toBe('unavailable');   // no spare
    applyPower(d, DuelSystem.Sensors, -1);
    expect(bars(d)[DuelSystem.Sensors]).toBe(0);
    expect(applyPower(d, DuelSystem.Sensors, -1)).toBe('unavailable');
    expect(sparesOf(d)).toBe(1);
    d.tactical.systems[0].rooms[Room.Engines] = 1;                        // capacity 2, Engines holds 3
    expect(applyPower(d, DuelSystem.Engines, 1)).toBe('unavailable');
    expect(applyPower(d, DuelSystem.Weapons, 1)).toBe('applied');
    expect(sparesOf(d)).toBe(0);
  }));
  it('damage lowers capacity; clampToCapacity returns the excess (the overdrive bar first); repair adds no bar', () => withDuel((d) => {
    overdriveEngines(d);
    expect(bars(d)[DuelSystem.Engines]).toBe(5); expect(isOverdriven(d, DuelSystem.Engines)).toBe(true);
    d.tactical.systems[0].rooms[Room.Engines] = 1;
    expect(capacityOf(d, DuelSystem.Engines)).toBe(2);
    clampToCapacity(d);
    expect(bars(d)[DuelSystem.Engines]).toBe(2); expect(sparesOf(d)).toBe(3);
    d.tactical.systems[0].rooms[Room.Engines] = 0;
    clampToCapacity(d);
    expect(bars(d)[DuelSystem.Engines]).toBe(2);
  }));
  it('coolant cycles 0 → 1 → 2 → 0; a step the pool cannot supply wraps to 0', () => withDuel((d) => {
    expect(cycleDuelCoolant(d, 0)).toBe('applied'); expect(d.power.coolant[0]).toBe(1);
    expect(cycleDuelCoolant(d, 0)).toBe('applied'); expect(d.power.coolant[0]).toBe(2);
    expect(cycleDuelCoolant(d, 0)).toBe('applied'); expect(d.power.coolant[0]).toBe(0);
    d.power.coolant = [2, 2, 2, 1, 0];                                     // 1 free: 1 → 2 is supplied
    expect(cycleDuelCoolant(d, 3)).toBe('applied'); expect(d.power.coolant[3]).toBe(2);
    expect(coolantFree(d)).toBe(0);
    expect(cycleDuelCoolant(d, 3)).toBe('applied'); expect(d.power.coolant[3]).toBe(0);   // 2 → 0
    d.power.coolant = [2, 2, 2, 0, 2];                                     // 8 used (Oxygen's slot borrowed for the test)
    expect(cycleDuelCoolant(d, 3)).toBe('noop'); expect(d.power.coolant[3]).toBe(0);      // 0 → 1 not supplied: wraps to 0
  }));
  it('heat: +2 per hazard tick overdriven at 0 coolant, +1 at 1, held at 2; −4 when not overdriven', () => withDuel((d) => {
    overdriveEngines(d);
    duelHeatStep(d); expect(d.power.heat[2]).toBe(2);
    d.power.coolant[2] = 1; duelHeatStep(d); expect(d.power.heat[2]).toBe(3);
    d.power.coolant[2] = 2; duelHeatStep(d); expect(d.power.heat[2]).toBe(3);
    applyPower(d, DuelSystem.Engines, -1); duelHeatStep(d); expect(d.power.heat[2]).toBe(0);
  }));
  it('overheat fails the system, returns its bars, draws once, and the system takes bars again at heat 0', () => withDuel((d) => {
    overdriveEngines(d);
    d.power.heat[2] = HEAT_MAX - 2;
    const probe = { ...d.interior.rng.hazards }, lit = nextFloat(probe) < 0.5;
    duelHeatStep(d);
    expect(d.interior.rng.hazards).toEqual(probe);                         // exactly one draw
    expect(d.power.failed[2]).toBe(1); expect(d.power.heat[2]).toBe(HEAT_MAX);
    expect(bars(d)[DuelSystem.Engines]).toBe(0); expect(sparesOf(d)).toBe(5);
    expect(d.interior.rooms.fire[d.systemRooms[2]!]! > 0).toBe(lit);
    expect(capacityOf(d, DuelSystem.Engines)).toBe(0);
    expect(applyPower(d, DuelSystem.Engines, 1)).toBe('unavailable');
    d.power.coolant[2] = 2;
    duelHeatStep(d); expect(d.power.heat[2]).toBe(HEAT_MAX - 3);            // failed: −1 × (1 + coolant)
    d.power.heat[2] = 2; duelHeatStep(d);
    expect(d.power.heat[2]).toBe(0); expect(d.power.failed[2]).toBe(0);
    expect(applyPower(d, DuelSystem.Engines, 1)).toBe('applied');
  }));
  it('the power values round-trip a snapshot; bad values are refused', () => withDuel((d) => {
    overdriveEngines(d); d.power.heat[2] = 40; d.power.coolant[2] = 2;
    const back = loadDuelSnapshot(HOUND, saveDuelSnapshot(d, DIGEST), DIGEST);
    try { expect(hashDuel(back)).toBe(hashDuel(d)); expect(back.power).toEqual(d.power); } finally { disposeDuel(back); }
    expect(() => validatePowerValues([0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toThrow(/coolant/);
    expect(() => validatePowerValues([0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toThrow(/heat/);
    expect(() => validatePowerValues([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2])).toThrow(/failed/);
  }));
});

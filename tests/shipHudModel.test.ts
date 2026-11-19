// Duel polish i spec §E, Engineering spike §6: the ship HUD's pure model: the hull, the shields with the bars' layer cap,
// and the power view (one column per system, the reactor's spare bars, the coolant), with the panel's layout.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { capacityOf, DUEL_SYSTEM_COUNT, REACTOR_BARS, SYSTEM_MAX, SYSTEM_SLOTS } from '../src/renderer/src/sim/duel/power';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { SHIP_HULL } from '../src/renderer/src/sim/tactical/tuning';
import { HEAT_MAX } from '../src/renderer/src/sim/tuning';
import { coolantY, heatY, HUD, hullSegX, hullTone, overdriveSlot, POWER_NAMES, powerBarY, powerColumnX, powerNameY, powerPanel, shipHud, slotState, type PowerColumn } from '../src/renderer/src/render/duel/shipHudModel';
import { INTERIOR_BAND } from '../src/renderer/src/render/duel/interiorModel';
import { TABS } from '../src/renderer/src/render/duel/consoleLayout';

const HOUND = parseShip(hound);

describe('shipHud (spec §E; Engineering spike §6)', () => {
  it('a fresh Hound: 20 lit segments, the bars 2/2/3/1/1 of 5/10/5/4/2 slots, one spare bar, all eight coolant free', () => {
    const d = createDuel(HOUND, 5);
    try {
      const h = shipHud(d);
      expect(h.hull).toEqual({ segments: SHIP_HULL / 2, lit: SHIP_HULL / 2, tone: 'good' });
      expect(h.shields.cap).toBe(1);   // 2 Shields bars hold one layer (spec §2)
      expect(h.power.systems.map((c) => [c.system, c.name, c.bars, c.capacity, c.slots, c.max])).toEqual([
        [0, 'SHLD', 2, 5, 5, 4], [1, 'WEAP', 2, 10, 10, 9], [2, 'ENG', 3, 5, 5, 4], [3, 'SENS', 1, 4, 4, 3], [4, 'O2', 1, 2, 2, 2]
      ]);
      expect(h.power.systems.map((c) => c.cools)).toEqual([true, true, true, true, false]);
      expect(h.power.systems.every((c) => c.heat === 0 && c.heatMax === HEAT_MAX && c.coolant === 0 && !c.failed && !c.overdriven)).toBe(true);
      expect(h.power).toMatchObject({ spare: 1, reactor: REACTOR_BARS, coolantFree: 8, coolantPool: 8 });
      expect(POWER_NAMES).toHaveLength(DUEL_SYSTEM_COUNT);
      expect(JSON.parse(JSON.stringify(h))).toEqual(h);   // JSON-plain, so the sink's replaceEqualDeep can share it
    } finally { disposeDuel(d); }
  });
  it('reads the state: damage lowers capacity, bars, heat, coolant and the failed and overdriven flags show', () => {
    const d = createDuel(HOUND, 5), sys = d.tactical.systems[0];
    try {
      sys.rooms[Room.Weapons] = 1; sys.bars[1] = 2; sys.bars[3] = 0; sys.bars[2] = 3;
      d.power.heat[2] = 100; d.power.coolant[2] = 2; d.power.failed[3] = 1; d.power.heat[3] = HEAT_MAX;
      const h = shipHud(d), col = (k: number) => h.power.systems[k]!;
      expect(col(1).capacity).toBe(capacityOf(d, 1));
      expect(col(1).capacity).toBe(5);   // Weapons 10 slots, damage 1 knocks out 5 (spec §10.1)
      expect(col(2)).toMatchObject({ bars: 3, heat: 100, coolant: 2 });
      expect(col(3)).toMatchObject({ bars: 0, capacity: 0, failed: true, heat: HEAT_MAX });
      expect(h.power.spare).toBe(REACTOR_BARS - (2 + 2 + 3 + 0 + 1));
      expect(h.power.coolantFree).toBe(6);
      sys.bars[2] = SYSTEM_MAX[2]! + 1;
      expect(shipHud(d).power.systems[2]!.overdriven).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('slotState: on below the bars, empty below the capacity, lost above it; the overdrive slot is the one past max', () => {
    const c: PowerColumn = { system: 2, name: 'ENG', bars: 1, capacity: 2, slots: 4, max: 3, heat: 0, heatMax: HEAT_MAX, coolant: 0, cools: true, failed: false, overdriven: false };
    expect([0, 1, 2, 3].map((k) => slotState(c, k))).toEqual(['on', 'empty', 'lost', 'lost']);
    expect([0, 1, 2, 3].map((k) => overdriveSlot(c, k))).toEqual([false, false, false, true]);
    const o2: PowerColumn = { ...c, system: 4, name: 'O2', slots: 2, max: 2, cools: false };
    expect([0, 1].map((k) => overdriveSlot(o2, k))).toEqual([false, false]);
    expect(SYSTEM_SLOTS).toEqual([5, 10, 5, 4, 2]);
  });
  it('lays out inside the interior band: the hull below the tab strip, the power panel above the band bottom, left of the readout', () => {
    expect(HUD.hull.labelY).toBeGreaterThanOrEqual(TABS.y + TABS.h);
    expect(hullSegX(19) + HUD.hull.segW).toBeLessThan(INTERIOR_BAND.x + INTERIOR_BAND.w);
    expect(powerBarY(1) + HUD.power.barH + HUD.power.gap).toBe(powerBarY(0));   // stacked bottom up
    expect(powerBarY(0) + HUD.power.barH).toBeLessThanOrEqual(heatY());
    expect(heatY() + HUD.power.heatH).toBeLessThanOrEqual(coolantY());
    expect(coolantY() + HUD.power.pipH).toBeLessThanOrEqual(powerNameY());
    expect(powerColumnX(5) - powerColumnX(4)).toBe(HUD.power.pitch + HUD.power.reactorGap);   // the reactor stands apart
    const p = powerPanel();
    expect(p.x + p.w).toBeLessThan(INTERIOR_BAND.w);
    expect(p.y).toBeGreaterThan(HUD.shields.y + HUD.shields.pip + 40);
    expect(p.y + p.h).toBeLessThanOrEqual(INTERIOR_BAND.y + INTERIOR_BAND.h);
    expect(2 * HUD.power.pipW + HUD.power.pipGap).toBeLessThanOrEqual(HUD.power.barW);
    expect([hullTone(30, 40), hullTone(15, 40), hullTone(5, 40)]).toEqual(['good', 'warn', 'alert']);
  });
});

import { describe, it, expect } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState } from '../src/renderer/src/sim/state';
import { step } from '../src/renderer/src/sim/step';
import { botIntent } from '../src/renderer/src/sim/bot';
import { DEFAULT_CHARACTERS } from '../src/renderer/src/sim/characters';
import { STATION_IDS } from '../src/renderer/src/sim/stationKinds';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';

const STATION_ROOMS: Record<string, string> = {
  navigation: 'Bridge', doors: 'Door Control', weapons: 'Weapons', science: 'Sensors',
  medbay: 'Medbay', lifeSupport: 'Oxygen', engineering: 'Engines'
};

describe('the cutter ship', () => {
  const layout = parseShip(cutter);
  it('parses with 17 rooms, 22 edges, 17 breach sites and 7 stations', () => {
    expect(layout.rooms).toHaveLength(17);
    expect(layout.edges).toHaveLength(22);
    expect(layout.breachSites).toHaveLength(17);
    expect(layout.stations).toHaveLength(7);
    expect(layout.rooms.find((r) => r.system === 'doors')?.name).toBe('Door Control');
  });
  it('has each station in its room', () => {
    for (const id of STATION_IDS) {
      const st = layout.stations.find((s) => s.id === id)!;
      expect(layout.rooms.find((r) => r.id === st.room)!.name, id).toBe(STATION_ROOMS[id]);
    }
  });
  it('runs 600 ticks with two bots without throwing', () => {
    const s = createSimState(layout, 2, 1, DEFAULT_CHARACTERS);
    for (let t = 0; t < 600; t++) step(s, [botIntent(s, 0), botIntent(s, 1)]);
    expect(s.tick).toBe(600);
  });
  // Airlock orientation, verified against the rows (spec Demo-vii amendment 5): T (12,0) above room tile (12,1), out of bounds above;
  // X (12,12) below (12,11), out of bounds below; E (0,6) left of (1,6), out of bounds left; F (24,4) above (24,5), space ' ' at (24,3).
  it('has four airlocks, in Dorsal Airlock, Ventral Airlock, Engines and Forward Corridor', () => {
    expect(layout.airlocks).toEqual([
      { room: 'T', tile: [12, 0] }, { room: 'X', tile: [12, 12] }, { room: 'E', tile: [0, 6] }, { room: 'F', tile: [24, 4] }
    ]);
    const d = deriveLayout(layout);
    expect(Array.from(d.airlockRoom)).toEqual(['T', 'X', 'E', 'F'].map((r) => d.roomIndex.get(r)));
    expect(Array.from(d.airlockTile)).toEqual([12, 12 * 29 + 12, 6 * 29, 4 * 29 + 24]);
    expect(d.airlockOfTile[6 * 29]).toBe(2);
    expect(d.airlockOfTile[6 * 29 + 1]).toBe(-1);
  });
  it('keeps the oxygen stability constant of the layout without airlocks', () => {
    expect(deriveLayout(layout).kEff).toBe(4.390243902439026);
    expect(deriveLayout(parseShip({ ...cutter, airlocks: [] })).kEff).toBe(4.390243902439026);
  });
  it('changes the layout hash when an airlock is added', () => {
    expect(deriveLayout(layout).layoutHash).not.toBe(deriveLayout(parseShip({ ...cutter, airlocks: [] })).layoutHash);
  });
});

describe('the cutter magazine (spec Coop-ii section 2)', () => {
  it('sits on a floor tile of the Lower Hold (room M)', () => {
    const layout = parseShip(cutter), d = deriveLayout(layout);
    expect(layout.magazine).toBeDefined(); expect(d.magazineTile).toBeGreaterThanOrEqual(0);
    expect(layout.rooms[d.magazineRoom]!.id).toBe('M'); expect(layout.rooms[d.magazineRoom]!.name).toBe('Lower Hold');
  });
});

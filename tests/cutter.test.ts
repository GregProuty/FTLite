import { describe, it, expect } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState } from '../src/renderer/src/sim/state';
import { step } from '../src/renderer/src/sim/step';
import { botIntent } from '../src/renderer/src/sim/bot';
import { DEFAULT_CHARACTERS } from '../src/renderer/src/sim/characters';
import { STATION_IDS } from '../src/renderer/src/sim/stationKinds';

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
});

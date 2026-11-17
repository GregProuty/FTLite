import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { stationBadges } from '../src/renderer/src/render/duel/interiorModel';
import { TILE_PX } from '../src/shared/resolution';

const layout = parseShip(hound);
const centre = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE_PX, y: (ty + 0.5) * TILE_PX });

describe('station badges (start-aboard spec §2)', () => {
  it('Helm, Weapons and Medbay, each at its console tile, all normal on a fresh duel', () => {
    const d = createDuel(layout, 1);
    try {
      const bs = stationBadges(d);
      expect(bs.map((b) => [b.kind, b.label, b.tint])).toEqual([['navigation', 'HELM', 'normal'], ['weapons', 'WEAPONS', 'normal'], ['medbay', 'MEDBAY', 'normal']]);
      expect(bs[0]).toMatchObject({ station: d.nav, ...centre(20, 7) });
      expect(bs[1]).toMatchObject({ station: d.weapons, ...centre(19, 5) });
      expect(bs[2]).toMatchObject({ station: d.interior.derived.stationOfKind[StationKind.Medbay], ...centre(8, 1) });
    } finally { disposeDuel(d); }
  });

  it('Helm red at Engines 2 and Weapons red at Weapons 2, not at 1; the Medbay faint while it is offline', () => {
    const d = createDuel(layout, 1);
    try {
      const rooms = d.tactical.systems[0].rooms;
      rooms[Room.Engines] = 1; rooms[Room.Weapons] = 1;
      expect(stationBadges(d).map((b) => b.tint)).toEqual(['normal', 'normal', 'normal']);
      rooms[Room.Engines] = 2;
      expect(stationBadges(d).map((b) => b.tint)).toEqual(['offline', 'normal', 'normal']);
      rooms[Room.Weapons] = 2; rooms[Room.Engines] = 0;
      expect(stationBadges(d).map((b) => b.tint)).toEqual(['normal', 'offline', 'normal']);
      d.interior.stations.level[d.interior.derived.stationOfKind[StationKind.Medbay]!] = 0;
      expect(stationBadges(d)[2]!.tint).toBe('faint');
    } finally { disposeDuel(d); }
  });
});

// Engineering spike §6: the interior shows the air (no tint at half or more, an amber wash to a quarter, red below), a
// marker for a fire outside the three repair rooms and for every breach (HOLD E, with the progress), a hover outline on a
// door or airlock, and reports the placement the click hit-test uses.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { TILE_PX } from '../src/shared/resolution';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { fireTileOf } from '../src/renderer/src/sim/duel/hazards';
import { LOW_AIR_FRAC } from '../src/renderer/src/sim/duel/tuning';
import { AMBER, WARN } from '../src/renderer/src/render/theme';
import { airTint, airTints, hazardMarkers } from '../src/renderer/src/render/duel/interiorModel';
import { createInteriorView } from '../src/renderer/src/render/duel/interiorView';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';

const HOUND = parseShip(hound);
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};

describe('airTint (spec §6, Decision 7)', () => {
  it('none at half air or more; amber from half to a quarter; red below a quarter, deepest at none', () => {
    expect(airTint(1)).toBeNull(); expect(airTint(0.5)).toBeNull();
    expect(airTint(0.375)).toEqual({ color: AMBER, alpha: 0.15 });
    expect(airTint(LOW_AIR_FRAC)).toEqual({ color: AMBER, alpha: 0.3 });
    const below = airTint(LOW_AIR_FRAC - 1e-6)!;
    expect(below.color).toBe(WARN); expect(below.alpha).toBeCloseTo(0.3, 5);
    expect(airTint(0)).toEqual({ color: WARN, alpha: 0.55 });
    expect(airTint(-0.1)).toEqual({ color: WARN, alpha: 0.55 });
  });
  it('airTints: one entry per room below half air, over its tiles, in room order', () => {
    const d = createDuel(HOUND, 5), st = d.interior, h = st.derived.roomIndex.get('H')!, l = st.derived.roomIndex.get('L')!;
    try {
      expect(airTints(d)).toEqual([]);
      st.rooms.o2[l] = 0.1 * st.derived.volume[l]!; st.rooms.o2[h] = 0.4 * st.derived.volume[h]!;
      const t = airTints(d);
      expect(t.map((x) => [x.room, x.color])).toEqual([[h, AMBER], [l, WARN]].sort((a, b) => a[0]! - b[0]!));
      expect(t.find((x) => x.room === l)!.tiles).toHaveLength(st.derived.roomTiles[l]!.length);
    } finally { disposeDuel(d); }
  });
});

describe('hazardMarkers (spec §4, §6)', () => {
  it('a fire outside the repair rooms gets a marker at its fire tile; a breach at its site; the repair rooms keep theirs', () => {
    const d = createDuel(HOUND, 5), st = d.interior, der = st.derived, q = der.roomIndex.get('Q')!, o = der.roomIndex.get('O')!;
    try {
      expect(hazardMarkers(d)).toEqual([]);
      st.rooms.fire[q] = 2; st.rooms.fireRepair[q] = 0.5;
      st.rooms.fire[o] = 2;   // O is a repair room: its marker is interiorOverlay's
      const site = Array.from(der.siteRoom).indexOf(q);
      st.breaches.active[site] = 1; st.breaches.repair[site] = 0.25;
      const tile = fireTileOf(d, q), w = der.width, at = (t: number) => ({ x: ((t % w) + 0.5) * TILE_PX, y: (Math.floor(t / w) + 0.5) * TILE_PX });
      expect(hazardMarkers(d)).toEqual([
        { kind: 'fire', room: q, ...at(tile), progress: 0.5, label: 'FIRE - HOLD E' },
        { kind: 'breach', room: q, x: at(der.siteTile[site]!).x, y: at(der.siteTile[site]!).y + TILE_PX / 2, progress: 0.25, label: 'BREACH - HOLD E' }   // Q's fire is fought at its breach tile: the label sits half a tile lower
      ]);
    } finally { disposeDuel(d); }
  });
});

describe('the interior view (spec §6)', () => {
  it('reports its placement after a draw (null before), and draws with a hover point', () => {
    const view = createInteriorView(assets), d = createDuel(HOUND, 5);
    try {
      expect(view.placement()).toBeNull();
      view.draw(d, [], 1, 1 / 60, [], 1 / 60, undefined, { x: 400, y: 300 });
      const p = view.placement()!;
      expect(p.scale).toBeGreaterThan(0);
      expect(view.world.scale.x).toBe(p.scale);
    } finally { view.destroy(); disposeDuel(d); }
  });
});

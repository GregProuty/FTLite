import { fixtureCouchViewer } from './helpers/cardUi';
import { describe, it, expect } from 'vitest';
import { roomIcons, ICON_KINDS, stationTint } from '../src/renderer/src/render/roomIconModel';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState } from './helpers/simLifetime';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { failStation } from '../src/renderer/src/sim/power';
import { buildHudModel } from '../src/renderer/src/render/hudModel';
import { TILE_PX } from '../src/shared/resolution';
import { makeState } from './helpers/sim';

const cut = () => createSimState(parseShip(cutter), 2, 1);
const roomName = (s: ReturnType<typeof cut>, room: number) => s.layout.rooms[room]!.name;

describe('roomIcons', () => {
  it('lists the eight glyph kinds', () => { expect([...ICON_KINDS]).toEqual(['navigation', 'weapons', 'science', 'engineering', 'lifeSupport', 'medbay', 'doors', 'reactor']); });

  it('cutter: the seven station rooms plus the reactor, each at its room-centre tile', () => {
    const s = cut(), icons = roomIcons(s), d = s.derived;
    expect(icons.map((i) => i.kind).sort()).toEqual([...ICON_KINDS].sort());
    for (const ic of icons) {
      const tiles = d.roomTiles[ic.room]!;
      const tx = Math.floor(tiles.reduce((a, t) => a + (t % d.width), 0) / tiles.length), ty = Math.floor(tiles.reduce((a, t) => a + Math.floor(t / d.width), 0) / tiles.length);
      expect([ic.x, ic.y]).toEqual([(tx + 0.5) * TILE_PX, (ty + 0.5) * TILE_PX]);
      expect(s.layout.rooms[ic.room]!.system).toBe(ic.kind);
    }
  });

  it('starter: the list matches its systems; no doors glyph (the doors station sits in the Bridge)', () => {
    const s = makeState(), icons = roomIcons(s);
    expect(icons.map((i) => i.kind).sort()).toEqual(['engineering', 'lifeSupport', 'medbay', 'navigation', 'reactor', 'science', 'weapons']);
    expect(icons.filter((i) => i.room === s.derived.roomIndex.get('A')!).map((i) => i.kind)).toEqual(['navigation']);
  });

  it('tints: failed, unpowered, normal; the reactor is never tinted', () => {
    const s = cut(), tintOf = (k: string) => roomIcons(s).find((i) => i.kind === k)!.tint;
    const w = s.derived.stationOfKind[StationKind.Weapons]!;
    s.stations.level[w] = 0; expect(tintOf('weapons')).toBe('unpowered');
    s.stations.level[w] = 1; expect(tintOf('weapons')).toBe('normal');
    failStation(s, w); expect(tintOf('weapons')).toBe('failed');
    s.stations.level[w] = 0; expect(tintOf('weapons')).toBe('failed');   // failed beats unpowered
    for (let i = 0; i < s.stations.failed.length; i++) { s.stations.failed[i] = 1; s.stations.level[i] = 0; }
    expect(tintOf('reactor')).toBe('normal');
    expect(roomName(s, roomIcons(s).find((i) => i.kind === 'reactor')!.room)).toBeTruthy();
  });

  it('Engineering at level 0 and not failed stays normal (never unpowered)', () => {
    const s = cut(), e = s.derived.stationOfKind[StationKind.Engineering]!;
    s.stations.level[e] = 0;
    expect(roomIcons(s).find((i) => i.kind === 'engineering')!.tint).toBe('normal');
  });

  it('cutter: the Bridge glyph sits at (880, 208), tile (27, 6) centre', () => {
    const ic = roomIcons(cut()).find((i) => i.kind === 'navigation')!;
    expect([ic.x, ic.y]).toEqual([880, 208]);
  });

  it('the HUD rows carry the same icon and tint', () => {
    const s = makeState(), w = s.derived.stationOfKind[StationKind.Weapons]!;
    failStation(s, w);
    const m = buildHudModel(s, fixtureCouchViewer(s), { slots: [], phase: 'running', message: '' });
    const st = m.stations.find((x) => x.kind === StationKind.Weapons)!;
    expect(st.icon).toBe('weapons'); expect(st.iconTint).toBe(stationTint(s, w)); expect(st.iconTint).toBe('failed');
  });

  it('a HUD power row with Weapons at level 0 (not failed) is unpowered', () => {
    const s = makeState(), w = s.derived.stationOfKind[StationKind.Weapons]!;
    s.stations.level[w] = 0;
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: [], phase: 'running', message: '' }).stations.find((x) => x.kind === StationKind.Weapons)!.iconTint).toBe('unpowered');
  });
});

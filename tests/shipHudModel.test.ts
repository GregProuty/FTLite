// Duel polish i spec §E: the ship HUD's pure model (segments, colours at the thresholds, bars by damage, the Medbay).
import { describe, expect, it } from 'vitest';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { medbayOnline } from '../src/renderer/src/sim/duel/health';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { SHIELD_LAYERS, SHIP_HULL } from '../src/renderer/src/sim/tactical/tuning';
import { HUD, hullSegX, hullTone, shipHud, sysBarY, sysColumnX, sysIconY } from '../src/renderer/src/render/duel/shipHudModel';
import { INTERIOR_BAND } from '../src/renderer/src/render/duel/interiorModel';
import { TABS } from '../src/renderer/src/render/duel/consoleLayout';
import { CUTTER } from './helpers/scriptedDuel';

describe('shipHud (spec §E)', () => {
  it('a fresh ship: 20 lit green segments, both shield layers, every system at full capacity, the Medbay on', () => {
    const d = createDuel(CUTTER, 5);
    try {
      const h = shipHud(d);
      expect(h.hull).toEqual({ segments: SHIP_HULL / 2, lit: SHIP_HULL / 2, tone: 'good' });
      expect(h.hull.segments).toBe(20);
      expect(h.shields).toEqual({ layers: SHIELD_LAYERS, up: 1 });   // Engineering spike spec §2: the crew's shields start a round at 1 layer (2 Shields bars)
      expect(h.systems.map((s) => [s.key, s.name])).toEqual([['helm', 'HELM'], ['weapons', 'WEAP'], ['shields', 'SHLD'], ['medbay', 'MED']]);
      for (const s of h.systems.slice(0, 3)) expect(s).toMatchObject({ bars: 2, lit: 2, damaged: 0, look: 'normal' });
      expect(medbayOnline(d)).toBe(true);
      expect(h.systems[3]).toEqual({ key: 'medbay', name: 'MED', bars: 1, lit: 1, damaged: 0, look: 'normal' });
      expect(JSON.parse(JSON.stringify(h))).toEqual(h);   // JSON-plain, so the sink's replaceEqualDeep can share it
    } finally { disposeDuel(d); }
  });
  it('lights ceil(hull / 2) segments and takes its colour at the thresholds', () => {
    const d = createDuel(CUTTER, 5), sys = d.tactical.systems[0];
    try {
      const at = (hull: number) => { sys.hull = hull; return shipHud(d).hull; };
      expect(at(21)).toMatchObject({ lit: 11, tone: 'good' });
      expect(at(20)).toMatchObject({ lit: 10, tone: 'warn' });    // half is amber
      expect(at(10)).toMatchObject({ lit: 5, tone: 'warn' });     // a quarter is amber
      expect(at(9)).toMatchObject({ lit: 5, tone: 'alert' });     // below a quarter is red
      expect(at(1)).toMatchObject({ lit: 1, tone: 'alert' });
      expect(at(0)).toMatchObject({ segments: 20, lit: 0, tone: 'alert' });
      expect(at(-3).lit).toBe(0);
      expect([hullTone(30, 40), hullTone(15, 40), hullTone(5, 40)]).toEqual(['good', 'warn', 'alert']);
    } finally { disposeDuel(d); }
  });
  it('shows the shield layers up, and each tactical room capacity lit and its damage red (offline at level 2)', () => {
    const d = createDuel(CUTTER, 5), sys = d.tactical.systems[0];
    try {
      sys.shields = 1; sys.rooms[Room.Engines] = 1; sys.rooms[Room.Weapons] = 2; sys.rooms[Room.Shields] = 0;
      const h = shipHud(d);
      expect(h.shields.up).toBe(1);
      expect(h.systems[0]).toMatchObject({ key: 'helm', lit: 1, damaged: 1, look: 'normal' });
      expect(h.systems[1]).toMatchObject({ key: 'weapons', lit: 0, damaged: 2, look: 'offline' });
      expect(h.systems[2]).toMatchObject({ key: 'shields', lit: 2, damaged: 0, look: 'normal' });
      sys.shields = 0; expect(shipHud(d).shields).toEqual({ layers: 2, up: 0 });
    } finally { disposeDuel(d); }
  });
  it('the Medbay bar goes dark and its icon dims while it is offline', () => {
    const d = createDuel(CUTTER, 5);
    try {
      d.interior.stations.failed[d.interior.derived.stationOfKind[StationKind.Medbay]!] = 1;
      expect(medbayOnline(d)).toBe(false);
      expect(shipHud(d).systems[3]).toEqual({ key: 'medbay', name: 'MED', bars: 1, lit: 0, damaged: 0, look: 'dim' });
    } finally { disposeDuel(d); }
  });
  it('lays out inside the interior band: below the tab strip, left of the readout column, above the band bottom', () => {
    const right = hullSegX(19) + HUD.hull.segW;
    expect(HUD.hull.labelY).toBeGreaterThanOrEqual(TABS.y + TABS.h);
    expect(HUD.hull.labelY).toBeGreaterThanOrEqual(INTERIOR_BAND.y);
    expect(right).toBeLessThan(INTERIOR_BAND.x + INTERIOR_BAND.w);
    expect(hullSegX(1) - hullSegX(0)).toBe(16);   // 14 px segments, 2 px gaps
    expect(sysColumnX(3) + HUD.sys.colW).toBeLessThan(INTERIOR_BAND.w);
    expect(sysBarY(1) + HUD.sys.barH + HUD.sys.gap).toBe(sysBarY(0));   // stacked bottom up with 2 px gaps
    expect(sysBarY(0) + HUD.sys.barH).toBeLessThanOrEqual(sysIconY());
    expect(HUD.sys.bottom).toBeLessThanOrEqual(INTERIOR_BAND.y + INTERIOR_BAND.h);
  });
});

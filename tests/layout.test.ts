import { describe, it, expect } from 'vitest';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { INTERNAL_W, INTERNAL_H, TILE_PX } from '../src/shared/resolution';
import { WORLD_BAND, worldFit } from '../src/renderer/src/render/worldFit';
import { WINDOW, SHIP, navigatorAtHelm } from '../src/renderer/src/render/enemyWindowModel';
import { createSimState } from './helpers/simLifetime';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { ENEMY_TILE, OLD_ENEMY_TILE } from '../src/renderer/src/render/enemyShipLayout';
import { MAP_W, MAP_H, nodeX, nodeY } from '../src/renderer/src/render/mapPanel';
import { CLOCK, POWER, THREATS, NOTICE, blockRect, cardRect, overlaps, inside, type Rect } from '../src/renderer/src/render/hudLayout';
import { SECTOR_COLUMNS, MIDDLE_MAX } from '../src/renderer/src/sim/tuning';
import { LAYOUT, CUTTER, RECRUITS, quiet, makeState } from './helpers/sim';

/** The FTL layout (spec Demo-x-c section 3): the world band x 256-864, the right column x 872-1272 with the 400 x 340 enemy window under the threats panel. */
const SCREEN: Rect = { x: 0, y: 0, w: INTERNAL_W, h: INTERNAL_H };
const band: Rect = WORLD_BAND, win: Rect = WINDOW;
const statics: [string, Rect][] = [['clock', CLOCK], ['power', POWER], ['threats', THREATS], ['window', win], ['band', band], ['notice', NOTICE], ...[0, 1, 2, 3].map((i): [string, Rect] => [`block ${i + 1}`, blockRect(i)])];

describe('the screen layout', () => {
  it('the band and the right column where the spec puts them', () => {
    expect([band.x, band.x + band.w]).toEqual([256, 864]);
    expect(THREATS).toEqual({ x: 872, y: 8, w: 400, h: 100 }); expect(win).toEqual({ x: 872, y: 114, w: 400, h: 340 });
    expect([MAP_W, MAP_H]).toEqual([win.w, win.h]);   // the map takes the window's slot while a navigator sits
  });
  it('no two fixed panels overlap, and every one is on screen', () => {
    for (const [n, r] of statics) expect(inside(r, SCREEN), n).toBe(true);
    for (let a = 0; a < statics.length; a++) for (let b = a + 1; b < statics.length; b++) expect(overlaps(statics[a]![1], statics[b]![1]), `${statics[a]![0]} / ${statics[b]![0]}`).toBe(false);
  });
  it('the console cards of players 1 to 3, with or without tabs, sit above their blocks clear of the band, the columns and each other', () => {
    for (const tabbed of [false, true]) {
      const cards = [0, 1, 2].map((i) => cardRect(i, tabbed));
      cards.forEach((c, i) => {
        expect(inside(c, SCREEN)).toBe(true); expect(c.y + c.h).toBeLessThanOrEqual(blockRect(i).y);
        for (const [n, r] of statics) if (!n.startsWith('block') && !(i === 2 && n === 'window')) expect(overlaps(c, r), `card ${i + 1} / ${n}`).toBe(false);
      });
      for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) expect(overlaps(cards[a]!, cards[b]!)).toBe(false);
    }
  });
  it('our ships fit the narrower band at every stage scale: the cutter at about 21 px a tile at stage 1.5 (16 snapped at stage 1), the Skiff at full size', () => {
    for (const l of [LAYOUT, CUTTER, parseShip(skiff)]) for (const stage of [1, 1.5, 2, 2.5, 3]) {
      const f = worldFit(l.width, l.height, stage);
      expect(inside({ x: f.x, y: f.y, w: l.width * TILE_PX * f.scale, h: l.height * TILE_PX * f.scale }, band), `${l.width}x${l.height} stage ${stage}`).toBe(true);
    }
    expect(Math.round(TILE_PX * worldFit(CUTTER.width, CUTTER.height, 1.5).scale)).toBe(21);
    expect(TILE_PX * worldFit(CUTTER.width, CUTTER.height, 1).scale).toBe(16);
  });
  it('the enemy ship drawn 1.6x larger, inside the window with its shield rings above the charge bar', () => {
    expect(ENEMY_TILE / OLD_ENEMY_TILE).toBe(1.6);
    expect(inside(SHIP, { x: 0, y: 0, w: win.w, h: win.h })).toBe(true);
    const rings = 3, rx = SHIP.w / 2 + 8 + 6 * (rings - 1), ry = SHIP.h / 2 + 8 + 6 * (rings - 1), cx = SHIP.x + SHIP.w / 2, cy = SHIP.y + SHIP.h / 2;
    expect(cx - rx).toBeGreaterThanOrEqual(2); expect(cx + rx).toBeLessThanOrEqual(win.w - 2); expect(cy - ry).toBeGreaterThan(18); expect(cy + ry).toBeLessThanOrEqual(288);
  });
  it('the map nodes sit inside the map panel under its title', () => {
    for (let c = 0; c < SECTOR_COLUMNS; c++) for (let n = 1; n <= MIDDLE_MAX; n++) for (let k = 0; k < n; k++) {
      expect(nodeX(c) - 16).toBeGreaterThanOrEqual(2); expect(nodeX(c) + 16).toBeLessThanOrEqual(MAP_W - 2);
      expect(nodeY(k, n) - 16).toBeGreaterThanOrEqual(28); expect(nodeY(k, n) + 16 + 30).toBeLessThanOrEqual(MAP_H - 2);
    }
  });
});

describe('the right column on the Skiff (spec Demo-x-c section 3)', () => {
  it('the map while the Helm group shows its Helm tab, the enemy window on its Weapons tab', () => {
    const s = createSimState(parseShip(skiff), 2, 1, RECRUITS); quiet(s);
    const nav = s.derived.stationOfKind[StationKind.Navigation]!, g = s.derived.stationGroup[nav]!;
    expect(navigatorAtHelm(s)).toBe(false);
    sitDown(s, 0, nav); s.groups.tab[g] = 0; expect(navigatorAtHelm(s)).toBe(true);
    s.groups.tab[g] = s.derived.groupStations[g]!.indexOf(s.derived.stationOfKind[StationKind.Weapons]!); expect(navigatorAtHelm(s)).toBe(false);
    const c = makeState(2); quiet(c); sitDown(c, 0, c.derived.stationOfKind[StationKind.Navigation]!); expect(navigatorAtHelm(c)).toBe(true);   // a lone Navigation console
  });
});

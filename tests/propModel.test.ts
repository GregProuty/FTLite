import { describe, it, expect } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip, type ShipLayout } from '../src/renderer/src/sim/ship/schema';
import type { SimState } from '../src/renderer/src/sim/state';
import { PROP_ART_NAMES } from '../src/renderer/src/render/assetNames';
import { consolePlacement, WALL_GAP, type Side } from '../src/renderer/src/render/consoleModel';
import { floorDepth, propCandidates, propDepth, propKey, propSlots, PROP_SIZE, ROOM_PROPS, roomKind } from '../src/renderer/src/render/propModel';
import { TILE_PX } from '../src/shared/resolution';
import { createSimState } from './helpers/simLifetime';
import { RECRUITS } from './helpers/sim';

const T = TILE_PX;
const SHIPS: Record<string, ShipLayout> = { cutter: parseShip(cutter), skiff: parseShip(skiff), starter: parseShip(starter) };
const stateOf = (layout: ShipLayout): SimState => createSimState(layout, 2, 1, RECRUITS);
const xy = (s: SimState, t: number): [number, number] => [t % s.derived.width, Math.floor(t / s.derived.width)];
const STEP: Record<Side, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

describe('which rooms get what (Art-iii spec section 2)', () => {
  it('names every room of the Cutter, the Skiff and the starter', () => {
    const kinds = (l: ShipLayout): Record<string, string | null> => Object.fromEntries(l.rooms.map((r) => [r.name, roomKind(r)]));
    expect(kinds(SHIPS.cutter!)).toEqual({
      Oxygen: null, 'Upper Hold': 'hold', Engines: null, 'Aft Passage': null, Weapons: null, 'Aft Store': 'hold', 'Lower Hold': 'hold',
      'Dorsal Airlock': null, 'Crew Quarters': 'quarters', Galley: 'galley', 'Ventral Airlock': null, Medbay: 'medbay', Reactor: null,
      'Door Control': null, Sensors: null, 'Forward Corridor': null, Bridge: null
    });
    expect(kinds(SHIPS.skiff!)).toEqual({ Bridge: null, Ops: null, Corridor: null, 'Life Support': null, Medbay: 'medbay', Engines: null, Reactor: null, Hold: 'hold' });
    expect(kinds(SHIPS.starter!)).toEqual({
      Bridge: null, 'Weapons Bay': null, 'Science Lab': null, Medbay: 'medbay', Reactor: null, Corridor: null, 'Crew Quarters': 'quarters', 'Life Support': null, 'Engine Room': null
    });
  });
  it('the generic rules: the name case-insensitively, then the medbay system', () => {
    expect(roomKind({ name: 'OFFICERS QUARTERS', system: null })).toBe('quarters');
    expect(roomKind({ name: 'Mess Hall', system: null })).toBe('galley');
    expect(roomKind({ name: 'galley', system: 'weapons' })).toBe('galley');
    expect(roomKind({ name: 'Cargo Bay', system: null })).toBe('hold');
    expect(roomKind({ name: 'Stores', system: null })).toBe('hold');
    expect(roomKind({ name: 'Sickbay', system: 'medbay' })).toBe('medbay');
    expect(roomKind({ name: 'Sickbay', system: null })).toBeNull();
    expect(ROOM_PROPS).toEqual({
      quarters: ['prop.bunk.a', 'prop.bunk.b', 'prop.bunk.a'], galley: ['prop.seats', 'prop.couch', 'prop.locker.a'],
      hold: ['prop.crate', 'prop.locker.a', 'prop.crate', 'prop.locker.b'], medbay: ['prop.bunk.a']
    });
  });
});

describe('where props stand (Art-iii spec section 3)', () => {
  for (const [ship, layout] of Object.entries(SHIPS)) it(`${ship}: no candidate on or next to a station, door, magazine; none next to a breach or airlock; no spawn or lamp tile; a wall on its side`, () => {
    const s = stateOf(layout), d = s.derived, W = d.width;
    const near = (a: number, b: number): boolean => { const [ax, ay] = xy(s, a), [bx, by] = xy(s, b); return Math.abs(ax - bx) + Math.abs(ay - by) <= 1; };
    const list = propCandidates(s);
    expect(list.length).toBeGreaterThan(0);
    for (const c of list) {
      const [x, y] = xy(s, c.tile), at = `${ship} (${x},${y})`;
      expect(d.roomOfTile[c.tile], at).toBe(c.room);
      expect(roomKind(layout.rooms[c.room]!), at).not.toBeNull();
      for (const t of [...d.stationTile, ...d.edgeTile, ...d.siteTile, ...d.airlockTile]) expect(near(c.tile, t), at).toBe(false);
      if (d.magazineTile >= 0) expect(near(c.tile, d.magazineTile), at).toBe(false);
      expect(layout.spawns.some(([sx, sy]) => sy * W + sx === c.tile), at).toBe(false);
      expect(c.tile, at).not.toBe(Math.min(...d.roomTiles[c.room]!));
      const first = (['n', 'e', 's', 'w'] as Side[]).find((sd) => layout.rows[y + STEP[sd][1]]?.charAt(x + STEP[sd][0]) === '#');
      expect(c.side, at).toBe(first);
    }
  });
  it('the fit rule: depth past the tile edge is 2 x the art height minus WALL_GAP; floor depth counts the room\'s tiles away from the wall', () => {
    expect(PROP_SIZE).toEqual({
      'prop.bunk.a': [14, 22], 'prop.bunk.b': [14, 23], 'prop.seats': [25, 15], 'prop.couch': [23, 15],
      'prop.locker.a': [18, 33], 'prop.locker.b': [18, 33], 'prop.crate': [12, 16]
    });
    expect(PROP_ART_NAMES.map(propDepth)).toEqual([34, 36, 20, 20, 56, 56, 22]);
    const s = stateOf(SHIPS.cutter!), at = (x: number, y: number): number => y * s.derived.width + x;
    expect(floorDepth(s, at(7, 3), 'n')).toBe(32);    // the Upper Hold: one row
    expect(floorDepth(s, at(13, 5), 'e')).toBe(96);   // the Crew Quarters: three columns
    expect(floorDepth(s, at(11, 8), 'w')).toBe(96);   // the Galley
  });
  it('the pinned slots: the Cutter and the Skiff (and the starter dressed)', () => {
    const named = (layout: ShipLayout): [string, number, number, Side, string][] => {
      const s = stateOf(layout);
      return propSlots(s).map((p) => [layout.rooms[p.room]!.name, ...xy(s, p.tile), p.side, p.name]);
    };
    expect(named(SHIPS.cutter!)).toEqual([
      ['Upper Hold', 7, 3, 'n', 'prop.crate'],
      ['Crew Quarters', 13, 3, 'n', 'prop.bunk.a'], ['Crew Quarters', 13, 5, 'e', 'prop.bunk.b'],
      ['Galley', 11, 8, 'w', 'prop.seats'], ['Galley', 13, 9, 'e', 'prop.couch'], ['Galley', 13, 7, 'n', 'prop.locker.a'],
      ['Medbay', 15, 5, 's', 'prop.bunk.a']
    ]);
    expect(named(SHIPS.skiff!)).toEqual([['Hold', 9, 7, 'e', 'prop.crate']]);
    const st = named(SHIPS.starter!);
    expect(st.filter((p) => p[0] === 'Crew Quarters').length).toBe(3);
    expect(st.filter((p) => p[0] === 'Medbay').length).toBe(1);
  });
  for (const [ship, layout] of Object.entries(SHIPS)) it(`${ship}: deterministic, no two slots touching, each name the first unused that fits, nothing past a wall`, () => {
    const s = stateOf(layout), d = s.derived, slots = structuredClone(propSlots(s));
    propSlots(stateOf(ship === 'cutter' ? SHIPS.skiff! : SHIPS.cutter!));   // evict the one-entry cache so the next call recomputes
    expect(propSlots(stateOf(layout))).toEqual(slots);
    for (const a of slots) for (const b of slots) if (a !== b) {
      const [ax, ay] = xy(s, a.tile), [bx, by] = xy(s, b.tile);
      expect(Math.max(Math.abs(ax - bx), Math.abs(ay - by)), `${ship} ${a.tile} ${b.tile}`).toBeGreaterThan(1);
    }
    layout.rooms.forEach((room, r) => {
      const kind = roomKind(room), mine = slots.filter((p) => p.room === r);
      if (!kind) { expect(mine).toEqual([]); return; }
      const used = ROOM_PROPS[kind].map(() => false);
      for (const p of mine) {
        const depth = floorDepth(s, p.tile, p.side), k = ROOM_PROPS[kind].findIndex((n, i) => !used[i] && propDepth(n) <= depth);
        expect(ROOM_PROPS[kind][k], `${ship} ${room.name} ${p.tile}`).toBe(p.name);
        used[k] = true;
      }
    });
    for (const p of slots) {
      // Every art pixel of the placed rectangle lies on the room's floor or within WALL_GAP of it (the strip in front of a
      // wall band), so it never crosses a wall's band, its own included (its back edge sits on its own wall's face).
      const [tx, ty] = xy(s, p.tile), [w, h] = PROP_SIZE[p.name], c = consolePlacement(p.side, true, w, h);
      const floor = d.roomTiles[p.room]!.map((t) => xy(s, t));
      for (let y = ty * T + c.top; y < ty * T + c.top + c.height; y += 2) for (let x = tx * T + c.left; x < tx * T + c.left + c.width; x += 2) {
        const ok = floor.some(([fx, fy]) => x + 1 >= fx * T - WALL_GAP && x + 1 < fx * T + T + WALL_GAP && y + 1 >= fy * T - WALL_GAP && y + 1 < fy * T + T + WALL_GAP);
        expect(ok, `${ship} ${p.name} at (${tx},${ty}) ${p.side}: art pixel ${x},${y}`).toBe(true);
      }
    }
  });
  it('the cache key covers the room names and systems as well as the layout hash', () => {
    const renamed: ShipLayout = { ...SHIPS.skiff!, rooms: SHIPS.skiff!.rooms.map((r) => r.name === 'Hold' ? { ...r, name: 'Galley' } : r) };
    const a = stateOf(SHIPS.skiff!), b = stateOf(renamed);
    expect(b.derived.layoutHash).toBe(a.derived.layoutHash);
    expect(propKey(b)).not.toBe(propKey(a));
    expect(propSlots(b).map((p) => p.name)).toEqual(['prop.seats']);
    expect(propSlots(a).map((p) => p.name)).toEqual(['prop.crate']);
  });
});

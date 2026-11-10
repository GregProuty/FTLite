import { describe, it, expect } from 'vitest';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';

function clone(): typeof starter { return JSON.parse(JSON.stringify(starter)); }

describe('ship schema', () => {
  it('accepts the starter ship', () => {
    const ship = parseShip(starter);
    expect(ship.rooms).toHaveLength(9);
    expect(ship.edges).toHaveLength(8);
  });
  it('rejects a row of the wrong width', () => {
    const s = clone(); s.rows[1] = '#AAAA#';
    expect(() => parseShip(s)).toThrow(/width/);
  });
  it('rejects an unknown room char in rows', () => {
    const s = clone(); s.rows[1] = '#AAAA#BBBB#DDDD#FFFF#ZZZ#';
    expect(() => parseShip(s)).toThrow(/room/);
  });
  it('rejects a room listed but never drawn (stray room)', () => {
    const s = clone(); s.rooms.push({ id: 'Z', name: 'Ghost', system: null });
    expect(() => parseShip(s)).toThrow(/Z/);
  });
  it('rejects a door tile that does not touch both rooms', () => {
    const s = clone(); s.edges[0]!.tile = [12, 4];
    expect(() => parseShip(s)).toThrow(/edge/);
  });
  it('rejects a door tile that also touches a third room', () => {
    const s = clone(); s.rows[4] = s.rows[4]!.slice(0, 3) + 'B' + s.rows[4]!.slice(4);
    expect(() => parseShip(s)).toThrow(/edge/);
  });
  it('rejects a disconnected room graph', () => {
    const s = clone(); s.edges = s.edges.filter((e) => e.a !== 'H');
    s.rows[4] = '##+####+####+####+#######';
    expect(() => parseShip(s)).toThrow(/connected/);
  });
  it('rejects duplicate stations and duplicate edge tiles', () => {
    const s = clone(); s.stations.push({ ...s.stations[0]! });
    expect(() => parseShip(s)).toThrow(/duplicate station/);
    const t = clone(); t.edges.push({ ...t.edges[0]! });
    expect(() => parseShip(t)).toThrow(/two edges/);
  });
  it('rejects a breach site that is not a wall adjacent to its room', () => {
    const s = clone(); s.breachSites[0]!.tile = [2, 2];
    expect(() => parseShip(s)).toThrow(/breach/);
  });
  it('rejects unreachable stations (crew-sized BFS)', () => {
    const s = clone(); s.rows[7] = '#########+######+########';
    s.edges = s.edges.filter((e) => e.a !== 'G');
    expect(() => parseShip(s)).toThrow(/reach|connected/);
  });
  it('derives station kinds, tiles, kind lookup and door edges', () => {
    const d = deriveLayout(parseShip(starter));
    expect(Array.from(d.stationKind)).toEqual([0, 6, 1, 2, 5, 4, 3]);          // starter order: nav, doors, wpn, sci, med, ls, eng
    expect(Array.from(d.stationOfKind)).toEqual([0, 2, 3, 6, 5, 4, 1]);
    expect(d.stationTile[6]).toBe(9 * 25 + 18);
    expect(d.stationRoom[6]).toBe(d.roomIndex.get('C'));
    expect(d.doorEdges).toHaveLength(8);
    expect(d.doorEdges.every((e) => d.edgeIsDoor[e] === 1)).toBe(true);
  });
  it('rejects an unknown station id, a missing kind, a fractional or over-max allocation, Engineering below 1, and a budget over capacity', () => {
    let s = clone(); (s.stations[0] as { id: string }).id = 'radar';
    expect(() => parseShip(s)).toThrow(/station/);
    s = clone(); s.stations.pop();
    expect(() => parseShip(s)).toThrow(/exactly 7/);
    s = clone(); s.stations[0]!.allocation = 1.5;
    expect(() => parseShip(s)).toThrow(/allocation/);
    s = clone(); s.stations[0]!.allocation = 3;                                    // navigation max is 2
    expect(() => parseShip(s)).toThrow(/exceeds max/);
    s = clone(); s.stations.find((st) => st.id === 'engineering')!.allocation = 0;
    expect(() => parseShip(s)).toThrow(/engineering/);
    s = clone(); s.stations.find((st) => st.id === 'weapons')!.allocation = 3; s.stations.find((st) => st.id === 'lifeSupport')!.allocation = 3;   // 9 + 1 + 1 = 11 > 10
    expect(() => parseShip(s)).toThrow(/capacity/);
  });
  it('layout identity changes when station kinds or allocations change', () => {
    const base = deriveLayout(parseShip(starter)).layoutHash;
    const a = clone(); a.stations.find((st) => st.id === 'navigation')!.allocation = 2;
    expect(deriveLayout(parseShip(a)).layoutHash).not.toBe(base);
    const b = clone(); const nav = b.stations.find((st) => st.id === 'navigation')!, sci = b.stations.find((st) => st.id === 'science')!;
    [nav.room, sci.room] = [sci.room, nav.room]; [nav.tile, sci.tile] = [sci.tile, nav.tile];       // same tiles, swapped kinds, equal allocations
    expect(deriveLayout(parseShip(b)).layoutHash).not.toBe(base);
  });
});

describe('derived tables', () => {
  it('maps tiles to rooms and computes volumes', () => {
    const d = deriveLayout(parseShip(starter));
    const idx = (c: string) => d.roomIndex.get(c)!;
    expect(d.volume[idx('A')]).toBe(12);
    expect(d.volume[idx('I')]).toBe(46);
    expect(d.volume[idx('C')]).toBe(27);
    expect(d.roomOfTile[5 * 25 + 1]).toBe(idx('I'));
    expect(d.roomOfTile[0]).toBe(-1);
    expect(d.wallTile[0]).toBe(1);
    expect(d.doorTileToEdge[4 * 25 + 2]).toBe(0);
    expect(d.edgeA[0]).toBe(idx('A')); expect(d.edgeB[0]).toBe(idx('I'));
    expect(d.siteRoom[5]).toBe(idx('I'));
    expect(d.siteTile[5]).toBe(5 * 25 + 0);
    expect(d.layoutHash).toMatch(/^[0-9a-f]{8}$/);
  });
  it('layout hash changes when rooms are reordered; id hash changes with the id', () => {
    const a = deriveLayout(parseShip(starter));
    const s = JSON.parse(JSON.stringify(starter)) as typeof starter;
    s.rooms.reverse();
    const b = deriveLayout(parseShip(s));
    expect(b.layoutHash).not.toBe(a.layoutHash);
    const t = clone(); t.id = 'other';
    expect(deriveLayout(parseShip(t)).idHash).not.toBe(a.idHash);
  });
});

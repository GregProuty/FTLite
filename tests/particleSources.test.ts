import { describe, it, expect } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { Position, Seated } from '../src/renderer/src/sim/components';
import { roomAt } from '../src/renderer/src/sim/grid';
import { TILE_PX } from '../src/shared/resolution';
import { createRenderMemory } from '../src/renderer/src/render/memory';
import { createEmitter } from '../src/renderer/src/render/particles/emitter';
import { hashString, hashU32 } from '../src/renderer/src/render/particles/random';
import { cellAt } from '../src/renderer/src/render/gradeModel';
import {
  bobOffset, breachDirection, breachOpenings, damagedRepairPoints, debrisBurst, DEBRIS_COUNT, duelWorking, failedStationPoints, fireSources, hitSmokeSources,
  PUFF_COUNT, sectorWorking, stepVents, ventingSources, wallVents, watchRepair, workSources
} from '../src/renderer/src/render/particles/sources';
import { cutterState } from './helpers/sim';

const T = TILE_PX;

describe('who is working (Art-i spec section 6)', () => {
  it('sector: a fire in the crew member\'s room counts only while its repair progress rises between drawn ticks', () => {
    const s = cutterState(), m = createRenderMemory(), eid = s.crew[0]!;
    Seated.station[eid] = -1; Seated.station[s.crew[1]!] = 1;   // player 1 seated: the derivation cannot tell two holders in one room apart (see the plan's spec notes)
    const room = roomAt(s, Position.x[eid]!, Position.y[eid]!);
    expect(room).toBeGreaterThanOrEqual(0);
    s.rooms.fire[room] = 4;
    watchRepair(m.repair, s);
    expect(sectorWorking(s, m.repair)).toEqual([]);                    // one sample: nothing to compare
    s.tick = 1; watchRepair(m.repair, s);
    expect(sectorWorking(s, m.repair)).toEqual([]);                    // no rise: standing in a burning room is not working
    s.tick = 2; s.rooms.fireRepair[room] = 0.1; watchRepair(m.repair, s);
    const w = sectorWorking(s, m.repair);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ pid: 0, kind: 'fire' });
    watchRepair(m.repair, s);                                            // the same tick drawn again keeps the answer
    expect(sectorWorking(s, m.repair)).toHaveLength(1);
    Seated.station[eid] = 0;
    expect(sectorWorking(s, m.repair)).toEqual([]);                    // seated: interactTarget is None
    m.reset();
    expect(m.repair).toEqual({ last: null, prev: null });
  });
  it('sector: a failed station in reach counts while its repair rises; the point is the station tile centre', () => {
    const s = cutterState(), m = createRenderMemory(), eid = s.crew[0]!, i = 0, t = s.derived.stationTile[i]!, w = s.derived.width;
    Seated.station[eid] = -1; s.stations.occupant.fill(-1);
    Position.x[eid] = (t % w) + 0.5; Position.y[eid] = Math.floor(t / w) + 0.5;
    s.stations.failed[i] = 1;
    watchRepair(m.repair, s); s.tick = 1; s.stations.repair[i] = 0.2; watchRepair(m.repair, s);
    expect(sectorWorking(s, m.repair)).toEqual([{ pid: 0, kind: 'power', x: (t % w) * T + T / 2, y: Math.floor(t / w) * T + T / 2 }]);
  });
  it('duel: a repairWork event for the player in the latest tick\'s events; the point is the room\'s repair tile', () => {
    const d = createDuel(parseShip(cutter), 5), w = d.interior.derived.width;
    expect(duelWorking(d)).toEqual([]);
    d.events = [{ kind: 'repairWork', player: 1, room: Room.Shields }, { kind: 'repairDone', room: Room.Shields, players: [1] }];
    const p = d.points.find((q) => q.tacticalRoom === Room.Shields)!;
    expect(duelWorking(d)).toEqual([{ pid: 1, kind: 'repair', x: (p.tile % w) * T + T / 2, y: Math.floor(p.tile / w) * T + T / 2 }]);
    disposeDuel(d);
  });
  it('a working crew member bobs 1 art pixel at 4 Hz', () => {
    expect([0, 0.1, 0.13, 0.2, 0.25, 0.4].map(bobOffset)).toEqual([0, 0, -2, -2, 0, -2]);
  });
});

describe('the emitter signals (Art-i spec section 6)', () => {
  it('fire: embers (additive) and smoke (normal) per burning tile', () => {
    const s = cutterState();
    expect(fireSources(s)).toEqual([]);
    s.rooms.fire[1] = 16;
    const src = fireSources(s), tiles = s.derived.roomTiles[1]!.length;
    expect(src).toHaveLength(2 * tiles);
    const e = createEmitter(3);
    e.step(1, src);
    expect(new Set(e.particles.map((p) => p.blend))).toEqual(new Set(['add', 'normal']));
  });
  it('sparks from each failed station (sector) and each damaged duel repair room', () => {
    const s = cutterState();
    expect(failedStationPoints(s)).toEqual([]);
    s.stations.failed[2] = 1;
    expect(failedStationPoints(s).map((p) => p.key)).toEqual(['station:2']);
    const d = createDuel(parseShip(cutter), 5);
    expect(damagedRepairPoints(d)).toEqual([]);
    d.tactical.systems[0]!.rooms[Room.Engines] = 1;
    expect(damagedRepairPoints(d).map((p) => p.key)).toEqual([`room:${Room.Engines}`]);
    disposeDuel(d);
  });
  it('venting streams from the floor tile toward the hole; debris on the tick a breach opens', () => {
    const s = cutterState(), site = 0;
    expect(ventingSources(s)).toEqual([]);
    let o = breachOpenings(s.breaches.active, null);
    expect(o.opened).toEqual([]);
    s.breaches.active[site] = 1;
    o = breachOpenings(s.breaches.active, o.seen);
    expect(o.opened).toEqual([site]);
    expect(breachOpenings(s.breaches.active, o.seen).opened).toEqual([]);
    const dir = breachDirection(s, site)!, src = ventingSources(s);
    expect(Math.abs(dir.dx) + Math.abs(dir.dy)).toBe(1);
    const e = createEmitter(9);
    e.step(1, src);
    for (const p of e.particles) expect(Math.sign(p.vx * dir.dx + p.vy * dir.dy)).toBe(1);   // every speck heads for the hole
    const before = e.particles.length;
    debrisBurst(e, s, site);
    expect(e.particles.length).toBe(before + DEBRIS_COUNT);
  });
  it('work: foam at a fire, sparks elsewhere; hit smoke only until it expires', () => {
    const w = workSources([{ pid: 0, kind: 'fire', x: 10, y: 10 }, { pid: 1, kind: 'power', x: 50, y: 50 }]);
    expect(w.map((x) => x.key)).toEqual(['foam:0', 'work:1']);
    expect(hitSmokeSources([{ key: 'r2', tiles: [5, 6], until: 3 }], 2.9, 10)).toHaveLength(1);
    expect(hitSmokeSources([{ key: 'r2', tiles: [5, 6], until: 3 }], 3, 10)).toHaveLength(0);
  });
});

describe('wall vents (Art-i spec section 8)', () => {
  it('are wall tiles next to a floor tile where hash(layoutHash, tile) mod 8 = 0, puffing into the room', () => {
    const s = cutterState(), d = s.derived, rows = s.layout.rows, vents = wallVents(rows, d.width, d.height, d.layoutHash), seed = hashString(d.layoutHash);
    expect(vents.length).toBeGreaterThan(0);
    for (const v of vents) {
      const tx = v.tile % d.width, ty = (v.tile - tx) / d.width;
      expect(cellAt(rows, tx, ty)).toBe('wall'); expect(hashU32(seed, v.tile) % 8).toBe(0);
      expect(cellAt(rows, tx + v.dx, ty + v.dy)).toBe('floor');
    }
    expect(wallVents(rows, d.width, d.height, d.layoutHash)).toEqual(vents);   // stable for a layout
  });
  it('each vent puffs every 4 to 8 seconds', () => {
    const s = cutterState(), d = s.derived, vents = wallVents(s.layout.rows, d.width, d.height, d.layoutHash).slice(0, 1), e = createEmitter(5), next: number[] = [];
    let puffs = 0;
    for (let k = 0; k <= 60 * 60; k++) { const n = e.particles.length; stepVents(e, vents, next, k / 60); if (e.particles.length > n) puffs++; e.step(1 / 60, []); }
    expect(puffs).toBeGreaterThanOrEqual(Math.floor(60 / 8)); expect(puffs).toBeLessThanOrEqual(Math.ceil(60 / 4) + 1);
    expect(PUFF_COUNT).toBe(7);
  });
});

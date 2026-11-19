// Valkyrn spec §4.2, §4.3: the Valkyrn traced from the rotated 2-Minute Tabletop painting at two tiles per square
// (tile tx centred on source x = 560 + 70 tx, ty on y = 910 + 70 ty), its repair points, a duel at crew 1, and its
// painting's place (BATTLEMAPS.valkyrn), which falls back to procedural tiles when the asset is missing.
import { describe, expect, it } from 'vitest';
import valkyrnJson from '../src/renderer/src/sim/ship/valkyrn.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { DUEL_REPAIR_POINTS } from '../src/renderer/src/sim/duel/tuning';
import { classIndexById, VALKYRN_CLASS, VALKYRN_LASER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { BATTLEMAPS, battlemapFor, fitRect } from '../src/renderer/src/render/battlemapModel';

const TRACE = [
  '#############      ',
  '#EEE#RRR#LLL#######',
  '#EEE#RRR#LLL#O#BBB#',
  '#EEE+RRR+LLL+O+BBB#',
  '#EEE#RRR##+##O#BBB#',
  '#EEE#RRR#MMM#######',
  '#############      '
];

describe('the Valkyrn layout (Valkyrn spec §4.2, §4.3)', () => {
  const ship = parseShip(valkyrnJson);
  it('is 19 x 7 with the traced rows, the cockpit to the right', () => {
    expect([ship.id, ship.width, ship.height]).toEqual(['valkyrn', 19, 7]);
    expect(ship.rows).toEqual(TRACE);
  });
  it('carries the four layout fields: its class, a crew of one, the Helm holds unattended, its hull', () => {
    expect([ship.shipClass, ship.crew, ship.helmHoldsUnattended, ship.hull]).toEqual(['valkyrn', 1, true, 'valkyrn']);
  });
  it('has the six rooms of §4.3 with their systems, and no system-less rooms', () => {
    expect(ship.rooms.map((r) => [r.id, r.system])).toEqual([
      ['B', 'navigation'], ['O', 'science'], ['M', 'medbay'], ['L', 'lifeSupport'], ['E', 'engineering'], ['R', 'reactor']
    ]);
  });
  it('the doors follow the painted gaps, front to back along row 3, and the bunk off the galley', () => {
    expect(ship.edges.map((e) => [e.a, e.b, e.tile])).toEqual([['E', 'R', [4, 3]], ['R', 'L', [8, 3]], ['L', 'M', [10, 4]], ['L', 'O', [12, 3]], ['O', 'B', [14, 3]]]);
  });
  it('Flight (Navigation + Weapons) at the front pilot chair, Science/Engineering/Doors at Ops, allocations as the Hound', () => {
    expect(ship.consoleGroups).toEqual([{ tile: [17, 3], kinds: ['navigation', 'weapons'] }, { tile: [13, 2], kinds: ['science', 'engineering', 'doors'] }]);
    expect(ship.stations.map((s) => [s.id, s.room, s.tile, s.allocation])).toEqual([
      ['navigation', 'B', [17, 3], 1], ['weapons', 'B', [17, 3], 2], ['science', 'O', [13, 2], 1], ['engineering', 'O', [13, 2], 1],
      ['doors', 'O', [13, 2], 1], ['lifeSupport', 'L', [11, 1], 1], ['medbay', 'M', [9, 5], 1]
    ]);
  });
  it('spawns on the Ops floor; the ramp and the galley are airlocks; every room has a breach site', () => {
    const [sx, sy] = ship.spawns[0]!;
    expect(ship.rows[sy]![sx]).toBe('O');
    expect(ship.airlocks).toEqual([{ room: 'E', tile: [0, 3] }, { room: 'L', tile: [10, 0] }]);
    expect(new Set(ship.breachSites.map((b) => b.room))).toEqual(new Set(ship.rooms.map((r) => r.id)));
  });
  it('the repair points: Weapons in Ops, Shields in the racks, Engines on the ramp, each on an open floor tile', () => {
    const points = DUEL_REPAIR_POINTS[ship.id]!;
    expect(points.map((p) => [p.tacticalRoom, p.room, p.tile])).toEqual([[Room.Weapons, 'O', [13, 4]], [Room.Shields, 'R', [6, 3]], [Room.Engines, 'E', [2, 3]]]);
    for (const p of points) {
      expect(ship.rows[p.tile[1]]![p.tile[0]]).toBe(p.room);
      expect(ship.stations.some((s) => s.tile[0] === p.tile[0] && s.tile[1] === p.tile[1])).toBe(false);
    }
  });
  it('a duel at crew 1: one character, the Valkyrn class from the layout, or the laser fit from the argument', () => {
    const d = createDuel(ship, 7, 0, 1);
    try {
      expect(d.present).toEqual([true]);
      expect(d.interior.crew.length).toBe(1);
      expect(d.crewClass).toBe(classIndexById(VALKYRN_CLASS.id));
      expect(d.tactical.systems[0].cls).toBe(d.crewClass);
      expect(d.points.map((p) => p.tacticalRoom)).toEqual([Room.Weapons, Room.Shields, Room.Engines]);
    } finally { disposeDuel(d); }
    const l = createDuel(ship, 7, 0, 1, classIndexById(VALKYRN_LASER_CLASS.id));
    try { expect(l.tactical.systems[0].cls).toBe(classIndexById(VALKYRN_LASER_CLASS.id)); } finally { disposeDuel(l); }
    expect(() => createDuel(ship, 7, 0, 2)).toThrow();   // the layout fixes the crew at one
  });
});

describe('the Valkyrn painting (Valkyrn spec §4.2)', () => {
  const v = BATTLEMAPS.valkyrn!;
  it('70 source px a tile, image corner at (-7.5, -12.5): tile centres on the rotated painting\'s square boundaries', () => {
    expect([v.name, v.pxPerTile]).toEqual(['ship.valkyrn.map', 70]);
    const cx = (tx: number) => (tx + 0.5 - v.origin.x) * v.pxPerTile, cy = (ty: number) => (ty + 0.5 - v.origin.y) * v.pxPerTile;
    expect([cx(0), cx(4), cx(18), cy(0), cy(3), cy(6)]).toEqual([560, 840, 1820, 910, 1120, 1330]);
    expect(v.bounds).toEqual({ x: -7, y: -12.1, w: 30.557, h: 30.714 });   // the alpha > 16 box, wings and engines
  });
  it('draws only with its own asset, and a missing Valkyrn never hides the Hound', () => {
    expect(battlemapFor('valkyrn', new Set())).toBe(v);
    expect(battlemapFor('valkyrn', new Set(['ship.valkyrn.map']))).toBeNull();
    expect(battlemapFor('hound', new Set(['ship.valkyrn.map']))).toBe(BATTLEMAPS.hound);
    expect(fitRect('valkyrn', 19, 7, new Set(['ship.valkyrn.map']))).toEqual({ x: 0, y: 0, w: 19, h: 7 });
    expect(fitRect('valkyrn', 19, 7, new Set())).toEqual(v.bounds);
  });
});

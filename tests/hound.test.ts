import { describe, it, expect } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { shipForCrew } from '../src/renderer/src/sim/ship/fleet';

/** The Hound (Art-iv spec sections 1-3): traced against the mirrored 2-Minute Tabletop painting at two tiles per square. */
const TRACE = [
  '      ######           ',
  '  #####MMMM#           ',
  '  #EEE#MMMM#           ',
  '  #EEE#MMMM#           ',
  '#####+#+###############',
  '#HHHHH+OOOOO#######BBB#',
  '#HHHHH#OOOOO#QQQQQ#BBB#',
  '#HHHHH#OOOOO+QQQQQ+BBB#',
  '#HHHHH#OOOOO#QQQQQ#BBB#',
  '#HHHHH+OOOOO#######BBB#',
  '#####+#+###############',
  '  #RRR#LLLL#           ',
  '  #RRR#LLLL#           ',
  '  #####LLLL#           ',
  '      ######           '
];

describe('the Hound layout', () => {
  const ship = parseShip(hound);
  it('is 23 x 15 with the traced rows, the dome (Bridge) to the right', () => {
    expect([ship.width, ship.height]).toEqual([23, 15]);
    expect(ship.rows).toEqual(TRACE);
    expect(ship.stations.find((s) => s.id === 'navigation')!.tile).toEqual([20, 7]);
  });
  it('has the eight rooms and systems of the spec table', () => {
    expect(ship.rooms.map((r) => [r.id, r.system])).toEqual([
      ['B', 'navigation'], ['Q', null], ['O', 'science'], ['M', 'medbay'], ['L', 'lifeSupport'], ['E', 'engineering'], ['R', 'reactor'], ['H', null]
    ]);
  });
  it('spawns in the bunk passage and has the hold ramp airlock', () => {
    for (const [x, y] of ship.spawns) expect(ship.rows[y]![x]).toBe('Q');
    expect(ship.airlocks).toContainEqual({ room: 'H', tile: [0, 7] });
  });
  it('is the duel ship, and the sector fleet is unchanged (Art-iv-b moves it)', () => {
    expect(DUEL_LAYOUT.id).toBe('hound');
    expect([1, 2, 3, 4].map(shipForCrew)).toEqual(['skiff', 'skiff', 'cutter', 'cutter']);
  });
  it('a duel on the Hound seats both players and resolves its repair points', () => {
    const d = createDuel(DUEL_LAYOUT, 7);
    try { expect(d.points.map((p) => p.tacticalRoom).length).toBe(3); } finally { disposeDuel(d); }
  });
});

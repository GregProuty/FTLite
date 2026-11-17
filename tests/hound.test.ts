import { describe, it, expect } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { seatOf } from '../src/renderer/src/app/duel/controls';
import { Seated, Position } from '../src/renderer/src/sim/components';
import { HOUND_REPAIR_POINTS } from '../src/renderer/src/sim/duel/tuning';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
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
  it('is the duel ship, and the sector fleet is the Hound at every crew size (Art-iv-b)', () => {
    expect(DUEL_LAYOUT.id).toBe('hound');
    expect([1, 2, 3, 4].map(shipForCrew)).toEqual(['hound', 'hound', 'hound', 'hound']);
  });
  it('a duel on the Hound seats the two players on separate seats, in both helm orders, and resolves its repair points', () => {
    for (const helm of [0, 1] as const) {
      const d = createDuel(DUEL_LAYOUT, 7, helm), st = d.interior;
      try {
        expect(d.nav).not.toBe(d.weapons);
        const [a, b] = [st.crew[helm]!, st.crew[1 - helm]!];
        expect(Seated.station[a]).toBe(d.nav); expect(Seated.station[b]).toBe(d.weapons);
        expect([Position.x[a], Position.y[a]]).not.toEqual([Position.x[b], Position.y[b]]);
        expect(st.stations.occupant[d.nav]).toBe(helm); expect(st.stations.occupant[d.weapons]).toBe(1 - helm);
        expect(seatOf(d, helm)).toBe('helm'); expect(seatOf(d, 1 - helm)).toBe('weapons');
        expect(HOUND_REPAIR_POINTS.map((p) => p.room)).toEqual(['O', 'R', 'E']);
        expect(d.points.map((p) => [p.tacticalRoom, p.room])).toEqual(HOUND_REPAIR_POINTS.map((p) => [p.tacticalRoom, st.derived.roomIndex.get(p.room)!]));
      } finally { disposeDuel(d); }
    }
  });
  it('createDuel refuses a layout that puts Navigation and Weapons in one console group', () => {
    expect(() => createDuel(parseShip(skiff), 7)).toThrow(/one console group/);
  });
});

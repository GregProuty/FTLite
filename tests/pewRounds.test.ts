// W-1 pew pew (spec 2026-11-18-pew-pew-weapons-design §1, §5): rounds fly straight with no gravity, end at life 30, hit
// the first thing on their swept segment (ties: rock, planet, the other ship's torpedo, the other ship), never their own
// ship or torpedo; a ship hit strips a layer or costs 1 hull and never raises a room; a torpedo hit ends it 'shot'; a crew
// round turns the Hunter hostile.
import { describe, expect, it } from 'vitest';
import { buildGrid } from '../src/renderer/src/sim/tactical/grid';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { placeRound } from '../src/renderer/src/sim/tactical/gun';
import { firePew, stepPew } from '../src/renderer/src/sim/tactical/pew';
import { createTacticalState, missileOf, placeMissile, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { TERMINAL_CAUSES } from '../src/renderer/src/sim/duel/summary';
import { HEADING_COUNT, PEW_HULL, PEW_LIFE, SHIP_RADIUS } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';

/** A state with no asteroids (or the ones given), the crew at (0, 1500) nose north and still, the Hunter far off. */
function open(rocks: { x: number; y: number; r: number }[] = []): TacticalState {
  const st = createTacticalState(5);
  st.map = { ...st.map, asteroids: rocks }; st.grid = buildGrid(rocks, st.map.rMap);
  Object.assign(st.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(st.ships[1], { x: 2000, y: 2000, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.events = [];
  return st;
}
const NORTH = 0;
const flying = (st: TacticalState) => st.pew.filter((r) => r.active);
const muzzleY = 1500 - (SHIP_RADIUS + 1);

describe('pew rounds in flight (spec §1)', () => {
  it('fly straight at the round speed, unbent by gravity, and end at life 30', () => {
    const st = open();
    firePew(st, 0, NORTH);
    for (let k = 1; k <= PEW_LIFE - 1; k++) {
      stepPew(st);
      const r = flying(st)[0]!;
      expect(r.x).toBe(0); expect(r.y).toBeCloseTo(muzzleY - 15 * k, 9); expect(r.age).toBe(k);
    }
    stepPew(st);
    expect(flying(st)).toHaveLength(0);
    expect(st.pew.every((r) => r.x === 0 && r.y === 0 && r.vx === 0 && r.vy === 0 && r.age === 0 && r.owner === 0)).toBe(true);
  });
  it('never hits its own ship or its own ship\'s torpedo', () => {
    const st = open();
    placeRound(st, { x: 0, y: 1530, vx: 0, vy: -900, age: 0, owner: 0 }, st.pew);   // behind the own ship, flying through it
    placeMissile(st, 0, { x: 0, y: 1400, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 });
    for (let k = 0; k < 12; k++) stepPew(st);
    expect(flying(st)).toHaveLength(1);
    expect(missileOf(st, 0)).not.toBeNull();
    expect(st.events).toEqual([]);
  });
});

describe('what a round hits (spec §1, §5)', () => {
  it('a shielded ship loses one layer and no hull; no room level changes', () => {
    const st = open();
    Object.assign(st.ships[1], { x: 0, y: 1300 });
    const hull = st.systems[1].hull, layers = st.systems[1].shields;
    firePew(st, 0, NORTH); st.events = [];
    for (let k = 0; k < 20 && flying(st).length > 0; k++) stepPew(st);
    expect([st.systems[1].shields, st.systems[1].hull, st.systems[1].rooms, st.systems[0].pewHits]).toEqual([layers - 1, hull, [0, 0, 0], 1]);
    expect(st.events).toEqual([{ kind: 'pewHit', ship: 1, owner: 0, stripped: true, hull: false, x: 0, y: expect.closeTo(1300 + SHIP_RADIUS, 9) }]);
  });
  it('an unshielded ship loses PEW_HULL hull; no room level changes', () => {
    const st = open();
    Object.assign(st.ships[1], { x: 0, y: 1300 });
    st.systems[1].shields = 0;
    const hull = st.systems[1].hull;
    firePew(st, 0, NORTH); st.events = [];
    for (let k = 0; k < 20 && flying(st).length > 0; k++) stepPew(st);
    expect([st.systems[1].hull, st.systems[1].rooms]).toEqual([hull - PEW_HULL, [0, 0, 0]]);
    expect(st.events[0]).toMatchObject({ kind: 'pewHit', ship: 1, owner: 0, stripped: false, hull: true });
  });
  it('a rock on the segment stops it with no effect, before the ship behind', () => {
    const st = open([{ x: 0, y: 1400, r: 20 }]);
    Object.assign(st.ships[1], { x: 0, y: 1300 });
    const before = { ...st.systems[1], rooms: [...st.systems[1].rooms] };
    firePew(st, 0, NORTH); st.events = [];
    for (let k = 0; k < 20; k++) stepPew(st);
    expect(flying(st)).toHaveLength(0);
    expect(st.events).toEqual([]);
    expect({ ...st.systems[1], rooms: [...st.systems[1].rooms] }).toEqual(before);
  });
  it('the planet stops it with no effect', () => {
    const st = open();
    Object.assign(st.ships[0], { x: 0, y: 200 });   // 130 u south of the planet's surface
    firePew(st, 0, NORTH); st.events = [];
    for (let k = 0; k < 12; k++) stepPew(st);
    expect(flying(st)).toHaveLength(0);
    expect(st.events).toEqual([]);
  });
  it('the other ship\'s torpedo on the segment is shot down (cause shot, a loss), before the ship behind', () => {
    const st = open();
    Object.assign(st.ships[1], { x: 0, y: 1300 });
    placeMissile(st, 1, { x: 0, y: 1400, vx: 0, vy: 0, heading: 128, headingAcc: 0, age: 30 });
    const layers = st.systems[1].shields;
    firePew(st, 0, NORTH); st.events = [];
    for (let k = 0; k < 20; k++) stepPew(st);
    expect(missileOf(st, 1)).toBeNull();
    expect(st.events).toEqual([{ kind: 'missileEnd', ship: 1, cause: 'shot', target: -1, room: -1, x: 0, y: 1400 }]);
    expect([st.systems[1].missilesLost, st.systems[1].shields, st.systems[0].pewHits]).toEqual([1, layers, 0]);
  });
  it('a tie on the segment goes to the rock before the torpedo', () => {
    const st = open([{ x: 0, y: 1400, r: 4 }]);
    placeMissile(st, 1, { x: 0, y: 1400, vx: 0, vy: 0, heading: 128, headingAcc: 0, age: 30 });   // the same circle as the rock
    firePew(st, 0, NORTH); st.events = [];
    for (let k = 0; k < 20; k++) stepPew(st);
    expect(missileOf(st, 1)).not.toBeNull();
    expect(st.events).toEqual([]);
  });
  it('the terminal causes name the pew after the gun', () => {
    expect(TERMINAL_CAUSES).toEqual(['planet', 'asteroid', 'ship', 'laser', 'gun', 'pew', 'missile', 'downed']);
  });
});

describe('in the duel tick (spec §1, §6 decision 7)', () => {
  it('a crew round fired turns the holding Hunter hostile, cause pew; the round moves on its spawn tick', () => {
    const st = createTacticalState(5);
    expect(st.hostileAt).toBe(-1);
    stepDuel(st, { ...IDLE_INPUT, pewAim: st.ships[0].heading * HEADING_COUNT });
    expect(st.events.filter((e) => e.kind === 'hostile')).toEqual([{ kind: 'hostile', cause: 'pew' }]);
    expect(st.pew.filter((r) => r.active).map((r) => r.age)).toEqual([1]);
  });
});

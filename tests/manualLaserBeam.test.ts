// W-2 manual laser (spec 2026-11-18-pew-pew-weapons-design §2, §5): the MANUAL beam. A laserFire input fires the shot or
// burst along the aim, clamped into the laser's ±60° about the heading: an instant beam from the ship's centre to 450.
// The first rock stops it and takes what the AUTO laser does to a rock (a push, then its damage); the planet stops it;
// a torpedo in its path is not hit. On a ship it strips a layer, or strikes the room under its hit point (+1 level, 2
// hull). A burst's second shot keeps the aim the burst was fired with and is re-checked at its own tick. No shot while
// the own torpedo flies, without a full charge, with a burst pending, offline, or in AUTO.
import { describe, expect, it } from 'vitest';
import { aimDir, clampAim } from '../src/renderer/src/sim/tactical/pew';
import { beginRockTick, rockAt, rockHp } from '../src/renderer/src/sim/tactical/rocks';
import { laserStrikesRock } from '../src/renderer/src/sim/tactical/rockWeapons';
import { LASER_ROCK_DAMAGE } from '../src/renderer/src/sim/tactical/rockTuning';
import { cloneTactical, createTacticalState, missileOf, placeMissile, Room, type DuelEvent, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { AIM_STEPS, HEADING_COUNT, LASER_ARC_STEPS, LASER_BURST_GAP_TICKS, LASER_CHARGE_UNITS, LASER_HULL, LASER_RANGE, PLANET_RADIUS, SHIP_RADIUS } from '../src/renderer/src/sim/tactical/tuning';
import { applyWeaponsInput, IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { mover } from './helpers/rockArena';

/** The first pool slot past the seeded asteroids, where open() writes its rocks. */
const ROCK0 = 100;
type LaserEvent = Extract<DuelEvent, { kind: 'laser' }>;
/** A MANUAL crew at (0, crewY) nose north and still, full; no rocks but the ones given (resting moving rocks from slot
 *  ROCK0 on); the Hunter far off and still; a fresh tick's rock masks; no events. */
function open(rocks: { x: number; y: number; r: number }[] = [], crewY = 1500): TacticalState {
  const st = createTacticalState(5);
  st.rocks.fill(0);   // every seeded rock gone (the seeded grid ignores empty slots)
  rocks.forEach((a, k) => mover(st, ROCK0 + k, a.x, a.y, 0, 0, a.r));
  beginRockTick(st);
  Object.assign(st.ships[0], { x: 0, y: crewY, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(st.ships[1], { x: 2000, y: 2000, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.systems[0].laserManual = true;
  st.systems[0].freq = (st.weakFreq + 1) % 3;   // off the weak frequency: one layer a hit (as tests/helpers/hostile.ts does)
  st.events = [];
  return st;
}
const fire = (aim: number) => ({ ...IDLE_INPUT, laserFire: aim });
const beams = (st: TacticalState): LaserEvent[] => st.events.filter((e): e is LaserEvent => e.kind === 'laser');
const NORTH = 0;

describe('a MANUAL shot (spec §2)', () => {
  it('fires along the aim clamped into ±60°, to the laser range; spends the charge; queues the burst with its aim', () => {
    const st = open();
    applyWeaponsInput(st, 0, fire(64 * HEADING_COUNT));   // 90° right of the nose: the cone's clockwise edge
    const [ux, uy] = aimDir(LASER_ARC_STEPS), b = beams(st);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ ship: 0, hit: false, stripped: false, room: -1, x1: 0, y1: 1500 });
    expect(b[0]!.x2).toBeCloseTo(ux * LASER_RANGE, 6); expect(b[0]!.y2).toBeCloseTo(1500 + uy * LASER_RANGE, 6);
    expect([st.systems[0].shots, st.systems[0].laserCharge, st.systems[0].laserBurst, st.systems[0].laserAim]).toEqual([1, 0, 1, LASER_ARC_STEPS]);
  });
  it('strikes the room under its hit point: the stern Engines, the nose Weapons, a flank Shields', () => {
    for (const [heading, room] of [[0, Room.Engines], [128, Room.Weapons], [64, Room.Shields]] as const) {
      const st = open();
      Object.assign(st.ships[1], { x: 0, y: 1300, heading });
      st.systems[1].shields = 0;
      const hull = st.systems[1].hull;
      applyWeaponsInput(st, 0, fire(NORTH));
      expect(st.systems[1].rooms[room], `heading ${heading}`).toBe(1);
      expect(st.systems[1].hull).toBe(hull - LASER_HULL);
      expect(beams(st)[0]).toMatchObject({ hit: true, stripped: false, room, x2: expect.closeTo(0, 6), y2: expect.closeTo(1300 + SHIP_RADIUS, 6) });
      expect(st.systems[0].laserHits).toBe(1);
    }
  });
  it('a shield layer up takes the hit (two on the weak frequency), with no room or hull', () => {
    for (const weak of [false, true]) {
      const st = open();
      Object.assign(st.ships[1], { x: 0, y: 1300 });
      if (weak) st.systems[0].freq = st.weakFreq;
      const hull = st.systems[1].hull;
      applyWeaponsInput(st, 0, fire(NORTH));
      expect([st.systems[1].shields, st.systems[1].hull, st.systems[1].rooms, st.systems[0].layersStripped]).toEqual([weak ? 0 : 1, hull, [0, 0, 0], weak ? 2 : 1]);
      expect(beams(st)[0]).toMatchObject({ hit: true, stripped: true, room: -1 });
    }
  });
});

describe('what stops the beam (spec §2, §5)', () => {
  it('the first rock stops it before the ship behind, and takes exactly what the AUTO laser does to a rock', () => {
    const st = open([{ x: 0, y: 1400, r: 40 }]);
    Object.assign(st.ships[1], { x: 0, y: 1300 });
    const twin = cloneTactical(st), shields = st.systems[1].shields, hull = st.systems[1].hull;
    applyWeaponsInput(st, 0, fire(NORTH));
    const b = beams(st)[0]!;
    expect(b).toMatchObject({ hit: false, stripped: false, room: -1, rock: ROCK0, x2: expect.closeTo(0, 6), y2: expect.closeTo(1440, 6) });
    expect([st.systems[1].shields, st.systems[1].hull]).toEqual([shields, hull]);
    laserStrikesRock(twin, 0, ROCK0, b.x2, b.y2);   // master's laser on this rock at this point
    expect(Array.from(st.rocks)).toEqual(Array.from(twin.rocks));
    expect(st.rockHits).toBe(twin.rockHits);
    expect(st.events.filter((e) => e.kind === 'rock')).toEqual(twin.events.filter((e) => e.kind === 'rock'));
    expect(rockAt(st, ROCK0).hp).toBe(rockHp(40) - LASER_ROCK_DAMAGE);
    expect(rockAt(st, ROCK0).vy).toBeLessThan(0);   // pushed along the beam
  });
  it('the planet stops it with no effect', () => {
    const st = open([], 300);
    Object.assign(st.ships[1], { x: 0, y: -100 });   // beyond the planet, within the beam's reach
    const shields = st.systems[1].shields, hull = st.systems[1].hull;
    applyWeaponsInput(st, 0, fire(NORTH));
    expect(beams(st)[0]).toMatchObject({ hit: false, stripped: false, room: -1, x2: expect.closeTo(0, 6), y2: expect.closeTo(PLANET_RADIUS, 6) });
    expect(beams(st)[0]!.rock).toBeUndefined();
    expect([st.systems[1].shields, st.systems[1].hull, st.rockHits]).toEqual([shields, hull, 0]);
  });
  it('a torpedo in its path is not hit: the beam passes through to the ship', () => {
    const st = open();
    Object.assign(st.ships[1], { x: 0, y: 1300 });
    placeMissile(st, 1, { x: 0, y: 1400, vx: 0, vy: 0, heading: 128, headingAcc: 0, age: 30 });
    const shields = st.systems[1].shields;
    applyWeaponsInput(st, 0, fire(NORTH));
    expect(missileOf(st, 1)).not.toBeNull();
    expect(st.events.some((e) => e.kind === 'missileEnd')).toBe(false);
    expect(st.systems[1].shields).toBe(shields - 1);
  });
});

describe('the double laser\'s burst (spec §2)', () => {
  it('the second shot keeps the burst\'s aim, re-clamped about the heading and re-checked at its own tick', () => {
    const st = open();
    Object.assign(st.ships[1], { x: 0, y: 1300 });
    applyWeaponsInput(st, 0, fire(NORTH));
    expect([st.systems[0].shots, st.systems[1].shields, st.systems[0].laserAim]).toEqual([1, 1, NORTH]);
    Object.assign(st.ships[1], { x: 300 });   // the enemy leaves the line before the second shot
    st.ships[0].heading = 64;                 // and the crew turns east: north is now outside its cone
    for (let k = 1; k < LASER_BURST_GAP_TICKS; k++) applyWeaponsInput(st, 0, IDLE_INPUT);
    expect(st.systems[0].shots).toBe(1);
    applyWeaponsInput(st, 0, IDLE_INPUT);
    expect([st.systems[0].shots, st.systems[0].laserBurst, st.systems[0].laserAim, st.systems[1].shields]).toEqual([2, 0, -1, 1]);
    const last = beams(st).at(-1)!, [ux, uy] = aimDir(clampAim(64, NORTH, LASER_ARC_STEPS));
    expect(last).toMatchObject({ hit: false, x1: 0, y1: 1500 });
    expect(last.x2).toBeCloseTo(ux * LASER_RANGE, 6); expect(last.y2).toBeCloseTo(1500 + uy * LASER_RANGE, 6);
  });
});

describe('when it does not fire (spec §2)', () => {
  it('not while its own torpedo flies, nor without a full charge, with a burst pending, offline, or with a bad aim', () => {
    const flying = open();
    placeMissile(flying, 0, { x: 500, y: 500, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 });
    applyWeaponsInput(flying, 0, fire(NORTH));
    expect([flying.systems[0].shots, flying.systems[0].laserCharge]).toEqual([0, LASER_CHARGE_UNITS]);
    const empty = open(); empty.systems[0].laserCharge = 0;
    applyWeaponsInput(empty, 0, fire(NORTH));
    expect(empty.systems[0].shots).toBe(0);
    const pending = open();
    Object.assign(pending.systems[0], { laserBurst: 1, laserBurstClock: 5, laserAim: NORTH });
    applyWeaponsInput(pending, 0, fire(NORTH));
    expect([pending.systems[0].shots, pending.systems[0].laserBurstClock]).toEqual([0, 4]);
    const offline = open(); offline.systems[0].rooms[Room.Weapons] = 2;
    applyWeaponsInput(offline, 0, fire(NORTH));
    expect([offline.systems[0].shots, offline.systems[0].laserCharge]).toEqual([0, 0]);
    for (const aim of [AIM_STEPS, 0.5]) { const st = open(); applyWeaponsInput(st, 0, fire(aim)); expect(st.systems[0].shots, `aim ${aim}`).toBe(0); }
  });
  it('in AUTO a laserFire input does nothing', () => {
    const st = open();
    st.systems[0].laserManual = false;   // the enemy is far off: no auto-fire either
    applyWeaponsInput(st, 0, fire(NORTH));
    expect(st.systems[0].shots).toBe(0);
  });
});

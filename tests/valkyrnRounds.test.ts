// Valkyrn-i (spec 2026-11-18-valkyrn-solo-ship-design §7.2, §10 Gun): rounds move on their spawn tick and are swept as
// segments against the other ships' post-move circles, the asteroids and the planet; the first contact ends them, so
// does their life; never their own ship. A shielded enemy wears a layer away in 8 hits (any strip zeroes the wear); an
// unshielded one loses a hull point every GUN.hitsPerHull hits and a Room level every GUN.hitsPerLevel, the Room by the closest approach of the
// round's line to the post-move centre on the post-move nose axis; repair zeroes a Room's wear; the first round turns
// the enemy hostile with cause gun.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { Position } from '../src/renderer/src/sim/components';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { GUN, ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { gunRoomOf, placeRound, stepRounds } from '../src/renderer/src/sim/tactical/gun';
import { buildGrid } from '../src/renderer/src/sim/tactical/grid';
import { hunterThink } from '../src/renderer/src/sim/tactical/hunter';
import { flySlot } from '../src/renderer/src/sim/tactical/physics';
import { createTacticalState, Outcome, Room, type DuelEvent, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { DEFAULT_FLIGHT, GUN_LIFE_TICKS, LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { applyWeaponsInput, IDLE_INPUT, tickWeapons } from '../src/renderer/src/sim/tactical/weapons';
import { holding, makeHostile } from './helpers/hostile';
import { createValkyrnDuel } from './helpers/valkyrnDuel';

type GunHit = Extract<DuelEvent, { kind: 'gunHit' }>;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
/** The Hunter's centre in `range()`. */
const H = { x: -300, y: -300 };
/** The gun Valkyrn at (−600, −300) facing east and the Hunter at H nose north (heading 0), both at rest, hostile, no
 *  asteroids; the Hunter's shields set to `shields`. */
function range(shields = 2): TacticalState {
  const st = makeHostile(createTacticalState(5, 2, ShipClass.Valkyrn));
  st.map = { ...st.map, asteroids: [] }; st.grid = buildGrid([], st.map.rMap);
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: H.x, y: H.y, vx: 0, vy: 0, heading: 0 });
  st.systems[1].shields = shields;
  return st;
}
const hitsOf = (st: TacticalState): GunHit[] => st.events.filter((e): e is GunHit => e.kind === 'gunHit');
/** One crew round from (x, y) at (vx, vy), stepped (rounds only) until it ends; returns its gunHit events. */
function shoot(st: TacticalState, x: number, y: number, vx: number, vy: number): GunHit[] {
  const r = placeRound(st, { x, y, vx, vy, age: 0, owner: 0 }), out: GunHit[] = [];
  for (let k = 0; k < GUN_LIFE_TICKS && r.active; k++) { st.events = []; stepRounds(st); out.push(...hitsOf(st)); }
  return out;
}
/** A round flying east past the Hunter's centre, `dy` across its nose axis (negative: fore, as the nose points north). */
const across = (st: TacticalState, dy: number): GunHit[] => shoot(st, H.x - 30, H.y + dy, 700, 0);

describe('rounds (spec §7.2)', () => {
  it('a round moves on its spawn tick and ends at its life, leaving a free entry of zeros', () => {
    const st = range(); Object.assign(st.ships[1], { x: 2600, y: 2600 });
    st.events = []; applyWeaponsInput(st, 0, { ...IDLE_INPUT, gunHeld: true }); tickWeapons(st, 0, IDLE_INPUT); stepRounds(st);
    const r = st.rounds[0]!;
    expect([r.active, r.age, r.y]).toEqual([true, 1, -288]);
    expect(r.x).toBeCloseTo(-579 + 700 / 60, 9);
    for (let k = 1; k < GUN_LIFE_TICKS - 1; k++) stepRounds(st);
    expect([r.active, r.age]).toEqual([true, GUN_LIFE_TICKS - 1]);
    stepRounds(st);
    expect(r).toEqual({ x: 0, y: 0, vx: 0, vy: 0, age: 0, owner: 0, active: false });
  });
  it('a round ends on the enemy, an asteroid or the planet; it never hits its own ship', () => {
    const st = range();
    expect(across(st, 12)).toHaveLength(1);
    expect(st.rounds.every((r) => !r.active)).toBe(true);
    const rock = createTacticalState(5, 2, ShipClass.Valkyrn), a = rock.map.asteroids[0]!;
    Object.assign(rock.ships[1], { x: 0, y: 500 });   // far from the rock
    const onRock = placeRound(rock, { x: a.x - a.r - 30, y: a.y, vx: 700, vy: 0, age: 0, owner: 0 });
    for (let k = 0; k < 4; k++) { rock.events = []; stepRounds(rock); expect(hitsOf(rock)).toEqual([]); }
    expect(onRock.active).toBe(false);
    const planet = createTacticalState(5, 2, ShipClass.Valkyrn);
    Object.assign(planet.ships[1], { x: 0, y: 900 });
    const onPlanet = placeRound(planet, { x: 300, y: 0, vx: -700, vy: 0, age: 0, owner: 0 });
    let ticks = 0;
    while (onPlanet.active && ticks < 30) { planet.events = []; stepRounds(planet); ticks++; expect(hitsOf(planet)).toEqual([]); }
    expect(ticks).toBe(20);   // (300 − 70) / (700 / 60) = 19.7: the 20th step crosses the surface
    const own = range(); Object.assign(own.ships[1], { x: 2600, y: 2600 });
    const inside = placeRound(own, { x: -600, y: -300, vx: 700, vy: 0, age: 0, owner: 0 });   // spawned inside its own ship
    own.events = []; stepRounds(own);
    expect([inside.active, hitsOf(own)]).toEqual([true, []]);
  });
  it('the first contact along a tick\'s segment ends it: the ship before the planet', () => {
    const st = createTacticalState(5, 2, ShipClass.Valkyrn);
    Object.assign(st.ships[1], { x: 120, y: 0, heading: 0 }); st.systems[1].shields = 1;
    const r = placeRound(st, { x: 150, y: 0, vx: -6000, vy: 0, age: 0, owner: 0 });   // 100 u this tick: enters the ship at t 0.1, the planet at 0.8
    stepRounds(st);
    expect([r.active, hitsOf(st).length]).toEqual([false, 1]);
  });
});

describe('hits (spec §7.2)', () => {
  it('a shielded enemy: 8 hits strip a layer, flagged stripped, the wear back to 0', () => {
    const st = range(2);
    for (let k = 0; k < 7; k++) across(st, 0);
    expect([st.systems[1].shields, st.systems[1].gunWear, st.systems[0].gunHits]).toEqual([2, 7, 7]);
    const eighth = across(st, 0);
    expect(eighth).toHaveLength(1);
    expect(eighth[0]).toMatchObject({ kind: 'gunHit', ship: 1, room: -1, stripped: true });
    expect(eighth[0]!.x).toBeCloseTo(H.x, 6);
    expect(eighth[0]!.y).toBeCloseTo(H.y, 6);
    expect([st.systems[1].shields, st.systems[1].shieldClock, st.systems[1].gunWear, st.systems[1].hull, st.systems[0].layersStripped]).toEqual([1, 0, 0, 123, 0]);   // W-1: duel hull ×1.75 to hold the 180 s floor with the pew (hull 70 before)
  });
  it('any strip zeroes the wear: a laser strip of the crew ship', () => {
    const st = range(2);
    st.systems[0].gunWear = 5;
    Object.assign(st.ships[1], { heading: 192 });   // the Hunter faces the crew 300 units west: in arc and range
    st.systems[1].laserCharge = LASER_CHARGE_UNITS; st.systems[1].fireHeld = true;
    st.events = []; applyWeaponsInput(st, 1, { ...IDLE_INPUT, laserCharge: false });
    expect(st.events.some((e) => e.kind === 'laser' && e.stripped)).toBe(true);
    expect([st.systems[0].shields, st.systems[0].gunWear]).toEqual([0, 0]);   // Engineering spike spec §2: the crew starts at 1 layer (2 Shields bars), so the strip leaves 0 (was 1)
  });
  it('an unshielded enemy: the Room by the closest approach on its nose axis; side-on fore Weapons, aft Engines; along the axis Shields', () => {
    const st = range(0);
    expect(across(st, -10)[0]).toMatchObject({ ship: 1, room: Room.Weapons, stripped: false });
    expect(across(st, 10)[0]).toMatchObject({ room: Room.Engines });
    expect(across(st, 0)[0]).toMatchObject({ room: Room.Shields });
    expect(shoot(st, H.x + 15, H.y - 30, 0, 700)[0]).toMatchObject({ room: Room.Shields });    // from ahead, at the nose
    expect(shoot(st, H.x - 15, H.y + 30, 0, -700)[0]).toMatchObject({ room: Room.Shields });   // from astern
  });
  it('gunRoomOf: exactly ±r/3 is Shields; the line counts, not where it crossed the edge', () => {
    const st = createTacticalState(5, 2, ShipClass.Valkyrn);
    Object.assign(st.ships[1], { x: 0, y: 0, heading: 0 });
    expect(gunRoomOf(st, 1, -30, -20 / 3, -20, -20 / 3)).toBe(Room.Shields);
    expect(gunRoomOf(st, 1, -30, 20 / 3, -20, 20 / 3)).toBe(Room.Shields);
    expect(gunRoomOf(st, 1, -30, -7, -20, -7)).toBe(Room.Weapons);
    expect(gunRoomOf(st, 1, -30, 7, -20, 7)).toBe(Room.Engines);
    Object.assign(st.ships[1], { heading: 64 });   // nose east: a shot from the west runs along the axis
    expect(gunRoomOf(st, 1, -30, -7, -20, -7)).toBe(Room.Shields);
  });
  it('uses the post-move centre and heading: the Hunter at full thrust, nose north at 600 u/s, turning', () => {
    const st = range(0);
    Object.assign(st.ships[1], { vy: -600 });
    const r = placeRound(st, { x: H.x - 25, y: H.y - 8, vx: 700, vy: 0, age: 0, owner: 0 });
    expect(gunRoomOf(st, 1, r.x, r.y, r.x + 700 / 60, r.y)).toBe(Room.Weapons);   // before the move: 8 fore of the centre
    flySlot(st, 1, { turn: 1, thrust: 1 }, DEFAULT_FLIGHT);                     // about 10 north, heading 0 → 1
    expect(st.ships[1].heading).toBe(1);
    st.events = []; stepRounds(st);
    expect(hitsOf(st)).toMatchObject([{ ship: 1, room: Room.Shields }]);       // after it: about 2 aft
  });
  it('every GUN.hitsPerHull hits cost a hull point; every GUN.hitsPerLevel hits on a Room raise it a level; at level 2 only the hull counts', () => {
    // The counters are tuned (Valkyrn spec §12), so the expected state is computed from them after every hit.
    const st = range(0), s = st.systems[1], perHull = GUN.hitsPerHull, perLevel = GUN.hitsPerLevel;
    let hits = 0, onWeapons = 0;
    const expectAfter = (): void => {
      const level = Math.min(2, Math.floor(onWeapons / perLevel));
      expect([s.hull, s.gunHull, s.rooms[Room.Weapons], s.gunRoomWear[Room.Weapons]], `after ${hits} hits`)
        .toEqual([123 - Math.floor(hits / perHull),   // W-1: duel hull ×1.75 (70 before)
         hits % perHull, level, level < 2 ? onWeapons % perLevel : 0]);
    };
    // On Weapons from level 0, past a hull point and past level 2.
    while (hits < Math.max(perHull + 1, 2 * perLevel + 1)) {
      const before = s.rooms[Room.Weapons], ev = across(st, -10);
      expect(ev).toHaveLength(1); hits++; onWeapons++; expectAfter();
      expect(ev[0]!.level, `level flag after ${hits} hits`).toBe(s.rooms[Room.Weapons] !== before);   // the view's callout: only a level change
    }
    // On the Engines at level 2: the level and its wear stay; only the hull counts.
    s.rooms[Room.Engines] = 2;
    for (let k = 0; k < perHull; k++) {
      const ev = across(st, 10);
      expect(ev).toHaveLength(1); hits++;
      expect(ev[0]!.level).toBe(false);
      expect([s.rooms[Room.Engines], s.gunRoomWear[Room.Engines]]).toEqual([2, 0]);
      expectAfter();
    }
  });
  it('a Room repaired a level zeroes its wear: the Hunter\'s repair and the crew\'s', () => {
    const st = range(0);
    Object.assign(st.ships[0], { x: -2600, y: 0 });   // out of the Hunter's laser range, so it repairs a level-1 Room
    st.systems[1].rooms[Room.Engines] = 1; st.systems[1].gunRoomWear[Room.Engines] = 4;
    for (let k = 0; k < 700 && st.systems[1].rooms[Room.Engines] > 0; k++) hunterThink(st, 1);
    expect([st.systems[1].rooms[Room.Engines], st.systems[1].gunRoomWear[Room.Engines]]).toEqual([0, 0]);
    const d = createValkyrnDuel(5);
    try {
      const crew = d.tactical.systems[0], p = d.points.find((q) => q.tacticalRoom === Room.Weapons)!, eid = d.interior.crew[0]!, w = d.interior.derived.width;
      crew.rooms[Room.Weapons] = 1; crew.gunRoomWear[Room.Weapons] = 3;
      Position.x[eid] = (p.tile % w) + 0.5; Position.y[eid] = Math.floor(p.tile / w) + 0.5;
      for (let k = 0; k < 240; k++) stepDuelTick(d, { held: [{ ...NONE, interactHeld: true }], commands: [] });
      expect([crew.rooms[Room.Weapons], crew.gunRoomWear[Room.Weapons]]).toEqual([0, 0]);
    } finally { disposeDuel(d); }
  });
});

describe('hostility and the end (spec §7.2)', () => {
  it('the crew\'s first gun round turns the enemy hostile, cause gun', () => {
    const st = holding(range(2));
    Object.assign(st.ships[1], { x: 2600, y: 2600 });
    stepDuel(st, IDLE_INPUT);
    expect(st.events.some((e) => e.kind === 'hostile')).toBe(false);
    stepDuel(st, { ...IDLE_INPUT, gunHeld: true });
    expect(st.events.filter((e) => e.kind === 'hostile')).toEqual([{ kind: 'hostile', cause: 'gun' }]);
    expect(st.hostileAt).toBe(1);
  });
  it('a round that takes the last hull point wins the round', () => {
    const st = range(0);
    st.systems[1].hull = 1; st.systems[1].gunHull = GUN.hitsPerHull - 1;
    placeRound(st, { x: H.x - 30, y: H.y, vx: 700, vy: 0, age: 0, owner: 0 });
    stepDuel(st, IDLE_INPUT);
    expect([st.systems[1].hull, st.outcome]).toEqual([0, Outcome.CrewWins]);
  });
});

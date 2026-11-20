// W-4 amendment §3 (W-4b): the crew's target room is ShipSystems.lock. On the Hound laserLock sets it (the seat, malformed,
// −1 and an unseen enemy unavailable; laserTargeted and laserRock untouched). A round fired by hand carries it (room =
// lock + 1 at the moment of firing); AUTO's rounds, the Hunter's and the Valkyrn's carry 0. The autocannon by hand wears the
// tagged room wherever the round lands, and on AUTO wears no room; pew pew by hand adds PEW_ROOM_WEAR to the same counter;
// shield hits are unchanged. An AUTO torpedo with no torpedo lock strikes the room lock names as it lands. The round's room
// is hashed, bounded and snapshotted.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { AUTOCANNON, GUN, ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { placeRound, stepRounds, tickGun } from '../src/renderer/src/sim/tactical/gun';
import { flattenTactical, ROUND_SLOT, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { launchMissile, resolveMissiles } from '../src/renderer/src/sim/tactical/missiles';
import { firePew, stepPew } from '../src/renderer/src/sim/tactical/pew';
import { createTacticalState, emptyRound, missileOf, Room, roundRoom, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { PEW_ROOM_WEAR } from '../src/renderer/src/sim/tactical/tuning';
import { applyWeaponsInput, IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { houndWeapons } from './helpers/crewWeapons';
import { createSeatedDuel } from './helpers/duelSeat';
import { holdInSight } from './helpers/sensorSight';

const CUTTER = parseShip(cutter), N: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const env = (d: DuelState, player: number, command: DuelCommand, seq: number) => ({ runId: 'duel', id: { player, sequence: seq }, requestedTick: d.interior.tick, command });
/** One command on one tick with the enemy held in sensor sight (the ships spawn out of it); its result. */
const seen = (d: DuelState, player: number, command: DuelCommand, seq: number) => { holdInSight(d.tactical); return stepDuelTick(d, { held: [], commands: [env(d, player, command, seq)] })[0]!; };

describe("laserLock is the target room's command on the Hound (amendment §3.2)", () => {
  it('the seat, malformed, −1 unavailable, an unseen enemy unavailable; seen, it sets lock and leaves laserTargeted and laserRock', () => {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer, s = d.tactical.systems[0];
    try {
      expect([s.lock, s.laserTargeted, s.laserRock]).toEqual([Room.Shields, false, -1]);
      expect(stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'laserLock', room: Room.Engines }, 1)] })[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });   // unseen: the ships spawn out of sensor range
      expect(s.lock).toBe(Room.Shields);
      expect(seen(d, d.helmPlayer, { kind: 'laserLock', room: Room.Engines }, 1)).toMatchObject({ status: 'rejected', reason: 'not-at-weapons' });
      for (const room of [3, -2, 1.5]) expect(seen(d, g, { kind: 'laserLock', room }, 2), String(room)).toMatchObject({ status: 'rejected', reason: 'malformed' });
      expect(seen(d, g, { kind: 'laserLock', room: -1 }, 3)).toMatchObject({ status: 'rejected', reason: 'unavailable' });   // the target room has no "none": nothing to clear
      expect(s.lock).toBe(Room.Shields);
      expect(seen(d, g, { kind: 'laserLock', room: Room.Engines }, 4)).toMatchObject({ status: 'applied' });
      expect([s.lock, s.laserTargeted, s.laserRock]).toEqual([Room.Engines, false, -1]);
      expect(seen(d, g, { kind: 'laserLock', room: Room.Weapons }, 5)).toMatchObject({ status: 'applied' });
      expect(s.lock).toBe(Room.Weapons);
    } finally { disposeDuel(d); }
  });
  it("is unavailable on the Valkyrn (no laser, no turret); on the laser fit it is the laser's lock, as before", () => {
    const v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn), fit = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.ValkyrnLaser);
    try {
      expect(seen(v, 1 - v.helmPlayer, { kind: 'laserLock', room: Room.Engines }, 1)).toMatchObject({ status: 'rejected', reason: 'unavailable' });
      expect(v.tactical.systems[0].lock).toBe(Room.Shields);
      const f = fit.tactical.systems[0], g = 1 - fit.helmPlayer;
      expect(seen(fit, g, { kind: 'laserLock', room: Room.Engines }, 1)).toMatchObject({ status: 'applied' });
      expect([f.lock, f.laserTargeted]).toEqual([Room.Engines, true]);
      expect(seen(fit, g, { kind: 'laserLock', room: -1 }, 2)).toMatchObject({ status: 'applied' });   // the laser's clear still works
      expect([f.lock, f.laserTargeted]).toEqual([Room.Engines, false]);
    } finally { disposeDuel(v); disposeDuel(fit); }
  });
});

/** The Hound at (0, 1500) nose north, still; the Hunter `ahead` u dead ahead (north is −y), still, its nose toward the Hound,
 *  shields down; no rocks; bars pew pew / autocannon / torpedo. */
function arena(bars: readonly [number, number, number], ahead = 120): TacticalState {
  const st = houndWeapons(createTacticalState(5), bars);
  st.rocks.fill(0); st.rockCells.fill(0);   // asteroids-iv: an emptied slot holds no cells either
  Object.assign(st.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(st.ships[1], { x: 0, y: 1500 - ahead, vx: 0, vy: 0, heading: 128, headingAcc: 0 });
  st.systems[1]!.shields = 0;
  st.events = [];
  return st;
}
/** The same, with the Hunter far off to the side: nothing can land. */
function range(bars: readonly [number, number, number]): TacticalState {
  const st = arena(bars);
  Object.assign(st.ships[1], { x: 2400, y: 1500 });
  return st;
}
/** `n` rounds of the crew's, each tagged `tag`, placed 30 u south of the Hunter's centre flying north, so each enters its
 *  circle on its first step and crosses its middle (the room under the round is Shields). */
function land(st: TacticalState, n: number, tag: number, pool: 'rounds' | 'pew' = 'rounds'): void {
  const h = st.ships[1]!;
  for (let k = 0; k < n; k++) {
    placeRound(st, { x: h.x, y: h.y + 30, vx: 0, vy: pool === 'pew' ? -900 : -700, age: 0, owner: 0, room: tag }, pool === 'pew' ? st.pew : st.rounds);
    if (pool === 'pew') stepPew(st); else stepRounds(st);
  }
}
const hits = (st: TacticalState, kind: 'gunHit' | 'pewHit') => st.events.filter((e) => e.kind === kind) as unknown as { ship: number; room: number; level: boolean; hull: boolean; stripped: boolean }[];
const HAND = { ...IDLE_INPUT, gunHeld: true, weaponSel: 1 };   // the trigger held with the autocannon selected

describe('a round carries the room it was fired at (amendment §3.3)', () => {
  it('the autocannon by hand: lock + 1 at the moment of firing, and a later change of lock leaves it; on AUTO, and on MAN but not selected, 0', () => {
    const st = range([1, 3, 1]), s = st.systems[0]!;
    s.gunManual = true; s.lock = Room.Engines;
    tickGun(st, 0, HAND);
    const r = st.rounds.find((e) => e.active)!;
    expect(r.room).toBe(Room.Engines + 1);
    s.lock = Room.Weapons; stepRounds(st);
    expect([r.active, r.room]).toEqual([true, Room.Engines + 1]);   // a round is not guided: it keeps the room it was fired at
    const auto = range([1, 3, 1]);
    auto.systems[0]!.lock = Room.Engines;
    tickGun(auto, 0, IDLE_INPUT, true);   // AUTO on solution
    expect(auto.rounds.filter((e) => e.active).map((e) => e.room)).toEqual([0]);
    const out = range([1, 3, 1]);
    out.systems[0]!.gunManual = true; out.systems[0]!.lock = Room.Engines;
    tickGun(out, 0, { ...IDLE_INPUT, gunHeld: true, weaponSel: 0 }, true);   // MAN but pew pew is selected: AUTO-driven
    expect(out.rounds.filter((e) => e.active).map((e) => e.room)).toEqual([0]);
  });
  it('an admitted pewFire carries the room even when pew pew is not the held selection, and a same-tick laserLock tags the new room', () => {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer, t = d.tactical, s = t.systems[0];
    try {
      s.pewManual = true;
      const held: HeldInput[] = [N, N]; held[g] = { ...N, weaponSel: 1 };   // the selection trails the click by a frame (amendment judgement call 7)
      holdInSight(t);
      const r = stepDuelTick(d, { held, commands: [env(d, g, { kind: 'pewFire' }, 1), env(d, g, { kind: 'laserLock', room: Room.Weapons }, 2)] });
      expect(r.map((x) => x.status)).toEqual(['applied', 'applied']);
      expect(s.lock).toBe(Room.Weapons);
      expect(t.pew.filter((e) => e.active).map((e) => [e.owner, e.room])).toEqual([[0, Room.Weapons + 1]]);   // the lock is applied first in the tick
    } finally { disposeDuel(d); }
  });
  it("rounds fired by AUTO's rules, the Hunter's and the Valkyrn's carry no room", () => {
    const st = arena([1, 1, 1], 300), s = st.systems[0]!;
    st.hostileAt = 0; s.lock = Room.Engines;
    for (let k = 0; k < 20; k++) applyWeaponsInput(st, 0, IDLE_INPUT);   // both guns on AUTO, the Hunter dead ahead: on solution at once
    expect([s.pewShots > 0, s.gunShots > 0]).toEqual([true, true]);
    expect([...st.rounds, ...st.pew].filter((e) => e.active).every((e) => e.room === 0)).toBe(true);
    firePew(st, 1, 0);   // the Hunter's pew
    expect(st.pew.filter((e) => e.active && e.owner === 1).map((e) => e.room)).toEqual([0]);
    const v = createTacticalState(5, 2, ShipClass.Valkyrn);
    v.systems[0]!.lock = Room.Engines;
    tickGun(v, 0, { ...IDLE_INPUT, gunHeld: true });
    expect(v.rounds.filter((e) => e.active).map((e) => e.room)).toEqual([0]);
  });
});

describe('hits on the target room (amendment §3.4)', () => {
  it("the autocannon by hand: six unshielded hits raise the tagged room a level, wherever they land; no other room's wear moves; the hull wears as before", () => {
    const st = arena([1, 3, 1]), t = st.systems[1]!, hull = t.hull;
    land(st, 5, Room.Engines + 1);
    expect([t.rooms, t.gunRoomWear]).toEqual([[0, 0, 0], [0, 0, 5]]);   // the rounds cross the middle (Shields is under them); the wear is the Engines'
    st.events = []; land(st, 1, Room.Engines + 1);
    expect([t.rooms, t.gunRoomWear]).toEqual([[0, 0, 1], [0, 0, 0]]);
    expect(hits(st, 'gunHit')).toMatchObject([{ ship: 1, room: Room.Engines, level: true, stripped: false }]);
    land(st, 6, Room.Engines + 1);
    expect([t.rooms, t.hull]).toEqual([[0, 0, 2], hull - Math.floor(12 / AUTOCANNON.hitsPerHull)]);   // 12 hits in all: the hull wears at hitsPerHull
    land(st, 3, Room.Engines + 1);
    expect(t.gunRoomWear).toEqual([0, 0, 0]);   // a level-2 room holds its wear at 0
    expect(st.systems[0]!.gunHits).toBe(15);
  });
  it('the autocannon on AUTO (an untagged round): the hull wears at hitsPerHull and no room; the event names no room', () => {
    const st = arena([1, 3, 1]), t = st.systems[1]!, hull = t.hull;
    land(st, AUTOCANNON.hitsPerHull, 0);
    expect([t.rooms, t.gunRoomWear, t.hull]).toEqual([[0, 0, 0], [0, 0, 0], hull - 1]);
    expect(hits(st, 'gunHit')).toHaveLength(AUTOCANNON.hitsPerHull);
    expect(hits(st, 'gunHit').every((e) => e.room === -1 && !e.level)).toBe(true);
    expect(hits(st, 'gunHit').at(-1)).toMatchObject({ hull: true });
  });
  it('pew pew by hand: each unshielded hit costs the hull and adds PEW_ROOM_WEAR, so two raise the room; one plus three autocannon hits by hand also do; a level-2 room holds its wear at 0', () => {
    expect(PEW_ROOM_WEAR).toBe(3);
    const st = arena([1, 1, 1]), t = st.systems[1]!, hull = t.hull;
    land(st, 1, Room.Weapons + 1, 'pew');
    expect([t.rooms, t.gunRoomWear, t.hull]).toEqual([[0, 0, 0], [3, 0, 0], hull - 1]);
    expect(hits(st, 'pewHit').at(-1)).toMatchObject({ ship: 1, hull: true, stripped: false, room: Room.Weapons, level: false });
    land(st, 1, Room.Weapons + 1, 'pew');
    expect([t.rooms, t.gunRoomWear, t.hull]).toEqual([[1, 0, 0], [0, 0, 0], hull - 2]);
    expect(hits(st, 'pewHit').at(-1)).toMatchObject({ room: Room.Weapons, level: true });
    land(st, 1, Room.Weapons + 1, 'pew'); land(st, 3, Room.Weapons + 1);   // one pew pew hit and three autocannon hits by hand share the counter
    expect([t.rooms[Room.Weapons], t.gunRoomWear[Room.Weapons]]).toEqual([2, 0]);
    land(st, 1, Room.Weapons + 1, 'pew');
    expect([t.rooms[Room.Weapons], t.gunRoomWear[Room.Weapons]]).toEqual([2, 0]);
    expect(hits(st, 'pewHit').at(-1)).toMatchObject({ room: Room.Weapons, level: false, hull: true });
  });
  it("pew pew on AUTO (an untagged round) is hull only, and so is the Hunter's pew on the crew", () => {
    const st = arena([1, 1, 1]), t = st.systems[1]!, hull = t.hull;
    land(st, 2, 0, 'pew');
    expect([t.rooms, t.gunRoomWear, t.hull]).toEqual([[0, 0, 0], [0, 0, 0], hull - 2]);
    expect(hits(st, 'pewHit').every((e) => e.room === -1 && !e.level)).toBe(true);
    const own = st.systems[0]!, ownHull = own.hull; own.shields = 0;
    placeRound(st, { x: 0, y: 1500 - 30, vx: 0, vy: 900, age: 0, owner: 1 }, st.pew); stepPew(st);   // the Hunter's round, into the Hound
    expect([own.rooms, own.gunRoomWear, own.hull]).toEqual([[0, 0, 0], [0, 0, 0], ownHull - 1]);
  });
  it('shield hits by either gun are unchanged, tagged or not, the weak frequency included', () => {
    for (const tag of [0, Room.Engines + 1]) {
      const st = arena([1, 3, 1]), t = st.systems[1]!, hull = t.hull;
      t.shields = 2; st.systems[0]!.freq = (st.weakFreq + 1) % 3;   // off the weak frequency
      land(st, AUTOCANNON.hitsPerLayer, tag);
      expect([t.shields, t.rooms, t.gunRoomWear], `tag ${tag}`).toEqual([1, [0, 0, 0], [0, 0, 0]]);
      land(st, 1, tag, 'pew');
      expect([t.shields, t.rooms, t.gunRoomWear, t.hull], `tag ${tag}`).toEqual([0, [0, 0, 0], [0, 0, 0], hull]);   // a strip costs no hull and wears no room
      expect(hits(st, 'pewHit').at(-1)).toMatchObject({ stripped: true, hull: false, room: -1, level: false });
      const weak = arena([1, 3, 1]), w = weak.systems[1]!;
      w.shields = 2; weak.systems[0]!.freq = weak.weakFreq;
      land(weak, AUTOCANNON.weakHitsPerLayer!, tag);
      expect(w.shields, `weak, tag ${tag}`).toBe(1);
      w.shields = 2; land(weak, 1, tag, 'pew');
      expect([w.shields, w.rooms, w.gunRoomWear], `weak pew, tag ${tag}`).toEqual([0, [0, 0, 0], [0, 0, 0]]);   // two layers on the weak frequency
    }
  });
  it("the Valkyrn's gun keeps the room under the round, whatever lock says", () => {
    const v = createTacticalState(5, 2, ShipClass.Valkyrn), t = v.systems[1]!;
    v.rocks.fill(0); t.shields = 0; v.systems[0]!.lock = Room.Engines;
    Object.assign(v.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
    Object.assign(v.ships[1], { x: 0, y: 1380, vx: 0, vy: 0, heading: 128, headingAcc: 0 });
    for (let k = 0; k < GUN.hitsPerLevel; k++) { placeRound(v, { x: 0, y: 1410, vx: 0, vy: -700, age: 0, owner: 0 }); stepRounds(v); }
    expect([t.rooms, t.gunRoomWear]).toEqual([[0, 1, 0], [0, 0, 0]]);   // through the middle: Shields, the room under the round
  });
});

describe('an AUTO torpedo with no torpedo lock follows the target room (amendment §3.1)', () => {
  it('it strikes the room lock names as it lands, so stepping the room while it flies moves the strike; one launched with a torpedo lock keeps its room', () => {
    const st = arena([1, 1, 1]), s = st.systems[0]!, t = st.systems[1]!, h = st.ships[1]!;
    /** Launch an AUTO torpedo (as F does, through launchMissile) with these locks, change lock in flight, and land it on the Hunter. */
    const strike = (lockAtLaunch: number, torpLock: number, lockAtImpact: number): number[] => {
      t.rooms = [0, 0, 0]; s.lock = lockAtLaunch; s.torpLock = torpLock; s.torpManual = false; s.magazine = 1;
      launchMissile(st, 0);
      s.lock = lockAtImpact;   // E / Q while it flies
      Object.assign(missileOf(st, 0)!, { x: h.x, y: h.y, age: 100 });
      resolveMissiles(st);
      return [...t.rooms];
    };
    expect(strike(Room.Shields, -1, Room.Engines)).toEqual([0, 0, 1]);   // no torpedo lock: the room lock names when it lands
    expect(strike(Room.Shields, Room.Weapons, Room.Engines)).toEqual([1, 0, 0]);   // launched with a torpedo lock: it keeps that room
  });
});

describe("the round's room in the hash and the snapshot (amendment §3.3)", () => {
  it("ROUND_SLOT is 8; a recycled pool entry takes the new round's tag; an ended entry holds zeros; roundRoom reads a tag", () => {
    expect(ROUND_SLOT).toBe(8);
    expect(emptyRound().room).toBe(0);
    const st = arena([1, 1, 1]);
    for (let k = 0; k < st.pew.length; k++) placeRound(st, { x: 0, y: 0, vx: 0, vy: 0, age: k, owner: 0, room: 3 }, st.pew);
    const e = placeRound(st, { x: 1, y: 1, vx: 0, vy: 0, age: 0, owner: 1 }, st.pew);   // a full pool: the oldest entry is recycled, and no tag is given
    expect([e.owner, e.room]).toEqual([1, 0]);
    expect([roundRoom(0), roundRoom(1), roundRoom(2), roundRoom(3), roundRoom(4)]).toEqual([-1, Room.Weapons, Room.Shields, Room.Engines, -1]);
  });
  it('bounds: 0..3, 0 on a free entry, nonzero only on a crew round', () => {
    const bad = (f: (st: TacticalState) => void): string => { const st = arena([1, 1, 1]); f(st); try { validateTacticalValues(st, flattenTactical(st)); return 'ok'; } catch (e) { return String((e as Error).message); } };
    const fly = (st: TacticalState, owner: number, room: number, pool = st.rounds): void => { Object.assign(pool[0]!, { active: true, owner, x: 5, y: 5, vx: 1, vy: 1, age: 1, room }); };
    expect(bad((st) => { fly(st, 0, 3); fly(st, 0, 1, st.pew); })).toBe('ok');
    expect(bad((st) => fly(st, 0, 4))).toMatch(/rounds\.0\.room/);
    expect(bad((st) => fly(st, 0, -1, st.pew))).toMatch(/pew\.0\.room/);
    expect(bad((st) => fly(st, 1, 2))).toMatch(/rounds\.0\.room/);   // the Hunter's round is never tagged
    expect(bad((st) => { st.rounds[0]!.room = 1; })).toMatch(/rounds\.0\.room/);   // a free entry holds zeros
  });
  it('a snapshot with tagged rounds in flight round-trips', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(d.tactical.rounds[3]!, { active: true, owner: 0, x: 40, y: 50, vx: 700, vy: 0, age: 2, room: 2 });
      Object.assign(d.tactical.pew[1]!, { active: true, owner: 0, x: 60, y: 70, vx: 0, vy: -900, age: 1, room: 3 });
      const back = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, 'w4'), 'w4');
      try { expect([back.tactical.rounds[3]!.room, back.tactical.pew[1]!.room, hashDuel(back)]).toEqual([2, 3, hashDuel(d)]); } finally { disposeDuel(back); }
    } finally { disposeDuel(d); }
  });
});

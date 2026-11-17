// Duel fire (docs/superpowers/specs/2026-11-17-duel-fire-design.md §3): ignition from enemy hits on the crew ship,
// persistence, the 900-tick damage cadence, extinguishing at the repair point, the event order, rounds and snapshots.
import { describe, expect, it } from 'vitest';
import { Position } from '../src/renderer/src/sim/components';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { igniteFromHits } from '../src/renderer/src/sim/duel/fire';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { DUEL_EXTINGUISH_UNITS, DUEL_FIRE_CHANCE_LASER, DUEL_FIRE_CHANCE_MISSILE, DUEL_FIRE_DAMAGE_TICKS, DUEL_FIRE_GROW } from '../src/renderer/src/sim/duel/tuning';
import { Outcome, Room, type DuelEvent } from '../src/renderer/src/sim/tactical/state';
import { FIRE_CAP, FIRE_START } from '../src/renderer/src/sim/tuning';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { nextFloat } from '../src/shared/rng';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const HOLD: HeldInput = { moveX: 0, moveY: 0, interactHeld: true };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
/** The tick's repair and fire events, without the health events a firefighter standing in the flames adds (duel-health). */
const work = (d: DuelState) => d.events.filter((e) => e.kind !== 'crewHurt' && e.kind !== 'downed' && e.kind !== 'revived');
const step = (d: DuelState, held: HeldInput[] = [NONE, NONE], commands: DuelEnvelope[] = []) => stepDuelTick(d, { held, commands });
/** Stand player pid up and put them at tile (tx, ty), as if they had walked there. */
function standAt(d: DuelState, pid: number, tx: number, ty: number): void {
  step(d, [NONE, NONE], [cmd(d, pid, { kind: 'stand' })]);
  const eid = d.interior.crew[pid]!;
  Position.x[eid] = tx + 0.5; Position.y[eid] = ty + 0.5;
}
/** The interior room of tactical Room r's repair point. */
const roomOf = (d: DuelState, r: number): number => d.points.find((p) => p.tacticalRoom === r)!.room;
const fireOf = (d: DuelState, r: number): number => d.interior.rooms.fire[roomOf(d, r)]!;
/** A duel whose enemy is switched off, so no hit lands and only the fire changes the room levels. */
function quietDuel(seed = 5): DuelState {
  const d = createDuel(CUTTER, seed);
  d.tactical.ships[1]!.active = false;
  return d;
}
const laser = (ship: number, hit: boolean, room: number): DuelEvent => ({ kind: 'laser', ship, hit, stripped: false, room, x1: 0, y1: 0, x2: 0, y2: 0 });
const missile = (cause: 'ship' | 'planet', target: number, room: number): DuelEvent => ({ kind: 'missileEnd', ship: 1, cause, target, room, x: 0, y: 0 });

describe('duel fire: ignition (spec §1.1)', () => {
  it('a laser hit by ship 1 ignites the point room exactly when the hazards draw is below 0.3; a burning room rolls no more', () => {
    let lit = 0, unlit = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const d = quietDuel(seed);
      try {
        for (const r of [Room.Weapons, Room.Shields, Room.Engines]) {
          const probe = { ...d.interior.rng.hazards }, expected = nextFloat(probe) < DUEL_FIRE_CHANCE_LASER;
          igniteFromHits(d, [laser(1, true, r)]);
          expect(d.interior.rng.hazards).toEqual(probe);                       // exactly one draw
          expect(fireOf(d, r) > 0).toBe(expected);
          if (expected) { lit++; expect(fireOf(d, r)).toBe(FIRE_START); expect(work(d)).toContainEqual({ kind: 'fireStart', room: r }); } else unlit++;
          if (expected) {                                                        // burning: the next hit draws nothing
            const before = { ...d.interior.rng.hazards }, n = d.events.length;
            igniteFromHits(d, [laser(1, true, r), missile('ship', 0, r)]);
            expect(d.interior.rng.hazards).toEqual(before);
            expect(d.events.length).toBe(n);
          }
        }
      } finally { disposeDuel(d); }
    }
    expect(lit).toBeGreaterThan(0); expect(unlit).toBeGreaterThan(0);
  });
  it('a missile hit on ship 0 rolls 0.6; misses, the crew own laser, other targets and other causes draw nothing', () => {
    expect(DUEL_FIRE_CHANCE_LASER).toBe(0.3); expect(DUEL_FIRE_CHANCE_MISSILE).toBe(0.6);
    const d = quietDuel(7);
    try {
      const before = { ...d.interior.rng.hazards };
      igniteFromHits(d, [laser(0, true, Room.Shields), laser(1, false, -1), laser(1, true, -1), missile('ship', 1, Room.Shields), missile('planet', 0, -1)]);
      expect(d.interior.rng.hazards).toEqual(before);
      const probe = { ...before }, expected = nextFloat(probe) < DUEL_FIRE_CHANCE_MISSILE;
      igniteFromHits(d, [missile('ship', 0, Room.Engines)]);
      expect(d.interior.rng.hazards).toEqual(probe);
      expect(fireOf(d, Room.Engines) > 0).toBe(expected);
    } finally { disposeDuel(d); }
  });
  it('rolls in tactical event order, one draw per qualifying hit', () => {
    const d = quietDuel(11);
    try {
      const probe = { ...d.interior.rng.hazards }, a = nextFloat(probe) < 0.3, b = nextFloat(probe) < 0.6;
      igniteFromHits(d, [laser(1, true, Room.Weapons), missile('ship', 0, Room.Engines)]);
      expect(d.interior.rng.hazards).toEqual(probe);
      expect([fireOf(d, Room.Weapons) > 0, fireOf(d, Room.Engines) > 0]).toEqual([a, b]);
    } finally { disposeDuel(d); }
  });
  it('scripted duels do catch fire from the hunter (the step wires the tactical events in)', () => {
    let starts = 0;
    for (let seed = 1; seed <= 3; seed++) {
      const d = createDuel(CUTTER, seed), pair = createScriptedPair(seed);
      try {
        for (let k = 0; k < 20000 && d.tactical.outcome === Outcome.Running; k++) {
          stepDuelTick(d, scriptedInput(pair, d));
          for (const e of d.events) if (e.kind === 'fireStart') {
            starts++;
            expect(d.tactical.events.some((t) => (t.kind === 'laser' && t.ship === 1 && t.hit && t.room === e.room) || (t.kind === 'missileEnd' && t.cause === 'ship' && t.target === 0 && t.room === e.room))).toBe(true);
          }
        }
      } finally { disposeDuel(d); }
    }
    expect(starts).toBeGreaterThan(0);
  }, 30_000);
});

describe('duel fire: persistence and damage (spec §1.2, §1.3)', () => {
  it('a burning room with no workers is still burning after 10 000 ticks, at FIRE_CAP', () => {
    const d = quietDuel();
    try {
      igniteRoom(d.interior, roomOf(d, Room.Shields));
      step(d);
      expect(fireOf(d, Room.Shields)).toBeCloseTo(FIRE_START + DUEL_FIRE_GROW, 12);
      for (let k = 1; k < 10000; k++) step(d);
      expect(d.tactical.outcome).toBe(Outcome.Running);
      expect(fireOf(d, Room.Shields)).toBe(FIRE_CAP);
    } finally { disposeDuel(d); }
  });
  it('the level rises by one at each 900-tick boundary and stops at 2', () => {
    expect(DUEL_FIRE_DAMAGE_TICKS).toBe(900);
    const d = quietDuel(), sys = d.tactical.systems[0];
    try {
      igniteRoom(d.interior, roomOf(d, Room.Engines));
      for (let k = 0; k < 899; k++) step(d);
      expect(sys.rooms[Room.Engines]).toBe(0);
      step(d);                                    // the step from tick 899
      expect(sys.rooms[Room.Engines]).toBe(1);
      expect([sys.rooms[Room.Weapons], sys.rooms[Room.Shields]]).toEqual([0, 0]);
      for (let k = 0; k < 899; k++) step(d);
      expect(sys.rooms[Room.Engines]).toBe(1);
      step(d);
      expect(sys.rooms[Room.Engines]).toBe(2);
      for (let k = 0; k < 1800; k++) step(d);
      expect(sys.rooms[Room.Engines]).toBe(2);
    } finally { disposeDuel(d); }
  });
});

describe('duel fire: putting it out (spec §1.4)', () => {
  it('one worker takes exactly 180 ticks, even on an undamaged room', () => {
    expect(DUEL_EXTINGUISH_UNITS).toBe(720);
    const d = quietDuel();
    try {
      standAt(d, 0, 1, 6);
      igniteRoom(d.interior, roomOf(d, Room.Engines));
      for (let k = 0; k < 179; k++) {
        step(d, [HOLD, NONE]);
        expect(work(d)).toEqual([{ kind: 'fireWork', player: 0, room: Room.Engines }]);
      }
      expect(fireOf(d, Room.Engines)).toBeGreaterThan(0);
      expect(d.interior.rooms.fireRepair[roomOf(d, Room.Engines)]).toBeCloseTo(179 * 4 / 720, 12);
      step(d, [HOLD, NONE]);
      expect(work(d)).toEqual([{ kind: 'fireWork', player: 0, room: Room.Engines }, { kind: 'fireOut', room: Room.Engines, players: [0] }]);
      expect(fireOf(d, Room.Engines)).toBe(0);
      expect(d.interior.rooms.fireRepair[roomOf(d, Room.Engines)]).toBe(0);
      step(d, [HOLD, NONE]);
      expect(work(d)).toEqual([]);              // nothing left to work on
    } finally { disposeDuel(d); }
  });
  it('two workers take exactly 72 ticks; the burning room\'s repair stays put, then resumes after fireOut', () => {
    const d = quietDuel(), sys = d.tactical.systems[0];
    try {
      standAt(d, 0, 1, 6); standAt(d, 1, 1, 7);
      sys.rooms[Room.Engines] = 1; d.repair[Room.Engines] = 100;
      igniteRoom(d.interior, roomOf(d, Room.Engines));
      for (let k = 0; k < 71; k++) step(d, [HOLD, HOLD]);
      expect(fireOf(d, Room.Engines)).toBeGreaterThan(0);
      expect(d.repair[Room.Engines]).toBe(100);
      step(d, [HOLD, HOLD]);
      expect(work(d).at(-1)).toEqual({ kind: 'fireOut', room: Room.Engines, players: [0, 1] });
      expect(fireOf(d, Room.Engines)).toBe(0);
      expect(d.repair[Room.Engines]).toBe(100);
      step(d, [HOLD, HOLD]);
      expect(work(d)).toEqual([{ kind: 'repairWork', player: 0, room: Room.Engines }, { kind: 'repairWork', player: 1, room: Room.Engines }]);
      expect(d.repair[Room.Engines]).toBe(110);
    } finally { disposeDuel(d); }
  });
  it('a seated or away player puts out nothing', () => {
    const d = quietDuel();
    try {
      igniteRoom(d.interior, roomOf(d, Room.Engines));
      standAt(d, 0, 1, 6);
      step(d, [NONE, NONE], [cmd(d, 0, { kind: 'presence', present: false })]);
      for (let k = 0; k < 200; k++) step(d, [HOLD, HOLD]);
      expect(fireOf(d, Room.Engines)).toBeGreaterThan(0);
      expect(d.interior.rooms.fireRepair[roomOf(d, Room.Engines)]).toBe(0);
    } finally { disposeDuel(d); }
  });
});

describe('duel fire: events, rounds and snapshots (spec §1.5, §1.6, §3)', () => {
  it('repair and fire events come in player order, then the finishes in Room order', () => {
    const d = quietDuel(), sys = d.tactical.systems[0];
    try {
      standAt(d, 0, 1, 6);                            // the Engines point
      step(d, [NONE, NONE], [cmd(d, 1, { kind: 'stand' })]);   // the gunner stands in reach of the Weapons point
      sys.rooms[Room.Weapons] = 1; d.repair[Room.Weapons] = 960 - 4 * 180;
      igniteRoom(d.interior, roomOf(d, Room.Engines));
      for (let k = 0; k < 179; k++) {
        step(d, [HOLD, HOLD]);
        expect(work(d)).toEqual([{ kind: 'fireWork', player: 0, room: Room.Engines }, { kind: 'repairWork', player: 1, room: Room.Weapons }]);
      }
      step(d, [HOLD, HOLD]);
      expect(work(d)).toEqual([
        { kind: 'fireWork', player: 0, room: Room.Engines }, { kind: 'repairWork', player: 1, room: Room.Weapons },
        { kind: 'repairDone', room: Room.Weapons, players: [1] }, { kind: 'fireOut', room: Room.Engines, players: [0] }
      ]);
    } finally { disposeDuel(d); }
  });
  it('fireStart follows the repair events; the events are not hashed', () => {
    const d = quietDuel();
    try {
      const h = hashDuel(d);
      d.events = [{ kind: 'fireStart', room: Room.Shields }];
      expect(hashDuel(d)).toBe(h);
      // the fire itself is hashed: igniting changes the hash
      igniteRoom(d.interior, roomOf(d, Room.Shields));
      expect(hashDuel(d)).not.toBe(h);
    } finally { disposeDuel(d); }
  });
  it('the end card runs no fire, and a new round clears it', () => {
    const d = quietDuel();
    try {
      igniteRoom(d.interior, roomOf(d, Room.Weapons));
      for (let k = 0; k < 10; k++) step(d);
      d.tactical.outcome = Outcome.CrewWins;
      const f = fireOf(d, Room.Weapons), levels = [...d.tactical.systems[0].rooms];
      for (let k = 0; k < 1000; k++) step(d);
      expect(fireOf(d, Room.Weapons)).toBe(f);
      expect([...d.tactical.systems[0].rooms]).toEqual(levels);
      step(d, [NONE, NONE], [cmd(d, 0, { kind: 'rematch' })]);
      expect(d.round).toBe(1);
      expect(Array.from(d.interior.rooms.fire).every((v) => v === 0)).toBe(true);
      expect(Array.from(d.interior.rooms.fireRepair).every((v) => v === 0)).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('a snapshot taken mid-fire, mid-extinguish restores and continues identically', () => {
    const d = createDuel(CUTTER, 1), pair = createScriptedPair(1);
    try {
      for (let k = 0; k < 600; k++) stepDuelTick(d, scriptedInput(pair, d));
      igniteRoom(d.interior, roomOf(d, Room.Shields)); igniteRoom(d.interior, roomOf(d, Room.Engines));
      d.interior.rooms.fireRepair[roomOf(d, Room.Engines)] = 100 / DUEL_EXTINGUISH_UNITS;
      for (let k = 0; k < 30; k++) stepDuelTick(d, scriptedInput(pair, d));
      const snap = saveDuelSnapshot(d, DIGEST), r = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(snap)), DIGEST), pairR = structuredClone(pair);
      try {
        expect(hashDuel(r)).toBe(hashDuel(d));
        expect(r.interior.rooms.fire[roomOf(r, Room.Shields)]).toBe(d.interior.rooms.fire[roomOf(d, Room.Shields)]);
        expect(r.interior.rooms.fireRepair[roomOf(r, Room.Engines)]).toBe(100 / DUEL_EXTINGUISH_UNITS);
        for (let k = 0; k < 1200 && d.tactical.outcome === Outcome.Running; k++) {
          stepDuelTick(d, scriptedInput(pair, d)); stepDuelTick(r, scriptedInput(pairR, r));
          expect(hashDuel(r)).toBe(hashDuel(d));
        }
      } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
});

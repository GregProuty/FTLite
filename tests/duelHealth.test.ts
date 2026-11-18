// Duel health (docs/superpowers/specs/2026-11-17-duel-health-design.md §3): fire and hit damage, the downed state,
// pick-up by standing near, the both-down loss (owner 2026-11-17), the Medbay, rounds, snapshots and the scripted bot.
import { describe, expect, it } from 'vitest';
import { Health, Life, LifeState, Position, Seated } from '../src/renderer/src/sim/components';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { applyHitDamage, medbayRoom } from '../src/renderer/src/sim/duel/health';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { duelEndSummary } from '../src/renderer/src/sim/duel/summary';
import { createTelemetry, recordTick } from '../src/renderer/src/sim/duel/telemetry';
import { DUEL_REVIVE_TICKS } from '../src/renderer/src/sim/duel/tuning';
import { canonicalFields } from '../src/renderer/src/sim/canonicalFields';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Outcome, Room, type DuelEvent } from '../src/renderer/src/sim/tactical/state';
import { DEBRIS_CREW_DAMAGE, ENEMY_SHOT_CREW_DAMAGE, FIRE_DAMAGE, HEALTH_MAX, MEDBAY_HEAL, REACH } from '../src/renderer/src/sim/tuning';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const HOLD: HeldInput = { moveX: 0, moveY: 0, interactHeld: true };
const WALK: HeldInput = { moveX: 1, moveY: 0, interactHeld: true };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
const step = (d: DuelState, held: HeldInput[] = [NONE, NONE], commands: DuelEnvelope[] = []) => stepDuelTick(d, { held, commands });
const eid = (d: DuelState, pid: number): number => d.interior.crew[pid]!;
const hp = (d: DuelState, pid: number): number => Health.cur[eid(d, pid)]!;
const life = (d: DuelState, pid: number): number => Life.state[eid(d, pid)]!;
const roomOf = (d: DuelState, r: number): number => d.points.find((p) => p.tacticalRoom === r)!.room;
const health = (d: DuelState) => d.events.filter((e) => e.kind === 'crewHurt' || e.kind === 'downed' || e.kind === 'revived');
/** Put pid at tile (tx, ty)'s centre (standing). */
function put(d: DuelState, pid: number, tx: number, ty: number): void { Position.x[eid(d, pid)] = tx + 0.5; Position.y[eid(d, pid)] = ty + 0.5; }
/** Stand pid up (a stand command) and put it at tile (tx, ty). */
function standAt(d: DuelState, pid: number, tx: number, ty: number): void { step(d, [NONE, NONE], [cmd(d, pid, { kind: 'stand' })]); put(d, pid, tx, ty); }
/** Stand pid up and put it on the first tile of interior room `room`. */
function standIn(d: DuelState, pid: number, room: number): void {
  const t = d.interior.derived.roomTiles[room]![0]!, w = d.interior.derived.width;
  standAt(d, pid, t % w, Math.floor(t / w));
}
/** A duel whose enemy is switched off, so no hit lands. */
function quietDuel(seed = 5): DuelState { const d = createSeatedDuel(CUTTER, seed); d.tactical.ships[1]!.active = false; return d; }
const laser = (ship: number, hit: boolean, room: number): DuelEvent => ({ kind: 'laser', ship, hit, stripped: false, room, x1: 0, y1: 0, x2: 0, y2: 0 });
const missile = (cause: 'ship' | 'planet', target: number, room: number): DuelEvent => ({ kind: 'missileEnd', ship: 1, cause, target, room, x: 0, y: 0 });
/** Down pid where it stands: health 0, then one step (the downed transition). */
function down(d: DuelState, pid: number): void { Health.cur[eid(d, pid)] = 0; step(d); }

describe('duel health: damage (spec §1.2)', () => {
  it('fire costs exactly 3 per second to whoever stands in the burning room; seated characters on the Bridge take none', () => {
    expect([HEALTH_MAX, FIRE_DAMAGE]).toEqual([100, 3]);
    const d = quietDuel();
    try {
      standAt(d, 0, 1, 6);
      igniteRoom(d.interior, roomOf(d, Room.Engines));
      expect([hp(d, 0), hp(d, 1)]).toEqual([100, 100]);
      step(d);
      expect(health(d)).toEqual([{ kind: 'crewHurt', player: 0, amount: expect.closeTo(FIRE_DAMAGE / 60, 12), cause: 'fire' }]);
      for (let k = 1; k < 60; k++) step(d);
      expect(hp(d, 0)).toBeCloseTo(97, 9);
      for (let k = 0; k < 600; k++) step(d);
      expect(hp(d, 0)).toBeCloseTo(67, 9);
      expect(hp(d, 1)).toBe(100);
    } finally { disposeDuel(d); }
  });
  it('a laser hit costs 12 and a missile 20, to conscious standing characters in the hit room only', () => {
    expect([ENEMY_SHOT_CREW_DAMAGE, DEBRIS_CREW_DAMAGE]).toEqual([12, 20]);
    const d = quietDuel();
    try {
      standIn(d, 0, roomOf(d, Room.Shields));
      const ev = applyHitDamage(d, [laser(1, true, Room.Shields), missile('ship', 0, Room.Shields), laser(1, true, Room.Engines), laser(0, true, Room.Shields), laser(1, false, -1), missile('ship', 1, Room.Shields), missile('planet', 0, -1)]);
      expect(ev).toEqual([{ kind: 'crewHurt', player: 0, amount: 12, cause: 'hit' }, { kind: 'crewHurt', player: 0, amount: 20, cause: 'hit' }]);
      expect([hp(d, 0), hp(d, 1)]).toEqual([68, 100]);   // player 1 is seated at Weapons on the Bridge
    } finally { disposeDuel(d); }
  });
  it('a seated character takes no hit damage even when its console room is hit', () => {
    const d = quietDuel();
    try {
      for (const r of [Room.Weapons, Room.Shields, Room.Engines]) applyHitDamage(d, [laser(1, true, r), missile('ship', 0, r)]);
      expect([hp(d, 0), hp(d, 1)]).toEqual([100, 100]);
      expect(Seated.station[eid(d, 0)]).toBe(d.nav);
    } finally { disposeDuel(d); }
  });
  it('the step wires the hunter hits in: away characters standing in the hit rooms are hurt by exactly the hits', () => {
    let hits = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const d = createSeatedDuel(CUTTER, seed);
      try {
        standIn(d, 0, roomOf(d, Room.Shields)); standIn(d, 1, roomOf(d, Room.Weapons));
        step(d, [NONE, NONE], [cmd(d, 0, { kind: 'presence', present: false }), cmd(d, 1, { kind: 'presence', present: false })]);
        for (let k = 0; k < 20000 && d.tactical.outcome === Outcome.Running && hits < 3 * seed; k++) {
          const before = [hp(d, 0), hp(d, 1)], up = [life(d, 0) === LifeState.Conscious, life(d, 1) === LifeState.Conscious];
          step(d);
          const expected: [number, number] = [0, 0];
          for (const t of d.tactical.events) {
            if (t.kind !== 'laser' && t.kind !== 'missileEnd') continue;
            const dmg = t.kind === 'laser' ? (t.ship === 1 && t.hit && t.room >= 0 ? 12 : 0) : t.cause === 'ship' && t.target === 0 && t.room >= 0 ? 20 : 0;
            if (dmg && t.room === Room.Shields && up[0]) expected[0] += dmg;
            if (dmg && t.room === Room.Weapons && up[1]) expected[1] += dmg;
          }
          for (const pid of [0, 1]) {
            const got = d.events.filter((e) => e.kind === 'crewHurt' && e.cause === 'hit' && e.player === pid).reduce((a, e) => a + (e.kind === 'crewHurt' ? e.amount : 0), 0);
            expect(got).toBe(Math.min(before[pid]!, expected[pid]!));
            if (got > 0) hits++;
          }
        }
      } finally { disposeDuel(d); }
    }
    expect(hits).toBeGreaterThan(0);
  }, 30_000);
});

describe('duel health: downed (spec §1.3)', () => {
  it('at 0 a character goes down: no bleed-out, no movement, no Interact, no sit', () => {
    const d = quietDuel(), sys = d.tactical.systems[0];
    try {
      standAt(d, 0, 1, 6);
      sys.rooms[Room.Engines] = 1;
      Health.cur[eid(d, 0)] = 0; step(d, [HOLD, NONE]);
      expect(life(d, 0)).toBe(LifeState.Downed);
      expect(d.events.filter((e) => e.kind === 'downed')).toEqual([{ kind: 'downed', player: 0 }]);
      const x = Position.x[eid(d, 0)], y = Position.y[eid(d, 0)], repair = d.repair[Room.Engines];
      for (let k = 0; k < 600; k++) {
        const r = step(d, [WALK, NONE], k === 0 ? [cmd(d, 0, { kind: 'sit', station: d.nav })] : []);
        if (k === 0) expect(r[0]!.status).toBe('rejected');
      }
      expect([Position.x[eid(d, 0)], Position.y[eid(d, 0)]]).toEqual([x, y]);
      expect(d.repair[Room.Engines]).toBe(repair);
      expect(life(d, 0)).toBe(LifeState.Downed);   // no bleed-out, no death
      expect(Life.bleed[eid(d, 0)]).toBe(0);
      expect(Seated.station[eid(d, 0)]).toBe(-1);
    } finally { disposeDuel(d); }
  });
  it('a seated character at 0 is stood up', () => {
    const d = quietDuel();
    try {
      down(d, 0);
      expect(life(d, 0)).toBe(LifeState.Downed);
      expect(Seated.station[eid(d, 0)]).toBe(-1);
      expect(d.interior.stations.occupant[d.nav]).toBe(-1);
      expect(d.interior.stations.level[d.interior.derived.stationOfKind[StationKind.Medbay]!]).toBeGreaterThan(0);   // no power shed
    } finally { disposeDuel(d); }
  });
});

describe('duel health: pick-up (spec §1.4)', () => {
  it('300 ticks within reach stands the character up at 1 health, with no key held', () => {
    expect(DUEL_REVIVE_TICKS).toBe(300);
    const d = quietDuel();
    try {
      standAt(d, 0, 1, 6); standAt(d, 1, 1, 7);
      down(d, 1);                                    // this step already counts one tick of pick-up
      expect(Life.reviveProgress[eid(d, 1)]).toBe(1 / 300);
      for (let k = 1; k < 299; k++) step(d);
      expect(life(d, 1)).toBe(LifeState.Downed);
      expect(Life.reviveProgress[eid(d, 1)]).toBe(299 / 300);
      expect(Life.reviverPid[eid(d, 1)]).toBe(0);
      step(d);
      expect(life(d, 1)).toBe(LifeState.Conscious);
      expect(hp(d, 1)).toBe(1);
      expect(Life.reviveProgress[eid(d, 1)]).toBe(0);
      expect(d.events).toContainEqual({ kind: 'revived', player: 1, by: [0] });
    } finally { disposeDuel(d); }
  });
  it('leaving reach resets the progress; an away or seated teammate picks up nothing', () => {
    const d = quietDuel();
    try {
      standAt(d, 0, 1, 6); standAt(d, 1, 1, 7);
      down(d, 1);
      for (let k = 0; k < 100; k++) step(d);
      expect(Life.reviveProgress[eid(d, 1)]).toBe(101 / 300);
      put(d, 0, 1, 6 - 2);                           // 3 tiles away, out of REACH
      expect(3).toBeGreaterThan(REACH);
      step(d);
      expect(Life.reviveProgress[eid(d, 1)]).toBe(0);
      put(d, 0, 1, 6);
      step(d, [NONE, NONE], [cmd(d, 0, { kind: 'presence', present: false })]);
      for (let k = 0; k < 400; k++) step(d);
      expect(life(d, 1)).toBe(LifeState.Downed);
      expect(Life.reviveProgress[eid(d, 1)]).toBe(0);
    } finally { disposeDuel(d); }
  });
});

describe('duel health: both down (spec §1.5, owner 2026-11-17)', () => {
  it('both down loses the round on that tick; the next tick is the end card; a rematch starts both full', () => {
    const d = quietDuel();
    try {
      standAt(d, 0, 1, 6); standAt(d, 1, 8, 2);
      down(d, 1);
      expect(d.tactical.outcome).toBe(Outcome.Running);
      Health.cur[eid(d, 0)] = 0;
      const tick = d.interior.tick;
      step(d);
      expect(d.tactical.outcome).toBe(Outcome.EnemyWins);
      expect(d.decidedTick).toBe(tick + 1);
      expect(d.tactical.systems[0].hull).toBeGreaterThan(0);
      const r = step(d, [WALK, WALK], [cmd(d, 0, { kind: 'stand' })]);
      expect(r[0]!.reason).toBe('duel-decided');            // stepDecided
      expect(d.events).toEqual([]);
      step(d, [NONE, NONE], [cmd(d, 0, { kind: 'rematch' })]);
      expect(d.round).toBe(1);
      expect(d.tactical.outcome).toBe(Outcome.Running);
      expect([hp(d, 0), hp(d, 1), life(d, 0), life(d, 1)]).toEqual([100, 100, LifeState.Conscious, LifeState.Conscious]);
    } finally { disposeDuel(d); }
  });
  it('the summary names downed as the crew ship cause', () => {
    const d = quietDuel(), t = createTelemetry(d);
    try {
      const go = (held: HeldInput[] = [NONE, NONE], commands: DuelEnvelope[] = []) => { const input = { held, commands }; stepDuelTick(d, input); recordTick(t, d, input); };
      go([NONE, NONE], [cmd(d, 0, { kind: 'stand' }), cmd(d, 1, { kind: 'stand' })]);
      Health.cur[eid(d, 0)] = 0; Health.cur[eid(d, 1)] = 0;
      go();
      expect(d.tactical.outcome).toBe(Outcome.EnemyWins);
      expect(duelEndSummary(t).terminal).toEqual([['downed'], []]);
    } finally { disposeDuel(d); }
  });
});

describe('duel health: Medbay (spec §1.6)', () => {
  it('heals 4 per second while online, to HEALTH_MAX; none while offline; none while downed', () => {
    expect(MEDBAY_HEAL).toBe(4);
    const d = quietDuel(), mb = d.interior.derived.stationOfKind[StationKind.Medbay]!;
    try {
      standIn(d, 0, medbayRoom(d));
      Health.cur[eid(d, 0)] = 50;
      for (let k = 0; k < 60; k++) step(d);
      expect(hp(d, 0)).toBeCloseTo(54, 9);
      d.interior.stations.level[mb] = 0;                 // forced offline
      for (let k = 0; k < 60; k++) step(d);
      expect(hp(d, 0)).toBeCloseTo(54, 9);
      d.interior.stations.level[mb] = 1;
      for (let k = 0; k < 60 * 20; k++) step(d);
      expect(hp(d, 0)).toBe(HEALTH_MAX);
      down(d, 0);
      for (let k = 0; k < 60; k++) step(d);
      expect(hp(d, 0)).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('a picked-up character heals from 1 in the Medbay', () => {
    const d = quietDuel(), room = medbayRoom(d), w = d.interior.derived.width, tiles = d.interior.derived.roomTiles[room]!;
    try {
      standIn(d, 0, room);
      step(d, [NONE, NONE], [cmd(d, 1, { kind: 'stand' })]);
      const t = tiles.find((q) => q !== tiles[0] && Math.hypot((q % w) - (tiles[0]! % w), Math.floor(q / w) - Math.floor(tiles[0]! / w)) <= 1)!;
      put(d, 1, t % w, Math.floor(t / w));
      down(d, 1);
      for (let k = 1; k < 300; k++) step(d);
      expect([life(d, 1), hp(d, 1)]).toEqual([LifeState.Conscious, 1 + MEDBAY_HEAL / 60]);
    } finally { disposeDuel(d); }
  });
});

describe('duel health: rounds, hash and snapshots (spec §1.8, §3)', () => {
  it('a new round starts everyone full and conscious; the end card changes nothing', () => {
    const d = quietDuel();
    try {
      standAt(d, 0, 1, 6); standAt(d, 1, 8, 2);
      Health.cur[eid(d, 0)] = 40; down(d, 1);
      d.tactical.outcome = Outcome.CrewWins;
      igniteRoom(d.interior, roomOf(d, Room.Engines));
      for (let k = 0; k < 300; k++) step(d);
      expect([hp(d, 0), life(d, 1)]).toEqual([40, LifeState.Downed]);
      step(d, [NONE, NONE], [cmd(d, 0, { kind: 'rematch' })]);
      expect([hp(d, 0), hp(d, 1), life(d, 0), life(d, 1)]).toEqual([100, 100, LifeState.Conscious, LifeState.Conscious]);
    } finally { disposeDuel(d); }
  });
  it('health, life and pick-up progress are hashed, carried by the interior flatten, and validated', () => {
    const names = canonicalFields(CUTTER, 2).map((f) => f.name);
    for (const p of [0, 1]) for (const k of ['health', 'life', 'reviveProgress']) expect(names).toContain(`crew.${p}.${k}`);
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const h = hashDuel(d);
      d.events = [{ kind: 'downed', player: 0 }];
      expect(hashDuel(d)).toBe(h);                        // events are not hashed
      Health.cur[eid(d, 0)] = 99; expect(hashDuel(d)).not.toBe(h);
      Health.cur[eid(d, 0)] = 0; Life.state[eid(d, 0)] = LifeState.Downed; Life.reviveProgress[eid(d, 0)] = 299 / 300;
      const snap = JSON.parse(JSON.stringify(saveDuelSnapshot(d, DIGEST)));
      expect(() => validateDuelSnapshot(CUTTER, snap, DIGEST)).not.toThrow();
    } finally { disposeDuel(d); }
  });
  it('a snapshot taken mid-downed and mid-pick-up restores and continues identically', () => {
    const d = createSeatedDuel(CUTTER, 1), pair = createScriptedPair(1);
    try {
      for (let k = 0; k < 600; k++) stepDuelTick(d, scriptedInput(pair, d));
      Health.cur[eid(d, 1)] = 0;                         // the gunner goes down at its console; the Helm bot walks over
      for (let k = 0; k < 400 && Life.reviveProgress[eid(d, 1)]! === 0; k++) stepDuelTick(d, scriptedInput(pair, d));
      expect(life(d, 1)).toBe(LifeState.Downed);
      expect(Life.reviveProgress[eid(d, 1)]).toBeGreaterThan(0);
      for (let k = 0; k < 30; k++) stepDuelTick(d, scriptedInput(pair, d));
      const snap = saveDuelSnapshot(d, DIGEST), r = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(snap)), DIGEST), pairR = structuredClone(pair);
      try {
        expect(hashDuel(r)).toBe(hashDuel(d));
        expect(Life.reviveProgress[eid(r, 1)]).toBe(Life.reviveProgress[eid(d, 1)]);
        let revived = false;
        for (let k = 0; k < 1200 && d.tactical.outcome === Outcome.Running; k++) {
          stepDuelTick(d, scriptedInput(pair, d)); stepDuelTick(r, scriptedInput(pairR, r));
          expect(hashDuel(r)).toBe(hashDuel(d));
          if (d.events.some((e) => e.kind === 'revived')) revived = true;
        }
        expect(revived).toBe(true);
      } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  }, 30_000);
});

describe('duel health: the scripted bot (spec §1.9)', () => {
  it('a hurt bot with nothing to repair heals at the Medbay to full, then goes back to its console', () => {
    const d = quietDuel(3), pair = createScriptedPair(3), mb = medbayRoom(d);
    try {
      Health.cur[eid(d, 1)] = 30;
      let inMedbay = false;
      for (let k = 0; k < 60 * 60 && !(hp(d, 1) === HEALTH_MAX && Seated.station[eid(d, 1)] === d.weapons); k++) {
        stepDuelTick(d, scriptedInput(pair, d));
        const e = eid(d, 1);
        if (d.interior.derived.roomOfTile[Math.floor(Position.y[e]!) * d.interior.derived.width + Math.floor(Position.x[e]!)] === mb) inMedbay = true;
      }
      expect(inMedbay).toBe(true);
      expect(hp(d, 1)).toBe(HEALTH_MAX);
      expect(Seated.station[eid(d, 1)]).toBe(d.weapons);
    } finally { disposeDuel(d); }
  });
  it('picking up a downed teammate outranks repair', () => {
    const d = quietDuel(3), pair = createScriptedPair(3);
    try {
      d.tactical.systems[0].rooms[Room.Engines] = 2;
      Health.cur[eid(d, 1)] = 0;
      let revivedAt = -1;
      for (let k = 0; k < 60 * 60 && revivedAt < 0; k++) {
        stepDuelTick(d, scriptedInput(pair, d));
        expect(d.events.some((e) => e.kind === 'repairWork')).toBe(false);
        if (d.events.some((e) => e.kind === 'revived' && e.player === 1)) revivedAt = k;
      }
      expect(revivedAt).toBeGreaterThan(0);
      expect(life(d, 1)).toBe(LifeState.Conscious);
    } finally { disposeDuel(d); }
  });
});

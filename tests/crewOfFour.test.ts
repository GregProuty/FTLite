// Sci-2 (spec 2026-11-18-sci-2-crew-of-four §3, §4.1, §7, §9 Sim): a duel crew of 2, 3 or 4. createDuel builds n
// Recruits at the layout's spawns, all present and standing; presence is admitted for players 0..n−1; a third player
// sits at Science and scans, a fourth takes a free console; the round is lost when every one of the n characters is
// down (away ones included); health, telemetry and the summary run to n; a rematch keeps the crew and its presence.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { validateDuelRecord, soloDuelRecord } from '../src/renderer/src/net/duelRecord';
import { Health, Life, LifeState, Position, Seated } from '../src/renderer/src/sim/components';
import { roomAt } from '../src/renderer/src/sim/grid';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { revivers } from '../src/renderer/src/sim/duel/health';
import { presenceModule } from '../src/renderer/src/sim/duel/modules';
import { createDuel, disposeDuel, DUEL_CREW_MAX, DUEL_CREW_MIN, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { duelEndSummary, duelRoundRecord } from '../src/renderer/src/sim/duel/summary';
import { createTelemetry, recordTick } from '../src/renderer/src/sim/duel/telemetry';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { SCAN_RATE_SCIENCE } from '../src/renderer/src/sim/tactical/tuning';
import { standAtStation } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const HOUND = parseShip(hound);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
const input = (d: DuelState, commands: DuelEnvelope[] = []) => ({ held: Array.from({ length: d.interior.playerCount }, () => NONE), commands });
const step = (d: DuelState, commands: DuelEnvelope[] = []) => stepDuelTick(d, input(d, commands));
/** At 0 health a conscious character goes down in the next step's health phase. */
const down = (d: DuelState, pid: number): void => { Health.cur[d.interior.crew[pid]!] = 0; };
const downedEvents = (d: DuelState): number[] => d.events.flatMap((e) => (e.kind === 'downed' ? [e.player] : []));

describe('createDuel with a crew (spec §4.1)', () => {
  it('the bounds are 2 and 4; the Hound has four spawns, 13..16,7 in room Q', () => {
    expect([DUEL_CREW_MIN, DUEL_CREW_MAX]).toEqual([2, 4]);
    expect(HOUND.spawns.slice(0, 4)).toEqual([[13, 7], [14, 7], [15, 7], [16, 7]]);
  });
  for (const crew of [3, 4]) it(`a crew of ${crew}: ${crew} Recruits at the spawns in player order, all standing, conscious and present`, () => {
    const d = createDuel(HOUND, 5, 0, crew);
    try {
      expect(d.interior.playerCount).toBe(crew);
      expect(d.present).toEqual(Array(crew).fill(true));
      expect(d.interior.crew.map((eid) => [Position.x[eid], Position.y[eid]])).toEqual(HOUND.spawns.slice(0, crew).map(([x, y]) => [x + 0.5, y + 0.5]));
      const q = d.interior.derived.roomIndex.get('Q');
      expect(d.interior.crew.map((eid) => roomAt(d.interior, Position.x[eid]!, Position.y[eid]!))).toEqual(Array(crew).fill(q));
      expect(d.interior.crew.map((eid) => [Seated.station[eid], Life.state[eid]])).toEqual(Array(crew).fill([-1, LifeState.Conscious]));
      expect(presenceModule.fields(d).map((f) => f.name)).toEqual(Array.from({ length: crew }, (_, p) => `present.${p}`));
    } finally { disposeDuel(d); }
  });
  it('throws for a crew outside 2..4, a crew above the spawn count, or a Helm player outside the crew', () => {
    for (const crew of [0, 5, 2.5]) expect(() => createDuel(HOUND, 5, 0, crew), `crew ${crew}`).toThrow(/invalid duel crew/);   // Valkyrn-i: a local crew of 1 is legal
    const twoSpawns = { ...CUTTER, spawns: CUTTER.spawns.slice(0, 2) };   // a parsed layout always has 4 (Decision 4)
    expect(() => createDuel(twoSpawns, 5, 0, 3)).toThrow(/spawns/);
    expect(() => createDuel(HOUND, 5, 3, 3)).toThrow(/helm player/);
    const d = createDuel(HOUND, 5, 3, 4);
    try { expect(d.helmPlayer).toBe(3); expect(Seated.station[d.interior.crew[3]!]).toBe(-1); } finally { disposeDuel(d); }   // seats nobody
  });
});

describe('presence and seats at n (spec §4.1, §7)', () => {
  it('presence is admitted for players 0..n−1 and malformed beyond', () => {
    const d = createDuel(HOUND, 5, 0, 4), two = createDuel(HOUND, 5), three = createDuel(HOUND, 5, 0, 3);
    try {
      expect(step(d, [cmd(d, 2, { kind: 'presence', present: false }), cmd(d, 3, { kind: 'presence', present: false })]).map((r) => r.status)).toEqual(['applied', 'applied']);
      expect(d.present).toEqual([true, true, false, false]);
      expect(step(two, [cmd(two, 2, { kind: 'presence', present: false })])[0]).toMatchObject({ status: 'rejected', reason: 'malformed' });
      expect(step(three, [cmd(three, 3, { kind: 'presence', present: false })])[0]).toMatchObject({ status: 'rejected', reason: 'malformed' });
      expect([two.present, three.present]).toEqual([[true, true], [true, true, true]]);
    } finally { disposeDuel(d); disposeDuel(two); disposeDuel(three); }
  });
  it('a third player sits at Science and scans at the Science rate; a fourth takes the free Weapons console and tunes', () => {
    const d = createDuel(HOUND, 5, 0, 4);
    try {
      standAtStation(d, 0, d.nav); standAtStation(d, 2, d.science); standAtStation(d, 3, d.weapons);
      expect(step(d, [cmd(d, 0, { kind: 'sit', station: d.nav }), cmd(d, 2, { kind: 'sit', station: d.science }), cmd(d, 3, { kind: 'sit', station: d.weapons })]).map((r) => r.status))
        .toEqual(['applied', 'applied', 'applied']);
      expect([d.nav, d.science, d.weapons].map((s) => d.interior.stations.occupant[s])).toEqual([0, 2, 3]);
      const r = step(d, [cmd(d, 2, { kind: 'contactScan', contact: 0 }), cmd(d, 3, { kind: 'laserFrequency', freq: 2 }), cmd(d, 1, { kind: 'laserFrequency', freq: 1 })]);
      expect(r.map((x) => [x.id.player, x.reason ?? x.status])).toEqual([[1, 'not-at-weapons'], [2, 'applied'], [3, 'applied']]);
      expect(d.tactical.scan).toMatchObject({ contact: 0, by: d.science, rate: SCAN_RATE_SCIENCE });
      expect(d.tactical.systems[0].freq).toBe(2);
    } finally { disposeDuel(d); }
  });
  it('two players race to one console: the first admitted sits (today\'s rule: one tick\'s sits at a console are admitted in player order)', () => {
    const d = createDuel(HOUND, 5, 0, 3);
    try {
      standAtStation(d, 1, d.weapons); standAtStation(d, 2, d.weapons);
      // applyInteractionCommands (sim/commands.ts) orders a tick's requests for one station by player, then sequence,
      // whatever their envelope order: player 1 is admitted first and sits; player 2 finds the console taken.
      const r = step(d, [cmd(d, 2, { kind: 'sit', station: d.weapons }), cmd(d, 1, { kind: 'sit', station: d.weapons })]);
      expect(r.map((x) => [x.id.player, x.reason ?? x.status])).toEqual([[1, 'applied'], [2, 'unavailable']]);
      expect(d.interior.stations.occupant[d.weapons]).toBe(1);
    } finally { disposeDuel(d); }
  });
});

describe('health at n (spec §4.1)', () => {
  it('the round is lost when all three are down, one of them away; not while one stands', () => {
    const d = createDuel(HOUND, 5, 0, 3), e = createDuel(HOUND, 5, 0, 3);
    try {
      d.present[2] = false;
      for (const pid of [0, 1, 2]) down(d, pid);
      step(d);
      expect(downedEvents(d)).toEqual([0, 1, 2]);
      expect(d.tactical.outcome).toBe(Outcome.EnemyWins);
      down(e, 0); down(e, 1); step(e);
      expect(downedEvents(e)).toEqual([0, 1]);
      expect(e.tactical.outcome).toBe(Outcome.Running);
    } finally { disposeDuel(d); disposeDuel(e); }
  });
  it('the health loops reach player 3; only present characters revive', () => {
    const d = createDuel(HOUND, 5, 0, 4);
    try {
      down(d, 3); step(d);
      expect(downedEvents(d)).toEqual([3]);
      const e3 = d.interior.crew[3]!, e2 = d.interior.crew[2]!;
      Position.x[e2] = Position.x[e3]!; Position.y[e2] = Position.y[e3]!;
      expect(revivers(d, 3)).toContain(2);
      d.present[2] = false;
      expect(revivers(d, 3)).not.toContain(2);
    } finally { disposeDuel(d); }
  });
});

describe('telemetry, the summary and the record at n (spec §4.1, §4.3)', () => {
  it('the per-player accumulator and summary values are n long; the ship pairs stay two', () => {
    const d = createDuel(HOUND, 5, 0, 3), t = createTelemetry(d);
    try {
      expect([t.players.length, t.prev.work.length, t.prev.seat.length, t.prev.lastConsole.length]).toEqual([3, 3, 3, 3]);
      for (let k = 0; k < 10; k++) { const i = input(d); stepDuelTick(d, i); recordTick(t, d, i); }
      expect(t.players.map((p) => p.walkingTicks)).toEqual([10, 10, 10]);
      const s = duelEndSummary(t);
      expect([s.repairsStarted.length, s.repairsFinished.length, s.walkingTicks, s.repairingTicks.length]).toEqual([3, 3, [10, 10, 10], 3]);
      expect([s.laserReleases.length, s.terminal.length, s.missileLosses.length]).toEqual([2, 2, 2]);
    } finally { disposeDuel(d); }
  });
  it('the playtest record takes seats 0..3 and n-long per-player values', () => {
    const d = createDuel(HOUND, 5, 2, 3), t = createTelemetry(d);
    try {
      d.tactical.systems[1].hull = 0;   // the first step decides the round for the crew
      const i = input(d); stepDuelTick(d, i); recordTick(t, d, i);
      const record = soloDuelRecord(duelRoundRecord(duelEndSummary(t), 0, d.tactical.seed, 0), { seat: 2, helmPlayer: 2, startedAtIso: '2026-11-18T00:00:00Z', pauses: 0 });
      expect(validateDuelRecord(record).summary.walkingTicks).toHaveLength(3);
      expect(() => validateDuelRecord({ ...record, seat: 4 })).toThrow();
      expect(() => validateDuelRecord({ ...record, helmPlayer: 4 })).toThrow();
      expect(() => validateDuelRecord({ ...record, summary: { ...record.summary, laserHits: [0, 0, 0] } })).toThrow();
    } finally { disposeDuel(d); }
  });
});

describe('rounds at n (spec §4.1, §7)', () => {
  it('a rematch keeps the crew size, the Helm player and an empty seat away; presence beyond n is malformed on the end card', () => {
    const d = createDuel(HOUND, 5, 2, 3);
    try {
      d.present[2] = false; d.tactical.systems[1].hull = 0;
      step(d);
      expect(d.tactical.outcome).toBe(Outcome.CrewWins);
      const r = step(d, [cmd(d, 0, { kind: 'rematch' }), cmd(d, 3, { kind: 'presence', present: true })]);
      expect(r.map((x) => [x.id.player, x.reason ?? x.status])).toEqual([[0, 'applied'], [3, 'malformed']]);
      expect([d.round, d.interior.playerCount, d.helmPlayer, d.present]).toEqual([1, 3, 2, [true, true, false]]);
    } finally { disposeDuel(d); }
  });
});

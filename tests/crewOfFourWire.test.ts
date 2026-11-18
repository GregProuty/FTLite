// Sci-2 (spec 2026-11-18-sci-2-crew-of-four §4.2, §4.3, §9 Snapshot/checkpoint/wire): the duel snapshot, the init, the
// checkpoint and the codec at a crew of 3 and 4. The header's playerCount is the crew, validated in 2..4 and against the
// interior; the round module sits after n presence flags; the checkpoint's per-player arrays and ledger are n long; the
// codec admits players 0..3 and carries n-long per-player values while the ship pairs stay two.
import { describe, expect, it } from 'vitest';
import { validateDuelCheckpoint, type DuelCheckpoint } from '../src/renderer/src/authority/duelCheckpoint';
import { validateDuelPublication } from '../src/renderer/src/clientControl/duelClient';
import { duelCodec } from '../src/renderer/src/net/codec';
import { MAX_PLAYERS } from '../src/shared/intent';
import { ROOM_MAX_PLAYERS } from '../src/shared/roomSession';
import { hashF64 } from '../src/shared/hash';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { duelRoundOf, duelSeedFacts, loadDuelSnapshot, restoreDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot, type DuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, DUEL_CREW_MAX } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { duelEndSummary, duelRoundRecord } from '../src/renderer/src/sim/duel/summary';
import { createTelemetry, recordTick } from '../src/renderer/src/sim/duel/telemetry';
import { duelInit, resolveCutter } from './helpers/duelAuthority';
import { liveDuel } from './helpers/liveDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE = { moveX: 0, moveY: 0, interactHeld: false };
const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const rehash = (s: DuelSnapshot): DuelSnapshot => { s.header.hash = hashF64(Float64Array.from(s.values)); return s; };
/** A crew-n Hound duel a few ticks in, its last player away. */
function crewDuel(n: number, helmPlayer = 0) {
  const d = createDuel(DUEL_LAYOUT, 5, helmPlayer, n);
  stepDuelTick(d, { held: [], commands: [{ runId: 'duel', id: { player: n - 1, sequence: 1 }, requestedTick: 0, command: { kind: 'presence', present: false } }] });
  for (let k = 0; k < 4; k++) stepDuelTick(d, { held: [], commands: [] });
  return d;
}

describe('the bounds agree (Decision 2)', () => {
  it('the duel crew limit is the room limit and the codec module\'s', () => {
    expect([DUEL_CREW_MAX, MAX_PLAYERS, ROOM_MAX_PLAYERS]).toEqual([4, 4, 4]);
  });
});

describe('the duel snapshot at n (spec §4.2)', () => {
  for (const n of [3, 4]) it(`a crew of ${n}: the header carries it, it validates, loads and restores to the same hash`, () => {
    const d = crewDuel(n);
    try {
      const snap = saveDuelSnapshot(d, DIGEST);
      expect(snap.header.playerCount).toBe(n);
      expect(validateDuelSnapshot(DUEL_LAYOUT, JSON.parse(JSON.stringify(snap)), DIGEST).header.playerCount).toBe(n);
      const r = loadDuelSnapshot(DUEL_LAYOUT, JSON.parse(JSON.stringify(snap)), DIGEST);
      try {
        expect([r.interior.playerCount, hashDuel(r)]).toEqual([n, hashDuel(d)]);
        expect(r.present).toEqual([...Array(n - 1).fill(true), false]);
        stepDuelTick(d, { held: [], commands: [] });
        restoreDuelSnapshot(r, validateDuelSnapshot(DUEL_LAYOUT, saveDuelSnapshot(d, DIGEST), DIGEST), DIGEST);
        expect(hashDuel(r)).toBe(hashDuel(d));
      } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
  it('refuses a header crew outside 2..4 or one that disagrees with the values; a replica of another crew is a load', () => {
    const d = crewDuel(3), two = createDuel(DUEL_LAYOUT, 5);
    try {
      const snap = saveDuelSnapshot(d, DIGEST), withCount = (n: number) => { const s = structuredClone(snap); s.header.playerCount = n; return s; };
      for (const n of [1, 5, 2.5]) expect(() => validateDuelSnapshot(DUEL_LAYOUT, withCount(n), DIGEST), `playerCount ${n}`).toThrow(/player count is invalid/);
      for (const n of [2, 4]) expect(() => validateDuelSnapshot(DUEL_LAYOUT, withCount(n), DIGEST), `playerCount ${n} on a crew of 3`).toThrow();
      const space = duelSeedFacts(5).spaceLength, interiorAt = 1 + space + 3 + 3 + 4 + 2;
      for (const k of [5, 9]) { const s = structuredClone(snap); s.values[interiorAt + k] = 2; expect(() => validateDuelSnapshot(DUEL_LAYOUT, rehash(s), DIGEST), `interior[${k}] = 2`).toThrow(); }
      expect(() => restoreDuelSnapshot(two, validateDuelSnapshot(DUEL_LAYOUT, snap, DIGEST), DIGEST)).toThrow(/load it instead/);
    } finally { disposeDuel(d); disposeDuel(two); }
  });
  it('duelRoundOf reads the round module after n presence flags; the Helm player is a seat of the crew', () => {
    const d = crewDuel(3, 2);
    try {
      const snap = saveDuelSnapshot(d, DIGEST);
      expect(duelRoundOf(snap)).toMatchObject({ round: 0, helmPlayer: 2, baseTick: 0, decidedTick: -1, outcome: 0 });
      const helmAt = 1 + duelSeedFacts(5).spaceLength + 3 + 3 + 1;
      expect(snap.values[helmAt]).toBe(2);
      const bad = structuredClone(snap); bad.values[helmAt] = 3;
      expect(() => validateDuelSnapshot(DUEL_LAYOUT, rehash(bad), DIGEST)).toThrow(/helm player/);
    } finally { disposeDuel(d); }
  });
});

describe('the init and the checkpoint at n (spec §4.3)', () => {
  it('a crew-3 checkpoint validates with n-long arrays and an n-player ledger; any other length or crew is refused', () => {
    const live = liveDuel(duelInit(5, 'crew-3', 0, DUEL_LAYOUT, 3));
    live.tick(30);
    const cp = JSON.parse(JSON.stringify(live.core.captureCheckpoint())) as DuelCheckpoint;
    expect([cp.init.playerCount, cp.snapshot.header.playerCount, cp.commandHighWater.length, cp.heldHighWater.length, cp.held.length, cp.admissionCounts.length]).toEqual([3, 3, 3, 3, 3, 3]);
    expect(cp.modeMemory.telemetry.players).toHaveLength(3);
    const check = (value: unknown) => validateDuelCheckpoint(JSON.parse(JSON.stringify(value)), DIGEST, resolveCutter);
    expect(() => check(cp)).not.toThrow();
    const t = cp.modeMemory.telemetry;
    for (const [what, bad] of [
      ['init crew 2', { ...cp, init: { ...cp.init, playerCount: 2 } }],
      ['init crew 5', { ...cp, init: { ...cp.init, playerCount: 5 } }],
      ['helm player 3', { ...cp, init: { ...cp.init, helmPlayer: 3 } }],
      ['two command watermarks', { ...cp, commandHighWater: cp.commandHighWater.slice(0, 2) }],
      ['two held frames', { ...cp, held: cp.held.slice(0, 2), heldHighWater: cp.heldHighWater.slice(0, 2) }],
      ['pause owner 3', { ...cp, pauseOwner: 3 }],
      ['two telemetry players', { ...cp, modeMemory: { ...cp.modeMemory, telemetry: { ...t, players: t.players.slice(0, 2) } } }],
      ['two seat copies', { ...cp, modeMemory: { ...cp.modeMemory, telemetry: { ...t, prev: { ...t.prev, seat: t.prev.seat.slice(0, 2) } } } }]
    ] as const) expect(() => check(bad), what).toThrow();
  });
  it('a crew-3 publication passes the duel publication validation', () => {
    const live = liveDuel(duelInit(5, 'crew-3-pub', 0, DUEL_LAYOUT, 3));
    live.tick(6);
    const state = [...live.sent].reverse().find((m) => m.kind === 'state');
    expect(state).toBeDefined();
    const p = validateDuelPublication(JSON.parse(JSON.stringify((state as { state: unknown }).state)), { resolveLayout: resolveCutter, contentDigest: DIGEST });
    expect([p.snapshot.header.playerCount, p.commandHighWater.length]).toEqual([3, 3]);
  });
});

describe('the duel codec at n (spec §4.3)', () => {
  it('admits players 0..3 at limit 4, refuses them at limit 2; per-player values n long, ship pairs two', () => {
    const command = (player: number) => raw({ kind: 'command', envelope: { runId: 'r', id: { player, sequence: 1 }, requestedTick: 0, command: { kind: 'stand' } } });
    expect(duelCodec(DUEL_CREW_MAX).decodeMessage(command(3))).toMatchObject({ kind: 'command' });
    expect(() => duelCodec(DUEL_CREW_MAX).decodeMessage(command(4))).toThrow();
    expect(() => duelCodec(2).decodeMessage(command(2))).toThrow();
    const d = createDuel(DUEL_LAYOUT, 5, 0, 3), t = createTelemetry(d);
    try {
      for (let k = 0; k < 3; k++) { const i = { held: [NONE, NONE, NONE], commands: [] }; stepDuelTick(d, i); recordTick(t, d, i); }
      const record = duelRoundRecord(duelEndSummary(t), 0, 5, 0);
      const round = (r: unknown) => ({ kind: 'event' as const, event: { runId: 'r', eventSequence: 1, tick: 3, payload: { kind: 'round', record: r } as never } });
      const codec = duelCodec(DUEL_CREW_MAX);
      expect(codec.decodeMessage(codec.encodeMessage(round(record)))).toEqual(round(record));
      for (const [what, bad] of [['a 3-long ship pair', { ...record, laserHits: [0, 0, 0] }], ['a 5-long player list', { ...record, walkingTicks: [0, 0, 0, 0, 0] }], ['a 1-long player list', { ...record, repairsStarted: [0] }]] as const)
        expect(() => codec.decodeMessage(raw(round(bad))), what).toThrow();
    } finally { disposeDuel(d); }
  });
});

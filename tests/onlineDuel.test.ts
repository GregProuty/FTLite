// The duel's main-process online mode (H-2 spec §2, §8, §10): compatibility, the room's init and seed, the guest's check
// of a committed start, the mirror check, the mode adapter and the sector test-only gate, and the playtest record log.
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { duelCompatibility, duelInit, duelJoinCompatibilities, validateCommittedDuelStart, validateDuelMirror } from '../src/network/online/onlineDuel';
import { onlineModeFor, validateModeMirror } from '../src/network/online/onlineModes';
import { sectorCompatibility } from '../src/network/online/onlineSector';
import { appendDuelRecord, duelRecordCallAllowed, duelRecordPath } from '../src/main/network/duelRecords';
import { createOnlineSession } from '../src/network/online/onlineSession';
import { nextValidSeed, seedFromRunId } from '../src/renderer/src/sim/duel/seeds';
import { DUEL_RECORD_MAX_BYTES, DUEL_RECORD_MAX_MS, latencyFigure, arrivalJitter, validateDuelRecord, type DuelPlaytestRecord } from '../src/renderer/src/net/duelRecord';
import type { RoomSnapshot } from '../src/shared/roomSession';
import { hunterDown, liveDuel } from './helpers/liveDuel';

function room(runId = '0000beef' + 'b'.repeat(24), capacity = 2): RoomSnapshot { return { roomId: 'a'.repeat(32), runId, joinCode: 'ABCDEFGH', capacity, hostSeatId: 0,
  hostGeneration: 1, rosterRevision: 1, phase: 'lobby', compatibility: duelCompatibility(), seats: Array.from({ length: capacity }, (_, seatId) => ({ seatId, seatGeneration: 1, occupied: true, connected: true, ready: false })) }; }
const commit = (snapshot: RoomSnapshot, value: unknown) => { const bytes = Buffer.from(JSON.stringify(value)); return { initBase64: bytes.toString('base64'), initHash: createHash('sha256').update(bytes).digest('hex'),
  lease: { roomId: snapshot.roomId, hostGeneration: 1, hostSeatId: 0, nonce: 'c'.repeat(32), expiresAtEpochMs: Date.now() + 12000 } }; };

describe('the duel online mode in main (spec §2)', () => {
  it('a duel room is the Hound at duel schema version 2, round 0 seeded from its runId', () => {
    expect(duelCompatibility()).toMatchObject({ protocolVersion: 2, modeId: 'duel', schemaVersion: 3 });
    expect(duelJoinCompatibilities()).toEqual([duelCompatibility()]);
    const snapshot = room();
    expect(duelInit(snapshot)).toMatchObject({ runId: snapshot.runId, layoutId: 'hound', playerCount: 2, helmPlayer: 0, seed: seedFromRunId(snapshot.runId) });
    expect(seedFromRunId(snapshot.runId)).toBe(nextValidSeed(0xbeef));
    expect(duelInit(snapshot, { helmPlayer: 1 }).helmPlayer).toBe(1);
    expect(duelInit(snapshot, undefined, 2277).seed).toBe(2277);   // the test-only seed
    expect(() => duelInit(room(undefined, 1))).toThrow();   // a crew is 2..4
    expect(() => duelInit({ ...snapshot, compatibility: sectorCompatibility(2) })).toThrow();
  });
  it('a duel room holds a crew of 2, 3 or 4 (Sci-2 spec §4.5): the init carries it and the Helm player is a seat of it', () => {
    for (const crew of [2, 3, 4] as const) {
      const snapshot = room(undefined, crew);
      expect(duelInit(snapshot)).toMatchObject({ playerCount: crew, helmPlayer: 0 });
      expect(duelInit(snapshot, { helmPlayer: crew - 1 }).helmPlayer).toBe(crew - 1);
      expect(() => duelInit(snapshot, { helmPlayer: crew }), `helm ${crew} of ${crew}`).toThrow();
    }
  });
  it('validateDuelMirror refuses a mirror whose init is not the room\'s crew size; the adapter passes the capacity', () => {
    const snapshot = room(undefined, 3), init = duelInit(snapshot), live = liveDuel(init, hunterDown);
    live.tick(40);
    const bytes = new TextEncoder().encode(JSON.stringify(live.core.captureCheckpoint()));
    const mirror = { bytes, metadata: { version: 1 as const, protocolVersion: 2 as const, roomId: snapshot.roomId, runId: snapshot.runId, compatibility: snapshot.compatibility,
      hostGeneration: 1, checkpointSequence: 1, capturedTick: live.tickNow(), payloadSha256: createHash('sha256').update(bytes).digest('hex') } };
    expect(() => validateDuelMirror(mirror)).not.toThrow();
    expect(() => validateDuelMirror(mirror, 3)).not.toThrow();
    expect(() => validateDuelMirror(mirror, 2)).toThrow();
    expect(() => validateModeMirror(mirror, 3)).not.toThrow();
    expect(() => validateModeMirror(mirror, 4)).toThrow();
  });
  it('the guest accepts either Helm player in a committed init and rejects any other field change', async () => {
    const snapshot = room();
    for (const helm of [0, 1] as const) await expect(validateCommittedDuelStart(snapshot, commit(snapshot, duelInit(snapshot, { helmPlayer: helm })))).resolves.toMatchObject({ helmPlayer: helm });
    const init = duelInit(snapshot);
    for (const bad of [{ ...init, seed: init.seed + 1 }, { ...init, runId: 'c'.repeat(32) }, { ...init, helmPlayer: 2 }, { ...init, extra: 1 }])
      await expect(validateCommittedDuelStart(snapshot, commit(snapshot, bad))).rejects.toThrow();
    await expect(validateCommittedDuelStart(snapshot, { ...commit(snapshot, init), initHash: '0'.repeat(64) })).rejects.toThrow();
  });
  it('validates a duel mirror by its checkpoint and metadata, through the adapter by mode', () => {
    const snapshot = room(), init = duelInit(snapshot), live = liveDuel(init, hunterDown);
    live.tick(40);
    const bytes = new TextEncoder().encode(JSON.stringify(live.core.captureCheckpoint()));
    const mirror = { bytes, metadata: { version: 1 as const, protocolVersion: 2 as const, roomId: snapshot.roomId, runId: snapshot.runId, compatibility: snapshot.compatibility,
      hostGeneration: 1, checkpointSequence: 1, capturedTick: live.tickNow(), payloadSha256: createHash('sha256').update(bytes).digest('hex') } };
    expect(() => validateDuelMirror(mirror)).not.toThrow();
    expect(() => validateModeMirror(mirror)).not.toThrow();
    for (const metadata of [{ ...mirror.metadata, capturedTick: 1 }, { ...mirror.metadata, runId: 'c'.repeat(32) }, { ...mirror.metadata, compatibility: sectorCompatibility(2) }])
      expect(() => validateDuelMirror({ ...mirror, metadata })).toThrow();
    expect(onlineModeFor('duel')!.modeId).toBe('duel');
    expect(onlineModeFor('sector')!.modeId).toBe('sector');
    expect(onlineModeFor('elsewhere')).toBeUndefined();
  });
});

describe('the session modes and the sector test-only entry (spec §2, §10)', () => {
  function owner(sectorTestEntry?: boolean, seat: unknown = null) {
    const create = vi.fn(async () => { throw { code: 'unavailable' }; }), join = vi.fn(async () => { throw { code: 'not-found' }; });
    const store = { load: async () => null, save: async () => {}, clear: async () => {} }, seatStore = { ...store, load: async () => seat };
    const session = createOnlineSession({ config: { enabled: true, baseUrl: 'http://127.0.0.1:8787', allowInsecureLocalhost: true, iceMode: 'loopback' }, seatStore: seatStore as never, mirrorStore: store as never,
      service: () => ({ create, join, close() {}, onEvent: () => () => {} }) as never, platform: { onVisibleGone: () => () => {} } as never,
      clock: { nowMs: () => 0, epochMs: () => Date.now() }, scheduler: { setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: (id) => clearTimeout(id as never) }, nonce: () => 'f'.repeat(32), sectorTestEntry });
    return { session, create, join };
  }
  it('Host creates a duel room for the crew size chosen; Join tries the duel compatibility only', async () => {
    const o = owner();
    expect(await o.session.dispatch({ type: 'host', mode: 'duel' } as never)).toEqual({ ok: false, code: 'invalid-action' });   // a duel host action carries its crew
    expect(await o.session.dispatch({ type: 'host', mode: 'duel', capacity: 3 })).toEqual({ ok: false, code: 'unavailable' });
    expect(o.create.mock.calls).toEqual([[duelCompatibility(), 3]]);
    expect(await o.session.dispatch({ type: 'join', code: 'ABCDEFGH' })).toEqual({ ok: false, code: 'not-found' });
    expect(o.join.mock.calls).toEqual([['ABCDEFGH', duelCompatibility()]]);
  });
  it('refuses the sector forms unless the main process was started for them', async () => {
    const off = owner();
    expect(await off.session.dispatch({ type: 'host', mode: 'sector', capacity: 2 })).toEqual({ ok: false, code: 'invalid-action' });
    expect(await off.session.dispatch({ type: 'join', code: 'ABCDEFGH', mode: 'sector' })).toEqual({ ok: false, code: 'invalid-action' });
    expect(off.create).not.toHaveBeenCalled(); expect(off.join).not.toHaveBeenCalled();
    const on = owner(true);
    await on.session.dispatch({ type: 'host', mode: 'sector', capacity: 2 });
    expect(on.create.mock.calls).toEqual([[sectorCompatibility(2), 2]]);
  });
  it('refuses a saved sector seat on Reconnect and Retry unless started for the sector entry, and does not offer them', async () => {
    const sectorSeat = { version: 1, serviceOrigin: 'http://127.0.0.1:8787', roomId: 'a'.repeat(32), joinCode: 'ABCDEFGH', compatibility: sectorCompatibility(2),
      seatId: 1, seatGeneration: 1, seatToken: 'T'.repeat(43) };
    const loaded = async (o: ReturnType<typeof owner>) => { for (let k = 0; k < 20 && !o.session.status().persistent; k++) await new Promise((r) => setTimeout(r, 0)); };
    const off = owner(false, sectorSeat); await loaded(off);
    expect(off.session.status().persistent).toBe(true);
    expect(off.session.status().actions).not.toContain('reconnect');
    expect(off.session.status().actions).not.toContain('retry');
    expect(await off.session.dispatch({ type: 'reconnect' })).toEqual({ ok: false, code: 'storage-invalid' });
    expect(await off.session.dispatch({ type: 'retry' })).toEqual({ ok: false, code: 'storage-invalid' });
    expect(off.join).not.toHaveBeenCalled();
    const on = owner(true, sectorSeat); await loaded(on);
    expect(on.session.status().actions).toEqual(expect.arrayContaining(['reconnect', 'retry']));
    await on.session.dispatch({ type: 'reconnect' });
    expect(on.join.mock.calls[0]).toEqual(['ABCDEFGH', sectorCompatibility(2), 'T'.repeat(43)]);
  });
});

describe('the duel playtest record (spec §8)', () => {
  const summary = { outcome: 1, ticks: 9000, terminal: [[], ['laser']], laserReleases: [3, 4], laserHits: [2, 1], missilesLaunched: [1, 1], missileHits: [1, 0], repairsFinished: [0, 1],
    laserMisses: [1, 3], layersStripped: [1, 0], missileLosses: [{ planet: 0, asteroid: 0, edge: 0, expired: 0, own: 0, missile: 0 }, { planet: 0, asteroid: 1, edge: 0, expired: 0, own: 0, missile: 0 }],
    planetContacts: [0, 1], asteroidContacts: [2, 0], baits: 1, consoleSwaps: 0, helmEmptyTicks: 0, weaponsEmptyTicks: 10, enemyInArcTicks: 900, weaponsIdleTicks: 30,
    repairsStarted: [0, 1], walkingTicks: [0, 200], repairingTicks: [0, 96], round: 2, seed: 77, baseTick: 30000 };
  const record = { version: 1, session: 'online', role: 'guest', transport: null, seat: 1, helmPlayer: 0, seed: 77, round: 2, startedAtIso: '2026-11-16T12:00:00.000Z',
    summary, latency: { held: latencyFigure([40, 50, 60]), command: latencyFigure([]), rttMs: null }, jitter: arrivalJitter([48, 52, 50]), disconnects: 1, pauses: 2 } as unknown as DuelPlaytestRecord;
  it('is strict and size-capped, and carries no credential fields', () => {
    expect(validateDuelRecord(record)).toEqual(record);
    expect(() => validateDuelRecord({ ...record, joinCode: 'ABCDEFGH' })).toThrow();
    expect(() => validateDuelRecord({ ...record, seatToken: 'x' })).toThrow();
    expect(() => validateDuelRecord({ ...record, round: 3 })).toThrow(/round/);
    expect(new TextEncoder().encode(JSON.stringify(record)).byteLength).toBeLessThan(DUEL_RECORD_MAX_BYTES);
    expect(latencyFigure([10, 20, 30, 40, 1000])).toEqual({ count: 5, median: 30, p95: 1000, max: 1000 });
    expect(arrivalJitter([])).toEqual({ count: 0, stdMs: null });
    // A sample above the schema's hour cap is dropped, never the record (a stale stamp across a reconnect).
    expect(latencyFigure([10, DUEL_RECORD_MAX_MS + 1])).toEqual({ count: 1, median: 10, p95: 10, max: 10 });
    expect(arrivalJitter([50, DUEL_RECORD_MAX_MS + 1])).toEqual({ count: 1, stdMs: 0 });
    expect(validateDuelRecord({ ...record, latency: { ...record.latency, rttMs: 12.5 } }).latency.rttMs).toBe(12.5);   // H-2b's RTC figure fits
  });
  it('main appends each valid record as one line of userData/playtest/duel-YYYY-MM-DD.jsonl, and refuses an invalid one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ftlite-duel-record-'));
    try {
      const now = new Date(2026, 10, 16, 9, 30);
      expect(await appendDuelRecord(dir, record, now)).toBe(true);
      expect(await appendDuelRecord(dir, { ...record, round: 2, summary: { ...summary } }, now)).toBe(true);
      expect(await appendDuelRecord(dir, { ...record, extra: true }, now)).toBe(false);
      const path = duelRecordPath(dir, now);
      expect(path.endsWith(join('playtest', 'duel-2026-11-16.jsonl'))).toBe(true);
      const lines = readFileSync(path, 'utf8').trim().split('\n');
      expect(lines.map((l) => JSON.parse(l).round)).toEqual([2, 2]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("caps the day's file: an append past the cap is refused and writes nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ftlite-duel-record-'));
    try {
      const now = new Date(2026, 10, 16, 9, 30), line = Buffer.byteLength(JSON.stringify(validateDuelRecord(record))) + 1;
      expect(await appendDuelRecord(dir, record, now, 2 * line)).toBe(true);
      expect(await appendDuelRecord(dir, record, now, 2 * line)).toBe(true);
      expect(await appendDuelRecord(dir, record, now, 2 * line)).toBe(false);
      expect(statSync(duelRecordPath(dir, now)).size).toBe(2 * line);
      expect(await appendDuelRecord(dir, record, new Date(2026, 10, 17, 9, 30), 2 * line)).toBe(true);   // a new day starts a new file
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("the duel:record channel answers only its own window's main frame, with exactly one argument", () => {
    const mainFrame = {}, contents = { mainFrame }, own = { sender: contents, senderFrame: mainFrame };
    expect(duelRecordCallAllowed(contents, own, [record])).toBe(true);
    expect(duelRecordCallAllowed(contents, { sender: {}, senderFrame: mainFrame }, [record])).toBe(false);   // a foreign sender
    expect(duelRecordCallAllowed(contents, { sender: contents, senderFrame: {} }, [record])).toBe(false);   // a subframe
    expect(duelRecordCallAllowed(contents, own, [])).toBe(false);
    expect(duelRecordCallAllowed(contents, own, [record, record])).toBe(false);
    expect(duelRecordCallAllowed(null, own, [record])).toBe(false);   // the window is gone
  });
});

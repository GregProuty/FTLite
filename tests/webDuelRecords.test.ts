// The browser's duel playtest log (web build spec §7.4): records go to the IndexedDB store duelRecords, keyed by local
// date, with the same per-record and per-day caps as Electron's files; the log exports as one combined file, oldest first.
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { createIndexedDbDuelRecordStore } from '../src/renderer/src/app/web/duelRecordStore';
import { downloadText } from '../src/renderer/src/app/web/download';
import { createIndexedDbRecordStore } from '../src/network/online/recordStore';
import { DUEL_RECORD_DAY_MAX_BYTES, DUEL_RECORD_MAX_BYTES, duelRecordDay, latencyFigure, validateDuelRecord, type DuelPlaytestRecord } from '../src/renderer/src/net/duelRecord';
import { DUEL_RECORD_FILE_MAX_BYTES, duelRecordPath } from '../src/main/network/duelRecords';

const losses = { planet: 0, asteroid: 0, edge: 0, expired: 0, own: 0, missile: 0 };
function record(round: number): DuelPlaytestRecord {
  return validateDuelRecord({ version: 1, session: 'online', role: 'host', transport: 'loopback', seat: 0, helmPlayer: 0, seed: 77, round, startedAtIso: '2026-11-16T12:00:00.000Z',
    summary: { outcome: 1, ticks: 14400, terminal: [[], ['laser']], laserReleases: [3, 4], laserHits: [2, 1], missilesLaunched: [1, 1], missileHits: [1, 0], repairsFinished: [0, 1],
      laserMisses: [1, 3], layersStripped: [1, 0], missileLosses: [losses, losses], planetContacts: [0, 1], asteroidContacts: [2, 0], baits: 1, consoleSwaps: 0,
      helmEmptyTicks: 0, weaponsEmptyTicks: 10, enemyInArcTicks: 900, weaponsIdleTicks: 30, repairsStarted: [0, 1], walkingTicks: [0, 200], repairingTicks: [0, 96], round, seed: 77, baseTick: 0 },
    latency: { held: latencyFigure([40, 50]), command: latencyFigure([70]), rttMs: 4 }, jitter: { count: 10, stdMs: 3 }, disconnects: 0, pauses: 0 });
}
const line = (r: DuelPlaytestRecord): string => JSON.stringify(r) + '\n';

describe('the duelRecords store', () => {
  it('appends valid records by local day and exports one combined file, oldest day first', async () => {
    const store = createIndexedDbDuelRecordStore(new IDBFactory());
    expect(await store.exportLog()).toBeNull();
    expect(await store.append(record(2), new Date(2026, 10, 17, 9))).toBe(true);
    expect(await store.append(record(0), new Date(2026, 10, 16, 23, 59))).toBe(true);
    expect(await store.append(record(1), new Date(2026, 10, 16, 8))).toBe(true);
    expect(await store.exportLog()).toEqual({ name: 'ftlite-playtest-2026-11-16-to-2026-11-17.jsonl', text: line(record(0)) + line(record(1)) + line(record(2)), days: 2, records: 3 });
  });
  it('refuses an invalid record and a full day, and shares database ftlite with the seat store', async () => {
    const idb = new IDBFactory(), one = new TextEncoder().encode(line(record(0))).byteLength;
    const store = createIndexedDbDuelRecordStore(idb, one * 2), day = new Date(2026, 10, 16, 12);
    expect(await store.append({ ...record(0), seatToken: 'x' }, day)).toBe(false);
    expect(await store.append(record(0), day)).toBe(true); expect(await store.append(record(1), day)).toBe(true);
    expect(await store.append(record(2), day)).toBe(false);   // the day is full
    expect(await store.append(record(2), new Date(2026, 10, 17))).toBe(true);
    const seats = createIndexedDbRecordStore(idb); await seats.put('seat-v1', new Uint8Array([1])); expect(await seats.get('seat-v1')).toEqual(new Uint8Array([1]));
    expect((await store.exportLog())!.records).toBe(3);
  });
  it('uses Electron’s caps: 8 KiB a record, 16 MiB a day, and the same local-date key as the day files', () => {
    expect(DUEL_RECORD_MAX_BYTES).toBe(8192); expect(DUEL_RECORD_DAY_MAX_BYTES).toBe(16 * 1024 * 1024); expect(DUEL_RECORD_FILE_MAX_BYTES).toBe(DUEL_RECORD_DAY_MAX_BYTES);
    expect(duelRecordDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(duelRecordPath('u', new Date(2026, 0, 5)).replace(/\\/g, '/')).toBe('u/playtest/duel-2026-01-05.jsonl');
  });
});

describe('downloadText', () => {
  it('saves through a Blob link and revokes it later', async () => {
    const clicks: { href: string; download: string }[] = [];
    const a = { href: '', download: '', style: { display: '' }, click() { clicks.push({ href: a.href, download: a.download }); }, remove: vi.fn() };
    const doc = { createElement: () => a, body: { append: vi.fn() } }, urls = { createObjectURL: vi.fn(() => 'blob:1'), revokeObjectURL: vi.fn() };
    let later: (() => void) | undefined;
    downloadText(doc as never, urls, 'ftlite-playtest-2026-11-16-to-2026-11-16.jsonl', 'x\n', cb => { later = cb; });
    expect(clicks).toEqual([{ href: 'blob:1', download: 'ftlite-playtest-2026-11-16-to-2026-11-16.jsonl' }]);
    const blob = (urls.createObjectURL.mock.calls[0] as unknown as [Blob])[0]; expect(await blob.text()).toBe('x\n');
    expect(urls.revokeObjectURL).not.toHaveBeenCalled(); later!(); expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:1'); expect(a.remove).toHaveBeenCalled();
  });
});

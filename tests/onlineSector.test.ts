import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { sectorCompatibility, sectorInit, sectorJoinCompatibilities, validateCommittedSectorStart, validateSectorMirror } from '../src/main/network/onlineSector';
import { initialOnlineCheckpoint } from './helpers/onlineCheckpoint';
import type { RoomSnapshot } from '../src/shared/roomSession';
function room(capacity = 4): RoomSnapshot { return { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), joinCode: 'ABCDEFGH', capacity, hostSeatId: 0,
  hostGeneration: 1, rosterRevision: 1, phase: 'lobby', compatibility: sectorCompatibility(capacity), seats: Array.from({ length: capacity }, (_, seatId) =>
    ({ seatId, seatGeneration: seatId === 0 || seatId === capacity - 1 ? 1 : 0, occupied: seatId === 0 || seatId === capacity - 1, connected: seatId === 0 || seatId === capacity - 1, ready: false })) }; }
describe('main sector initialization', () => {
  it('validates exact mode bytes, captured tick, run and full compatibility for a mirror', () => {
    const snapshot = room(), candidate = initialOnlineCheckpoint(sectorInit(snapshot));
    const mirror = { bytes: candidate.bytes, metadata: { version: 1 as const, protocolVersion: 2 as const, roomId: snapshot.roomId, runId: snapshot.runId, compatibility: snapshot.compatibility, hostGeneration: 1, checkpointSequence: 1, capturedTick: 0, payloadSha256: createHash('sha256').update(candidate.bytes).digest('hex') } };
    expect(() => validateSectorMirror(mirror)).not.toThrow();
    for (const metadata of [{ ...mirror.metadata, capturedTick: 1 }, { ...mirror.metadata, runId: 'c'.repeat(32) }, { ...mirror.metadata, compatibility: sectorCompatibility(2) }]) expect(() => validateSectorMirror({ ...mirror, metadata })).toThrow();
  });
  it('uses capacity and baseline content for sparse seats and exposes just two layouts', () => {
    expect(sectorInit(room())).toMatchObject({ layoutId: 'cutter', playerCount: 4, seed: 2026, characters: [0, 1, 2, 3], unlocked: [] });
    expect(sectorInit(room(2))).toMatchObject({ layoutId: 'skiff', playerCount: 2 });
    expect(sectorJoinCompatibilities()).toHaveLength(2);
    expect(() => sectorInit({ ...room(), compatibility: sectorCompatibility(2) })).toThrow();
  });
  it('validates hash, run identity, lease identity and exact baseline init before utility allocation', async () => {
    const snapshot = room(), init = sectorInit(snapshot);
    const commit = (value: unknown) => { const bytes = Buffer.from(JSON.stringify(value)); return { initBase64: bytes.toString('base64'), initHash: createHash('sha256').update(bytes).digest('hex'),
      lease: { roomId: snapshot.roomId, hostGeneration: 1, hostSeatId: 0, nonce: 'c'.repeat(32), expiresAtEpochMs: Date.now() + 12000 } }; };
    await expect(validateCommittedSectorStart(snapshot, commit(init))).resolves.toEqual(init);
    await expect(validateCommittedSectorStart(snapshot, { ...commit(init), initHash: '0'.repeat(64) })).rejects.toThrow();
    await expect(validateCommittedSectorStart(snapshot, commit({ ...init, runId: 'c'.repeat(32) }))).rejects.toThrow();
    await expect(validateCommittedSectorStart(snapshot, commit({ ...init, seed: 1 }))).rejects.toThrow();
    await expect(validateCommittedSectorStart(snapshot, { ...commit(init), lease: { ...commit(init).lease, hostGeneration: 2 } })).rejects.toThrow();
  });
});

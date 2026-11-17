// The duel's main-process online mode (H-2 spec §2): its compatibility (duel schema version 2, the Hound's layout), the
// init a room implies (round 0's seed from the room's runId, the host's Helm choice), the guest's check of a committed
// start (any helmPlayer, every other field its own expected init's), and the mirror check. A test-only seed replaces the
// runId's when the main process was given one (unpackaged builds only, H-2 spec §10's forced round end).
import { createHash } from 'node:crypto';
import { validateDuelCheckpoint, validateDuelInit, type DuelInit } from '../../renderer/src/authority/duelCheckpoint';
import { SIM_VERSION } from '../../renderer/src/sim/tuning';
import { deriveLayout } from '../../renderer/src/sim/ship/derived';
import { nextValidSeed, seedFromRunId } from '../../renderer/src/sim/duel/seeds';
import { DUEL_LAYOUT } from '../../renderer/src/sim/duel/layout';
import { validateInitBase64, validateLeaseGrant, validateRoomSnapshot, type CommittedStart, type RoomCompatibility, type RoomSnapshot } from '../../shared/roomSession';
import type { SessionMirror } from './mirrorStore';
import { onlineFault } from './onlineRetry';

const resolveLayout = (id: string) => { if (id !== DUEL_LAYOUT.id) throw Error('unknown duel layout'); return DUEL_LAYOUT; };
/** The duel mode's schema version (src/network/modes/duel.ts). */
export const DUEL_SCHEMA_VERSION = 2;
export interface DuelChoice { helmPlayer: 0 | 1 }

export function duelCompatibility(): RoomCompatibility {
  return { protocolVersion: 2, modeId: 'duel', schemaVersion: DUEL_SCHEMA_VERSION, simVersion: SIM_VERSION,
    contentDigest: __GAMEPLAY_CONTENT_DIGEST__, layoutHash: deriveLayout(DUEL_LAYOUT).layoutHash };
}
export function duelJoinCompatibilities(): readonly RoomCompatibility[] { return [duelCompatibility()]; }
/** Round 0's seed for a room: the test seed when one was given, else the runId's (spec §2). */
export function duelRoomSeed(runId: string, testSeed?: number): number {
  try { return testSeed === undefined ? seedFromRunId(runId) : nextValidSeed(testSeed); } catch { throw onlineFault('invalid-request'); }
}
export function duelInit(snapshot: RoomSnapshot, choice: DuelChoice = { helmPlayer: 0 }, testSeed?: number): DuelInit {
  if (!validateRoomSnapshot(snapshot)) throw onlineFault('invalid-frame');
  const expected = duelCompatibility();
  if (snapshot.capacity !== 2 || Object.entries(expected).some(([key, value]) => snapshot.compatibility[key as keyof RoomCompatibility] !== value)) throw onlineFault('incompatible');
  if (choice.helmPlayer !== 0 && choice.helmPlayer !== 1) throw onlineFault('invalid-request');
  return validateDuelInit(DUEL_LAYOUT, { runId: snapshot.runId, layoutId: DUEL_LAYOUT.id, layoutHash: expected.layoutHash, simVersion: SIM_VERSION,
    contentDigest: expected.contentDigest, seed: duelRoomSeed(snapshot.runId, testSeed), playerCount: 2, helmPlayer: choice.helmPlayer }, expected.contentDigest);
}
/** The guest cannot know the host's seat choice: either helmPlayer, and every other field equal to its own expected init. */
export async function validateCommittedDuelStart(snapshot: RoomSnapshot, committed: CommittedStart, testSeed?: number): Promise<DuelInit> {
  const expected = duelInit(snapshot, { helmPlayer: 0 }, testSeed), lease = committed.lease;
  if (!validateInitBase64(committed.initBase64) || !validateLeaseGrant(lease) || lease.roomId !== snapshot.roomId
    || lease.hostGeneration !== snapshot.hostGeneration || lease.hostSeatId !== snapshot.hostSeatId) throw onlineFault('invalid-frame');
  const bytes = Buffer.from(committed.initBase64, 'base64');
  if (createHash('sha256').update(bytes).digest('hex') !== committed.initHash) throw onlineFault('hash-mismatch');
  try {
    const value = validateDuelInit(DUEL_LAYOUT, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), expected.contentDigest);
    const wanted = { ...expected, helmPlayer: value.helmPlayer };
    if (Object.keys(value).length !== Object.keys(wanted).length || Object.entries(wanted).some(([key, v]) => JSON.stringify(value[key as keyof DuelInit]) !== JSON.stringify(v))) throw Error();
    return value;
  } catch { throw onlineFault('incompatible'); }
}
export function validateDuelMirror(mirror: SessionMirror): void {
  try {
    const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(mirror.bytes));
    const checkpoint = validateDuelCheckpoint(raw, __GAMEPLAY_CONTENT_DIGEST__, resolveLayout), m = mirror.metadata;
    if (checkpoint.init.runId !== m.runId || checkpoint.snapshot.header.tick !== m.capturedTick
      || Object.entries(duelCompatibility()).some(([k, v]) => m.compatibility[k as keyof RoomCompatibility] !== v)) throw Error();
  } catch { throw onlineFault('save-invalid'); }
}

// The duel's main-process online mode (H-2 spec §2): its compatibility (duel schema version 2, the Hound's layout), the
// init a room implies (round 0's seed from the room's runId, the host's Helm choice, the crew size from the room's capacity (Sci-2 spec §4.5)), the guest's check of a committed
// start (any helmPlayer, every other field its own expected init's), and the mirror check. A test-only seed replaces the
// runId's when the main process was given one (unpackaged builds only, H-2 spec §10's forced round end).
import { sha256Hex } from '../../shared/sha256';
import { base64ToBytes } from '../../shared/bytes';
import { validateDuelCheckpoint, validateDuelInit, type DuelInit } from '../../renderer/src/authority/duelCheckpoint';
import { SIM_VERSION } from '../../renderer/src/sim/tuning';
import { deriveLayout } from '../../renderer/src/sim/ship/derived';
import { nextValidSeed, seedFromRunId } from '../../renderer/src/sim/duel/seeds';
import { DUEL_LAYOUT } from '../../renderer/src/sim/duel/layout';
import { DUEL_CREW_MAX, DUEL_CREW_MIN, type DuelCrew } from '../../renderer/src/sim/duel/state';
import { validateInitBase64, validateLeaseGrant, validateRoomSnapshot, type CommittedStart, type RoomCompatibility, type RoomSnapshot } from '../../shared/roomSession';
import type { SessionMirror } from './mirrorStore';
import { onlineFault } from './onlineRetry';

const resolveLayout = (id: string) => { if (id !== DUEL_LAYOUT.id) throw Error('unknown duel layout'); return DUEL_LAYOUT; };
/** The duel mode's schema version (src/network/modes/duel.ts). */
export const DUEL_SCHEMA_VERSION = 2;
export interface DuelChoice { helmPlayer: number }

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
  const crew = snapshot.capacity;
  if (!Number.isInteger(crew) || crew < DUEL_CREW_MIN || crew > DUEL_CREW_MAX || Object.entries(expected).some(([key, value]) => snapshot.compatibility[key as keyof RoomCompatibility] !== value)) throw onlineFault('incompatible');
  if (!Number.isInteger(choice.helmPlayer) || choice.helmPlayer < 0 || choice.helmPlayer >= crew) throw onlineFault('invalid-request');
  return validateDuelInit(DUEL_LAYOUT, { runId: snapshot.runId, layoutId: DUEL_LAYOUT.id, layoutHash: expected.layoutHash, simVersion: SIM_VERSION,
    contentDigest: expected.contentDigest, seed: duelRoomSeed(snapshot.runId, testSeed), playerCount: crew as DuelCrew, helmPlayer: choice.helmPlayer }, expected.contentDigest);
}
/** The guest cannot know the host's seat choice: either helmPlayer, and every other field equal to its own expected init. */
export async function validateCommittedDuelStart(snapshot: RoomSnapshot, committed: CommittedStart, testSeed?: number): Promise<DuelInit> {
  const expected = duelInit(snapshot, { helmPlayer: 0 }, testSeed), lease = committed.lease;
  if (!validateInitBase64(committed.initBase64) || !validateLeaseGrant(lease) || lease.roomId !== snapshot.roomId
    || lease.hostGeneration !== snapshot.hostGeneration || lease.hostSeatId !== snapshot.hostSeatId) throw onlineFault('invalid-frame');
  const bytes = base64ToBytes(committed.initBase64);
  if (sha256Hex(bytes) !== committed.initHash) throw onlineFault('hash-mismatch');
  try {
    const value = validateDuelInit(DUEL_LAYOUT, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), expected.contentDigest);
    const wanted = { ...expected, helmPlayer: value.helmPlayer };
    if (Object.keys(value).length !== Object.keys(wanted).length || Object.entries(wanted).some(([key, v]) => JSON.stringify(value[key as keyof DuelInit]) !== JSON.stringify(v))) throw Error();
    return value;
  } catch { throw onlineFault('incompatible'); }
}
/** `capacity` (Sci-2 spec §4.5, as validateSectorMirror): the room's crew size, which the mirror's init must carry. */
export function validateDuelMirror(mirror: SessionMirror, capacity?: number): void {
  try {
    const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(mirror.bytes));
    const checkpoint = validateDuelCheckpoint(raw, __GAMEPLAY_CONTENT_DIGEST__, resolveLayout), m = mirror.metadata;
    if (capacity !== undefined && checkpoint.init.playerCount !== capacity || checkpoint.init.runId !== m.runId || checkpoint.snapshot.header.tick !== m.capturedTick
      || Object.entries(duelCompatibility()).some(([k, v]) => m.compatibility[k as keyof RoomCompatibility] !== v)) throw Error();
  } catch { throw onlineFault('save-invalid'); }
}

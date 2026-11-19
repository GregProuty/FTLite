import { sha256Hex } from '../../shared/sha256';
import { base64ToBytes } from '../../shared/bytes';
import { validateRunInit, validateCheckpoint } from '../../renderer/src/authority/checkpoint';
import type { SessionMirror } from './mirrorStore';
import type { RunInit } from '../../renderer/src/net/contracts';
import { DEFAULT_CHARACTERS } from '../../renderer/src/sim/characters';
import { SIM_VERSION } from '../../renderer/src/sim/tuning';
import { deriveLayout } from '../../renderer/src/sim/ship/derived';
import { shipForCrew } from '../../renderer/src/sim/ship/fleet';
import { parseShip } from '../../renderer/src/sim/ship/schema';
import skiff from '../../renderer/src/sim/ship/skiff.json';
import cutter from '../../renderer/src/sim/ship/cutter.json';
import hound from '../../renderer/src/sim/ship/hound.json';
import { validateInitBase64, validateLeaseGrant, validateRoomSnapshot, type CommittedStart, type RoomCompatibility, type RoomSnapshot } from '../../shared/roomSession';
import { onlineFault } from './onlineRetry';

const layouts = { skiff: parseShip(skiff), cutter: parseShip(cutter), hound: parseShip(hound) };
export function validateSectorMirror(mirror: SessionMirror, capacity?: number): void {
  try {
    const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(mirror.bytes));
    const layout = layouts[raw?.init?.layoutId as keyof typeof layouts];
    if (!layout) throw Error();
    const checkpoint = validateCheckpoint(layout, raw, __GAMEPLAY_CONTENT_DIGEST__), m = mirror.metadata;
    const compatibility = sectorCompatibility(checkpoint.init.playerCount);
    if (capacity !== undefined && checkpoint.init.playerCount !== capacity || checkpoint.init.runId !== m.runId || checkpoint.snapshot.header.tick !== m.capturedTick
      || Object.entries(compatibility).some(([k, v]) => m.compatibility[k as keyof RoomCompatibility] !== v)) throw Error();
  } catch { throw onlineFault('save-invalid'); }
}
export function sectorCompatibility(capacity: number): RoomCompatibility {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4) throw onlineFault('invalid-request');
  return { protocolVersion: 2, modeId: 'sector', schemaVersion: 1, simVersion: SIM_VERSION,
    contentDigest: __GAMEPLAY_CONTENT_DIGEST__, layoutHash: deriveLayout(layouts[shipForCrew(capacity)]).layoutHash };
}
/** One compatibility per distinct sector layout across crew sizes 1-4 (one today: the Hound flies at every size). */
export function sectorJoinCompatibilities(): readonly RoomCompatibility[] {
  const byLayout = new Map<string, RoomCompatibility>();
  for (const capacity of [1, 2, 3, 4]) { const c = sectorCompatibility(capacity); if (!byLayout.has(c.layoutHash)) byLayout.set(c.layoutHash, c); }
  return [...byLayout.values()];
}
export function sectorInit(snapshot: RoomSnapshot): RunInit {
  if (!validateRoomSnapshot(snapshot)) throw onlineFault('invalid-frame');
  const expected = sectorCompatibility(snapshot.capacity), layout = layouts[shipForCrew(snapshot.capacity)];
  if (Object.entries(expected).some(([key, value]) => snapshot.compatibility[key as keyof RoomCompatibility] !== value)) throw onlineFault('incompatible');
  return validateRunInit(layout, { runId: snapshot.runId, layoutId: layout.id, layoutHash: expected.layoutHash,
    simVersion: SIM_VERSION, contentDigest: expected.contentDigest, seed: 2026, playerCount: snapshot.capacity,
    characters: [...DEFAULT_CHARACTERS], unlocked: [] }, expected.contentDigest);
}
export async function validateCommittedSectorStart(snapshot: RoomSnapshot, committed: CommittedStart): Promise<RunInit> {
  const expected = sectorInit(snapshot), lease = committed.lease;
  if (!validateInitBase64(committed.initBase64) || !validateLeaseGrant(lease) || lease.roomId !== snapshot.roomId
    || lease.hostGeneration !== snapshot.hostGeneration || lease.hostSeatId !== snapshot.hostSeatId) throw onlineFault('invalid-frame');
  const bytes = base64ToBytes(committed.initBase64);
  if (sha256Hex(bytes) !== committed.initHash) throw onlineFault('hash-mismatch');
  try {
    const value = validateRunInit(layouts[shipForCrew(snapshot.capacity)], JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), expected.contentDigest);
    if (Object.keys(value).length !== Object.keys(expected).length || Object.entries(expected).some(([key, wanted]) => JSON.stringify(value[key as keyof RunInit]) !== JSON.stringify(wanted))) throw Error();
    return value;
  } catch { throw onlineFault('incompatible'); }
}

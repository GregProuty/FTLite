// The main process's online mode adapter (H-2 spec §2): the five operations the online session needs from a mode, so the
// session itself is mode-generic. The sector's are today's onlineSector.ts functions, unchanged; the duel's are
// onlineDuel.ts. A context records its adapter when it is created: the host's from the action, the joiner's from the
// requested mode, a reconnect's from the saved seat's compatibility.
import type { CommittedStart, RoomCompatibility, RoomSnapshot } from '../../shared/roomSession';
import type { OnlineMode } from '../../shared/onlineSession';
import type { SessionMirror } from './mirrorStore';
import { sectorCompatibility, sectorInit, sectorJoinCompatibilities, validateCommittedSectorStart, validateSectorMirror } from './onlineSector';
import { duelCompatibility, duelInit, duelJoinCompatibilities, validateCommittedDuelStart, validateDuelMirror } from './onlineDuel';

export interface OnlineModeAdapter {
  readonly modeId: OnlineMode;
  /** The host's room compatibility (the sector's depends on its capacity). */
  compatibility(capacity: number): RoomCompatibility;
  /** The compatibilities a joiner tries, in order. */
  joinCompatibilities(): readonly RoomCompatibility[];
  /** The init a room implies; throws for a room this mode cannot run. `helmPlayer` is the duel host's seat choice. */
  init(snapshot: RoomSnapshot, choice?: { helmPlayer: 0 | 1 }): unknown;
  validateCommittedStart(snapshot: RoomSnapshot, committed: CommittedStart): Promise<unknown>;
  validateMirror(mirror: SessionMirror, capacity?: number): void;
}

export const sectorOnlineMode: OnlineModeAdapter = {
  modeId: 'sector', compatibility: sectorCompatibility, joinCompatibilities: sectorJoinCompatibilities,
  init: (snapshot) => sectorInit(snapshot), validateCommittedStart: validateCommittedSectorStart, validateMirror: validateSectorMirror
};
/** The duel adapter; `testSeed` (unpackaged test builds only) replaces every room's runId seed. */
export function duelOnlineMode(testSeed?: number): OnlineModeAdapter {
  return {
    modeId: 'duel', compatibility: () => duelCompatibility(), joinCompatibilities: duelJoinCompatibilities,
    init: (snapshot, choice) => duelInit(snapshot, choice, testSeed),
    validateCommittedStart: (snapshot, committed) => validateCommittedDuelStart(snapshot, committed, testSeed),
    validateMirror: (mirror) => validateDuelMirror(mirror)
  };
}
/** The adapter for a room's mode id, or undefined for a mode this build does not run online. */
export function onlineModeFor(modeId: string, testSeed?: number): OnlineModeAdapter | undefined {
  return modeId === 'duel' ? duelOnlineMode(testSeed) : modeId === 'sector' ? sectorOnlineMode : undefined;
}
/** The mirror store's validator: each mirror by its own mode. */
export function validateModeMirror(mirror: SessionMirror, capacity?: number): void {
  const mode = onlineModeFor(mirror.metadata.compatibility.modeId);
  if (!mode) throw Error('unknown mirror mode');
  mode.validateMirror(mirror, capacity);
}

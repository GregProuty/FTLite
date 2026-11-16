import { createAuthority } from '../../src/renderer/src/authority/authority';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import skiff from '../../src/renderer/src/sim/ship/skiff.json';
import cutter from '../../src/renderer/src/sim/ship/cutter.json';
import type { RunInit } from '../../src/renderer/src/net/contracts';
import type { CheckpointCandidate } from '../../src/shared/sessionCheckpoint';
export function initialOnlineCheckpoint(init: RunInit): CheckpointCandidate {
  let candidate!: CheckpointCandidate;
  const authority = createAuthority({ clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, contentDigest: init.contentDigest,
    sessionGate: { check: () => ({ allowed: false, revision: 0, reason: null }) }, resolveLayout: () => parseShip(init.layoutId === 'cutter' ? cutter : skiff), onCrash: record => { throw Error(record.error); },
    onCheckpoint: (checkpoint, cause) => { candidate = { captureId: 1, capturedTick: checkpoint.snapshot.header.tick, controlRevision: checkpoint.controlRevision, cause, bytes: new TextEncoder().encode(JSON.stringify(checkpoint)) }; } });
  try { authority.start(init); return candidate; } finally { authority.dispose(); }
}

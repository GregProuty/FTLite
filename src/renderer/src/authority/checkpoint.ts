import { z } from 'zod';
import { MAX_PLAYERS } from '../../../shared/intent';
import { canonicalFields } from '../sim/canonicalFields';
import { SIM_VERSION } from '../sim/tuning';
import { CHARACTERS } from '../sim/characters';
import { QUIRKS } from '../sim/quirks';
import { deriveLayout } from '../sim/ship/derived';
import type { ShipLayout } from '../sim/ship/schema';
import { validateSnapshot, type Snapshot } from '../sim/snapshot';
import type { RunInit } from '../net/contracts';
import { createLedger } from './ledger';

export type { Checkpoint } from '../net/contracts';
import type { Checkpoint } from '../net/contracts';
const uint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const stamp = z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER);
const text = z.string().min(1).max(128);
export const runInitSchema = z.object({
  runId: text, layoutId: text, layoutHash: text, simVersion: z.literal(SIM_VERSION),
  contentDigest: z.string().regex(/^[0-9a-f]{64}$/), seed: uint.max(0xffffffff),
  playerCount: uint.min(1).max(MAX_PLAYERS), characters: z.array(uint.max(CHARACTERS.length - 1)).max(MAX_PLAYERS),
  unlocked: z.array(text).max(128), quirk: uint.max(QUIRKS.length - 1).optional()
}).strict();
const visit = z.object({ sector: uint.max(65535), beacon: uint.max(65535), arrivalTick: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER) }).strict();
const event = z.object({ visit, eventId: uint.max(65535) }).strict();
const uiSchema = z.object({
  runId: text, players: z.array(z.object({ nextSequence: uint.min(1), heldSequence: uint,
    heldDir: uint.max(4), repeat: uint, lastTick: stamp, botDecisionTick: stamp.optional(), seat: stamp,
    pendingVoteSequence: uint, pendingVoteTick: stamp, pendingVote: z.object({ event, choice: uint.max(65535) }).strict().nullable()
  }).strict()).max(MAX_PLAYERS), stations: z.array(z.object({ rowKey: z.string().max(256).nullable(), page: z.enum(['main', 'upgrades']) }).strict()).max(128),
  groupBar: z.array(z.boolean()).max(128), navigationVisit: visit.nullable()
}).strict();
const checkpointSchema = z.object({
  checkpointVersion: z.literal(2), init: runInitSchema, snapshot: z.unknown(),
  commandHighWater: z.array(uint).min(1).max(MAX_PLAYERS), recentResults: z.array(z.unknown()).max(MAX_PLAYERS * 256),
  admissionTick: stamp, admissionCounts: z.array(uint.max(16)).min(1).max(MAX_PLAYERS),
  eventSequence: uint, publicationSequence: uint, controlRevision: uint, receiveOrder: uint, lifecycleOrdinal: uint,
  botControllers: z.array(uiSchema).max(MAX_PLAYERS), paused: z.boolean(), phase: z.enum(['running', 'paused', 'ended']),
  pauseOwner: uint.max(MAX_PLAYERS - 1).nullable(), pauseReason: text.nullable(), heldHighWater: z.array(uint).min(1).max(MAX_PLAYERS),
  held: z.array(z.object({ moveX: z.number().finite().min(-1).max(1), moveY: z.number().finite().min(-1).max(1), interactHeld: z.boolean(), face: z.boolean().optional(), aim: z.number().int().min(-1).max(255).optional(), gunHeld: z.boolean().optional(),
    throttleHeld: z.number().int().min(-1).max(1).optional(), rcsX: z.number().int().min(-1).max(1).optional(), rcsY: z.number().int().min(-1).max(1).optional() }).strict()).min(1).max(MAX_PLAYERS)   // playtest2feedback §7
}).strict();
export function validateRunInit(layout: ShipLayout, value: unknown, contentDigest: string): RunInit {
  const init = runInitSchema.parse(value);
  if (init.contentDigest !== contentDigest || init.layoutId !== layout.id || init.layoutHash !== deriveLayout(layout).layoutHash) throw new Error('incompatible run');
  return init;
}
/** Validate the entire portable envelope before allocation, scheduling or live mutation. */
export function validateCheckpoint(layout: ShipLayout, value: unknown, contentDigest: string): Checkpoint {
  if ((value as { checkpointVersion?: unknown } | null)?.checkpointVersion !== 2) throw new Error('unsupported checkpoint format');
  const cp = checkpointSchema.parse(value) as Checkpoint;
  cp.init = validateRunInit(layout, cp.init, contentDigest);
  cp.snapshot = validateSnapshot(layout, cp.snapshot, contentDigest);
  const n = cp.init.playerCount;
  const ended = cp.snapshot.values[canonicalFields(layout, n).find(field => field.name === 'ended')!.offset] === 1;
  if (ended !== (cp.phase === 'ended')) throw new Error('inconsistent checkpoint terminal phase');
  if (cp.snapshot.header.playerCount !== n || [cp.commandHighWater, cp.admissionCounts, cp.heldHighWater, cp.held].some(a => a.length !== n) ||
    cp.admissionTick > cp.snapshot.header.tick || cp.paused !== (cp.phase === 'paused') || (cp.pauseOwner !== null && cp.pauseOwner >= n)) throw new Error('inconsistent checkpoint');
  const ledger = createLedger(Array.from({ length: n }, (_, p) => p), n);
  ledger.restore({ commandHighWater: cp.commandHighWater, recentResults: cp.recentResults, admissionTick: cp.admissionTick, admissionCounts: cp.admissionCounts });
  for (const { envelope, result } of cp.recentResults) if (envelope.runId !== cp.init.runId || result.tick > cp.snapshot.header.tick) throw new Error('inconsistent checkpoint cache');
  for (const ui of cp.botControllers) {
    if (ui.runId !== cp.init.runId || ui.players.length !== n || ui.stations.length > layout.stations.length || ui.groupBar.length > layout.consoleGroups.length) throw new Error('invalid bot controller');
    for (const p of ui.players) if (p.seat >= layout.stations.length || p.lastTick > cp.snapshot.header.tick || (p.botDecisionTick ?? -1) > cp.snapshot.header.tick || p.pendingVoteTick > cp.snapshot.header.tick) throw new Error('invalid bot controller');
  }
  return structuredClone(cp);
}

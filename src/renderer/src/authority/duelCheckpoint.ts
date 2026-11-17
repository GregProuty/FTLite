// The duel's init, checkpoint and mode-memory schemas (engine refactor spec §6). The checkpoint is the generic
// authority envelope with the duel's init, the duel snapshot, no bot controllers, and `modeMemory`: the telemetry
// accumulator as its own versioned blob, outside the hash, restored with the duel so a restored duel's end summary
// equals an uninterrupted one's. Everything is validated before any allocation. H-2 spec §7: the init names the Helm
// player, and a checkpoint may be from any round of the run (its seed is that round's), on a decided round's end card
// in a running or paused phase, with the accumulator counting from the round's base tick.
import { z } from 'zod';
import type { Checkpoint } from '../net/contracts';
import { duelCodec } from '../net/codec';
import { deriveLayout } from '../sim/ship/derived';
import type { ShipLayout } from '../sim/ship/schema';
import { DUEL_PLAYERS, duelRoundOf, duelSeedFacts, validateDuelSnapshot, type DuelSnapshot } from '../sim/duel/snapshot';
import { roundSeed } from '../sim/duel/seeds';
import type { DuelTelemetry, MissileLoss } from '../sim/duel/telemetry';
import { TERMINAL_CAUSES } from '../sim/duel/summary';
import { SIM_VERSION } from '../sim/tuning';
import { createLedger } from './ledger';
import type { ResolveLayout } from './rules';

/** `seed` is round 0's; `helmPlayer` is seated at Navigation in every round (H-2 spec §2). */
export interface DuelInit { runId: string; layoutId: string; layoutHash: string; simVersion: number; contentDigest: string; seed: number; playerCount: number; helmPlayer: 0 | 1 }
/** The duel has no bot producers in R-1, so its controller memory is always empty. */
export type DuelControllers = readonly never[];
/** The telemetry accumulator as JSON: its typed arrays as number arrays. */
export interface DuelMemory { version: 1; telemetry: Omit<DuelTelemetry, 'prev'> & { prev: Omit<DuelTelemetry['prev'], 'grace'> & { grace: [number[], number[]] } } }
export type DuelCheckpoint = Checkpoint<DuelInit, DuelControllers, DuelSnapshot> & { modeMemory: DuelMemory };

const uint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const int = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
/** The accumulator's graceUntil copies are restored as Int32Arrays, so they must fit signed 32 bits (Codex plan review F2). */
const int32 = z.number().int().min(-2147483648).max(2147483647);
const num = z.number().finite();
const stamp = z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER);
const text = z.string().min(1).max(128);
const two = <T extends z.ZodTypeAny>(item: T) => z.tuple([item, item]);
export const duelInitSchema = z.object({
  runId: text, layoutId: text, layoutHash: text, simVersion: z.literal(SIM_VERSION),
  contentDigest: z.string().regex(/^[0-9a-f]{64}$/), seed: uint.max(0xffffffff), playerCount: z.literal(DUEL_PLAYERS),
  helmPlayer: z.union([z.literal(0), z.literal(1)])
}).strict();
const causes = z.array(z.enum(TERMINAL_CAUSES)).max(TERMINAL_CAUSES.length)
  .refine((list) => list.every((c, k) => k === 0 || TERMINAL_CAUSES.indexOf(list[k - 1]!) < TERMINAL_CAUSES.indexOf(c)), 'causes out of order or repeated');
const losses: Record<MissileLoss, typeof uint> = { planet: uint, asteroid: uint, edge: uint, expired: uint, own: uint, missile: uint };
const shipTelemetry = z.object({
  laserReleases: uint, laserHits: uint, laserMisses: uint, layersStripped: uint, missilesLaunched: uint,
  missileHitsByRoom: z.tuple([uint, uint, uint]), missileLosses: z.object(losses).strict(), planetContacts: uint, asteroidContacts: uint
}).strict();
const playerTelemetry = z.object({ repairsStarted: uint, repairsFinished: uint, walkingTicks: uint, repairingTicks: uint }).strict();
export const duelMemorySchema = z.object({
  version: z.literal(1),
  telemetry: z.object({
    ticks: uint, outcome: z.number().int().min(0).max(3), ships: two(shipTelemetry), players: two(playerTelemetry),
    baits: uint, consoleSwaps: uint, helmEmptyTicks: uint, weaponsEmptyTicks: uint, enemyInArcTicks: uint, weaponsIdleTicks: uint,
    terminal: two(causes),
    prev: z.object({ counters: two(z.tuple([uint, uint, uint, uint])), grace: two(z.array(int32).max(65_536)), work: two(int), seat: two(int), lastConsole: two(int) }).strict(),
    manoeuvre: z.object({ tick: int, x: num, y: num }).strict()
  }).strict()
}).strict();

export function encodeDuelMemory(t: DuelTelemetry): DuelMemory {
  const copy = structuredClone(t);
  return { version: 1, telemetry: { ...copy, prev: { ...copy.prev, grace: [Array.from(t.prev.grace[0]), Array.from(t.prev.grace[1])] } } };
}
export function decodeDuelMemory(memory: DuelMemory): DuelTelemetry {
  const t = structuredClone(memory.telemetry);
  return { ...t, prev: { ...t.prev, grace: [Int32Array.from(t.prev.grace[0]), Int32Array.from(t.prev.grace[1])] } } as DuelTelemetry;
}

const held = z.object({ moveX: z.number().finite().min(-1).max(1), moveY: z.number().finite().min(-1).max(1), interactHeld: z.boolean() }).strict();
const checkpointSchema = z.object({
  checkpointVersion: z.literal(2), init: z.unknown(), snapshot: z.unknown(),
  commandHighWater: z.array(uint).length(DUEL_PLAYERS), recentResults: z.array(z.unknown()).max(DUEL_PLAYERS * 256),
  admissionTick: stamp, admissionCounts: z.array(uint.max(16)).length(DUEL_PLAYERS),
  eventSequence: uint, publicationSequence: uint, controlRevision: uint, receiveOrder: uint, lifecycleOrdinal: uint,
  botControllers: z.array(z.never()).max(0), paused: z.boolean(), phase: z.enum(['running', 'paused', 'ended']),
  pauseOwner: uint.max(DUEL_PLAYERS - 1).nullable(), pauseReason: text.nullable(), heldHighWater: z.array(uint).length(DUEL_PLAYERS),
  held: z.array(held).length(DUEL_PLAYERS), modeMemory: duelMemorySchema
}).strict();

export function validateDuelInit(layout: ShipLayout, value: unknown, contentDigest: string): DuelInit {
  const init = duelInitSchema.parse(value);
  if (init.contentDigest !== contentDigest || init.layoutId !== layout.id || init.layoutHash !== deriveLayout(layout).layoutHash) throw new Error('incompatible duel');
  if (!duelSeedFacts(init.seed).valid) throw new Error('invalid duel map for this seed');   // from the seed cache (H-2 spec §5)
  return init;
}

/** Validate the whole duel checkpoint envelope before allocation: init, snapshot, ledger cache, phase, memory. */
export function validateDuelCheckpoint(value: unknown, contentDigest: string, resolveLayout: ResolveLayout): DuelCheckpoint {
  if ((value as { checkpointVersion?: unknown } | null)?.checkpointVersion !== 2) throw new Error('unsupported checkpoint format');
  const cp = checkpointSchema.parse(value) as unknown as DuelCheckpoint;
  const layout = resolveLayout((cp.init as { layoutId?: string } | null)?.layoutId as string);
  cp.init = validateDuelInit(layout, cp.init, contentDigest);
  cp.snapshot = validateDuelSnapshot(layout, cp.snapshot, contentDigest);
  const r = duelRoundOf(cp.snapshot), decided = r.outcome !== 0, tick = cp.snapshot.header.tick;
  if (cp.snapshot.header.seed !== roundSeed(cp.init.seed, r.round)) throw new Error('inconsistent duel checkpoint seed');   // the round's seed
  if (r.helmPlayer !== cp.init.helmPlayer) throw new Error('inconsistent duel checkpoint helm player');
  if (cp.phase === 'ended' && !decided) throw new Error('inconsistent checkpoint terminal phase');   // a decided round may be running or paused
  if (cp.admissionTick > tick || cp.paused !== (cp.phase === 'paused')) throw new Error('inconsistent checkpoint');
  const ledger = createLedger([0, 1], DUEL_PLAYERS, duelCodec);
  ledger.restore({ commandHighWater: cp.commandHighWater, recentResults: cp.recentResults, admissionTick: cp.admissionTick, admissionCounts: cp.admissionCounts });
  for (const { envelope, result } of cp.recentResults) if (envelope.runId !== cp.init.runId || result.tick > tick) throw new Error('inconsistent checkpoint cache');
  const t = cp.modeMemory.telemetry, bodies = duelSeedFacts(cp.snapshot.header.seed).graceLength;   // the round map's bodies plus the other ship slots
  if (t.prev.grace.some((g) => g.length !== bodies) || t.ticks !== (decided ? r.decidedTick : tick) - r.baseTick) throw new Error('inconsistent duel telemetry');
  // The accumulator's outcome is the snapshot's, and only a decided round has terminal causes.
  if (t.outcome !== r.outcome || (t.outcome === 0 && t.terminal.some((c) => c.length > 0))) throw new Error('inconsistent duel telemetry');
  return structuredClone(cp);
}

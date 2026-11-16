// Portable replays for any mode (engine refactor spec §6). A replay records its `mode`; absent means 'sector', so
// every V2/V3/V4 file recorded before R-1 parses unchanged. The mode's rules supply the checkpoint, snapshot and
// command validators. parseReplay and runReplay are the sector instances, kept for their callers.
import { z } from 'zod';
import { MAX_PLAYERS } from '../../../shared/intent';
import type { ShipLayout } from '../sim/ship/schema';
import type { CommandEnvelope, CommandResult } from '../net/contracts';
import type { SimState } from '../sim/state';
import { replayDataEqual, type Replay, type ReplayFrame } from '../sim/replay';
import { createEncounterCore } from './core';
import type { EncounterRules, EncounterTypes, ResolveLayout } from './rules';
import { sectorRules, type SectorTypes } from './sectorRules';
import { duelRules } from './duelRules';
export type { Replay, ReplayV2, ReplayV3, ReplayV4, ReplayFrame } from '../sim/replay';
const uint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const players = z.array(uint.max(MAX_PLAYERS - 1)).max(MAX_PLAYERS).refine(a => new Set(a).size === a.length);
const held = z.object({ moveX: z.number().finite().min(-1).max(1), moveY: z.number().finite().min(-1).max(1), interactHeld: z.boolean() }).strict();
const action = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('admission'), entries: z.array(z.object({ binding: uint.min(1), players, order: uint.min(1), message: z.unknown(), admissionPolicy: z.literal('receive-time').optional(), effectiveTick: uint.optional() }).strict()).min(1).max(1024) }).strict(),
  z.object({ kind: z.literal('lifecycle'), order: uint.min(1), ordinal: uint.min(1), control: z.object({ paused: z.boolean(), reason: z.string().min(1).max(128) }).strict() }).strict(),
  z.object({ kind: z.literal('controls'), processedCount: uint.optional(), fenced: z.literal(true).optional() }).strict(),
  z.object({ kind: z.literal('tick'), input: z.object({ held: z.array(held).min(1).max(MAX_PLAYERS), commands: z.array(z.unknown()).max(256) }).strict(), heldSequences: z.array(uint).min(1).max(MAX_PLAYERS) }).strict(),
  z.object({ kind: z.literal('detach'), binding: uint.min(1), players }).strict(),
  z.object({ kind: z.literal('watchdog'), players: players.refine(p => p.length > 0) }).strict(),
  z.object({ kind: z.literal('cursor'), receiveOrder: uint }).strict(),
  z.object({ kind: z.literal('publish') }).strict(), z.object({ kind: z.literal('seal'), discardLifecycleResumes: z.literal(true).optional() }).strict()
]);
const frameSchema = z.object({ tick: uint, eventSequenceBefore: uint, action, results: z.array(z.unknown()).max(1024), events: z.array(z.object({ eventSequence: uint.min(1), tick: uint, kind: z.enum(['cue', 'pause', 'ended']) }).strict()).max(256),
  after: z.object({ tick: uint, hash: z.string().regex(/^[0-9a-f]{8}$/), phase: z.enum(['running', 'paused', 'ended', 'error']), eventSequence: uint, publicationSequence: uint, controlRevision: uint }).strict().optional()
}).strict();
/** Full validation occurs before constructing a simulation. No numeric-button fallback. */
export function parseReplay(layout: ShipLayout, value: unknown, contentDigest: string): Replay {
  return parseEncounterReplay(sectorRules, value, contentDigest, () => layout);
}
/** The mode a replay names: its `mode` field, or 'sector' when the field is absent. */
export function replayMode(value: unknown): string {
  const mode = (value as { mode?: unknown } | null)?.mode;
  return mode === undefined ? 'sector' : typeof mode === 'string' ? mode : '';
}
export function parseEncounterReplay<T extends EncounterTypes>(rules: EncounterRules<T>, value: unknown, contentDigest: string, resolveLayout: ResolveLayout): Replay<T> {
  const version = (value as { version?: unknown } | null)?.version;
  if (version !== 2 && version !== 3 && version !== 4) throw new Error('unsupported replay format (expected 2, 3 or 4)');
  if (replayMode(value) !== rules.modeId) throw new Error('replay mode does not match');
  const parsed = z.object({ version: z.union([z.literal(2), z.literal(3), z.literal(4)]), mode: z.string().min(1).max(64).optional(), init: z.unknown(), initial: z.unknown(), checkpoint: z.unknown(), frames: z.array(frameSchema).max(1_000_000) }).strict().parse(value);
  const { decodeMessage, encodeMessage } = rules.commandCodec();
  const checkpoint = rules.validateCheckpoint(parsed.checkpoint, contentDigest, resolveLayout);
  if (!replayDataEqual(parsed.init, checkpoint.init) || !replayDataEqual(parsed.initial, checkpoint.snapshot)) throw new Error('inconsistent replay baseline');
  let expectedTick = checkpoint.snapshot.header.tick;
  for (const frame of parsed.frames) {
    if (frame.tick !== expectedTick) throw new Error('invalid replay tick');
    frame.results = frame.results.map(result => {
      const decoded = decodeMessage(encodeMessage({ kind: 'result', runId: checkpoint.init.runId, result: result as CommandResult }));
      if (decoded.kind !== 'result') throw new Error('invalid replay result');
      if (version === 2 && decoded.result.admission !== undefined) throw new Error('v3 result in v2 replay');
      return decoded.result;
    });
    if (frame.action.kind === 'admission') for (const entry of frame.action.entries) {
      if (version === 2 && (entry.admissionPolicy !== undefined || entry.effectiveTick !== undefined)) throw new Error('v3 admission in v2 replay');
      if ((entry.admissionPolicy !== undefined) !== (entry.effectiveTick !== undefined) || (entry.effectiveTick !== undefined && entry.effectiveTick !== frame.tick)) throw new Error('invalid replay effective tick');
      const message = decodeMessage(encodeMessage(entry.message as Parameters<typeof encodeMessage>[0]));
      if (message.kind !== 'held' && message.kind !== 'command') throw new Error('replay contains nonsemantic message');
      entry.message = message;
      if (entry.players.some(p => p >= checkpoint.init.playerCount)) throw new Error('invalid replay player');
    }
    if (frame.action.kind === 'detach' && frame.action.players.some(p => p >= checkpoint.init.playerCount)) throw new Error('invalid replay detach');
    if (frame.action.kind === 'controls' && ((frame.action.processedCount !== undefined) !== (frame.action.fenced === true)
      || version !== 4 && frame.action.fenced)) throw Error('invalid replay control fence');
    if (frame.action.kind === 'seal' && frame.action.discardLifecycleResumes && version !== 4) throw Error('invalid replay fence seal');
    if (frame.action.kind === 'watchdog' && (version === 2 || frame.action.players.some(p => p >= checkpoint.init.playerCount))) throw new Error('invalid replay watchdog');
    if (frame.action.kind === 'tick') {
      expectedTick++;
      if (frame.action.input.held.length !== checkpoint.init.playerCount || frame.action.heldSequences.length !== checkpoint.init.playerCount) throw new Error('invalid replay held shape');
      frame.action.input.commands = frame.action.input.commands.map(envelope => {
        const message = decodeMessage(encodeMessage({ kind: 'command', envelope: envelope as CommandEnvelope }));
        if (message.kind !== 'command') throw new Error('invalid replay command');
        return message.envelope;
      });
    }
    if (frame.after && frame.after.tick !== expectedTick) throw new Error('invalid replay completion tick');
  }
  return { version: parsed.version, ...(parsed.mode !== undefined ? { mode: parsed.mode } : {}), init: checkpoint.init, initial: checkpoint.snapshot, checkpoint, frames: parsed.frames as ReplayFrame[] };
}
export interface ReplayOptions {
  /** Default false: avoid retaining a second journal for long replay runs. */
  retainFrames?: boolean;
  /** Default true; false lets onFrame/observe sample without accumulating traces. */
  retainTrace?: boolean;
  onFrame?(frame: Readonly<ReplayFrame>): void;
}
/** Runs the live admission/phase executor directly; no wall-clock debt or producer callbacks. */
export function runReplay(layout: ShipLayout, value: unknown, contentDigest: string, observe?: (state: SimState, frame: Readonly<ReplayFrame>) => void, options: ReplayOptions = {}) {
  return runEncounterReplay<SectorTypes>(sectorRules, value, contentDigest, () => layout, observe, options);
}
/** Every mode a replay may name, by mode id. */
const REPLAY_RULES: Readonly<Record<string, EncounterRules<EncounterTypes>>> = { sector: sectorRules as unknown as EncounterRules<EncounterTypes>, duel: duelRules as unknown as EncounterRules<EncounterTypes> };
/** Run a replay of any mode: its `mode` field (absent: sector) selects the rules. */
export function runModeReplay(value: unknown, contentDigest: string, resolveLayout: ResolveLayout, options: ReplayOptions = {}) {
  const rules = REPLAY_RULES[replayMode(value)];
  if (!rules) throw new Error('unknown replay mode');
  return runEncounterReplay(rules, value, contentDigest, resolveLayout, undefined, options);
}
export function runEncounterReplay<T extends EncounterTypes>(rules: EncounterRules<T>, value: unknown, contentDigest: string, resolveLayout: ResolveLayout, observe?: (state: T['state'], frame: Readonly<ReplayFrame>) => void, options: ReplayOptions = {}) {
  const replay = parseEncounterReplay(rules, value, contentDigest, resolveLayout);
  const state = rules.restore(replay.initial, resolveLayout, replay.checkpoint.modeMemory);
  const core = createEncounterCore(rules, { init: replay.init, contentDigest, resolveLayout, clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash(record) { throw new Error(record.error); } }, state, replay.checkpoint);
  const results: CommandResult[] = [], frames = [], hashes: string[] = [], events = [];
  try {
    for (const frame of replay.frames) {
      const actual = core.replayFrame(frame);
      if (frame.after && !replayDataEqual(actual.after, frame.after)) throw new Error(`replay outcome divergence at tick ${frame.tick}`);
      if (frame.after && !replayDataEqual(actual.results, frame.results)) throw new Error(`replay result divergence at tick ${frame.tick}`);
      if (frame.after && !replayDataEqual(actual.events, frame.events)) throw new Error(`replay event divergence at tick ${frame.tick}`);
      if (options.retainFrames) frames.push(actual);
      if (options.retainTrace !== false) {
        results.push(...actual.results); events.push(...actual.events);
        if (frame.action.kind === 'tick' && actual.after) hashes.push(actual.after.hash);
      }
      options.onFrame?.(actual);
      if (frame.action.kind === 'tick') observe?.(state, actual);
    }
    return { checkpoint: core.captureCheckpoint(), results, events, hashes, frames };
  } finally { core.dispose(); }
}

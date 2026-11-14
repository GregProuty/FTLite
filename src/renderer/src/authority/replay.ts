import { z } from 'zod';
import { MAX_PLAYERS } from '../../../shared/intent';
import type { ShipLayout } from '../sim/ship/schema';
import { loadSnapshot } from '../sim/snapshot';
import { decodeMessage, encodeMessage } from '../net/codec';
import type { CommandEnvelope, CommandResult } from '../net/contracts';
import type { SimState } from '../sim/state';
import { replayDataEqual, type ReplayV2, type ReplayFrame } from '../sim/replay';
import { validateCheckpoint } from './checkpoint';
import { createAuthorityCore } from './core';
export type { ReplayV2, ReplayFrame } from '../sim/replay';
const uint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const players = z.array(uint.max(MAX_PLAYERS - 1)).max(MAX_PLAYERS).refine(a => new Set(a).size === a.length);
const held = z.object({ moveX: z.number().finite().min(-1).max(1), moveY: z.number().finite().min(-1).max(1), interactHeld: z.boolean() }).strict();
const action = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('admission'), entries: z.array(z.object({ binding: uint.min(1), players, order: uint.min(1), message: z.unknown() }).strict()).min(1).max(1024) }).strict(),
  z.object({ kind: z.literal('lifecycle'), order: uint.min(1), ordinal: uint.min(1), control: z.object({ paused: z.boolean(), reason: z.string().min(1).max(128) }).strict() }).strict(),
  z.object({ kind: z.literal('controls') }).strict(),
  z.object({ kind: z.literal('tick'), input: z.object({ held: z.array(held).min(1).max(MAX_PLAYERS), commands: z.array(z.unknown()).max(256) }).strict(), heldSequences: z.array(uint).min(1).max(MAX_PLAYERS) }).strict(),
  z.object({ kind: z.literal('detach'), binding: uint.min(1), players }).strict(),
  z.object({ kind: z.literal('cursor'), receiveOrder: uint }).strict(),
  z.object({ kind: z.literal('publish') }).strict(), z.object({ kind: z.literal('seal') }).strict()
]);
const frameSchema = z.object({ tick: uint, eventSequenceBefore: uint, action, results: z.array(z.unknown()).max(1024), events: z.array(z.object({ eventSequence: uint.min(1), tick: uint, kind: z.enum(['cue', 'pause', 'ended']) }).strict()).max(256),
  after: z.object({ tick: uint, hash: z.string().regex(/^[0-9a-f]{8}$/), phase: z.enum(['running', 'paused', 'ended', 'error']), eventSequence: uint, publicationSequence: uint, controlRevision: uint }).strict().optional()
}).strict();
/** Full validation occurs before constructing a simulation. No numeric-button fallback. */
export function parseReplay(layout: ShipLayout, value: unknown, contentDigest: string): ReplayV2 {
  if ((value as { version?: unknown } | null)?.version !== 2) throw new Error('unsupported replay format (expected 2)');
  const parsed = z.object({ version: z.literal(2), init: z.unknown(), initial: z.unknown(), checkpoint: z.unknown(), frames: z.array(frameSchema).max(1_000_000) }).strict().parse(value);
  const checkpoint = validateCheckpoint(layout, parsed.checkpoint, contentDigest);
  if (!replayDataEqual(parsed.init, checkpoint.init) || !replayDataEqual(parsed.initial, checkpoint.snapshot)) throw new Error('inconsistent replay baseline');
  let expectedTick = checkpoint.snapshot.header.tick;
  for (const frame of parsed.frames) {
    if (frame.tick !== expectedTick) throw new Error('invalid replay tick');
    frame.results = frame.results.map(result => {
      const decoded = decodeMessage(encodeMessage({ kind: 'result', runId: checkpoint.init.runId, result: result as CommandResult }));
      if (decoded.kind !== 'result') throw new Error('invalid replay result');
      return decoded.result;
    });
    if (frame.action.kind === 'admission') for (const entry of frame.action.entries) {
      const message = decodeMessage(encodeMessage(entry.message as Parameters<typeof encodeMessage>[0]));
      if (message.kind !== 'held' && message.kind !== 'command') throw new Error('replay contains nonsemantic message');
      entry.message = message;
      if (entry.players.some(p => p >= checkpoint.init.playerCount)) throw new Error('invalid replay player');
    }
    if (frame.action.kind === 'detach' && frame.action.players.some(p => p >= checkpoint.init.playerCount)) throw new Error('invalid replay detach');
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
  return { version: 2, init: checkpoint.init, initial: checkpoint.snapshot, checkpoint, frames: parsed.frames as ReplayFrame[] };
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
  const replay = parseReplay(layout, value, contentDigest);
  const state = loadSnapshot(layout, replay.initial, contentDigest);
  const core = createAuthorityCore({ init: replay.init, contentDigest, resolveLayout: () => layout, clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash(record) { throw new Error(record.error); } }, state, replay.checkpoint);
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

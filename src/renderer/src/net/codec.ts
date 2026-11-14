import { z } from 'zod';
import { COMMAND_REASONS } from './contracts';
import type { AuthorityMessage, ClientMessage } from './contracts';

// Bounds are wire resource limits. Layout/catalog membership remains execution validation.
export const MAX_MESSAGE_BYTES = 65_536;
export const MAX_INDEX = 65_535;
// Validate homogeneous numeric storage in one bounded pass instead of allocating a
// Zod effects context for every scalar. Both endpoints still validate every value.
const finiteValues = z.custom<number[]>((value) => {
  if (!Array.isArray(value) || value.length > MAX_MESSAGE_BYTES) return false;
  for (const n of value) if (typeof n !== 'number' || !Number.isFinite(n)) return false;
  return true;
}, 'invalid snapshot values')
  .transform((values) => values.map((n) => n === 0 ? 0 : n));
const uint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const index = z.number().int().min(0).max(MAX_INDEX);
const player = z.number().int().min(0).max(3);
const text = z.string().min(1).max(128);
const axis = z.number().finite().min(-1).max(1).transform((n) => n === 0 ? 0 : n);
const id = z.object({ player, sequence: positive }).strict();
const held = z.object({ moveX: axis, moveY: axis, interactHeld: z.boolean() }).strict();
const frame = z.object({ runId: text, player, tick: uint, sequence: positive, held }).strict();
const visit = z.object({ sector: index, beacon: index, arrivalTick: uint }).strict();
const target = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('object'), stableId: positive }).strict(),
  z.object({ kind: z.literal('enemy'), stableId: positive, room: index }).strict()
]);
const weapon = z.object({ selector: index, expectedWeaponId: index }).strict();
const eventRef = z.object({ visit, eventId: index }).strict();
const jump = z.object({ visit, requestedAtTick: uint, destination: index }).strict();
export const commandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('moveTo'), tile: index }).strict(),
  z.object({ kind: z.literal('sit'), station: index }).strict(),
  z.object({ kind: z.literal('stand') }).strict(),
  z.object({ kind: z.literal('toggleDoorLocal'), edge: index }).strict(),
  z.object({ kind: z.literal('doorCycle'), station: index, edge: index, mode: z.enum(['cycle', 'seal']) }).strict(),
  z.object({ kind: z.literal('airlockToggle'), station: index, airlock: index }).strict(),
  z.object({ kind: z.literal('power'), station: index, target: index, delta: z.union([z.literal(-1), z.literal(1)]) }).strict(),
  z.object({ kind: z.literal('coolant'), station: index, target: index }).strict(),
  z.object({ kind: z.literal('buyUpgrade'), station: index, system: index, expectedLevel: index }).strict(),
  z.object({ kind: z.literal('buyReactor'), station: index, expectedBonus: index }).strict(),
  z.object({ kind: z.literal('selectWeapon'), station: index, weapon }).strict(),
  z.object({ kind: z.literal('selectTarget'), station: index, target: target.nullable() }).strict(),
  z.object({ kind: z.literal('fire'), station: index, weapon, target }).strict(),
  z.object({ kind: z.literal('swapCargo'), station: index, slot: index, expectedCargo: index, expectedEquipped: index }).strict(),
  z.object({ kind: z.literal('scan'), station: index, target }).strict(),
  z.object({ kind: z.literal('systemScan'), station: index, visit }).strict(),
  z.object({ kind: z.literal('lockFrequency'), station: index, enemyId: positive }).strict(),
  z.object({ kind: z.literal('vote'), event: eventRef, choice: index }).strict(),
  z.object({ kind: z.literal('jumpAgree'), pending: jump }).strict(),
  z.object({ kind: z.literal('buy'), station: index, visit, item: index, expectedOffer: index }).strict(),
  z.object({ kind: z.literal('jump'), station: index, visit, destination: index }).strict(),
  z.object({ kind: z.literal('sectorJump'), station: index, visit }).strict(),
  z.object({ kind: z.literal('wait'), station: index, visit }).strict(),
  z.object({ kind: z.literal('evade'), station: index }).strict(),
  z.object({ kind: z.literal('tab'), group: index, station: index }).strict(),
  z.object({ kind: z.literal('setPaused'), paused: z.boolean() }).strict()
]);
const envelope = z.object({ runId: text, id, requestedTick: uint, command: commandSchema }).strict();
const legacyInput = held.extend({ interactPressed: z.boolean(), confirmPressed: z.boolean(), cancelPressed: z.boolean() }).strict();
const result = z.object({ id, tick: uint, status: z.enum(['applied', 'noop', 'rejected', 'already-processed']), reason: z.enum(COMMAND_REASONS).optional() }).strict();
const u32 = z.number().int().min(0).max(4_294_967_295);
const snapshot = z.object({
  header: z.object({
    formatVersion: positive, simVersion: positive, tick: uint,
    rngStates: z.object({ hazards: u32, director: u32, combat: u32, loot: u32, cosmetic: u32, map: u32, quirk: u32 }).strict(),
    layoutId: text, layoutHash: text, playerCount: z.number().int().min(1).max(4), manifest: z.array(text).min(1).max(128)
  }).strict(),
  values: finiteValues
}).strict();
const stringList = z.array(text).max(128);
const seconds = z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER);
const recordMap = z.record(text, seconds).refine((r) => Object.keys(r).length <= 128, 'too many entries');
const lifeEvent = z.object({ who: text, seconds }).strict().nullable();
const telemetry = z.object({
  version: z.literal(1), simVersion: positive, seed: u32, playerCount: z.number().int().min(1).max(4), characters: z.array(text).min(1).max(4),
  endReason: z.enum(['hull', 'crew', 'victory', 'running']), durationSeconds: seconds, firstDown: lifeEvent, firstDeath: lifeEvent,
  stationsNeverManned: stringList, mannedSeconds: recordMap, longestIdleSeconds: z.array(seconds).max(4),
  spawns: z.object({ fire: uint, breach: uint, power: uint, debris: uint }).strict(),
  impacts: uint, evadeRolls: uint, evasions: uint, shots: uint, hits: uint,
  repairs: z.object({ fire: uint, breach: uint, power: uint }).strict(), maxStress: seconds,
  phaseEntries: z.object({ buildUp: uint, sustainPeak: uint, peakFade: uint, relax: uint }).strict(),
  enemy: z.object({ met: uint, destroyed: uint, disables: uint, fled: uint, surrenders: uint, shieldHits: uint }).strict(),
  boarders: z.object({ parties: uint, killed: uint, vented: uint }).strict(),
  run: z.object({ nodesReached: uint, jumps: uint, columns: uint, scrap: z.object({ earned: uint, spent: uint }).strict(),
    events: uint, purchases: uint, upgrades: z.record(text, index).refine((r) => Object.keys(r).length <= 128, 'too many upgrades'),
    reactorBonus: index, quirk: text, unlocks: stringList }).strict(),
  teamwork: z.object({ lockedShots: uint, teamSeconds: seconds, revives: uint, timedEvades: uint, votesUnanimous: uint, votesSplit: uint }).strict(),
  score: seconds, skills: z.array(z.array(index).max(128)).max(4)
}).strict();
const payload = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cue'), cue: z.enum(['alarm', 'impact', 'shot', 'hit', 'ready', 'jump', 'upgrade', 'victory', 'defeat', 'callout']) }).strict(),
  z.object({ kind: z.literal('callout'), player, text: z.string().min(1).max(256), station: index.nullable() }).strict(),
  z.object({ kind: z.literal('pause'), paused: z.boolean(), owner: player.nullable(), reason: text }).strict(),
  z.object({ kind: z.literal('ended'), record: telemetry }).strict()
]);
const state = z.object({
  runId: text, tick: uint, publicationSequence: positive, snapshot, hash: text, phase: z.enum(['running', 'paused', 'ended', 'error']),
  pauseOwner: player.nullable(), controlRevision: uint, commandHighWater: z.array(uint).min(1).max(4), eventSequence: uint
}).strict();
const authorityEvent = z.object({ runId: text, eventSequence: positive, tick: uint, payload }).strict();
const messageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('held'), frame }).strict(),
  z.object({ kind: z.literal('command'), envelope }).strict(),
  z.object({ kind: z.literal('callout'), runId: text, player, sequence: positive, calloutKind: z.literal('contextual') }).strict(),
  z.object({ kind: z.literal('legacyCardInput'), runId: text, id, requestedTick: uint, input: legacyInput }).strict(),
  z.object({ kind: z.literal('state'), state }).strict(),
  z.object({ kind: z.literal('result'), runId: text, result }).strict(),
  z.object({ kind: z.literal('event'), event: authorityEvent }).strict()
]);
export function encodeMessage(message: ClientMessage | AuthorityMessage): Uint8Array {
  const validated = messageSchema.parse(message);
  const bytes = new TextEncoder().encode(JSON.stringify(validated));
  if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new Error('message exceeds byte limit');
  return bytes;
}
export function decodeMessage(bytes: Uint8Array): ClientMessage | AuthorityMessage {
  if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new Error('message exceeds byte limit');
  return messageSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}
export interface LatestMessageMetadata { key: string; sequence: number }
/** Framing policy lives above transport; sequences were stamped by the producer. */
export function latestMessageMetadata(bytes: Uint8Array): LatestMessageMetadata | null {
  if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new Error('message exceeds byte limit');
  // Transport only needs stream identity; the receiving codec validates the payload.
  const message: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!message || typeof message !== 'object') return null;
  const tagged = message as { kind?: unknown; frame?: unknown; state?: unknown };
  const value = tagged.kind === 'held' ? tagged.frame : tagged.kind === 'state' ? tagged.state : null;
  if (!value || typeof value !== 'object') return null;
  const data = value as { runId?: unknown; player?: unknown; sequence?: unknown; publicationSequence?: unknown };
  if (typeof data.runId !== 'string' || data.runId.length < 1 || data.runId.length > 128) return null;
  const sequence = tagged.kind === 'held' ? data.sequence : data.publicationSequence;
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 1) return null;
  if (tagged.kind === 'held') {
    if (typeof data.player !== 'number' || !Number.isInteger(data.player) || data.player < 0 || data.player > 3) return null;
    return { key: `held:${data.runId}:${data.player}`, sequence };
  }
  if (tagged.kind === 'state') return { key: `state:${data.runId}`, sequence };
  return null;
}

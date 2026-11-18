import { MAX_PLAYERS } from '../../../shared/intent';
import { z } from 'zod';
import { COMMAND_REASONS } from './contracts';
import type { AuthorityMessage, ClientMessage, PublishedState } from './contracts';
import type { Snapshot } from '../sim/snapshot';
import type { DuelSnapshot } from '../sim/duel/snapshot';
import { MISSILE_LOSSES, TERMINAL_CAUSES } from '../sim/duel/summary';

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
/** The wire primitives every mode's command and snapshot-header schemas are built from. */
function primitives(playerLimit: number) {
  return {
    uint: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    positive: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    index: z.number().int().min(0).max(MAX_INDEX),
    player: z.number().int().min(0).max(playerLimit - 1),
    text: z.string().min(1).max(128),
    u32: z.number().int().min(0).max(4_294_967_295),
    playerCount: z.number().int().min(1).max(playerLimit)
  };
}
type Primitives = ReturnType<typeof primitives>;
type CommandOption = z.ZodDiscriminatedUnionOption<'kind'>;
/** The schemas every mode's end record may build on (today the sector's telemetry record). */
interface SharedSchemas { telemetry: z.ZodTypeAny }
/** What one mode adds to the shared message schema: its command kinds, its snapshot header and its end record. The
 *  header schema is tied to the mode's snapshot type S, so pairing a mode's wire with another mode's snapshot type
 *  does not compile (tests/codecModeWire.test.ts). */
export interface ModeWire<S extends { header: unknown }> {
  commands(p: Primitives): [CommandOption, ...CommandOption[]];
  snapshotHeader(p: Primitives): z.ZodType<S['header'], z.ZodTypeDef, unknown>;
  /** The `ended` event's record, tagged `{ mode, record }`: each codec admits only its own mode's record. */
  endRecord(p: Primitives, shared: SharedSchemas): z.ZodTypeAny;
  /** The mode's own authority event payloads, appended to the shared payload union (H-2 spec §4: the duel's `round`). */
  events(p: Primitives, shared: SharedSchemas): CommandOption[];
}
export const sectorWire: ModeWire<Snapshot> = {
  commands({ uint, positive, index }) {
    const visit = z.object({ sector: index, beacon: index, arrivalTick: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER) }).strict();
    const target = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('object'), stableId: positive }).strict(),
      z.object({ kind: z.literal('enemy'), stableId: positive, room: index }).strict()
    ]);
    const weapon = z.object({ selector: index, expectedWeaponId: index }).strict();
    const eventRef = z.object({ visit, eventId: index }).strict();
    const jump = z.object({ visit, requestedAtTick: uint, destination: index }).strict();
    return [
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
    ];
  },
  snapshotHeader({ uint, positive, text, u32, playerCount }) {
    return z.object({
      formatVersion: positive, simVersion: positive, contentDigest: z.string().regex(/^[0-9a-f]{64}$/), tick: uint,
      rngStates: z.object({ hazards: u32, director: u32, combat: u32, loot: u32, cosmetic: u32, map: u32, quirk: u32 }).strict(),
      layoutId: text, layoutHash: text, playerCount, manifest: z.array(text).min(1).max(128)
    }).strict();
  },
  endRecord: (_p, { telemetry }) => z.object({ mode: z.literal('sector'), record: telemetry }).strict(),
  events: () => []
};
/** The duel's summary and round record (sim/duel/summary.ts), the fields of each in order. */
function duelSummaryShape({ uint }: Primitives) {
  const pair = z.tuple([uint, uint]);
  const causes = z.array(z.enum(TERMINAL_CAUSES)).max(TERMINAL_CAUSES.length)
    .refine((list) => list.every((c, k) => k === 0 || TERMINAL_CAUSES.indexOf(list[k - 1]!) < TERMINAL_CAUSES.indexOf(c)), 'terminal causes out of order or repeated');
  const losses = z.object(Object.fromEntries(MISSILE_LOSSES.map((k) => [k, uint])) as Record<(typeof MISSILE_LOSSES)[number], typeof uint>).strict();
  return { outcome: z.number().int().min(0).max(3), ticks: uint, terminal: z.tuple([causes, causes]),
    laserReleases: pair, laserHits: pair, missilesLaunched: pair, missileHits: pair, repairsFinished: pair,
    laserMisses: pair, layersStripped: pair, missileLosses: z.tuple([losses, losses]), planetContacts: pair, asteroidContacts: pair,
    baits: uint, consoleSwaps: uint, helmEmptyTicks: uint, weaponsEmptyTicks: uint, enemyInArcTicks: uint, weaponsIdleTicks: uint,
    repairsStarted: pair, walkingTicks: pair, repairingTicks: pair };
}
/** The duel's wire (engine refactor spec §6): its own command kinds plus the core's setPaused, and the duel snapshot
 *  header (sim/duel/snapshot.ts). H-2 adds `rematch` and the `round` event; Artemis-ii adds `throttle`. */
export const duelWire: ModeWire<DuelSnapshot> = {
  commands({ index }) {
    return [
      z.object({ kind: z.literal('sit'), station: index }).strict(),
      z.object({ kind: z.literal('stand') }).strict(),
      z.object({ kind: z.literal('presence'), present: z.boolean() }).strict(),
      // FTL targeting spec §2: a weapon's target Room, or −1 to clear it.
      z.object({ kind: z.literal('laserLock'), room: z.number().int().min(-1).max(MAX_INDEX) }).strict(),
      z.object({ kind: z.literal('torpLock'), room: z.number().int().min(-1).max(MAX_INDEX) }).strict(),
      z.object({ kind: z.literal('laserCharge'), held: z.boolean() }).strict(),
      z.object({ kind: z.literal('missileLaunch') }).strict(),
      z.object({ kind: z.literal('throttle'), level: z.number().finite() }).strict(),
      z.object({ kind: z.literal('contactScan'), contact: z.number().int() }).strict(),
      z.object({ kind: z.literal('designate'), contact: z.number().int() }).strict(),
      z.object({ kind: z.literal('laserFrequency'), freq: z.number().int() }).strict(),
      z.object({ kind: z.literal('rematch') }).strict(),
      z.object({ kind: z.literal('setPaused'), paused: z.boolean() }).strict()
    ];
  },
  snapshotHeader({ uint, positive, text, u32, playerCount }) {
    return z.object({
      snapshotFormat: z.literal(1), simVersion: positive, contentDigest: z.string().regex(/^[0-9a-f]{64}$/), tick: uint, playerCount,
      layoutId: text, layoutHash: text, seed: u32, mapHash: z.string().regex(/^[0-9a-f]{8}$/), hash: z.string().regex(/^[0-9a-f]{8}$/)
    }).strict();
  },
  /** The frozen end summary (sim/duel/summary.ts). Never null: an ended duel always carries its summary. */
  endRecord(p) {
    return z.object({ mode: z.literal('duel'), record: z.object(duelSummaryShape(p)).strict() }).strict();
  },
  /** A decided round's record: the summary plus its round, seed and base tick (H-2 spec §7). */
  events(p) {
    return [z.object({ kind: z.literal('round'), record: z.object({ ...duelSummaryShape(p), round: p.uint, seed: p.u32, baseTick: p.uint }).strict() }).strict()];
  }
};
function messageSchemaFor<S extends { header: unknown }>(playerLimit: number, wire: ModeWire<S>) {
const prims = primitives(playerLimit);
const { uint, positive, index, player, text, u32 } = prims;
const axis = z.number().finite().min(-1).max(1).transform((n) => n === 0 ? 0 : n);
const id = z.object({ player, sequence: positive }).strict();
const held = z.object({ moveX: axis, moveY: axis, interactHeld: z.boolean(), face: z.boolean().optional() }).strict();   // face: Feel-i's auto-face
const frame = z.object({ runId: text, player, tick: uint, sequence: positive, held }).strict();
const commandSchema = z.discriminatedUnion('kind', wire.commands(prims));
const envelope = z.object({ runId: text, id, requestedTick: uint, command: commandSchema }).strict();
const result = z.object({ id, tick: uint, status: z.enum(['applied', 'noop', 'rejected', 'already-processed']), reason: z.enum(COMMAND_REASONS).optional(),
  admission: z.object({ expectedSequence: positive, disposition: z.enum(['terminal', 'retryable']) }).strict().optional()
}).strict();
const snapshot = z.object({ header: wire.snapshotHeader(prims), values: finiteValues }).strict();
const stringList = z.array(text).max(128);
const seconds = z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER);
const recordMap = z.record(text, seconds).refine((r) => Object.keys(r).length <= 128, 'too many entries');
const lifeEvent = z.object({ who: text, seconds }).strict().nullable();
const telemetry = z.object({
  version: z.literal(1), simVersion: positive, seed: u32, playerCount: z.number().int().min(1).max(playerLimit), characters: z.array(text).min(1).max(playerLimit),
  endReason: z.enum(['hull', 'crew', 'victory', 'running']), durationSeconds: seconds, firstDown: lifeEvent, firstDeath: lifeEvent,
  stationsNeverManned: stringList, mannedSeconds: recordMap, longestIdleSeconds: z.array(seconds).max(playerLimit),
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
  score: seconds, skills: z.array(z.array(index).max(128)).max(playerLimit)
}).strict();
const payload = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cue'), cue: z.enum(['alarm', 'impact', 'shot', 'hit', 'ready', 'jump', 'upgrade', 'victory', 'defeat', 'callout']) }).strict(),
  z.object({ kind: z.literal('callout'), player, text: z.string().min(1).max(256), station: index.nullable() }).strict(),
  z.object({ kind: z.literal('pause'), paused: z.boolean(), owner: player.nullable(), reason: text }).strict(),
  z.object({ kind: z.literal('ended'), record: wire.endRecord(prims, { telemetry }) }).strict(),
  ...wire.events(prims, { telemetry })
]);
const state = z.object({
  runId: text, tick: uint, publicationSequence: positive, snapshot, hash: text, phase: z.enum(['running', 'paused', 'ended', 'error']),
  pauseOwner: player.nullable(), controlRevision: uint, pauseReason: text.nullable(), lagTicks: uint, tickTimeMs: seconds.nullable(),
  commandHighWater: z.array(uint).min(1).max(playerLimit), heldHighWater: z.array(uint).min(1).max(playerLimit), auxiliaryHighWater: z.array(uint).min(1).max(playerLimit), eventSequence: uint
}).strict().refine((value) => [value.commandHighWater, value.heldHighWater, value.auxiliaryHighWater]
  .every((water) => water.length === (value as { snapshot: { header: { playerCount: number } } }).snapshot.header.playerCount), 'publication watermarks must cover every player');
const authorityEvent = z.object({ runId: text, eventSequence: positive, tick: uint, payload }).strict();
const messageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('held'), frame }).strict(),
  z.object({ kind: z.literal('command'), envelope }).strict(),
  z.object({ kind: z.literal('callout'), runId: text, player, sequence: positive, calloutKind: z.literal('contextual') }).strict(),
  z.object({ kind: z.literal('state'), state }).strict(),
  z.object({ kind: z.literal('result'), runId: text, result }).strict(),
  z.object({ kind: z.literal('event'), event: authorityEvent }).strict()
]);
return { messageSchema, commandSchema, publicationSchema: state };
}
/** One mode's byte codec for every message on a link: held frames, command envelopes, results, events and states. */
export interface MessageCodec<S = Snapshot> {
  encodeMessage(message: ClientMessage | AuthorityMessage<S>): Uint8Array;
  decodeMessage(bytes: Uint8Array): ClientMessage | AuthorityMessage<S>;
}
/** A mode's codec factory, by player limit (engine refactor spec §6: the ledger takes the mode's command codec). */
export type CommandCodec<S = Snapshot> = (playerLimit?: number) => MessageCodec<S>;
export function codecFor<S extends { header: unknown }>(wire: ModeWire<S>): CommandCodec<S> {
  return (playerLimit = MAX_PLAYERS) => {
    if (!Number.isInteger(playerLimit) || playerLimit < 1 || playerLimit > 256) throw new Error('invalid player limit');
    const { messageSchema } = messageSchemaFor(playerLimit, wire);
    return {
      encodeMessage(message) {
        const bytes = new TextEncoder().encode(JSON.stringify(messageSchema.parse(message)));
        if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new Error('message exceeds byte limit');
        return bytes;
      },
      decodeMessage(bytes) {
        if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new Error('message exceeds byte limit');
        // The one cast: the parsed value is the wire contract (net/contracts.ts), but its type is zod's inference
        // from the schemas (with the ZodTypeAny parts, the telemetry and end records, as any), which TypeScript cannot
        // prove equal to ClientMessage | AuthorityMessage<S>. The header is pinned to S by ModeWire<S>; the rest is
        // held to the contracts by the codec tests.
        return messageSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))) as ClientMessage | AuthorityMessage<S>;
      }
    };
  };
}
/** The sector's codec; createMessageCodec and the module-level encodeMessage/decodeMessage are this codec. */
export const sectorCodec: CommandCodec<Snapshot> = codecFor<Snapshot>(sectorWire);
export function createMessageCodec(playerLimit = MAX_PLAYERS): MessageCodec<Snapshot> { return sectorCodec(playerLimit); }
/** The duel's codec: duel command kinds only, the duel snapshot header, and the same results and events. */
export const duelCodec: CommandCodec<DuelSnapshot> = codecFor<DuelSnapshot>(duelWire);
/** Object validation of a duel publication, as validatePublication is for the sector. */
export const duelPublicationSchema = messageSchemaFor(2, duelWire).publicationSchema;
export const commandSchema = messageSchemaFor(MAX_PLAYERS, sectorWire).commandSchema;
/** Object transport validation, independent of the unchanged local byte ceiling. */
export const publicationSchema = messageSchemaFor(MAX_PLAYERS, sectorWire).publicationSchema;
export function validatePublication(value: unknown): PublishedState { return publicationSchema.parse(value) as PublishedState; }
export const { encodeMessage, decodeMessage } = createMessageCodec();
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
    if (typeof data.player !== 'number' || !Number.isInteger(data.player) || data.player < 0 || data.player >= MAX_PLAYERS) return null;
    return { key: `held:${data.runId}:${data.player}`, sequence };
  }
  if (tagged.kind === 'state') return { key: `state:${data.runId}`, sequence };
  return null;
}

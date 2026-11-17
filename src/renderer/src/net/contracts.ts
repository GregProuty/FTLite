import type { Snapshot } from '../sim/snapshot';
import type { TelemetryRecord } from '../sim/telemetry';
import type { DuelEndSummary, DuelRoundRecord } from '../sim/duel/summary';

export type PeerId = string;
export type RunId = string;
export type PlayerId = number; // bounded by the configured player limit, never an ECS entity ID
export type StationId = number;
export type ChannelKind = 'reliable-ordered' | 'unreliable-latest';
export type Unsubscribe = () => void;
export interface TransportCaps { unreliable: boolean; maxDatagram: number; hidesPeerIp: boolean; p2p: boolean }
export interface LinkStats { rttMs: number; lossPct: number; relayed: boolean; bufferedBytes: number }
export interface Link {
  readonly peer: PeerId;
  readonly caps: TransportCaps;
  send(kind: ChannelKind, bytes: Uint8Array): void;
  onMessage(cb: (kind: ChannelKind, bytes: Uint8Array) => void): Unsubscribe;
  onClose(cb: (reason: string) => void): Unsubscribe;
  stats(): LinkStats;
  close(reason: string): void;
}
export interface HostOpts { protocolVersion: number; contentDigest: string }
export interface Compatibility extends HostOpts { simVersion: number }
export interface Session {
  readonly links: readonly Link[];
  host(opts: HostOpts): Promise<{ joinCode: string }>;
  join(code: string, seatToken?: string): Promise<void>;
  onLink(cb: (link: Link) => void): Unsubscribe;
  onLinkLost(cb: (peer: PeerId) => void): Unsubscribe;
  close(reason: string): void;
}
export interface HeldInput { moveX: number; moveY: number; interactHeld: boolean }
export interface HeldFrame { runId: RunId; player: PlayerId; tick: number; sequence: number; held: HeldInput }
export interface LifecyclePause { paused: boolean; reason: string }
export interface CommandId { player: PlayerId; sequence: number }
export type TargetRef = { kind: 'object'; stableId: number } | { kind: 'enemy'; stableId: number; room: number };
export interface VisitRef { sector: number; beacon: number; arrivalTick: number }
export interface EventRef { visit: VisitRef; eventId: number }
export interface JumpRef { visit: VisitRef; requestedAtTick: number; destination: number }
export interface WeaponRef { selector: number; expectedWeaponId: number }
/** The sector's commands. `sit` and `stand` are shared with the duel. */
export type SectorCommand =
  | { kind: 'moveTo'; tile: number }
  | { kind: 'sit'; station: StationId }
  | { kind: 'stand' }
  | { kind: 'toggleDoorLocal'; edge: number }
  | { kind: 'doorCycle'; station: StationId; edge: number; mode: 'cycle' | 'seal' }
  | { kind: 'airlockToggle'; station: StationId; airlock: number }
  | { kind: 'power'; station: StationId; target: StationId; delta: -1 | 1 }
  | { kind: 'coolant'; station: StationId; target: StationId }
  | { kind: 'buyUpgrade'; station: StationId; system: number; expectedLevel: number }
  | { kind: 'buyReactor'; station: StationId; expectedBonus: number }
  | { kind: 'selectWeapon'; station: StationId; weapon: WeaponRef }
  | { kind: 'selectTarget'; station: StationId; target: TargetRef | null }
  | { kind: 'fire'; station: StationId; weapon: WeaponRef; target: TargetRef }
  | { kind: 'swapCargo'; station: StationId; slot: number; expectedCargo: number; expectedEquipped: number }
  | { kind: 'scan'; station: StationId; target: TargetRef }
  | { kind: 'systemScan'; station: StationId; visit: VisitRef }
  | { kind: 'lockFrequency'; station: StationId; enemyId: number }
  | { kind: 'vote'; event: EventRef; choice: number }
  | { kind: 'jumpAgree'; pending: JumpRef }
  | { kind: 'buy'; station: StationId; visit: VisitRef; item: number; expectedOffer: number }
  | { kind: 'jump'; station: StationId; visit: VisitRef; destination: number }
  | { kind: 'sectorJump'; station: StationId; visit: VisitRef }
  | { kind: 'wait'; station: StationId; visit: VisitRef }
  | { kind: 'evade'; station: StationId }
  | { kind: 'tab'; group: number; station: StationId }
  | { kind: 'setPaused'; paused: boolean };
/** The duel's commands (Helm demo spec §13). Each mode's codec admits only its own kinds (net/codec.ts). */
export type DuelCommand =
  | { kind: 'sit'; station: StationId }
  | { kind: 'stand' }
  | { kind: 'presence'; present: boolean }
  | { kind: 'laserLock'; room: number }
  | { kind: 'laserCharge'; held: boolean }
  | { kind: 'missileLaunch' }
  /** On a decided round's end card: start the next round (H-2 spec §7). */
  | { kind: 'rematch' }
  | { kind: 'setPaused'; paused: boolean };
/** The one command union (engine refactor spec §6): every mode's kinds; `setPaused` is the core's control. */
export type Command = SectorCommand | DuelCommand;
export interface CommandEnvelope<C extends Command = Command> { runId: RunId; id: CommandId; requestedTick: number; command: C }
/** The shared base reasons, then the duel's (spec §6: the enum is closed, so every module's reasons join it). H-2 adds
 *  the round module's two: a rematch while the round runs, and a round command on a decided round's end card. */
export const COMMAND_REASONS = [
  'wrong-run', 'unowned', 'malformed', 'expected-sequence', 'stale-tick', 'over-capacity',
  'invalid-seat', 'stale-target', 'unavailable', 'unsupported', 'conflicting-duplicate',
  'not-in-duel', 'not-at-weapons', 'missile-in-flight', 'duel-running', 'duel-decided'
] as const;
export type CommandReason = typeof COMMAND_REASONS[number];
/** The one result type for every mode. `already-processed` comes only from the ledger; `admission` is wire-only
 *  receive-time metadata (commandOutbox.ts) and never enters the ledger's result cache. */
export interface CommandResult {
  id: CommandId; tick: number; status: 'applied' | 'noop' | 'rejected' | 'already-processed'; reason?: CommandReason;
  admission?: { expectedSequence: number; disposition: 'terminal' | 'retryable' };
}
export type Admission = { status: 'queued' } | { status: 'duplicate' | 'rejected'; result: CommandResult };
export type ClientAuxMessage = { kind: 'callout'; runId: RunId; player: PlayerId; sequence: number; calloutKind: 'contextual' };
// Data-only event cue names shared with pure derivation.
export type Cue = 'alarm' | 'impact' | 'shot' | 'hit' | 'ready' | 'jump' | 'upgrade' | 'victory' | 'defeat' | 'callout';
/** The authority's end record, tagged on the wrapper by mode (spec §6). The sector record is unchanged; the duel's
 *  is its frozen end summary, always present once the duel has ended. Each mode's codec admits only its own record. */
export type EndRecord = { mode: 'sector'; record: TelemetryRecord } | { mode: 'duel'; record: DuelEndSummary };
export interface AuthorityEvent {
  runId: RunId; eventSequence: number; tick: number;
  payload:
    | { kind: 'cue'; cue: Cue }
    | { kind: 'callout'; player: PlayerId; text: string; station: number | null }
    | { kind: 'pause'; paused: boolean; owner: PlayerId | null; reason: string }
    | { kind: 'ended'; record: EndRecord }
    /** A duel round was decided (H-2 spec §7); only the duel codec admits it. */
    | { kind: 'round'; record: DuelRoundRecord };
}
export interface PublishedState<S = Snapshot> {
  runId: RunId; tick: number; publicationSequence: number; snapshot: S; hash: string;
  phase: 'running' | 'paused' | 'ended' | 'error'; pauseOwner: PlayerId | null; controlRevision: number;
  pauseReason: string | null; lagTicks: number; tickTimeMs: number | null;
  // Highest admitted per-player IDs; zero means no input in that stream yet.
  commandHighWater: readonly number[]; heldHighWater: readonly number[]; auxiliaryHighWater: readonly number[]; eventSequence: number;
}
export type ClientMessage = { kind: 'held'; frame: HeldFrame } | { kind: 'command'; envelope: CommandEnvelope } | ClientAuxMessage;
export type AuthorityMessage<S = Snapshot> =
  | { kind: 'state'; state: PublishedState<S> }
  | { kind: 'result'; runId: RunId; result: CommandResult }
  | { kind: 'event'; event: AuthorityEvent };
export interface RunInit {
  runId: RunId; layoutId: string; layoutHash: string; simVersion: number; contentDigest: string; seed: number;
  playerCount: number; characters: readonly number[]; unlocked: readonly string[]; quirk?: number;
}
export interface MonotonicClock { nowMs(): number }
export interface Scheduler { schedule(delayMs: number, cb: () => void): Unsubscribe }

/** Durable authority envelope; no auxiliary request or presentation history. Generic over the mode's init, producer
 *  memory and snapshot; the defaults are the sector's. `modeMemory` is present only for a mode that keeps memory
 *  outside the hash (the duel's telemetry), so a sector checkpoint is unchanged. */
export interface Checkpoint<Init = RunInit, CM = import('../clientControl/cardController').CardUiState[], S = Snapshot> {
  checkpointVersion: 2; init: Init; snapshot: S;
  commandHighWater: number[];
  recentResults: { envelope: CommandEnvelope; result: CommandResult }[];
  admissionTick: number; admissionCounts: number[];
  eventSequence: number; publicationSequence: number; controlRevision: number;
  receiveOrder: number; lifecycleOrdinal: number;
  botControllers: CM; paused: boolean;
  phase: PublishedState['phase']; pauseOwner: number | null; pauseReason: string | null;
  heldHighWater: number[]; held: HeldInput[];
  modeMemory?: unknown;
}

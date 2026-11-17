// The generic authority's rules contract (engine refactor spec §6). The authority core runs any encounter through one
// of these: it never imports a sim. Every call the core used to make into sector code goes through a hook here.
import type { AuthorityEvent, Checkpoint, CommandResult, Cue, EndRecord, HeldInput, CommandEnvelope } from '../net/contracts';
import type { CommandCodec } from '../net/codec';
import type { ShipLayout } from '../sim/ship/schema';

export type ResolveLayout = (id: string) => ShipLayout;
/** What the core reads from any init: the run id that every envelope, event and result carries. */
export interface EncounterInit { runId: string; seed: number; playerCount: number; layoutId: string }
/** What the core reads from any snapshot: the tick and player count in its header, and the canonical values it hashes. */
export interface EncounterSnapshot { header: { tick: number; playerCount: number; simVersion: number; contentDigest: string }; values: number[] }
/** One tick's frozen input: every player's held axes and the admitted commands, in admission order. */
export interface FrozenTickInput { held: readonly HeldInput[]; commands: readonly CommandEnvelope[] }
export interface Callout { text: string; station: number | null }
export interface Terminal { ended: boolean; endRecord: EndRecord | null }

/** The type family of one encounter kind. */
export interface EncounterTypes {
  state: unknown;
  init: EncounterInit;
  /** Opaque per-mode producer memory saved in the checkpoint's botControllers field (sector: CardUiState[]). */
  controllers: unknown;
  snapshot: EncounterSnapshot;
  /** What the cue detector compares across a tick. */
  cueBaseline: unknown;
}
export type CheckpointOf<T extends EncounterTypes> = Checkpoint<T['init'], T['controllers'], T['snapshot']>;

export interface EncounterRules<T extends EncounterTypes> {
  /** The mode this rule set belongs to; replays of any mode but 'sector' record it. */
  readonly modeId: string;
  /** Validate an init for this content digest before anything is allocated (decision 2: the spec's list had no init validator). */
  validateInit(value: unknown, contentDigest: string, resolveLayout: ResolveLayout): T['init'];
  create(init: T['init'], resolveLayout: ResolveLayout): T['state'];
  dispose(state: T['state']): void;
  assertLive(state: T['state']): void;
  playerCount(state: T['state']): number;
  tick(state: T['state']): number;
  step(state: T['state'], input: FrozenTickInput): readonly CommandResult[];
  /** Whether the encounter has ended, and its end record when it has. The init is passed because the sector record
   *  needs the run seed, which the sector state does not hold (decision 3). */
  terminal(state: T['state'], init: T['init']): Terminal;
  /** Changes whenever a safe-point checkpoint should be captured (sector: the visit). */
  safePointKey(state: T['state']): string;
  /** The contextual callout for a player, or null when none may be shown (sector: a dead crew member). */
  callouts(state: T['state'], player: number): Callout | null;
  /** The cue baseline after a tick (decision 4: the spec's cues(prev, state) needs a baseline to start from). */
  cueBaseline(state: T['state']): T['cueBaseline'];
  cues(prev: T['cueBaseline'], state: T['state']): Cue[];
  /** Mode events a tick produced beyond its cues, against the same baseline (H-2 spec §7: the duel's `round` record on
   *  the tick a round is decided). The core emits each, in order, after the tick's cues. */
  records?(prev: T['cueBaseline'], state: T['state']): AuthorityEvent['payload'][];
  snapshot(state: T['state'], contentDigest: string): T['snapshot'];
  /** Construct a live state from a validated snapshot. `memory` is the checkpoint's modeMemory blob, when the mode has one. */
  restore(snapshot: T['snapshot'], resolveLayout: ResolveLayout, memory?: unknown): T['state'];
  hash(state: T['state']): string;
  validateCheckpoint(value: unknown, contentDigest: string, resolveLayout: ResolveLayout): CheckpointOf<T>;
  /** The mode's message codec: the ledger and the core validate every envelope, result and publication with it. */
  commandCodec: CommandCodec<T['snapshot']>;
  /** Producer memory before any producer has run (sector: no bot controllers). */
  initialControllers(): T['controllers'];
  /** Mode memory saved in the checkpoint next to botControllers, outside the hash (the duel's telemetry). */
  memory?(state: T['state']): unknown;
}

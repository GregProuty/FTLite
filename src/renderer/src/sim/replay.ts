import type { ClientMessage, CommandResult, HeldInput, LifecyclePause, PublishedState, RunInit } from '../net/contracts';
import type { Snapshot } from './snapshot';
import type { Checkpoint } from '../net/contracts';
import type { TickInput } from './commands';
/** The type family a replay is generic over (authority/rules.ts EncounterTypes); the default is the sector's. */
export interface ReplayTypes { init: unknown; controllers: unknown; snapshot: unknown }
export interface SectorReplayTypes { init: RunInit; controllers: Checkpoint['botControllers']; snapshot: Snapshot }
import type { AdmissionPolicy } from '../net/receivePolicy';
export type ReplayAdmission = { binding: number; players: number[]; order: number; message: Exclude<ClientMessage, { kind: 'callout' }>; admissionPolicy?: AdmissionPolicy; effectiveTick?: number };
export type ReplayAction =
  | { kind: 'admission'; entries: ReplayAdmission[] }
  | { kind: 'lifecycle'; order: number; ordinal: number; control: LifecyclePause }
  | { kind: 'controls'; processedCount?: number; fenced?: true }
  | { kind: 'tick'; input: TickInput; heldSequences: number[] }
  | { kind: 'detach'; binding: number; players: number[] }
  | { kind: 'watchdog'; players: number[] }
  | { kind: 'publish' }
  | { kind: 'seal'; discardLifecycleResumes?: true }
  | { kind: 'cursor'; receiveOrder: number };
export interface ReplayOutcome {
  tick: number; hash: string; phase: PublishedState['phase']; eventSequence: number;
  publicationSequence: number; controlRevision: number;
}
export interface ReplayFrame {
  tick: number; eventSequenceBefore: number; action: ReplayAction;
  results: CommandResult[]; events: { eventSequence: number; tick: number; kind: 'cue' | 'pause' | 'ended' | 'round' }[]; after?: ReplayOutcome;
}
/** Portable semantic replay. Auxiliary requests/presentation payloads are deliberately absent. `mode` names the
 *  encounter's mode; it is absent for the sector, so every V2/V3/V4 file recorded before R-1 parses unchanged. */
export interface ReplayV2<T extends ReplayTypes = SectorReplayTypes> { version: 2; mode?: string; init: T['init']; initial: T['snapshot']; checkpoint: Checkpoint<T['init'], T['controllers'], T['snapshot']>; frames: ReplayFrame[] }
export interface ReplayV3<T extends ReplayTypes = SectorReplayTypes> extends Omit<ReplayV2<T>, 'version'> { version: 3 }
/** V4 can record a permission fence inside a partially processed control drain. */
export interface ReplayV4<T extends ReplayTypes = SectorReplayTypes> extends Omit<ReplayV2<T>, 'version'> { version: 4 }
export type Replay<T extends ReplayTypes = SectorReplayTypes> = ReplayV2<T> | ReplayV3<T> | ReplayV4<T>;
export type { HeldInput };

/** Property insertion order is not part of portable JSON semantics. */
export function replayDataEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a).sort(), right = Object.keys(b).sort();
  return left.length === right.length && left.every((key, i) => key === right[i] && replayDataEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

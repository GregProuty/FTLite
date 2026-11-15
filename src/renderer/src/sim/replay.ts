import type { ClientMessage, CommandResult, HeldInput, LifecyclePause, PublishedState, RunInit } from '../net/contracts';
import type { Snapshot } from './snapshot';
import type { Checkpoint } from '../net/contracts';
import type { TickInput } from './commands';
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
  results: CommandResult[]; events: { eventSequence: number; tick: number; kind: 'cue' | 'pause' | 'ended' }[]; after?: ReplayOutcome;
}
/** Portable semantic replay. Auxiliary requests/presentation payloads are deliberately absent. */
export interface ReplayV2 { version: 2; init: RunInit; initial: Snapshot; checkpoint: Checkpoint; frames: ReplayFrame[] }
export interface ReplayV3 extends Omit<ReplayV2, 'version'> { version: 3 }
/** V4 can record a permission fence inside a partially processed control drain. */
export interface ReplayV4 extends Omit<ReplayV2, 'version'> { version: 4 }
export type Replay = ReplayV2 | ReplayV3 | ReplayV4;
export type { HeldInput };

/** Property insertion order is not part of portable JSON semantics. */
export function replayDataEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a).sort(), right = Object.keys(b).sort();
  return left.length === right.length && left.every((key, i) => key === right[i] && replayDataEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

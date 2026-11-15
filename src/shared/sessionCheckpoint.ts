import { boundedHostBytes, positiveSafeInteger } from './netSession';

export type CaptureCause = 'initial' | 'periodic' | 'pause' | 'safe-point' | 'paused-control' | 'exit';
export interface ModeCheckpoint { capturedTick: number; controlRevision: number; cause: CaptureCause; bytes: Uint8Array }
export interface CheckpointCandidate extends ModeCheckpoint { captureId: number }
const urgency: readonly CaptureCause[] = ['exit', 'initial', 'pause', 'safe-point', 'paused-control', 'periodic'];
export function isCaptureCause(value: unknown): value is CaptureCause { return urgency.includes(value as CaptureCause); }
export function urgentCapture(a: CaptureCause | undefined, b: CaptureCause): CaptureCause {
  return a !== undefined && urgency.indexOf(a) < urgency.indexOf(b) ? a : b;
}
export function isModeCheckpoint(value: unknown): value is ModeCheckpoint {
  if (!value || typeof value !== 'object') return false;
  const c = value as ModeCheckpoint;
  return Number.isSafeInteger(c.capturedTick) && c.capturedTick >= 0 && Number.isSafeInteger(c.controlRevision)
    && c.controlRevision >= 0 && isCaptureCause(c.cause) && boundedHostBytes(c.bytes);
}
export function isCheckpointCandidate(value: unknown): value is CheckpointCandidate {
  return isModeCheckpoint(value) && positiveSafeInteger((value as CheckpointCandidate).captureId)
    && Object.keys(value).every(k => ['capturedTick', 'controlRevision', 'cause', 'bytes', 'captureId'].includes(k));
}
export function copyCheckpoint<T extends ModeCheckpoint>(candidate: T): T { return { ...candidate, bytes: new Uint8Array(candidate.bytes) }; }

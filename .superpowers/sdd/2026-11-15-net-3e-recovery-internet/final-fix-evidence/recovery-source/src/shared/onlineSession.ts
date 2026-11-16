import { SERVICE_ERROR_RETRYABLE, isRoomId, validateCompatibility, validateRoomSnapshot, validateCheckpointMetadata, type SessionCheckpointMetadata, type RoomCompatibility, type RoomSnapshot, type ServiceErrorCode } from './roomSession';
import { rtcKeys, rtcRecord } from './rtcSession';

/** Fixed public outcomes only. Provider messages and credential material stay in main. */
export const ONLINE_ERROR_CODES = [
  ...Object.keys(SERVICE_ERROR_RETRYABLE) as ServiceErrorCode[],
  'online-disabled', 'invalid-action', 'invalid-status', 'invalid-port', 'busy', 'cancelled',
  'storage-invalid', 'storage-read-failed', 'storage-write-failed', 'storage-clear-failed',
  'transport-lost', 'host-lost', 'suspended', 'clock-discontinuity', 'retry-exhausted',
  'save-unavailable', 'save-invalid', 'save-too-large',
] as const;
export type OnlineErrorCode = typeof ONLINE_ERROR_CODES[number];
export function isOnlineErrorCode(value: unknown): value is OnlineErrorCode {
  return typeof value === 'string' && (ONLINE_ERROR_CODES as readonly string[]).includes(value);
}
export type OnlineAction =
  | { type: 'host'; capacity: number }
  | { type: 'join'; code: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'remove-seat'; seatId: number }
  | { type: 'view-state'; epoch: number; phase: 'synced' | 'running' | 'paused' | 'ended' }
  | { type: 'reconnect' }
  | { type: 'rehost' }
  | { type: 'start' }
  | { type: 'retry' }
  | { type: 'leave' }
  | { type: 'forget-seat' };
export type OnlinePhase = 'idle' | 'creating' | 'joining' | 'lobby' | 'connecting' | 'syncing' | 'running' | 'paused' | 'reconnecting' | 'saved' | 'saving' | 'rehosting' | 'ended' | 'error';
export interface MirrorStatus {
  committed: SessionCheckpointMetadata | null; receivedAgeMs: number | null; localPending: boolean; persistent: boolean; error: OnlineErrorCode | null;
}
export interface OnlineStatus {
  mirror: MirrorStatus;
  phase: OnlinePhase;
  role: 'host' | 'guest' | null;
  ownSeat: number | null;
  snapshot: RoomSnapshot | null;
  attachmentEpoch: number;
  error: OnlineErrorCode | null;
  /** Epoch deadline for display only; retry enforcement remains main-process monotonic. */
  retryAtMs: number | null;
  persistent: boolean;
  actions: readonly OnlineAction['type'][];
}
export interface OnlinePortDescriptor {
  epoch: number; runId: string; hostGeneration: number; seatId: number; compatibility: RoomCompatibility;
}
export type OnlineResult = { ok: true } | { ok: false; code: OnlineErrorCode };

const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const natural = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const seatId = (value: unknown): value is number => natural(value) && value < 4;
/** Element validators skip holes and extra properties; only dense index keys may cross IPC. */
function hasOnlyArrayIndices(value: readonly unknown[]): boolean {
  const keys = Object.keys(value);
  return keys.length === value.length && keys.every((key, index) => key === String(index));
}
const actionTypes: readonly OnlineAction['type'][] = ['host', 'join', 'ready', 'remove-seat', 'view-state', 'reconnect', 'rehost', 'start', 'retry', 'leave', 'forget-seat'];
const phases: readonly OnlinePhase[] = ['idle', 'creating', 'joining', 'lobby', 'connecting', 'syncing', 'running', 'paused', 'reconnecting', 'saved', 'saving', 'rehosting', 'ended', 'error'];
/** Bound raw input first, then accept only the service's eight-character code alphabet. */
export function validateOnlineAction(value: unknown): value is OnlineAction {
  if (!rtcRecord(value)) return false;
  switch (value.type) {
    case 'host': return rtcKeys(value, ['type', 'capacity']) && positive(value.capacity) && value.capacity <= 4;
    case 'join': return rtcKeys(value, ['type', 'code']) && typeof value.code === 'string' && value.code.length <= 32
      && /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(value.code.trim().toUpperCase());
    case 'ready': return rtcKeys(value, ['type', 'ready']) && typeof value.ready === 'boolean';
    case 'remove-seat': return rtcKeys(value, ['type', 'seatId']) && seatId(value.seatId);
    case 'view-state': return rtcKeys(value, ['type', 'epoch', 'phase']) && positive(value.epoch)
      && ['synced', 'running', 'paused', 'ended'].includes(value.phase as string);
    case 'rehost': case 'reconnect': case 'start': case 'retry': case 'leave': case 'forget-seat': return rtcKeys(value, ['type']);
    default: return false;
  }
}
export function validateOnlineStatus(value: unknown): value is OnlineStatus {
  return rtcRecord(value) && rtcKeys(value, ['phase', 'role', 'ownSeat', 'snapshot', 'attachmentEpoch', 'error', 'retryAtMs', 'persistent', 'actions', 'mirror'])
    && validateMirrorStatus(value.mirror)
    && phases.includes(value.phase as OnlinePhase) && (value.role === null || value.role === 'host' || value.role === 'guest')
    && (value.ownSeat === null || seatId(value.ownSeat))
    && (value.snapshot === null || (validateRoomSnapshot(value.snapshot) && hasOnlyArrayIndices(value.snapshot.seats)))
    && (value.snapshot === null || value.ownSeat === null || (value.ownSeat as number) < (value.snapshot as RoomSnapshot).capacity)
    && natural(value.attachmentEpoch) && (value.error === null || isOnlineErrorCode(value.error))
    && (value.retryAtMs === null || (typeof value.retryAtMs === 'number' && Number.isFinite(value.retryAtMs) && value.retryAtMs >= 0))
    && typeof value.persistent === 'boolean' && Array.isArray(value.actions) && value.actions.length <= actionTypes.length
    && hasOnlyArrayIndices(value.actions) && value.actions.every(type => actionTypes.includes(type)) && new Set(value.actions).size === value.actions.length;
}
export function validateMirrorStatus(value: unknown): value is MirrorStatus {
  return rtcRecord(value) && rtcKeys(value, ['committed', 'receivedAgeMs', 'localPending', 'persistent', 'error'])
    && (value.committed === null || validateCheckpointMetadata(value.committed))
    && (value.receivedAgeMs === null || typeof value.receivedAgeMs === 'number' && Number.isFinite(value.receivedAgeMs) && value.receivedAgeMs >= 0)
    && typeof value.localPending === 'boolean' && typeof value.persistent === 'boolean' && (value.error === null || isOnlineErrorCode(value.error));
}
/** Validate before detaching so unknown credential fields can never be copied to IPC. */
export function copyOnlineStatus(value: OnlineStatus): OnlineStatus {
  if (!validateOnlineStatus(value)) throw Error('invalid-status');
  return structuredClone(value);
}
export function validateOnlinePortDescriptor(value: unknown): value is OnlinePortDescriptor {
  return rtcRecord(value) && rtcKeys(value, ['epoch', 'runId', 'hostGeneration', 'seatId', 'compatibility'])
    && positive(value.epoch) && isRoomId(value.runId) && positive(value.hostGeneration) && seatId(value.seatId)
    && validateCompatibility(value.compatibility);
}
export function copyOnlinePortDescriptor(value: OnlinePortDescriptor): OnlinePortDescriptor {
  if (!validateOnlinePortDescriptor(value)) throw Error('invalid-port');
  return structuredClone(value);
}
export function validateOnlineResult(value: unknown): value is OnlineResult {
  return rtcRecord(value) && (value.ok === true ? rtcKeys(value, ['ok'])
    : value.ok === false && rtcKeys(value, ['ok', 'code']) && isOnlineErrorCode(value.code));
}

export type Unsubscribe = () => void;
export const ONLINE_CHANNELS = {
  host: 'online:host', join: 'online:join', ready: 'online:ready', 'remove-seat': 'online:remove-seat',
  'view-state': 'online:view-state', reconnect: 'online:reconnect', rehost: 'online:rehost', start: 'online:start', retry: 'online:retry',
  leave: 'online:leave', 'forget-seat': 'online:forget-seat',
} as const satisfies Record<OnlineAction['type'], string>;
export const ONLINE_STATUS_CHANNEL = 'online:status';
export const ONLINE_PORT_CHANNEL = 'online:port';
export const ONLINE_PORT_SOURCE = 'ftlite:online:main';
export interface OnlineStatusEnvelope { version: 1; revision: number; status: OnlineStatus }
export function validateOnlineStatusEnvelope(value: unknown): value is OnlineStatusEnvelope {
  return rtcRecord(value) && rtcKeys(value, ['version', 'revision', 'status']) && value.version === 1
    && positive(value.revision) && validateOnlineStatus(value.status);
}
export function validateOnlinePortEnvelope(value: unknown): value is { version: 1; descriptor: OnlinePortDescriptor } {
  return rtcRecord(value) && rtcKeys(value, ['version', 'descriptor']) && value.version === 1 && validateOnlinePortDescriptor(value.descriptor);
}
/** Ordinary contextBridge API. MessagePorts use the renderer-owned facade instead. */
export interface OnlinePreloadApi {
  host(capacity: number): Promise<OnlineResult>;
  join(code: string): Promise<OnlineResult>;
  ready(ready: boolean): Promise<OnlineResult>;
  removeSeat(seatId: number): Promise<OnlineResult>;
  viewState(epoch: number, phase: Extract<OnlineAction, { type: 'view-state' }>['phase']): Promise<OnlineResult>;
  reconnect(): Promise<OnlineResult>;
  rehost(): Promise<OnlineResult>;
  start(): Promise<OnlineResult>;
  retry(): Promise<OnlineResult>;
  leave(): Promise<OnlineResult>;
  forgetSeat(): Promise<OnlineResult>;
  readStatus(): Promise<OnlineStatusEnvelope | Extract<OnlineResult, { ok: false }>>;
  onStatus(callback: (value: OnlineStatusEnvelope) => void): Unsubscribe;
}
export interface FtlitePreloadApi {
  online: OnlinePreloadApi;
  onSuspend(callback: () => void): Unsubscribe;
  onResume(callback: () => void): Unsubscribe;
}

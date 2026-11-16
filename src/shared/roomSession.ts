import { copyRtcIceServers, isRtcIdentity, isRtcSignal, rtcBoundedText, rtcRecord, type RtcIceServerConfig, type RtcIdentity, type RtcSignal } from './rtcSession';

/** Data-only service contract. Mode/game payloads remain opaque at this boundary. */
export const ROOM_MAX_PLAYERS = 4;
export const ROOM_SMALL_BODY_BYTES = 8192;
export const ROOM_INIT_BYTES = 65_536;
export const ROOM_CHECKPOINT_BYTES = 262_144;
export const ROOM_FRAME_BYTES = 98_304;
export const ROOM_CHECKPOINT_METADATA_BYTES = 4096;
export interface RoomCompatibility {
  protocolVersion: 2; modeId: string; schemaVersion: number; simVersion: number; contentDigest: string; layoutHash: string;
}
export interface RoomSeat {
  seatId: number; seatGeneration: number; occupied: boolean; connected: boolean; ready: boolean;
}
export type RoomPhase = 'lobby' | 'active' | 'lost' | 'ended';
export interface RoomSnapshot {
  roomId: string; joinCode: string; runId: string; compatibility: RoomCompatibility; capacity: number;
  hostSeatId: number; hostGeneration: number; phase: RoomPhase; rosterRevision: number; seats: RoomSeat[];
}
export interface SeatSession { snapshot: RoomSnapshot; seatId: number; seatGeneration: number; seatToken: string }
export type SeatSessionView = Omit<SeatSession, 'seatToken'>;
export interface SocketTicket { ticket: string; connectionId: string; expiresAtEpochMs: number }
export interface LeaseGrant { roomId: string; hostGeneration: number; hostSeatId: number; nonce: string; expiresAtEpochMs: number }
export interface SessionCheckpointMetadata {
  version: 1; protocolVersion: 2; roomId: string; compatibility: RoomCompatibility; runId: string;
  hostGeneration: number; checkpointSequence: number; capturedTick: number; payloadSha256: string;
}
export interface LinkIssued {
  attemptId: string; role: 'offerer' | 'answerer'; identity: RtcIdentity;
  localTicket: string; expectedRemoteTicket: string; ticketExpiresAtEpochMs: number;
}
export interface TurnCredentials { iceServers: RtcIceServerConfig[]; expiresAtEpochMs: number }
export interface RoomConnectionIdentity { roomId: string; hostGeneration: number; seatId: number; seatGeneration: number; connectionId: string }
export interface CommittedStart { initBase64: string; initHash: string; lease: LeaseGrant }

/** Only these fixed codes cross an untrusted boundary; no exception/provider messages. */
export const SERVICE_ERROR_RETRYABLE = {
  'invalid-request': false, 'invalid-frame': false, 'unauthorized': false, 'forbidden': false,
  'not-found': false, 'conflict': false, 'incompatible': false, 'invalid-state': false,
  'stale-connection': false, 'stale-generation': false, 'ticket-expired': false, 'ticket-used': false,
  'rate-limited': true, 'capacity': true, 'unavailable': true, 'too-large': false, 'timeout': true,
  'no-checkpoint': false, 'hash-mismatch': false, 'lease-expired': false, 'turn-unavailable': true, 'internal': true,
} as const;
export type ServiceErrorCode = keyof typeof SERVICE_ERROR_RETRYABLE;
export interface ServiceError { code: ServiceErrorCode; retryable: boolean; retryAfterMs?: number }
export type RequestFrame = { requestId: number } & (
  | { type: 'ready'; ready: boolean }
  | { type: 'remove-seat'; seatId: number }
  | { type: 'start-propose'; expectedRosterRevision: number; initBase64: string; initHash: string }
  | { type: 'start-commit'; proposalId: string; expectedRosterRevision: number }
  | { type: 'link-request'; guestSeatId: number }
  | { type: 'signal'; signal: RtcSignal }
  | { type: 'link-ready'; attemptId: string }
  | { type: 'lease-renew'; nonce: string }
  | { type: 'host-release' }
  | { type: 'rehost-claim'; expectedHostGeneration: number; nonce: string });
export type ClientFrame = { type: 'auth'; ticket: string; connectionId: string } | { type: 'ack'; sequence: number } | RequestFrame;
export type ReplyOutcome =
  | { kind: 'snapshot'; snapshot: RoomSnapshot }
  | { kind: 'proposal'; proposalId: string }
  | { kind: 'attempt'; attemptId: string }
  | ({ kind: 'started' } & CommittedStart)
  | { kind: 'lease'; lease: LeaseGrant }
  | { kind: 'void' }
  | { kind: 'error'; error: ServiceError };
export type ServerPayload =
  | { type: 'authenticated'; session: SeatSessionView }
  | { type: 'reply'; requestId: number; outcome: ReplyOutcome }
  | { type: 'roster'; snapshot: RoomSnapshot }
  | { type: 'start-proposed'; proposalId: string; expectedRosterRevision: number; expiresAtEpochMs: number }
  | ({ type: 'started' } & CommittedStart)
  | { type: 'link-issued'; link: LinkIssued }
  | { type: 'signal'; signal: RtcSignal }
  | { type: 'link-state'; attemptId: string; state: 'ready' | 'closed' }
  | { type: 'lease'; lease: LeaseGrant }
  | { type: 'checkpoint-status'; metadata: SessionCheckpointMetadata }
  | { type: 'host-departed'; hostGeneration: number }
  | { type: 'host-changed'; snapshot: RoomSnapshot; lease: LeaseGrant }
  | { type: 'error'; error: ServiceError };
export interface ServerEnvelope { sequence: number; payload: ServerPayload }

type Validator = (value: unknown) => boolean;
const positive: Validator = value => Number.isSafeInteger(value) && (value as number) > 0;
const natural: Validator = value => Number.isSafeInteger(value) && (value as number) >= 0;
const bool: Validator = value => typeof value === 'boolean';
const literal = (...values: unknown[]): Validator => value => values.includes(value);
const pattern = (regex: RegExp): Validator => value => typeof value === 'string' && regex.test(value);
export const isRoomId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
export const isRoomToken = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const hash = pattern(/^[a-f0-9]{64}$/);
const seatId: Validator = value => natural(value) && (value as number) < ROOM_MAX_PLAYERS;
const joinCode = pattern(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
const shape = (fields: Record<string, Validator>, optional: Record<string, Validator> = {}): Validator => value =>
  rtcRecord(value) && Object.keys(fields).every(key => Object.hasOwn(value, key) && fields[key]!(value[key]))
  && Object.keys(value).every(key => Object.hasOwn(fields, key) || (Object.hasOwn(optional, key) && optional[key]!(value[key])));
const compatibility = shape({ protocolVersion: literal(2), modeId: value => rtcBoundedText(value, 64) && value.length > 0,
  schemaVersion: positive, simVersion: positive, contentDigest: hash, layoutHash: pattern(/^[a-f0-9]{8}$/) });
export function validateCompatibility(value: unknown): value is RoomCompatibility { return compatibility(value); }

const seat = shape({ seatId, seatGeneration: natural, occupied: bool, connected: bool, ready: bool });
const snapshotShape = shape({ roomId: isRoomId, joinCode, runId: isRoomId, compatibility,
  capacity: value => positive(value) && (value as number) <= ROOM_MAX_PLAYERS,
  hostSeatId: seatId, hostGeneration: positive, phase: literal('lobby', 'active', 'lost', 'ended'), rosterRevision: positive,
  seats: value => Array.isArray(value) && value.length <= ROOM_MAX_PLAYERS && value.every(seat) });
export function validateRoomSnapshot(value: unknown): value is RoomSnapshot {
  if (!snapshotShape(value)) return false;
  const s = value as RoomSnapshot;
  return s.hostSeatId < s.capacity && s.seats.length === s.capacity && s.seats.every((entry, index) =>
    entry.seatId === index && (!entry.occupied ? !entry.connected && !entry.ready : entry.seatGeneration > 0)
    && (!entry.ready || entry.connected));
}
const sessionFields = { snapshot: validateRoomSnapshot, seatId, seatGeneration: positive };
function sessionMatches(value: SeatSessionView): boolean {
  const entry = value.snapshot.seats[value.seatId];
  return !!entry?.occupied && entry.seatGeneration === value.seatGeneration;
}
export function validateSeatSession(value: unknown): value is SeatSession {
  return shape({ ...sessionFields, seatToken: isRoomToken })(value) && sessionMatches(value as SeatSession);
}
const sessionView: Validator = value => shape(sessionFields)(value) && sessionMatches(value as SeatSessionView);
export function validateSocketTicket(value: unknown): value is SocketTicket {
  return shape({ ticket: isRoomToken, connectionId: isRoomId, expiresAtEpochMs: positive })(value);
}
const lease = shape({ roomId: isRoomId, hostGeneration: positive, hostSeatId: seatId, nonce: isRoomId, expiresAtEpochMs: positive });
export function validateLeaseGrant(value: unknown): value is LeaseGrant { return lease(value); }
const checkpoint = shape({ version: literal(1), protocolVersion: literal(2), roomId: isRoomId, compatibility, runId: isRoomId,
  hostGeneration: positive, checkpointSequence: positive, capturedTick: natural, payloadSha256: hash });
export function validateCheckpointMetadata(value: unknown): value is SessionCheckpointMetadata { return checkpoint(value); }
const identity: Validator = value => isRtcIdentity(value) && compatibility({ protocolVersion: value.protocolVersion,
  modeId: value.modeId, schemaVersion: value.schemaVersion, simVersion: value.simVersion, contentDigest: value.contentDigest,
  layoutHash: value.layoutHash }) && [value.roomId, value.runId, value.localConnectionId, value.remoteConnectionId].every(isRoomId);
const signal: Validator = value => isRtcSignal(value) && [value.roomId, value.attemptId, value.from, value.to].every(isRoomId) && value.from !== value.to;
const link = shape({ attemptId: isRoomId, role: literal('offerer', 'answerer'), identity,
  localTicket: isRoomToken, expectedRemoteTicket: isRoomToken, ticketExpiresAtEpochMs: positive });
export function validateTurnCredentials(value: unknown): value is TurnCredentials {
  return shape({ iceServers: servers => Array.isArray(servers) && servers.length > 0 && !!copyRtcIceServers(servers), expiresAtEpochMs: positive })(value);
}
export function validateRoomConnectionIdentity(value: unknown): value is RoomConnectionIdentity {
  return shape({ roomId: isRoomId, hostGeneration: positive, seatId: seatId, seatGeneration: positive, connectionId: isRoomId })(value);
}
const serviceErrorShape = shape({ code: value => typeof value === 'string' && Object.hasOwn(SERVICE_ERROR_RETRYABLE, value), retryable: bool }, { retryAfterMs: natural });
export function validateServiceError(value: unknown): value is ServiceError {
  return serviceErrorShape(value) && (value as ServiceError).retryable === SERVICE_ERROR_RETRYABLE[(value as ServiceError).code];
}

/** Canonical standard base64, with its decoded size checked before any decoding allocation. */
export function validateInitBase64(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(ROOM_INIT_BYTES / 3) || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  if (value.length / 4 * 3 - padding > ROOM_INIT_BYTES) return false;
  // Unused low bits must be zero so alternate encodings cannot bypass equality checks.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  return padding === 0 || (alphabet.indexOf(value[value.length - padding - 1]!) & (padding === 2 ? 15 : 3)) === 0;
}
const startFields = { initBase64: validateInitBase64, initHash: hash, lease };
const requestShapes: Record<string, Record<string, Validator>> = {
  ready: { ready: bool }, 'remove-seat': { seatId },
  'start-propose': { expectedRosterRevision: positive, initBase64: validateInitBase64, initHash: hash },
  'start-commit': { proposalId: isRoomId, expectedRosterRevision: positive }, 'link-request': { guestSeatId: seatId },
  signal: { signal }, 'link-ready': { attemptId: isRoomId }, 'lease-renew': { nonce: isRoomId },
  'host-release': {}, 'rehost-claim': { expectedHostGeneration: positive, nonce: isRoomId },
};
function clientFrame(value: unknown): value is ClientFrame {
  if (!rtcRecord(value)) return false;
  if (value.type === 'auth') return shape({ type: literal('auth'), ticket: isRoomToken, connectionId: isRoomId })(value);
  if (value.type === 'ack') return shape({ type: literal('ack'), sequence: positive })(value);
  return typeof value.type === 'string' && Object.hasOwn(requestShapes, value.type)
    && shape({ type: literal(value.type), requestId: positive, ...requestShapes[value.type] })(value);
}
const outcomeShapes: Record<string, Record<string, Validator>> = {
  snapshot: { snapshot: validateRoomSnapshot }, proposal: { proposalId: isRoomId }, attempt: { attemptId: isRoomId },
  started: startFields, lease: { lease }, void: {}, error: { error: validateServiceError },
};
const tagged = (value: unknown, tag: string, shapes: Record<string, Record<string, Validator>>): boolean =>
  rtcRecord(value) && typeof value[tag] === 'string' && Object.hasOwn(shapes, value[tag])
  && shape({ [tag]: literal(value[tag]), ...shapes[value[tag]] })(value);
const payloadShapes: Record<string, Record<string, Validator>> = {
  authenticated: { session: sessionView }, reply: { requestId: positive, outcome: value => tagged(value, 'kind', outcomeShapes) },
  roster: { snapshot: validateRoomSnapshot }, 'start-proposed': { proposalId: isRoomId, expectedRosterRevision: positive, expiresAtEpochMs: positive },
  started: startFields, 'link-issued': { link }, signal: { signal },
  'link-state': { attemptId: isRoomId, state: literal('ready', 'closed') }, lease: { lease },
  'checkpoint-status': { metadata: checkpoint }, 'host-departed': { hostGeneration: positive },
  'host-changed': { snapshot: validateRoomSnapshot, lease }, error: { error: validateServiceError },
};
const envelope = shape({ sequence: positive, payload: value => tagged(value, 'type', payloadShapes) });

/** JSON.parse alone silently overwrites duplicate keys. Scan the already valid JSON
 * with a depth bound and decoded key sets, including escaped spellings of keys. */
export function parseBoundedJson(text: unknown, maxBytes: number): unknown {
  if (!rtcBoundedText(text, maxBytes)) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    let offset = 0;
    const whitespace = () => { while (/\s/.test(text[offset] ?? '') && offset < text.length) offset++; };
    const string = (): string => {
      const start = offset++;
      while (offset < text.length) {
        const char = text[offset++];
        if (char === '\\') offset++;
        else if (char === '"') return JSON.parse(text.slice(start, offset)) as string;
      }
      throw Error('invalid-frame');
    };
    const scan = (depth: number): void => {
      if (depth > 32) throw Error('invalid-frame');
      whitespace();
      const char = text[offset];
      if (char === '"') { string(); return; }
      if (char === '{' || char === '[') {
        offset++; whitespace();
        const end = char === '{' ? '}' : ']';
        const keys = new Set<string>();
        while (text[offset] !== end) {
          if (char === '{') {
            const key = string();
            if (keys.has(key)) throw Error('invalid-frame');
            keys.add(key); whitespace(); offset++;
          }
          scan(depth + 1); whitespace();
          if (text[offset] !== ',') break;
          offset++; whitespace();
        }
        offset++; return;
      }
      while (offset < text.length && !/[\s,}\]]/.test(text[offset]!)) offset++;
    };
    scan(0);
    return value;
  } catch { return undefined; }
}
export function parseClientFrame(text: unknown): ClientFrame | undefined {
  const value = parseBoundedJson(text, ROOM_FRAME_BYTES);
  return clientFrame(value) ? value : undefined;
}
export function parseServerEnvelope(text: unknown): ServerEnvelope | undefined {
  const value = parseBoundedJson(text, ROOM_FRAME_BYTES);
  return envelope(value) ? value as ServerEnvelope : undefined;
}
export function encodeServerEnvelope(value: ServerEnvelope): string {
  if (!envelope(value)) throw Error('invalid-frame');
  const text = JSON.stringify(value);
  if (!rtcBoundedText(text, ROOM_FRAME_BYTES)) throw Error('invalid-frame');
  return text;
}

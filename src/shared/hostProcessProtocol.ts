import { boundedHostBytes, positiveSafeInteger, SESSION_PROTOCOL_VERSION, type HostResponse } from './netSession';
import { validateSessionLeaseIdentity, type SessionLeaseIdentity, type LeaseFenceReason } from './sessionLease';

export function matchesSessionLease(value: unknown, identity: SessionLeaseIdentity): value is SessionLeaseIdentity {
  return validateSessionLeaseIdentity(value) && (Object.keys(identity) as (keyof SessionLeaseIdentity)[]).every(key => value[key] === identity[key]);
}
export function isLeaseFenceReason(value: unknown): value is LeaseFenceReason {
  return ['lease-expired', 'service-fenced', 'suspended', 'resumed', 'clock-discontinuity', 'disposed'].includes(value as string);
}

/** Trusted host attachment only; never part of gameplay or renderer IPC payloads. */
export interface StreamAttachmentOptions { streamed?: boolean; latestPayloadLimit?: number }
export function validStreamAttachmentOptions(value: unknown): value is StreamAttachmentOptions | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const options = value as StreamAttachmentOptions;
  return Object.keys(options).every(key => key === 'streamed' || key === 'latestPayloadLimit')
    && (options.streamed === undefined || typeof options.streamed === 'boolean')
    && (options.latestPayloadLimit === undefined ? options.streamed !== true : Number.isSafeInteger(options.latestPayloadLimit)
      // 16 KiB RTC packet less the maximum 296-byte framing header. Keep this
      // shared boundary free of renderer-backed network type dependencies.
      && options.latestPayloadLimit >= 4096 && options.latestPayloadLimit <= 16088);
}

export interface HostIdentity {
  modeId: string; schemaVersion: number; simVersion: number; contentDigest: string; hostGeneration: number;
}
export const TRANSPORT_CHANNEL = 'net:transport-connect';
export const TRANSPORT_READY_CHANNEL = 'net:transport-ready';
export function isHostIdentity(value: unknown): value is HostIdentity {
  if (!value || typeof value !== 'object') return false;
  const v = value as HostIdentity;
  return typeof v.modeId === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(v.modeId)
    && positiveSafeInteger(v.schemaVersion) && positiveSafeInteger(v.simVersion)
    && positiveSafeInteger(v.hostGeneration) && typeof v.contentDigest === 'string' && /^[0-9a-f]{64}$/.test(v.contentDigest);
}
export function matchesIdentity(value: unknown, identity: HostIdentity): boolean {
  if (!isHostIdentity(value)) return false;
  return (value as HostIdentity & { protocolVersion?: unknown }).protocolVersion === SESSION_PROTOCOL_VERSION
    && (['modeId', 'schemaVersion', 'simVersion', 'contentDigest', 'hostGeneration'] as const).every(key => value[key] === identity[key]);
}
export function isHostResponse(value: unknown): value is HostResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!positiveSafeInteger(v.hostGeneration) || !positiveSafeInteger(v.requestId)) return false;
  if (v.ok === true) return (v.checkpointBytes === undefined || boundedHostBytes(v.checkpointBytes))
    && Object.keys(v).every(key => ['requestId', 'hostGeneration', 'ok', 'checkpointBytes'].includes(key));
  if (v.ok !== false || !v.error || typeof v.error !== 'object') return false;
  const error = v.error as Record<string, unknown>;
  return ['invalid-command', 'stale-generation', 'stale-request', 'unavailable', 'mode-error', 'checkpoint-too-large'].includes(error.code as string)
    && error.message === error.code && Object.keys(error).every(key => ['code', 'message'].includes(key))
    && Object.keys(v).every(key => ['requestId', 'hostGeneration', 'ok', 'error'].includes(key));
}
export function validPeer(peer: unknown, players: unknown): players is readonly number[] {
  return typeof peer === 'string' && peer.length > 0 && peer.length <= 128 && Array.isArray(players)
    && players.length > 0 && players.length <= 16 && new Set(players).size === players.length
    && players.every(p => Number.isSafeInteger(p) && p >= 0 && p <= 65535);
}

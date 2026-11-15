import { isRoomId, ROOM_MAX_PLAYERS } from './roomSession';
import { rtcKeys, rtcRecord } from './rtcSession';

/** Local monotonic time and independent wall time, sampled only by the utility. */
export interface SessionClock { nowMs(): number; epochMs(): number }
export interface SessionLeaseIdentity {
  roomId: string; runId: string; hostGeneration: number; hostSeatId: number; utilityEpoch: string;
}
/** No caller-supplied request-start timestamp is accepted across the boundary. */
export interface LeaseRenewalRequest extends SessionLeaseIdentity { nonce: string }
export type LeaseFenceReason = 'lease-expired' | 'service-fenced' | 'suspended' | 'resumed' | 'clock-discontinuity' | 'disposed';
export interface SessionGateState { allowed: boolean; revision: number; reason: LeaseFenceReason | null }
export interface SessionWorkGate { check(): SessionGateState }

const identityKeys = ['roomId', 'runId', 'hostGeneration', 'hostSeatId', 'utilityEpoch'];
const requestKeys = [...identityKeys, 'nonce'];
const reasons: readonly LeaseFenceReason[] = ['lease-expired', 'service-fenced', 'suspended', 'resumed', 'clock-discontinuity', 'disposed'];
const identityFields = (value: Record<string, unknown>): boolean =>
  isRoomId(value.roomId) && isRoomId(value.runId) && isRoomId(value.utilityEpoch)
  && Number.isSafeInteger(value.hostGeneration) && (value.hostGeneration as number) > 0
  && Number.isSafeInteger(value.hostSeatId) && (value.hostSeatId as number) >= 0 && (value.hostSeatId as number) < ROOM_MAX_PLAYERS;

/** Room/run IDs, utility epochs and nonces are exactly 32 lowercase hex digits. */
export function validateSessionLeaseIdentity(value: unknown): value is SessionLeaseIdentity {
  return rtcRecord(value) && rtcKeys(value, identityKeys) && identityFields(value);
}
export function validateLeaseRenewalRequest(value: unknown): value is LeaseRenewalRequest {
  return rtcRecord(value) && rtcKeys(value, requestKeys) && identityFields(value) && isRoomId(value.nonce);
}
export function validateSessionGateState(value: unknown): value is SessionGateState {
  return rtcRecord(value) && rtcKeys(value, ['allowed', 'revision', 'reason'])
    && typeof value.allowed === 'boolean' && Number.isSafeInteger(value.revision) && (value.revision as number) >= 0
    && (value.reason === null || reasons.includes(value.reason as LeaseFenceReason))
    && (!value.allowed || value.reason === null);
}

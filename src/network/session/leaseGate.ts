import type { Scheduler } from '../../renderer/src/net/contracts';
import { isRoomId, validateLeaseGrant, type LeaseGrant } from '../../shared/roomSession';
import {
  validateLeaseRenewalRequest, validateSessionLeaseIdentity,
  type LeaseFenceReason, type LeaseRenewalRequest, type SessionClock, type SessionGateState,
  type SessionLeaseIdentity, type SessionWorkGate,
} from '../../shared/sessionLease';

const LOCAL_LEASE_MS = 12_000;
const RENEWAL_MS = 5_000;
const CLOCK_TOLERANCE_MS = 2_000;

export interface LeaseGate extends SessionWorkGate {
  renewNow(): void;
  accept(request: LeaseRenewalRequest, grant: LeaseGrant): boolean;
  invalidate(reason: LeaseFenceReason): void;
  dispose(): void;
}
export interface LeaseGateOptions {
  identity: SessionLeaseIdentity; clock: SessionClock; scheduler: Scheduler;
  /** Must supply a fresh cryptographic 32-digit lowercase hex nonce per request. */
  nonce(): string;
  onRenew(request: LeaseRenewalRequest): void;
}

/** Starts CLOSED. The owner subscribes to private IPC, then calls renewNow(). */
export function createLeaseGate(options: LeaseGateOptions): LeaseGate {
  if (!validateSessionLeaseIdentity(options.identity)) throw Error('invalid-lease-identity');
  const identity = { ...options.identity };
  let state: SessionGateState = { allowed: false, revision: 0, reason: null };
  let disposed = false;
  let cancelRenewal: (() => void) | undefined;
  let previous: { mono: number; epoch: number } | undefined;
  let pending: { request: LeaseRenewalRequest; started: number } | undefined;
  let permission: { deadline: number; expiresAtEpochMs: number } | undefined;

  function close(reason: LeaseFenceReason, retireRequest = true): void {
    if (disposed && reason !== 'disposed') return;
    permission = undefined;
    if (retireRequest) pending = undefined;
    if (state.allowed || state.reason !== reason) state = { allowed: false, revision: state.revision + 1, reason };
  }
  function sample(): { mono: number; epoch: number } | undefined {
    let mono: number, epoch: number;
    try { mono = options.clock.nowMs(); epoch = options.clock.epochMs(); }
    catch { previous = undefined; close('clock-discontinuity'); return undefined; }
    if (!Number.isFinite(mono) || !Number.isFinite(epoch)) {
      previous = undefined; close('clock-discontinuity'); return undefined;
    }
    const current = { mono, epoch }, last = previous;
    previous = current;
    if (last && (mono < last.mono || epoch < last.epoch
      || Math.abs((epoch - last.epoch) - (mono - last.mono)) > CLOCK_TOLERANCE_MS)) {
      close('clock-discontinuity'); return undefined;
    }
    if (permission && (mono >= permission.deadline || epoch >= permission.expiresAtEpochMs)) {
      // A newer in-flight renewal may still be useful after the prior permission expires.
      close('lease-expired', false);
    }
    return current;
  }
  function renewNow(): void {
    if (disposed) return;
    const current = sample(); if (!current) return;
    try {
      const nonce = options.nonce();
      if (!isRoomId(nonce)) { close('service-fenced'); return; }
      const request = { ...identity, nonce };
      // Store before IPC: a synchronous reply must see its own request-start sample.
      pending = { request: { ...request }, started: current.mono };
      options.onRenew(request);
    } catch { close('service-fenced'); }
  }
  function accept(request: LeaseRenewalRequest, grant: LeaseGrant): boolean {
    if (disposed) return false;
    const current = sample();
    if (!current || !pending || !validateLeaseRenewalRequest(request) || !validateLeaseGrant(grant)) return false;
    const expected = pending.request;
    if (request.roomId !== expected.roomId || request.runId !== expected.runId
      || request.hostGeneration !== expected.hostGeneration || request.hostSeatId !== expected.hostSeatId
      || request.utilityEpoch !== expected.utilityEpoch || request.nonce !== expected.nonce
      || grant.roomId !== expected.roomId || grant.hostGeneration !== expected.hostGeneration
      || grant.hostSeatId !== expected.hostSeatId || grant.nonce !== expected.nonce) return false;
    const deadline = Math.min(pending.started + LOCAL_LEASE_MS, current.mono + grant.expiresAtEpochMs - current.epoch);
    if (current.mono >= deadline || grant.expiresAtEpochMs <= current.epoch) return false;
    pending = undefined;
    permission = { deadline, expiresAtEpochMs: grant.expiresAtEpochMs };
    state = { allowed: true, revision: state.revision + 1, reason: null };
    return true;
  }
  function scheduleRenewal(): void {
    cancelRenewal = options.scheduler.schedule(RENEWAL_MS, () => {
      cancelRenewal = undefined;
      if (disposed) return;
      renewNow();
      if (!disposed) scheduleRenewal();
    });
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true; close('disposed'); cancelRenewal?.(); cancelRenewal = undefined;
  }
  sample(); scheduleRenewal();
  return {
    check() { if (!disposed) sample(); return { ...state }; },
    renewNow, accept,
    invalidate(reason) { if (disposed) return; if (reason === 'disposed') dispose(); else close(reason); },
    dispose,
  };
}

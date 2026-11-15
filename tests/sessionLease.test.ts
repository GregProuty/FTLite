import { describe, expect, it } from 'vitest';
import type { Scheduler } from '../src/renderer/src/net/contracts';
import type { LeaseGrant } from '../src/shared/roomSession';
import {
  validateLeaseRenewalRequest, validateSessionGateState, validateSessionLeaseIdentity,
  type LeaseRenewalRequest, type SessionLeaseIdentity,
} from '../src/shared/sessionLease';
import { createLeaseGate, type LeaseGate } from '../src/network/session/leaseGate';

const identity: SessionLeaseIdentity = {
  roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 1, hostSeatId: 0, utilityEpoch: 'c'.repeat(32),
};

function fixture(onRenew?: (request: LeaseRenewalRequest) => void) {
  let mono = 1000, epoch = 1_000_000, sequence = 0;
  const requests: LeaseRenewalRequest[] = [];
  const timers = new Set<{ at: number; callback: () => void }>();
  const scheduler: Scheduler = { schedule(delay, callback) {
    const timer = { at: mono + delay, callback }; timers.add(timer);
    return () => { timers.delete(timer); };
  } };
  const clock = { nowMs: () => mono, epochMs: () => epoch };
  const gate = createLeaseGate({ identity, clock, scheduler,
    nonce: () => (++sequence).toString(16).padStart(32, '0'),
    onRenew: request => { requests.push(request); onRenew?.(request); },
  });
  const set = (nextMono: number, nextEpoch = 1_000_000 + nextMono - 1000) => { mono = nextMono; epoch = nextEpoch; };
  return { gate, requests, timers, set, clock,
    advanceTo(next: number) {
      while (true) {
        const timer = [...timers].filter(t => t.at <= next).sort((a, b) => a.at - b.at)[0];
        if (!timer) break;
        set(timer.at); timers.delete(timer); timer.callback();
      }
      set(next);
    },
  };
}
function grant(request: LeaseRenewalRequest, expiresAtEpochMs = 1_015_000): LeaseGrant {
  return { roomId: request.roomId, hostGeneration: request.hostGeneration, hostSeatId: request.hostSeatId,
    nonce: request.nonce, expiresAtEpochMs };
}

describe('utility-local session lease', () => {
  it('starts closed and expires at request start + 12000, independent of receipt time', () => {
    const f = fixture();
    expect(f.gate.check()).toEqual({ allowed: false, revision: 0, reason: null });
    expect(f.requests).toHaveLength(0);
    f.gate.renewNow(); const request = f.requests[0]!;
    f.set(2000);
    expect(f.gate.accept(request, grant(request))).toBe(true);
    f.set(12_999); expect(f.gate.check().allowed).toBe(true);
    f.set(13_000); expect(f.gate.check()).toMatchObject({ allowed: false, reason: 'lease-expired' });
  });

  it.each([13_000, 13_001])('never opens for a reply received at %i', receipt => {
    const f = fixture(); f.gate.renewNow(); const request = f.requests[0]!;
    f.set(receipt);
    expect(f.gate.accept(request, grant(request))).toBe(false);
    expect(f.gate.check().allowed).toBe(false);
  });

  it('rejects an already expired server grant and closes at an earlier server expiry', () => {
    const f = fixture(); f.gate.renewNow(); const request = f.requests[0]!;
    expect(f.gate.accept(request, grant(request, 1_000_000))).toBe(false);
    expect(f.gate.check().allowed).toBe(false);
    expect(f.gate.accept(request, grant(request, 1_003_000))).toBe(true);
    f.set(3999); expect(f.gate.check().allowed).toBe(true);
    f.set(4000); expect(f.gate.check().allowed).toBe(false);
  });

  it.each([
    { roomId: 'd'.repeat(32) }, { runId: 'd'.repeat(32) }, { utilityEpoch: 'd'.repeat(32) },
    { nonce: 'd'.repeat(32) }, { hostGeneration: 2 }, { hostSeatId: 1 }, { extra: 1 },
  ])('ignores a request with obsolete/malformed fields %j', changed => {
    const f = fixture(); f.gate.renewNow(); const request = f.requests[0]!;
    expect(f.gate.accept({ ...request, ...changed }, grant(request))).toBe(false);
    expect(f.gate.check().allowed).toBe(false);
    expect(f.gate.accept(request, grant(request))).toBe(true);
  });

  it.each([
    { roomId: 'd'.repeat(32) }, { nonce: 'd'.repeat(32) }, { hostGeneration: 2 }, { hostSeatId: 1 },
    { expiresAtEpochMs: Infinity }, { extra: 1 },
  ])('rejects a mismatched/malformed service grant %j', changed => {
    const f = fixture(); f.gate.renewNow(); const request = f.requests[0]!;
    expect(f.gate.accept(request, { ...grant(request), ...changed })).toBe(false);
    expect(f.gate.check().allowed).toBe(false);
  });

  it('supersedes only the pending reply while retaining an earlier useful permission', () => {
    const f = fixture(); f.gate.renewNow(); const obsoleteRequest = f.requests[0]!;
    expect(f.gate.accept(obsoleteRequest, grant(obsoleteRequest))).toBe(true);
    f.set(6000); f.gate.renewNow(); const current = f.requests[1]!;
    expect(f.gate.check().allowed).toBe(true);
    expect(f.gate.accept(obsoleteRequest, grant(obsoleteRequest))).toBe(false);
    expect(f.gate.check().allowed).toBe(true);
    f.set(13_000); expect(f.gate.check().allowed).toBe(false);
    expect(f.gate.accept(obsoleteRequest, grant(obsoleteRequest))).toBe(false);
    expect(f.gate.accept(current, grant(current, 1_020_000))).toBe(true);
    f.set(17_999); expect(f.gate.check().allowed).toBe(true);
    f.set(18_000); expect(f.gate.check().allowed).toBe(false);
  });

  it('does not extend permission on duplicate or rejected replies', () => {
    const f = fixture(); f.gate.renewNow(); const request = f.requests[0]!;
    expect(f.gate.accept(request, grant(request))).toBe(true);
    f.set(6000);
    expect(f.gate.accept(request, grant(request, 1_030_000))).toBe(false);
    f.gate.renewNow(); const next = f.requests[1]!;
    expect(f.gate.accept(next, { ...grant(next), hostGeneration: 2 })).toBe(false);
    f.set(13_000); expect(f.gate.check().allowed).toBe(false);
  });

  it('renews every five seconds while retaining only the newest reply capability', () => {
    const f = fixture(); f.gate.renewNow();
    f.advanceTo(5999); expect(f.requests).toHaveLength(1);
    f.advanceTo(6000); expect(f.requests).toHaveLength(2);
    f.advanceTo(11_000); expect(f.requests).toHaveLength(3);
    expect(f.timers.size).toBe(1);
    expect(f.gate.accept(f.requests[1]!, grant(f.requests[1]!))).toBe(false);
    expect(f.gate.accept(f.requests[2]!, grant(f.requests[2]!))).toBe(true);
  });

  it('stamps a request before invoking a synchronous renewal reply', () => {
    let gate!: LeaseGate, accepted = false;
    const f = fixture(request => { accepted = gate.accept(request, grant(request)); }); gate = f.gate;
    gate.renewNow(); expect(accepted).toBe(true);
    f.set(13_000); expect(gate.check().allowed).toBe(false);
  });

  it.each(['service-fenced', 'suspended', 'resumed'] as const)('latches %s until a fresh request is granted', reason => {
    const f = fixture(); f.gate.renewNow(); const stale = f.requests[0]!;
    expect(f.gate.accept(stale, grant(stale))).toBe(true);
    f.gate.invalidate(reason);
    expect(f.gate.check()).toMatchObject({ allowed: false, reason });
    expect(f.gate.accept(stale, grant(stale))).toBe(false);
    f.set(2000); f.gate.renewNow(); expect(f.gate.check().allowed).toBe(false);
    const fresh = f.requests[1]!;
    expect(f.gate.accept(fresh, grant(fresh))).toBe(true);
    expect(f.gate.check()).toMatchObject({ allowed: true, reason: null });
  });

  it.each([
    [999, 1_000_000], [1000, 999_999], [NaN, 1_000_000], [Infinity, 1_000_000],
    [1000, NaN], [1000, Infinity], [2000, 1_003_001], [4001, 1_001_000],
  ])('fences backward, nonfinite or divergent clock samples (%s, %s)', (mono, epoch) => {
    const f = fixture(); f.gate.renewNow(); const request = f.requests[0]!;
    expect(f.gate.accept(request, grant(request))).toBe(true);
    f.set(mono, epoch);
    expect(f.gate.check()).toMatchObject({ allowed: false, reason: 'clock-discontinuity' });
    expect(f.gate.accept(request, grant(request))).toBe(false);
  });

  it('allows a clock delta discrepancy of exactly 2000ms', () => {
    const f = fixture(); f.gate.renewNow(); const request = f.requests[0]!;
    expect(f.gate.accept(request, grant(request))).toBe(true);
    f.set(2000, 1_003_000); expect(f.gate.check().allowed).toBe(true);
  });

  it('recovers from a clock discontinuity only through a newly stamped renewal', () => {
    const f = fixture(); f.gate.renewNow(); const stale = f.requests[0]!;
    f.set(2000, 1_003_001); expect(f.gate.check().reason).toBe('clock-discontinuity');
    expect(f.gate.accept(stale, grant(stale))).toBe(false);
    f.gate.renewNow(); const fresh = f.requests[1]!;
    expect(f.gate.check().allowed).toBe(false);
    expect(f.gate.accept(fresh, grant(fresh))).toBe(true);
  });

  it('keeps revisions increasing and returns snapshots callers cannot mutate', () => {
    const f = fixture(); const initial = f.gate.check();
    f.gate.renewNow(); const request = f.requests[0]!;
    f.gate.accept(request, grant(request)); const valid = f.gate.check();
    expect(valid.revision).toBeGreaterThan(initial.revision);
    valid.allowed = false; expect(f.gate.check().allowed).toBe(true);
    f.gate.invalidate('service-fenced'); const fenced = f.gate.check();
    expect(fenced.revision).toBeGreaterThan(valid.revision);
    f.gate.check(); expect(f.gate.check().revision).toBe(fenced.revision);
    f.gate.renewNow(); const next = f.requests[1]!; f.gate.accept(next, grant(next));
    expect(f.gate.check().revision).toBeGreaterThan(fenced.revision);
  });

  it('disposes permanently, cancels timers and ignores late replies and callbacks', () => {
    const f = fixture(); f.gate.renewNow(); const request = f.requests[0]!;
    f.gate.accept(request, grant(request)); const callback = [...f.timers][0]!.callback;
    f.gate.dispose(); expect(f.timers.size).toBe(0);
    const state = f.gate.check(); expect(state).toMatchObject({ allowed: false, reason: 'disposed' });
    f.gate.dispose(); f.gate.invalidate('resumed'); f.gate.renewNow(); callback();
    expect(f.gate.accept(request, grant(request))).toBe(false);
    expect(f.gate.check()).toEqual(state);
    expect(f.requests).toHaveLength(1); expect(f.timers.size).toBe(0);
  });

  it('keeps disposal terminal when the renewal consumer disposes and throws synchronously', () => {
    let gate!: LeaseGate;
    const f = fixture(() => { gate.dispose(); throw Error('consumer-failed'); }); gate = f.gate;
    gate.renewNow();
    expect(gate.check()).toMatchObject({ allowed: false, reason: 'disposed' });
    expect(f.timers.size).toBe(0);
  });
});

describe('strict lease data contracts', () => {
  it('accepts only bounded room/run/utility/seat/generation identities', () => {
    expect(validateSessionLeaseIdentity(identity)).toBe(true);
    for (const changed of [{ roomId: '' }, { runId: 'X'.repeat(32) }, { utilityEpoch: '' },
      { hostGeneration: 0 }, { hostGeneration: 1.5 }, { hostGeneration: Number.MAX_SAFE_INTEGER + 1 },
      { hostSeatId: -1 }, { hostSeatId: 4 }, { extra: 1 }]) {
      expect(validateSessionLeaseIdentity({ ...identity, ...changed })).toBe(false);
    }
    expect(validateSessionLeaseIdentity(null)).toBe(false);
    expect(validateSessionLeaseIdentity({})).toBe(false);
    expect(validateSessionLeaseIdentity([])).toBe(false);
    expect(() => createLeaseGate({ identity: { ...identity, utilityEpoch: '' },
      clock: { nowMs: () => 0, epochMs: () => 0 }, scheduler: { schedule: () => () => {} },
      nonce: () => 'd'.repeat(32), onRenew: () => {} })).toThrow();
  });

  it('rejects missing/invalid nonce, utility timestamps and extra gate state fields', () => {
    const request = { ...identity, nonce: 'd'.repeat(32) };
    expect(validateLeaseRenewalRequest(request)).toBe(true);
    expect(validateLeaseRenewalRequest(identity)).toBe(false);
    expect(validateLeaseRenewalRequest({ ...request, nonce: 'bad' })).toBe(false);
    expect(validateLeaseRenewalRequest({ ...request, requestStartedAt: 1000 })).toBe(false);
    expect(validateSessionGateState({ allowed: false, revision: 0, reason: null })).toBe(true);
    expect(validateSessionGateState({ allowed: false, revision: 1, reason: 'clock-discontinuity' })).toBe(true);
    for (const changed of [{ allowed: 1 }, { revision: -1 }, { revision: NaN }, { reason: 'unknown' }, { extra: true }]) {
      expect(validateSessionGateState({ allowed: false, revision: 0, reason: null, ...changed })).toBe(false);
    }
  });
});

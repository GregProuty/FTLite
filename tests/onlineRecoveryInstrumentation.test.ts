import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

const instrument = createRequire(import.meta.url)('../scripts/network/online-recovery-instrument.cjs');
// Web-i: the host runs in the page's Worker, one ES module built by the renderer pipeline (needs `npm run build`).
const source = readFileSync('out/renderer/assets/authorityWorker.js', 'utf8');
function exercise(observed: boolean, serviceDuration: number) {
  const code = observed ? instrument(source) : source;
  const gateSource = code.slice(code.indexOf('const LOCAL_LEASE_MS'), code.indexOf('function createUtilityHost('));
  const events: any[] = [];
  // The Worker bundle calls its validators as plain functions; the old main build called them through a chunk namespace.
  const validators = { validateSessionLeaseIdentity: () => true, isRoomId: () => true, validateLeaseRenewalRequest: () => true, validateLeaseGrant: () => true };
  const create = runInNewContext(gateSource + '\ncreateLeaseGate', { hostProcessProtocol: validators, ...validators, __recoveryLease: (event: any) => events.push(event) });
  let mono = 100, request: any, outgoingMs = 0;
  const gate = create({ identity: { roomId: 'room', runId: 'run', hostGeneration: 1, hostSeatId: 0, utilityEpoch: 'utility' },
    clock: { nowMs: () => mono, epochMs: () => 100000 + mono }, scheduler: { schedule: () => () => {} },
    nonce: () => { mono += 500; return 'nonce'; },
    onRenew: (r: any) => { mono += 1000; outgoingMs = mono; request = r; },
  });
  gate.renewNow();
  const accepted = gate.accept(request, { ...request, expiresAtEpochMs: 100000 + mono + serviceDuration });
  const deadline = Math.min(12100, mono + serviceDuration);
  mono = deadline - 1; const before = gate.check();
  mono = deadline; const after = gate.check();
  return { events, outgoingMs, accepted, before, after, deadline };
}
it.each([20000, 700])('observes exact gate start and minimum deadline with delayed outgoing IPC (%i ms service lifetime)', duration => {
  const plain = exercise(false, duration), traced = exercise(true, duration);
  expect({ ...traced, events: [] }).toEqual(plain);
  expect(traced.accepted).toBe(true); expect(traced.before.allowed).toBe(true); expect(traced.after.allowed).toBe(false);
  expect(traced.outgoingMs).toBe(1600);
  expect(traced.events).toEqual([
    { kind: 'request', nonce: 'nonce', startedMs: 100 },
    { kind: 'accepted', startedMs: 100, acceptedMs: 1600, acceptedEpochMs: 101600,
      expiresAtEpochMs: 101600 + duration, deadlineMs: traced.deadline },
  ]);
});
it('fails closed when a lease observation anchor changes or is duplicated', () => {
  const anchor = 'pending = { request: { ...request }, started: current.mono };';
  expect(() => instrument(source.replace(anchor, 'pending = undefined;'))).toThrow('instrumentation-source-mismatch');
  expect(() => instrument(source + '\n' + anchor)).toThrow('instrumentation-source-mismatch');
});
it('instruments the built Worker chunk at exactly one site per needle', () => { expect(() => instrument(source)).not.toThrow(); });

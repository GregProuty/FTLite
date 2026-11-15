import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRtcTransport } from '../src/main/network/rtcTransport';
import type { RtcAttemptOptions, RtcRequest, RtcSignal } from '../src/shared/rtcSession';

const identity = { modeId: 'counter', schemaVersion: 1, simVersion: 9, contentDigest: 'a'.repeat(64), hostGeneration: 7 };
function config(attemptId = 'a', remoteConnectionId = 'guest'): RtcAttemptOptions {
  return { attemptId, role: 'offerer', identity: { ...identity, protocolVersion: 2, layoutHash: '1234abcd', runId: 'run', roomId: 'room', seatGeneration: 1,
    localConnectionId: 'host', remoteConnectionId }, localTicket: 'local', expectedRemoteTicket: 'remote', ticketExpiresAtEpochMs: Date.now() + 20000, iceServers: [] };
}
function harness() {
  let receive = (_: unknown) => {};
  const requests: RtcRequest[] = [], ports: unknown[][] = [], dispose = vi.fn();
  const owner = createRtcTransport(identity, { send(message, transfer) { requests.push(message); ports.push(transfer ?? []); },
    onResponse(callback) { receive = callback; return () => { receive = () => {}; }; }, dispose });
  const port = () => ({ close: vi.fn() } as any);
  const reply = (request: RtcRequest, kind: string, extra = {}) => receive({ version: 1, hostGeneration: 7, requestId: request.requestId,
    attemptId: request.kind === 'start' ? request.options.attemptId : request.attemptId, kind, ...extra });
  return { owner, requests, ports, port, reply, receive: (value: unknown) => receive(value), dispose };
}
afterEach(() => vi.useRealTimers());

describe('main RTC transport owner', () => {
  it('requires port readiness before native readiness and forwards the exact negotiated cap', async () => {
    const h = harness(), p = h.port(), started = h.owner.startAttempt(config(), p), request = h.requests[0]!;
    let ready = false; void started.then(() => { ready = true; });
    h.reply(request, 'port-ready'); await Promise.resolve(); expect(ready).toBe(false);
    h.reply(request, 'ready', { latestPayloadLimit: 4096 }); expect(await started).toEqual({ latestPayloadLimit: 4096 });
    expect(h.ports[0]).toEqual([p]); await h.owner.dispose(); expect(p.close).toHaveBeenCalledOnce(); expect(h.dispose).toHaveBeenCalledOnce();
  });
  it('rejects an out-of-order ready and closes only that attempt', async () => {
    const h = harness(), first = h.owner.startAttempt(config('a', 'guest-a'), h.port()), rejected = expect(first).rejects.toThrow('rtc-attempt-failed');
    const second = h.owner.startAttempt(config('b', 'guest-b'), h.port()), a = h.requests[0]!, b = h.requests[1]!;
    h.reply(a, 'ready', { latestPayloadLimit: 16088 }); await rejected;
    h.reply(b, 'port-ready'); h.reply(b, 'ready', { latestPayloadLimit: 16088 }); await expect(second).resolves.toEqual({ latestPayloadLimit: 16088 });
    await h.owner.dispose();
  });
  it('bounds four active peers and validates expired/mismatched options before transfer', async () => {
    const h = harness();
    for (let n = 0; n < 4; n++) {
      const p = h.owner.startAttempt(config(String(n), String(n)), h.port()), req = h.requests.at(-1)!;
      h.reply(req, 'port-ready'); h.reply(req, 'ready', { latestPayloadLimit: 16088 }); await p;
    }
    const overflow = h.port(); await expect(h.owner.startAttempt(config('five', 'five'), overflow)).rejects.toThrow('rtc-attempt-capacity'); expect(overflow.close).toHaveBeenCalledOnce();
    const expired = h.port(); await expect(h.owner.startAttempt({ ...config(), ticketExpiresAtEpochMs: Date.now() }, expired)).rejects.toThrow('rtc-ticket-expired');
    const bad = config(); bad.identity.contentDigest = 'b'.repeat(64);
    await expect(h.owner.startAttempt(bad, h.port())).rejects.toThrow('rtc-config-invalid'); expect(h.requests).toHaveLength(4);
    await h.owner.dispose();
  });
  it('replaces one remote, rejects old readiness, ignores late callbacks and prohibits ID reuse', async () => {
    const h = harness(), oldPort = h.port(), old = h.owner.startAttempt(config('old'), oldPort), rejected = expect(old).rejects.toThrow('rtc-replaced');
    const previous = h.requests[0]!, next = h.owner.startAttempt(config('new'), h.port()), current = h.requests.at(-1)!;
    await rejected; expect(oldPort.close).toHaveBeenCalledOnce();
    h.reply(previous, 'port-ready'); h.reply(previous, 'ready', { latestPayloadLimit: 16088 });
    h.reply(current, 'port-ready'); h.reply(current, 'ready', { latestPayloadLimit: 4096 }); await next;
    await expect(h.owner.startAttempt(config('old'), h.port())).rejects.toThrow('rtc-attempt-id-used');
    await h.owner.dispose();
  });
  it('cancels before a late signal/port ack and waits for the matching close acknowledgement', async () => {
    const h = harness(), started = h.owner.startAttempt(config(), h.port()), rejected = expect(started).rejects.toThrow('rtc-cancelled');
    const start = h.requests[0]!, signals = vi.fn(); h.owner.onSignal(signals);
    const closing = h.owner.closeAttempt('a'), close = h.requests.at(-1)!; await rejected;
    h.reply(start, 'port-ready'); h.reply(start, 'ready', { latestPayloadLimit: 16088 });
    const signal: RtcSignal = { kind: 'candidate', candidate: null, attemptId: 'a', from: 'host', to: 'guest', roomId: 'room', hostGeneration: 7, seatGeneration: 1 };
    h.reply(start, 'signal', { signal }); expect(signals).not.toHaveBeenCalled();
    h.reply(close, 'closed'); await closing; await h.owner.dispose();
  });
  it('routes signal operations by main stamps, ignores stale generations and bounds pending requests', async () => {
    const h = harness(), started = h.owner.startAttempt(config(), h.port()), request = h.requests[0]!;
    const signal: RtcSignal = { kind: 'candidate', candidate: null, attemptId: 'a', from: 'guest', to: 'host', roomId: 'room', hostGeneration: 7, seatGeneration: 1 };
    h.reply(request, 'port-ready', { hostGeneration: 6 }); h.reply(request, 'port-ready'); h.reply(request, 'ready', { latestPayloadLimit: 16088 }); await started;
    const incoming = h.owner.receiveSignal(signal), operation = h.requests.at(-1)!;
    expect(operation).toMatchObject({ kind: 'signal', attemptGeneration: request.requestId });
    h.reply(operation, 'applied'); await incoming;
    const waiting = Array.from({ length: 64 }, () => h.owner.receiveSignal(signal));
    const outcomes = Promise.allSettled(waiting);
    await expect(h.owner.receiveSignal(signal)).rejects.toThrow('rtc-request-capacity');
    expect((await outcomes).every(x => x.status === 'rejected')).toBe(true); await h.owner.dispose();
  });
  it('releases offered endpoints on transfer failure and all pending starts on owner death/disposal', async () => {
    const p = { close: vi.fn() } as any;
    const owner = createRtcTransport(identity, { send() { throw Error('native'); }, onResponse: () => () => {}, dispose() {} });
    await expect(owner.startAttempt(config(), p)).rejects.toThrow('rtc-attempt-failed'); expect(p.close).toHaveBeenCalledOnce(); await owner.dispose();
    const h = harness(), one = h.owner.startAttempt(config('one', 'one'), h.port()), two = h.owner.startAttempt(config('two', 'two'), h.port());
    const outcomes = Promise.allSettled([one, two]); await h.owner.dispose(); expect((await outcomes).every(x => x.status === 'rejected')).toBe(true);
    const late = h.port(); await expect(h.owner.startAttempt(config('late'), late)).rejects.toThrow('rtc-disposed'); expect(late.close).toHaveBeenCalledOnce();
  });
  it('times out one start without closing the other ready peer', async () => {
    vi.useFakeTimers(); const h = harness(), pending = h.owner.startAttempt(config('slow', 'slow'), h.port()), rejected = expect(pending).rejects.toThrow('rtc-attempt-failed');
    const ready = h.owner.startAttempt(config('fast', 'fast'), h.port()), req = h.requests.at(-1)!;
    h.reply(req, 'port-ready'); h.reply(req, 'ready', { latestPayloadLimit: 16088 }); await ready;
    await vi.advanceTimersByTimeAsync(31000); await rejected; expect(h.dispose).not.toHaveBeenCalled(); await h.owner.dispose();
  });
});

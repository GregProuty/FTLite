import { describe, expect, it, vi } from 'vitest';
import { createTransportController } from '../src/network/transport/controller';
import { connectTransportPort } from '../src/network/transport/bridge';
import { rtcLocalDeadline, type RtcAttemptOptions, type RtcResponse } from '../src/shared/rtcSession';
import type { PortEndpoint } from '../src/shared/netSession';
import type { Link, ChannelKind } from '../src/renderer/src/net/contracts';
import type { RtcPeerOptions } from '../src/network/rtc/peer';
import { encodeControl, encodeOpaquePacket } from '../src/network/state/imageCodec';
import { createPortLink } from '../src/network/portLink';
import { createStateSender } from '../src/network/state/sender';

const identity = { modeId: 'counter', schemaVersion: 1, simVersion: 9, contentDigest: 'a'.repeat(64), hostGeneration: 7 };
function config(attemptId: string, remoteConnectionId = attemptId): RtcAttemptOptions {
  return { attemptId, role: 'offerer', identity: { ...identity, protocolVersion: 2, layoutHash: '1234abcd', runId: 'run', roomId: 'room', seatGeneration: 1,
    localConnectionId: 'host', remoteConnectionId }, localTicket: 'local', expectedRemoteTicket: 'remote', ticketExpiresAtEpochMs: 2000, iceServers: [] };
}
class Port implements PortEndpoint {
  messages = new Set<(data: unknown) => void>(); closes = new Set<() => void>(); sent: any[] = []; closed = false;
  postMessage(value: unknown) { this.sent.push(value); }
  onMessage(cb: (data: unknown) => void) { this.messages.add(cb); return () => { this.messages.delete(cb); }; }
  onClose(cb: () => void) { this.closes.add(cb); return () => { this.closes.delete(cb); }; }
  start() {} close() { this.closed = true; }
  receive(value: unknown) { for (const cb of this.messages) cb(value); }
}
function fakeLink(cap = 16088) {
  const messages = new Set<(kind: ChannelKind, bytes: Uint8Array) => void>(), closes = new Set<(reason: string) => void>();
  let closed = false;
  const link: Link = { peer: 'remote', caps: { unreliable: true, maxDatagram: cap, p2p: true, hidesPeerIp: false },
    send: vi.fn(), stats: () => ({ rttMs: 0, lossPct: 0, bufferedBytes: 0, relayed: false }),
    onMessage(cb) { messages.add(cb); return () => { messages.delete(cb); }; },
    onClose(cb) { if (closed) cb('closed'); else closes.add(cb); return () => { closes.delete(cb); }; },
    close: vi.fn(() => { if (closed) return; closed = true; for (const cb of [...closes]) cb('closed'); }) };
  return { link, emit: (kind: ChannelKind, bytes: Uint8Array) => { for (const cb of messages) cb(kind, bytes); }, messages, closes };
}
function harness() {
  const responses: RtcResponse[] = [], peers: { options: RtcPeerOptions; close: ReturnType<typeof vi.fn>; resolve(link: Link): void; signal: ReturnType<typeof vi.fn> }[] = [];
  let wall = 1000;
  const controller = createTransportController({ identity, respond: response => responses.push(response), wallNow: () => wall, clock: { nowMs: () => 900000 },
    createPeer(options) { let resolve!: (link: Link) => void; const ready = new Promise<Link>(done => { resolve = done; });
      const close = vi.fn(), signal = vi.fn(async () => {}); peers.push({ options, close, resolve, signal });
      return { ready, close, receiveSignal: signal, diagnostics: () => ({ rttMs: 0, lossPct: 0, bufferedBytes: 0, relayed: false }) }; } });
  let id = 0;
  const start = (attemptId: string, port = new Port(), remote = attemptId) => {
    const request = { version: 1 as const, kind: 'start' as const, hostGeneration: 7, requestId: ++id, options: config(attemptId, remote) };
    controller.receive(request, [port]); return { request, port };
  };
  return { controller, responses, peers, start, wall: (value: number) => { wall = value; }, next: () => ++id };
}

describe('hidden RTC bridge', () => {
  it('converts epoch expiry once across different process clock origins and caps setup', () => {
    expect(rtcLocalDeadline(11000, 1000, 700)).toBe(10700);
    expect(rtcLocalDeadline(11000, 1000, 900000)).toBe(910000);
    expect(rtcLocalDeadline(100000, 1000, 700)).toBe(30700);
    expect(() => rtcLocalDeadline(1000, 1000, 700)).toThrow('rtc-ticket-expired');
  });
  it('keeps the converted deadline unchanged after a backward wall-clock jump', async () => {
    const h = harness(); h.start('a'); expect(h.peers[0]!.options.ticketExpiresAtMs).toBe(901000);
    h.wall(-999999); const link = fakeLink(); h.peers[0]!.resolve(link.link); await Promise.resolve();
    expect(h.peers[0]!.options.ticketExpiresAtMs).toBe(901000); h.controller.dispose();
  });
  it('installs port listeners before port-ready and native ready, then isolates two routes', async () => {
    const h = harness(), a = h.start('a'), b = h.start('b'), one = fakeLink(4096), two = fakeLink();
    expect(a.port.messages.size).toBe(1); expect(h.responses.map(x => x.kind)).toEqual(['port-ready', 'port-ready']);
    h.peers[0]!.resolve(one.link); h.peers[1]!.resolve(two.link); await Promise.resolve();
    expect(h.responses.filter(x => x.kind === 'ready')).toMatchObject([{ attemptId: 'a', latestPayloadLimit: 4096 }, { attemptId: 'b', latestPayloadLimit: 16088 }]);
    const input = encodeOpaquePacket('input', 'command', 1, new Uint8Array([5]));
    a.port.receive({ version: 1, type: 'data', id: 1, kind: 'reliable-ordered', bytes: input });
    expect(one.link.send).toHaveBeenCalledWith('reliable-ordered', input); expect(two.link.send).not.toHaveBeenCalled();
    const notification = encodeOpaquePacket('state', 'sector-notification', 2, new Uint8Array([9]));
    two.emit('reliable-ordered', notification); expect(b.port.sent.at(-1)).toMatchObject({ type: 'data', bytes: notification });
    expect(a.port.sent.at(-1)).toEqual({ version: 1, type: 'ack', id: 1 });
    one.link.close('failed'); expect(a.port.closed).toBe(true); expect(b.port.closed).toBe(false); h.controller.dispose();
    expect(b.port.closed).toBe(true); expect(h.peers.every(peer => peer.close.mock.calls.length === 1)).toBe(true);
  });
  it('forwards exact full-received and validated ACK envelopes while storage ACKs stay local', async () => {
    const h = harness(), a = h.start('a'), rtc = fakeLink(); h.peers[0]!.resolve(rtc.link); await Promise.resolve();
    const receipt = encodeControl({ kind: 'full-received', sequence: 47 }, 1), ack = encodeControl({ kind: 'ack', sequence: 47 }, 2);
    rtc.emit('reliable-ordered', receipt); rtc.emit('reliable-ordered', ack);
    expect(a.port.sent.map(x => x.bytes)).toEqual([receipt, ack]);
    a.port.receive({ version: 1, type: 'ack', id: 1 }); expect(rtc.link.send).not.toHaveBeenCalled();
    a.port.receive({ version: 1, type: 'data', id: 1, kind: 'reliable-ordered', bytes: receipt });
    a.port.receive({ version: 1, type: 'data', id: 2, kind: 'reliable-ordered', bytes: ack });
    expect(rtc.link.send).toHaveBeenNthCalledWith(1, 'reliable-ordered', receipt); expect(rtc.link.send).toHaveBeenNthCalledWith(2, 'reliable-ordered', ack); h.controller.dispose();
  });
  it('retains real sender full credit across ports until the exact RTC receipt; only validated ACKs select delta bases', async () => {
    const h = harness(), port = new Port(), rtc = fakeLink();
    let authorityReceive = (_: unknown) => {};
    const authority = createPortLink({ postMessage: data => port.receive(data), start() {}, close() {},
      onMessage(callback) { authorityReceive = callback; return () => { authorityReceive = () => {}; }; }, onClose: () => () => {}
    }, 'guest');
    port.postMessage = value => { port.sent.push(value); authorityReceive(value); };
    h.start('a', port); h.peers[0]!.resolve(rtc.link); await Promise.resolve();
    const sender = createStateSender({ send: authority.send, latestPayloadLimit: 16088, clock: { nowMs: () => 0 }, close: authority.close });
    authority.onMessage((_kind, bytes) => sender.receiveControl(bytes));
    const publish = (sequence: number) => {
      const values = new Float64Array(32); values[0] = sequence;
      sender.publish({ sequence, tick: sequence * 3, epoch: 'e', metadata: new Uint8Array(), values }, false);
    };
    publish(1); publish(2);
    expect(authority.stats().bufferedBytes).toBe(0); // All port-storage ACKs already arrived.
    expect(sender.stats().pendingOrdinary).toBe(true); expect(rtc.link.send).toHaveBeenCalledTimes(1);
    rtc.emit('reliable-ordered', encodeControl({ kind: 'full-received', sequence: 99 }, 1)); expect(rtc.link.send).toHaveBeenCalledTimes(1);
    rtc.emit('reliable-ordered', encodeControl({ kind: 'full-received', sequence: 1 }, 2));
    expect(rtc.link.send).toHaveBeenCalledTimes(2); expect(vi.mocked(rtc.link.send).mock.calls[1]![0]).toBe('reliable-ordered'); // Receipt did not select a baseline.
    publish(3); expect(sender.stats().pendingOrdinary).toBe(true);
    rtc.emit('reliable-ordered', encodeControl({ kind: 'ack', sequence: 2 }, 3)); expect(rtc.link.send).toHaveBeenCalledTimes(2);
    rtc.emit('reliable-ordered', encodeControl({ kind: 'full-received', sequence: 1 }, 4)); expect(rtc.link.send).toHaveBeenCalledTimes(2);
    rtc.emit('reliable-ordered', encodeControl({ kind: 'full-received', sequence: 2 }, 5));
    expect(rtc.link.send).toHaveBeenCalledTimes(3); expect(vi.mocked(rtc.link.send).mock.calls[2]![0]).toBe('unreliable-latest');
    sender.dispose(); authority.close('disposed'); h.controller.dispose();
  });
  it('cancels/replaces one pending peer and closes late native readiness without resurrection', async () => {
    const h = harness(), first = h.start('a', new Port(), 'same'), second = h.start('b', new Port(), 'same');
    expect(first.port.closed).toBe(true); expect(h.peers[0]!.close).toHaveBeenCalledOnce();
    const late = fakeLink(); h.peers[0]!.resolve(late.link); h.peers[0]!.options.emitSignal({ kind: 'candidate', candidate: null, attemptId: 'a', roomId: 'room', seatGeneration: 1, hostGeneration: 7, from: 'host', to: 'same' });
    await Promise.resolve(); expect(late.link.close).toHaveBeenCalledOnce(); expect(h.responses.filter(x => x.attemptId === 'a').map(x => x.kind)).toEqual(['port-ready', 'failed']);
    h.controller.receive({ version: 1, hostGeneration: 7, requestId: h.next(), kind: 'close', attemptId: 'b', attemptGeneration: second.request.requestId }, []);
    expect(second.port.closed).toBe(true); h.controller.dispose();
  });
  it('rejects wrong generation, excess/unexpected ports, duplicate requests and a fifth peer', () => {
    const h = harness(), p = new Port(), first = h.start('a');
    h.controller.receive(first.request, [p]); expect(p.closed).toBe(true);
    const q = new Port(); h.controller.receive({ ...first.request, requestId: h.next(), hostGeneration: 8 }, [q]); expect(q.closed).toBe(true);
    const r = new Port(), s = new Port(); h.controller.receive({ ...first.request, requestId: h.next(), options: config('excess') }, [r, s]); expect(r.closed && s.closed).toBe(true);
    h.start('b'); h.start('c'); h.start('d'); const fifth = h.start('e'); expect(fifth.port.closed).toBe(true); expect(h.peers).toHaveLength(4);
    h.controller.dispose(); expect(first.port.messages.size).toBe(0); expect(first.port.closes.size).toBe(0);
  });
  it('closes partial endpoints on native construction failure or payload before readiness', () => {
    const responses: RtcResponse[] = [], port = new Port();
    const controller = createTransportController({ identity, respond: x => responses.push(x), wallNow: () => 1000, createPeer() { throw Error('native'); } });
    controller.receive({ version: 1, hostGeneration: 7, requestId: 1, kind: 'start', options: config('a') }, [port]);
    expect(port.closed).toBe(true); expect(responses.map(x => x.kind)).toEqual(['port-ready', 'failed']); controller.dispose();
    const h = harness(), early = h.start('early'); early.port.receive({ version: 1, type: 'data', id: 1, kind: 'reliable-ordered', bytes: new Uint8Array([1]) });
    expect(early.port.closed).toBe(true); expect(h.peers[0]!.close).toHaveBeenCalledOnce(); h.controller.dispose();
  });
  it('answers a transport port with transport-ready for its identity only (web build spec §3.2)', async () => {
    const channel = new MessageChannel();
    const received = new Promise(resolve => { channel.port2.addEventListener('message', event => resolve((event as MessageEvent).data), { once: true }); channel.port2.start(); });
    connectTransportPort(channel.port1, identity);
    expect(await received).toEqual({ kind: 'transport-ready', protocolVersion: 2, ...identity });
    channel.port1.close(); channel.port2.close();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createPageTransport } from '../src/network/transport/pageTransport';
import { SESSION_PROTOCOL_VERSION } from '../src/shared/netSession';
import type { RtcAttemptOptions } from '../src/shared/rtcSession';
import type { Link } from '../src/renderer/src/net/contracts';
import type { RtcPeerOptions } from '../src/network/rtc/peer';

const identity = { modeId: 'counter', schemaVersion: 1, simVersion: 9, contentDigest: 'a'.repeat(64), hostGeneration: 7 };
const config = (attemptId: string): RtcAttemptOptions => ({ attemptId, role: 'offerer', identity: { ...identity, protocolVersion: 2, layoutHash: '1234abcd', runId: 'run',
  roomId: 'room', seatGeneration: 1, localConnectionId: 'host', remoteConnectionId: attemptId }, localTicket: 'local', expectedRemoteTicket: 'remote',
  ticketExpiresAtEpochMs: Date.now() + 20000, iceServers: [] });
function link(cap = 16088): Link {
  const closes = new Set<(reason: string) => void>();
  return { peer: 'remote', caps: { unreliable: true, maxDatagram: cap, p2p: true, hidesPeerIp: false }, send: vi.fn(),
    stats: () => ({ rttMs: 0, lossPct: 0, bufferedBytes: 0, relayed: false }), onMessage: () => () => {},
    onClose(cb) { closes.add(cb); return () => { closes.delete(cb); }; }, close: vi.fn((reason: string) => { for (const cb of [...closes]) cb(reason); }) };
}
function harness() {
  const peers: { options: RtcPeerOptions; resolve(link: Link): void }[] = [];
  const transport = createPageTransport(identity, { createPeer(options) {
    let resolve!: (value: Link) => void; const ready = new Promise<Link>(done => { resolve = done; });
    peers.push({ options, resolve });
    return { ready, close: vi.fn(), receiveSignal: vi.fn(async () => {}), diagnostics: () => ({ rttMs: 0, lossPct: 0, bufferedBytes: 0, relayed: false }) };
  } });
  return { transport, peers };
}
describe('page transport: the RTC owner and controller in one page (web build spec §3)', () => {
  it('runs an attempt from start to ready across the in-page request protocol', async () => {
    const h = harness(), channel = new MessageChannel();
    const ready = h.transport.controller.startAttempt(config('a'), channel.port1);
    await vi.waitFor(() => expect(h.peers).toHaveLength(1));
    h.peers[0]!.resolve(link());
    await expect(ready).resolves.toEqual({ latestPayloadLimit: 16088 });
    h.transport.dispose(); channel.port2.close();
  });
  it('answers the Worker transport port with transport-ready, and only one port', async () => {
    const h = harness(), channel = new MessageChannel(), second = new MessageChannel();
    const received = new Promise(resolve => { channel.port2.addEventListener('message', event => resolve((event as MessageEvent).data), { once: true }); channel.port2.start(); });
    h.transport.connect(channel.port1);
    expect(await received).toEqual({ kind: 'transport-ready', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity });
    expect(() => h.transport.connect(second.port1)).toThrow('transport-unavailable');
    h.transport.dispose(); channel.port2.close(); second.port2.close();
  });
  it('reports a public controller disposal as one exit and an owner disposal as none', async () => {
    const a = harness(), lost = vi.fn(); a.transport.onExit(lost);
    await a.transport.controller.dispose(); await a.transport.controller.dispose(); expect(lost).toHaveBeenCalledOnce();
    const b = harness(), quiet = vi.fn(), late = new MessageChannel(); b.transport.onExit(quiet); b.transport.dispose();
    expect(quiet).not.toHaveBeenCalled();
    await expect(b.transport.controller.startAttempt(config('late'), late.port1)).rejects.toThrow('rtc-disposed'); late.port2.close();
  });
});

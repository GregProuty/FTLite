import type { Link, Unsubscribe } from '../../renderer/src/net/contracts';
import type { HostIdentity } from '../../shared/hostProcessProtocol';
import { matchesIdentity } from '../../shared/hostProcessProtocol';
import type { PortEndpoint } from '../../shared/netSession';
import { isRtcRequest, RTC_MAX_ATTEMPTS, RTC_OWNER_ATTEMPT_LIMIT, rtcLocalDeadline, validRtcCap, type RtcResponse } from '../../shared/rtcSession';
import { createPortLink } from '../portLink';
import { createRtcPeer, type RtcPeer, type RtcPeerOptions } from '../rtc/peer';
import { classifyStreamPacket } from '../state/imageCodec';

export interface HiddenControllerOptions {
  identity: HostIdentity;
  respond(response: RtcResponse): void;
  wallNow?(): number;
  clock?: RtcPeerOptions['clock'];
  scheduler?: RtcPeerOptions['scheduler'];
  createPeer?: (options: RtcPeerOptions) => RtcPeer;
}
/** Generic bridge: receipts, validated ACKs and opaque mode payloads pass unchanged. */
export function createTransportController(options: HiddenControllerOptions) {
  const clock = options.clock ?? { nowMs: () => performance.now() };
  const scheduler = options.scheduler ?? { schedule(ms: number, callback: () => void) { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); } };
  const attempts = new Map<string, { generation: number; remote: string; close(): void }>();
  let disposed = false, lastRequest = 0, started = 0;
  function receive(value: unknown, ports: readonly PortEndpoint[]): void {
    const rejectPorts = () => { for (const port of ports) { try { port.close(); } catch {} } };
    if (disposed || !isRtcRequest(value) || value.hostGeneration !== options.identity.hostGeneration || value.requestId <= lastRequest) { rejectPorts(); return; }
    lastRequest = value.requestId;
    const attemptId = value.kind === 'start' ? value.options.attemptId : value.attemptId;
    const stamp = { version: 1 as const, hostGeneration: value.hostGeneration, requestId: value.requestId, attemptId };
    const respond = (message: RtcResponse) => { if (!disposed) options.respond(message); };
    if (value.kind !== 'start') {
      if (ports.length) { rejectPorts(); return; }
      const entry = attempts.get(attemptId);
      if (value.kind === 'close') {
        if (entry?.generation === value.attemptGeneration) entry.close();
        respond({ ...stamp, kind: 'closed' }); return;
      }
      if (entry?.generation !== value.attemptGeneration) { respond({ ...stamp, kind: 'applied' }); return; }
      // Signal processing is attached below without retaining tickets or native objects in IPC state.
      void signals.get(attemptId)!(value.signal).then(() => respond({ ...stamp, kind: 'applied' }), () => entry.close());
      return;
    }
    const config = value.options;
    if (ports.length !== 1 || !matchesIdentity(config.identity, options.identity) || attempts.has(attemptId)
      || ++started > RTC_OWNER_ATTEMPT_LIMIT) { rejectPorts(); respond({ ...stamp, kind: 'failed' }); return; }
    // Replacement affects only the same remote endpoint. A fresh attempt ID is required by main.
    for (const entry of attempts.values()) if (entry.remote === config.identity.remoteConnectionId) entry.close();
    if (attempts.size >= RTC_MAX_ATTEMPTS) { rejectPorts(); respond({ ...stamp, kind: 'failed' }); return; }
    let deadline: number;
    try { deadline = rtcLocalDeadline(config.ticketExpiresAtEpochMs, (options.wallNow ?? Date.now)(), clock.nowMs()); }
    catch { rejectPorts(); respond({ ...stamp, kind: 'failed' }); return; }
    let portLink: Link | undefined, rtc: Link | undefined, peer: RtcPeer | undefined, closed = false;
    const removers: Unsubscribe[] = [];
    function close() {
      if (closed) return; closed = true;
      attempts.delete(attemptId); signals.delete(attemptId);
      for (const off of removers.splice(0)) off();
      portLink?.close('rtc-attempt-closed'); peer?.close('rtc-attempt-closed');
      // Construction failure may precede PortLink ownership.
      if (!portLink) rejectPorts();
      respond({ ...stamp, kind: 'failed' });
    }
    function subscribe(register: () => Unsubscribe) { const off = register(); if (closed) off(); else removers.push(off); }
    attempts.set(attemptId, { generation: value.requestId, remote: config.identity.remoteConnectionId, close });
    try {
      portLink = createPortLink(ports[0]!, config.identity.remoteConnectionId, { latestStreamKey: bytes => classifyStreamPacket(bytes).stream });
      subscribe(() => portLink!.onClose(close));
      if (closed) return;
      subscribe(() => portLink!.onMessage((kind, bytes) => {
        if (!rtc) { close(); return; }
        // The mode's generic envelope remains intact; no JSON/gameplay decoding here.
        classifyStreamPacket(bytes); rtc.send(kind, bytes);
      }));
      if (closed) return;
      respond({ ...stamp, kind: 'port-ready' });
      peer = (options.createPeer ?? createRtcPeer)({ ...config, ticketExpiresAtMs: deadline,
        classify: classifyStreamPacket, clock, scheduler,
        emitSignal(signal) { if (!closed) respond({ ...stamp, kind: 'signal', signal }); } });
      if (closed) { peer.close('rtc-attempt-closed'); return; }
      signals.set(attemptId, signal => peer!.receiveSignal(signal));
      void peer.ready.then(link => {
        if (closed || disposed) { link.close('rtc-attempt-closed'); return; }
        rtc = link;
        subscribe(() => link.onClose(close));
        if (closed) return;
        subscribe(() => link.onMessage((kind, bytes) => { classifyStreamPacket(bytes); portLink!.send(kind, bytes); }));
        if (closed) return;
        if (!validRtcCap(link.caps.maxDatagram)) { close(); return; }
        respond({ ...stamp, kind: 'ready', latestPayloadLimit: link.caps.maxDatagram });
      }, close);
    } catch { close(); }
  }
  const signals = new Map<string, (signal: unknown) => Promise<void>>();
  return { receive, dispose() { if (disposed) return; disposed = true; for (const entry of [...attempts.values()]) entry.close(); signals.clear(); } };
}

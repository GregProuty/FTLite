import type { ChannelKind, Link, Unsubscribe } from '../../renderer/src/net/contracts';
import { RTC_DRAIN_FRAMES, RTC_MAX_HEADER_BYTES, RTC_MAX_PACKET_BYTES, RTC_MAX_RECORDS, RTC_MAX_STREAMS, RTC_RELIABLE_BYTES, RTC_RELIABLE_HIGH_WATER, validMetadata, type RtcDataChannel, type RtcDataLinkOptions } from './contracts';
import { createRtcReassembler, encodeRtcFrames, rtcPacketLimit, type RtcPacket } from './frames';

type Timer = { cancel?: Unsubscribe };
/** Only accepts channels whose options and peer identity have already been authenticated.
 * Owns channel listeners/close after construction. Scheduler callbacks must run asynchronously. */
export function createRtcDataLink(channels: { reliable: RtcDataChannel; latest: RtcDataChannel }, options: RtcDataLinkOptions): Link {
  const packetLimit = rtcPacketLimit(options.maxMessageSize), maxDatagram = packetLimit - RTC_MAX_HEADER_BYTES;
  if (channels.reliable === channels.latest || channels.reliable.readyState !== 'open' || channels.latest.readyState !== 'open') throw new Error('rtc-channels-not-open');
  const receiver = createRtcReassembler(packetLimit), reliable: Uint8Array[] = [], latest = new Map<string, Uint8Array>();
  const outgoingReliable = new Map<string, number>(), outgoingLatest = new Map<string, number>();
  const outstanding: number[] = [], latestOutstanding: number[] = [], messages = new Set<(kind: ChannelKind, bytes: Uint8Array) => void>(), closes = new Set<(reason: string) => void>();
  const off: Unsubscribe[] = [];
  let queuedBytes = 0, outstandingBytes = 0, latestOutstandingBytes = 0, nextId = 1, closed = false, closeReason = '', draining = false, preferLatest = true;
  let drainTimer: Timer | undefined, expiryTimer: Timer | undefined, initial: { kind: ChannelKind; packet: RtcPacket } | undefined;
  function cancelTimer(timer: Timer | undefined) { try { timer?.cancel?.(); } catch { /* finish disposal */ } }
  function close(reason: string) {
    if (closed) return;
    closed = true; closeReason = reason;
    cancelTimer(drainTimer); cancelTimer(expiryTimer); drainTimer = expiryTimer = undefined;
    for (const unsubscribe of off.splice(0)) { try { unsubscribe(); } catch { /* finish disposal */ } }
    reliable.length = outstanding.length = latestOutstanding.length = 0; queuedBytes = outstandingBytes = latestOutstandingBytes = 0; latest.clear(); outgoingReliable.clear(); outgoingLatest.clear(); receiver.clear(); initial = undefined; messages.clear();
    for (const channel of [channels.reliable, channels.latest]) { try { channel.close(); } catch { /* close both */ } }
    for (const callback of [...closes]) { try { callback(reason); } catch { /* close every listener */ } }
    closes.clear();
  }
  function releaseRecords() {
    const buffered = channels.reliable.bufferedAmount;
    while (outstanding.length && outstandingBytes - outstanding[0]! >= buffered) outstandingBytes -= outstanding.shift()!;
    while (latestOutstanding.length && latestOutstandingBytes - latestOutstanding[0]! >= channels.latest.bufferedAmount) latestOutstandingBytes -= latestOutstanding.shift()!;
  }
  function readyReliable(): boolean { return reliable.length > 0 && channels.reliable.bufferedAmount + reliable[0]!.length <= RTC_RELIABLE_HIGH_WATER; }
  function readyLatest(): boolean {
    const first = latest.values().next().value as Uint8Array | undefined;
    return !!first && channels.latest.bufferedAmount + first.length <= RTC_MAX_PACKET_BYTES;
  }
  function queueDrain() {
    if (closed || drainTimer || (!readyReliable() && !readyLatest())) return;
    const token: Timer = {}; drainTimer = token;
    token.cancel = options.scheduler.schedule(0, () => { if (closed || drainTimer !== token) return; drainTimer = undefined; drain(); });
    if (closed || drainTimer !== token) cancelTimer(token);
  }
  function drain() {
    if (closed || draining) return;
    draining = true;
    try {
      releaseRecords();
      for (let n = 0; n < RTC_DRAIN_FRAMES && !closed; n++) {
        const canReliable = readyReliable(), canLatest = readyLatest();
        if (!canReliable && !canLatest) break;
        let frame: Uint8Array, channel: RtcDataChannel;
        if (canLatest && (preferLatest || !canReliable)) {
          const [stream, bytes] = latest.entries().next().value!; latest.delete(stream); frame = bytes; channel = channels.latest; latestOutstanding.push(frame.length); latestOutstandingBytes += frame.length; preferLatest = false;
        } else {
          frame = reliable.shift()!; queuedBytes -= frame.length; outstanding.push(frame.length); outstandingBytes += frame.length; channel = channels.reliable; preferLatest = true;
        }
        if (channel.readyState !== 'open') { close('rtc-channel-closed'); break; }
        try { channel.send(frame.buffer as ArrayBuffer); } catch { close('rtc-send-failed'); }
      }
    } finally { draining = false; }
    queueDrain();
  }
  function scheduleExpiry() {
    cancelTimer(expiryTimer); expiryTimer = undefined;
    if (closed || receiver.partialCount === 0) return;
    const token: Timer = {}; expiryTimer = token;
    token.cancel = options.scheduler.schedule(Math.max(0, receiver.nextExpiry - options.clock.nowMs()), () => {
      if (closed || expiryTimer !== token) return;
      expiryTimer = undefined; receiver.expire(options.clock.nowMs()); scheduleExpiry();
    });
    if (closed || expiryTimer !== token) cancelTimer(token);
  }
  function deliver(kind: ChannelKind, packet: RtcPacket) {
    try { for (const cb of [...messages]) { if (closed) break; cb(kind, packet.bytes.slice()); } }
    catch { close('rtc-receiver-failed'); }
  }
  function receive(kind: ChannelKind, event: Event) {
    if (closed) return;
    const data: unknown = (event as MessageEvent).data;
    if (!(data instanceof ArrayBuffer) || data.byteLength > packetLimit) { close('rtc-invalid-frame'); return; }
    let packet: RtcPacket | undefined;
    try { packet = receiver.accept(new Uint8Array(data), kind, options.clock.nowMs()); }
    catch { close('rtc-invalid-frame'); return; }
    scheduleExpiry(); if (!packet || closed) return;
    try {
      const m = options.classify(packet.bytes.slice());
      if (!validMetadata(m) || m.class !== packet.metadata.class || m.stream !== packet.metadata.stream || m.sequence !== packet.metadata.sequence) { close('rtc-invalid-payload'); return; }
    } catch { close('rtc-invalid-payload'); return; }
    if (closed) return;
    if (!messages.size) {
      if (initial) close('rtc-unobserved-overflow'); else initial = { kind, packet };
    } else deliver(kind, packet);
  }
  function listen(channel: RtcDataChannel, type: string, listener: EventListener) {
    if (closed) return;
    channel.addEventListener(type, listener);
    const unsubscribe = () => channel.removeEventListener(type, listener);
    if (closed) unsubscribe(); else off.push(unsubscribe);
  }
  try {
    for (const [channel, kind] of [[channels.reliable, 'reliable-ordered'], [channels.latest, 'unreliable-latest']] as const) {
      if (closed) break;
      channel.binaryType = 'arraybuffer'; channel.bufferedAmountLowThreshold = 0;
      listen(channel, 'message', event => receive(kind, event));
      listen(channel, 'bufferedamountlow', () => drain());
      listen(channel, 'close', () => close('rtc-channel-closed'));
      listen(channel, 'error', () => close('rtc-channel-error'));
    }
  } catch { close('rtc-channel-setup-failed'); throw new Error('rtc-channel-setup-failed'); }
  return {
    peer: options.peer, caps: { unreliable: true, maxDatagram, hidesPeerIp: false, p2p: true },
    send(kind, bytes) {
      if (closed) return;
      if ((kind !== 'reliable-ordered' && kind !== 'unreliable-latest') || !(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > 262144) { close('rtc-invalid-payload'); return; }
      const owned = bytes.slice();
      let frames: Uint8Array[], stream: string, sequence: number;
      try {
        const metadata = options.classify(owned.slice());
        if (closed) return;
        if (!validMetadata(metadata)) { close('rtc-invalid-payload'); return; }
        stream = metadata.stream; sequence = metadata.sequence;
        if (kind === 'unreliable-latest' && owned.length > maxDatagram) { close('rtc-latest-overflow'); return; }
        frames = encodeRtcFrames(owned, metadata, nextId++, packetLimit);
      } catch { close('rtc-invalid-payload'); return; }
      const ordinals = kind === 'reliable-ordered' ? outgoingReliable : outgoingLatest;
      if (!ordinals.has(stream) && ordinals.size >= RTC_MAX_STREAMS) { close('rtc-stream-overflow'); return; }
      if (sequence <= (ordinals.get(stream) ?? 0)) { close('rtc-stale-send'); return; }
      ordinals.set(stream, sequence);
      releaseRecords();
      const addedRecords = frames.length - (kind === 'unreliable-latest' && latest.has(stream) ? 1 : 0);
      if (reliable.length + outstanding.length + latest.size + latestOutstanding.length + addedRecords > RTC_MAX_RECORDS) {
        close(kind === 'reliable-ordered' ? 'rtc-reliable-overflow' : 'rtc-record-overflow'); return;
      }
      if (kind === 'reliable-ordered') {
        const bytes = frames.reduce((sum, f) => sum + f.length, 0);
        if (queuedBytes + channels.reliable.bufferedAmount + bytes > RTC_RELIABLE_BYTES) { close('rtc-reliable-overflow'); return; }
        reliable.push(...frames); queuedBytes += bytes;
      } else latest.set(stream, frames[0]!);
      drain();
    },
    onMessage(cb) {
      if (!closed) { messages.add(cb); if (initial) { const saved = initial; initial = undefined; deliver(saved.kind, saved.packet); } }
      return () => { messages.delete(cb); };
    },
    onClose(cb) { if (closed) cb(closeReason); else closes.add(cb); return () => { closes.delete(cb); }; },
    stats() {
      if (closed) return { rttMs: 0, lossPct: 0, relayed: false, bufferedBytes: 0 };
      let bufferedBytes = queuedBytes + channels.reliable.bufferedAmount + channels.latest.bufferedAmount;
      for (const frame of latest.values()) bufferedBytes += frame.length;
      return { rttMs: 0, lossPct: 0, relayed: false, bufferedBytes };
    },
    close() { close('rtc-closed'); }
  };
}

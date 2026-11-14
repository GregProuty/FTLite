import type { ChannelKind, Compatibility, HostOpts, Link, PeerId, Session, TransportCaps, Unsubscribe } from './contracts';
import { latestMessageMetadata } from './codec';

const MAX_QUEUED_BYTES = 1_048_576;
const CAPS: Readonly<TransportCaps> = Object.freeze({ unreliable: true, maxDatagram: 65_536, hidesPeerIp: true, p2p: false });
export interface LoopbackOptions {
  /** Reliable packets may be delayed, never dropped/reordered. Zero is the next drain. */
  impairment?: (packet: Readonly<{ kind: ChannelKind; peer: PeerId; ordinal: number }>) => { delayDrains?: number; drop?: boolean };
  reverseLatest?: boolean;
}
type MessageListener = (kind: ChannelKind, bytes: Uint8Array) => void;
interface Packet { bytes: Uint8Array; ordinal: number; readyDrain: number; sequence?: number }
interface Direction {
  reliable: Packet[];
  latest: Map<string, Packet>;
  sent: number; dropped: number;
  buffered: number;
}
function direction(): Direction { return { reliable: [], latest: new Map(), sent: 0, dropped: 0, buffered: 0 }; }
function subscribe<T>(listeners: Set<T>, cb: T): Unsubscribe { listeners.add(cb); return () => { listeners.delete(cb); }; }
// One observer must not prevent teardown or delivery to the other owners.
function notify<T extends unknown[]>(listeners: Set<(...args: T) => void>, args: T): void {
  for (const cb of [...listeners]) if (listeners.has(cb)) { try { cb(...args); } catch { /* observer owns its errors */ } }
}
function validCompatibility(value: Compatibility): boolean {
  return Number.isSafeInteger(value.protocolVersion) && value.protocolVersion > 0
    && Number.isSafeInteger(value.simVersion) && value.simVersion > 0 && /^[0-9a-f]{64}$/.test(value.contentDigest);
}
function compatible(a: Compatibility, b: Compatibility): boolean {
  return a.protocolVersion === b.protocolVersion && a.simVersion === b.simVersion && a.contentDigest === b.contentDigest;
}

/** One harness is one local registry, with an explicit, nonreentrant drain queue. */
export function createLoopbackHarness(compatibility: Compatibility, options: LoopbackOptions = {}): {
  createSession(expectedCompatibility?: Compatibility): Session;
  drain(): void;
} {
  if (!validCompatibility(compatibility)) throw new Error('invalid loopback compatibility');
  const defaults = { ...compatibility };
  const registry = new Map<string, LocalSession>(), pairs = new Set<Pair>();
  let nextSession = 0, nextCode = 0, ordinal = 0, drainNumber = 0, draining = false;

  class LocalSession implements Session {
    readonly peers = new Set<LocalLink>();
    readonly linkListeners = new Set<(link: Link) => void>();
    readonly lostListeners = new Set<(peer: PeerId) => void>();
    readonly peer: PeerId;
    readonly expected: Compatibility;
    closed = false;
    code: string | null = null;
    constructor(expected: Compatibility) { this.peer = 'local-' + ++nextSession; this.expected = { ...expected }; }
    get links(): readonly Link[] { return [...this.peers]; }
    async host(opts: HostOpts): Promise<{ joinCode: string }> {
      if (this.closed || this.code || this.peers.size) throw new Error('session unavailable');
      if (opts.protocolVersion !== this.expected.protocolVersion || opts.contentDigest !== this.expected.contentDigest) throw new Error('incompatible host options');
      this.code = 'local-' + ++nextCode; registry.set(this.code, this);
      return { joinCode: this.code };
    }
    async join(code: string, _seatToken?: string): Promise<void> {
      // Tokens are reserved; even a nonempty token is not authentication.
      if (this.closed || this.code || this.peers.size) throw new Error('session unavailable');
      const host = registry.get(code);
      if (!host || host.closed || host === this) throw new Error('unknown local join code');
      if (!compatible(host.expected, this.expected)) throw new Error('incompatible loopback session');
      const pair = new Pair(this, host); pairs.add(pair);
      this.peers.add(pair.a); host.peers.add(pair.b);
      notify(host.linkListeners, [pair.b]); notify(this.linkListeners, [pair.a]);
    }
    onLink(cb: (link: Link) => void): Unsubscribe { return subscribe(this.linkListeners, cb); }
    onLinkLost(cb: (peer: PeerId) => void): Unsubscribe { return subscribe(this.lostListeners, cb); }
    close(reason: string): void {
      if (this.closed) return;
      this.closed = true;
      if (this.code) registry.delete(this.code);
      for (const link of [...this.peers]) link.close(reason);
      this.linkListeners.clear(); this.lostListeners.clear();
    }
  }
  class LocalLink implements Link {
    readonly caps = CAPS;
    readonly messages = new Set<MessageListener>();
    readonly closes = new Set<(reason: string) => void>();
    constructor(readonly owner: LocalSession, readonly peer: PeerId, readonly pair: Pair, readonly outgoing: Direction) {}
    send(kind: ChannelKind, bytes: Uint8Array): void { this.pair.send(this, kind, bytes); }
    onMessage(cb: MessageListener): Unsubscribe { return subscribe(this.messages, cb); }
    onClose(cb: (reason: string) => void): Unsubscribe { return subscribe(this.closes, cb); }
    stats() { return { rttMs: 0, lossPct: this.outgoing.sent === 0 ? 0 : 100 * this.outgoing.dropped / this.outgoing.sent, relayed: false, bufferedBytes: this.outgoing.buffered }; }
    close(reason: string): void { this.pair.close(reason); }
  }
  class Pair {
    readonly a: LocalLink;
    readonly b: LocalLink;
    closed = false;
    constructor(client: LocalSession, host: LocalSession) {
      this.a = new LocalLink(client, host.peer, this, direction());
      this.b = new LocalLink(host, client.peer, this, direction());
    }
    close(reason: string): void {
      if (this.closed) return;
      this.closed = true; pairs.delete(this);
      for (const link of [this.a, this.b]) {
        link.outgoing.reliable.length = 0; link.outgoing.latest.clear(); link.outgoing.buffered = 0;
        link.owner.peers.delete(link);
      }
      for (const link of [this.a, this.b]) {
        notify(link.closes, [reason]); notify(link.owner.lostListeners, [link.peer]);
        link.messages.clear(); link.closes.clear();
      }
    }
    send(link: LocalLink, kind: ChannelKind, bytes: Uint8Array): void {
      if (this.closed) return;
      if (kind !== 'reliable-ordered' && kind !== 'unreliable-latest') { this.close('unsupported-channel'); return; }
      if (!(bytes instanceof Uint8Array)) { this.close('invalid-payload'); return; }
      if (bytes.byteLength > CAPS.maxDatagram) { this.close('oversize'); return; }
      // Never retain a view of caller-owned memory, including Node Buffer.slice().
      const copy = Uint8Array.from(bytes);
      const outgoing = link.outgoing;
      let metadata: ReturnType<typeof latestMessageMetadata> = null;
      if (kind === 'unreliable-latest') {
        try { metadata = latestMessageMetadata(copy); } catch { this.close('invalid-latest'); return; }
        if (!metadata) { this.close('invalid-latest'); return; }
        const old = outgoing.latest.get(metadata.key);
        if (old && metadata.sequence <= old.sequence!) return;
        if (old) { outgoing.buffered -= old.bytes.byteLength; outgoing.latest.delete(metadata.key); }
      }
      if (outgoing.buffered + copy.byteLength > MAX_QUEUED_BYTES) {
        if (kind === 'reliable-ordered') this.close('reliable-overflow');
        return; // Latest overload never removes another stream or a reliable packet.
      }
      outgoing.sent++;
      const packetOrdinal = ++ordinal;
      let impairment: { delayDrains?: number; drop?: boolean } = {};
      try { impairment = options.impairment?.({ kind, peer: link.peer, ordinal: packetOrdinal }) ?? {}; }
      catch { this.close('invalid-impairment'); return; }
      const delay = impairment.delayDrains ?? 0;
      if (!Number.isSafeInteger(delay) || delay < 0) { this.close('invalid-impairment'); return; }
      if (kind === 'unreliable-latest' && impairment.drop) { outgoing.dropped++; return; }
      const packet: Packet = { bytes: copy, ordinal: packetOrdinal, readyDrain: drainNumber + delay + 1, sequence: metadata?.sequence };
      outgoing.buffered += copy.byteLength;
      if (kind === 'reliable-ordered') outgoing.reliable.push(packet);
      else outgoing.latest.set(metadata!.key, packet);
    }
    deliver(from: LocalLink, to: LocalLink, cutoff: number): void {
      const outgoing = from.outgoing;
      while (!this.closed) {
        const packet = outgoing.reliable[0];
        if (!packet || packet.ordinal > cutoff || packet.readyDrain > drainNumber) break;
        outgoing.reliable.shift(); outgoing.buffered -= packet.bytes.byteLength;
        this.deliverPacket(to, 'reliable-ordered', packet);
      }
      const latest = [...outgoing.latest.entries()];
      if (options.reverseLatest) latest.reverse();
      for (const [key, packet] of latest) {
        if (this.closed) return;
        if (packet.ordinal > cutoff || packet.readyDrain > drainNumber || outgoing.latest.get(key) !== packet) continue;
        outgoing.latest.delete(key); outgoing.buffered -= packet.bytes.byteLength;
        this.deliverPacket(to, 'unreliable-latest', packet);
      }
    }
    deliverPacket(to: LocalLink, kind: ChannelKind, packet: Packet): void {
      for (const cb of [...to.messages]) {
        if (this.closed) break;
        if (to.messages.has(cb)) { try { cb(kind, Uint8Array.from(packet.bytes)); } catch { /* independent observers */ } }
      }
    }
    drain(cutoff: number): void { this.deliver(this.a, this.b, cutoff); this.deliver(this.b, this.a, cutoff); }
  }
  return {
    createSession(expected = defaults) {
      if (!validCompatibility(expected)) throw new Error('invalid loopback compatibility');
      return new LocalSession(expected);
    },
    drain() {
      if (draining) return;
      draining = true; drainNumber++; const cutoff = ordinal;
      try { for (const pair of [...pairs]) pair.drain(cutoff); } finally { draining = false; }
    }
  };
}

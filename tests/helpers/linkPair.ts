// Two queued Link ends for headless stream tests: what one end sends waits until the test delivers it to the other, so
// nothing reenters a sender. `close` on either end closes both. Optionally drops ordinary (unreliable) packets.
import type { ChannelKind, Link } from '../../src/renderer/src/net/contracts';

interface End { link: Link; outbox: { kind: ChannelKind; bytes: Uint8Array }[]; receive(kind: ChannelKind, bytes: Uint8Array): void; closed(): boolean; reasons: string[] }
function end(peer: string, closeBoth: (reason: string) => void): End & { fireClose(reason: string): void } {
  const messages = new Set<(kind: ChannelKind, bytes: Uint8Array) => void>(), closes = new Set<(reason: string) => void>();
  const outbox: End['outbox'] = [], reasons: string[] = [];
  let closed = false;
  const link: Link = { peer, caps: { unreliable: true, maxDatagram: 16088, hidesPeerIp: true, p2p: false },
    send(kind, bytes) { if (!closed) outbox.push({ kind, bytes: bytes.slice() }); },
    onMessage(cb) { messages.add(cb); return () => { messages.delete(cb); }; },
    onClose(cb) { closes.add(cb); return () => { closes.delete(cb); }; },
    close(reason) { closeBoth(reason); },
    stats: () => ({ rttMs: 1, lossPct: 0, relayed: false, bufferedBytes: 0 }) };
  return { link, outbox, reasons, closed: () => closed,
    receive(kind, bytes) { if (!closed) for (const cb of [...messages]) cb(kind, bytes); },
    fireClose(reason) { if (closed) return; closed = true; reasons.push(reason); outbox.length = 0; for (const cb of [...closes]) cb(reason); } };
}

export interface LinkPair { host: End; guest: End; flush(): number; close(reason: string): void }
/** `drop(k)` is asked for the k-th unreliable packet in each direction; true drops it. */
export function linkPair(peer: string, drop: (k: number) => boolean = () => false): LinkPair {
  let k = 0;
  const closeBoth = (reason: string) => { host.fireClose(reason); guest.fireClose(reason); };
  const host = end(`${peer}:host`, closeBoth), guest = end(`${peer}:guest`, closeBoth);
  return { host, guest,
    /** Deliver everything queued in both directions until both queues are empty; returns the packets delivered. */
    flush() {
      let n = 0;
      while (host.outbox.length || guest.outbox.length) {
        for (const [from, to] of [[host, guest], [guest, host]] as const) for (const p of from.outbox.splice(0)) {
          if (p.kind === 'unreliable-latest' && drop(++k)) continue;
          to.receive(p.kind, p.bytes); n++;
        }
      }
      return n;
    },
    close: closeBoth };
}

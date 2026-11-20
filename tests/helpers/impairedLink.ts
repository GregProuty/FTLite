// The latency and loss harness Net-0 asked of Net-4 (Net-4a spec §6): two Link ends like linkPair's, but each packet is
// due at its send time plus the direction's delay plus a seeded jitter in [−jitter, +jitter]. Unreliable packets are
// lost with probability `loss` (seeded), or when `keep(sentAt)` says false, or when sent inside an outage. Reliable
// packets are never lost: each is due no earlier than the one sent before it in its direction (in order), and one
// that would fall inside an outage is due at the outage's end plus the delay. flush() delivers what is due by now().
import type { ChannelKind, Link } from '../../src/renderer/src/net/contracts';
import { createRng, nextFloat } from '../../src/shared/rng';
import type { LinkPair } from './linkPair';

export interface Direction { delayMs: number; jitterMs?: number; loss?: number; outages?: readonly { from: number; to: number }[]; keep?(sentAt: number): boolean }
export interface ImpairedOptions { seed: number; now(): number; up: Direction; down: Direction }
interface Packet { kind: ChannelKind; bytes: Uint8Array; due: number; order: number }

export function impairedPair(peer: string, options: ImpairedOptions): LinkPair & { stats(): { sent: number; dropped: number; delivered: number } } {
  const rng = createRng(options.seed >>> 0);
  let order = 0, sent = 0, dropped = 0, delivered = 0, closed = false;
  const reasons: string[] = [];
  const inOutage = (d: Direction, t: number) => (d.outages ?? []).find((o) => t >= o.from && t < o.to) ?? null;
  function end(name: string, dir: Direction) {
    const messages = new Set<(kind: ChannelKind, bytes: Uint8Array) => void>(), closes = new Set<(reason: string) => void>();
    const queue: Packet[] = [];
    let lastReliableDue = -Infinity;
    const link: Link = { peer: `${peer}:${name}`, caps: { unreliable: true, maxDatagram: 16088, hidesPeerIp: true, p2p: false },
      send(kind, bytes) {
        if (closed) return;
        sent++;
        const now = options.now(), jitter = dir.jitterMs ? (nextFloat(rng) * 2 - 1) * dir.jitterMs : 0, outage = inOutage(dir, now);
        if (kind === 'unreliable-latest') {
          const lost = (dir.loss ?? 0) > 0 && nextFloat(rng) < dir.loss!;
          if (outage || lost || (dir.keep && !dir.keep(now))) { dropped++; return; }
          queue.push({ kind, bytes: bytes.slice(), due: now + Math.max(0, dir.delayMs + jitter), order: order++ });
          return;
        }
        let due = Math.max(lastReliableDue, now + Math.max(0, dir.delayMs + jitter));
        const late = inOutage(dir, due - dir.delayMs) ?? outage;
        if (late) due = Math.max(due, late.to + dir.delayMs);
        lastReliableDue = due;
        queue.push({ kind, bytes: bytes.slice(), due, order: order++ });
      },
      onMessage(cb) { messages.add(cb); return () => { messages.delete(cb); }; },
      onClose(cb) { closes.add(cb); return () => { closes.delete(cb); }; },
      close(reason) { closeBoth(reason); },
      stats: () => ({ rttMs: 1, lossPct: 0, relayed: false, bufferedBytes: 0 }) };
    return { link, outbox: [] as { kind: ChannelKind; bytes: Uint8Array }[], reasons, queue, closed: () => closed,
      receive(kind: ChannelKind, bytes: Uint8Array) { if (!closed) for (const cb of [...messages]) cb(kind, bytes); },
      fireClose(reason: string) { for (const cb of [...closes]) cb(reason); } };
  }
  // up: guest → host (the guest end sends with the up direction); down: host → guest.
  const host = end('host', options.down), guest = end('guest', options.up);
  function closeBoth(reason: string) {
    if (closed) return; closed = true; reasons.push(reason); host.queue.length = 0; guest.queue.length = 0;
    host.fireClose(reason); guest.fireClose(reason);
  }
  return {
    host, guest,
    flush() {
      let n = 0, moved = true;
      while (moved && !closed) {
        moved = false;
        const now = options.now();
        for (const [from, to] of [[host, guest], [guest, host]] as const) {
          from.queue.sort((a, b) => a.due - b.due || a.order - b.order);
          while (from.queue.length && from.queue[0]!.due <= now && !closed) { const p = from.queue.shift()!; to.receive(p.kind, p.bytes); n++; delivered++; moved = true; }
        }
      }
      return n;
    },
    close: closeBoth,
    stats: () => ({ sent, dropped, delivered })
  } as LinkPair & { stats(): { sent: number; dropped: number; delivered: number } };
}

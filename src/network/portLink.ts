import type { ChannelKind, Link, Unsubscribe } from '../renderer/src/net/contracts';
import { MAX_LATEST_BYTES, MAX_LATEST_STREAMS, MAX_RELIABLE_BYTES, positiveSafeInteger, type PortEndpoint, type PortFrame } from '../shared/netSession';
export type { PortEndpoint } from '../shared/netSession';

function isFrame(value: unknown): value is PortFrame {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1) return false;
  if (v.type === 'ack') return positiveSafeInteger(v.id) && Object.keys(v).length === 3;
  if (v.type === 'close') return typeof v.reason === 'string' && v.reason.length <= 128 && Object.keys(v).length === 3;
  return v.type === 'data' && Object.keys(v).length === 5 && positiveSafeInteger(v.id)
    && (v.kind === 'reliable-ordered' || v.kind === 'unreliable-latest') && v.bytes instanceof Uint8Array
    && v.bytes.byteLength > 0 && v.bytes.byteLength <= (v.kind === 'unreliable-latest' ? MAX_LATEST_BYTES : MAX_RELIABLE_BYTES);
}
/** ACKs release transport storage only. Application command acknowledgement is independent. */
export function createPortLink(port: PortEndpoint, peer: string, options: { latestStreamKey?(bytes: Uint8Array): string } = {}): Link {
  const messages = new Set<(kind: ChannelKind, bytes: Uint8Array) => void>(), closes = new Set<(reason: string) => void>();
  const subscriptions: Unsubscribe[] = [];
  const outstanding = new Map<number, { size: number; stream?: string }>();
  const latest = new Map<string, { id: number; replacement?: Uint8Array }>();
  let closed = false, closeReason = '', nextId = 1, receivedId = 0, reliableBytes = 0;
  function close(reason: string, notify = true): void {
    if (closed) return;
    closed = true; closeReason = reason.slice(0, 128);
    for (const off of subscriptions.splice(0)) { try { off(); } catch { /* finish all cleanup */ } }
    if (notify) { try { port.postMessage({ version: 1, type: 'close', reason: closeReason } satisfies PortFrame); } catch { /* already gone */ } }
    try { port.close(); } catch { /* platform close may race a disconnect */ }
    outstanding.clear(); latest.clear(); reliableBytes = 0; messages.clear();
    for (const cb of [...closes]) { try { cb(closeReason); } catch { /* one listener cannot retain the others */ } }
    closes.clear();
  }
  function post(frame: PortFrame): void { if (!closed) { try { port.postMessage(frame); } catch { close('port-send-failed', false); } } }
  function transmit(kind: ChannelKind, bytes: Uint8Array, stream?: string): void {
    if (!positiveSafeInteger(nextId)) { close('port-sequence-exhausted'); return; }
    const id = nextId++;
    outstanding.set(id, { size: bytes.byteLength, stream });
    if (stream !== undefined) latest.set(stream, { id }); else reliableBytes += bytes.byteLength;
    post({ version: 1, type: 'data', id, kind, bytes });
  }
  function receive(value: unknown): void {
    if (closed) return;
    if (!isFrame(value)) { close('malformed-port-frame'); return; }
    if (value.type === 'close') { close(value.reason, false); return; }
    if (value.type === 'ack') {
      const item = outstanding.get(value.id); if (!item) return; // duplicate/unknown ACKs never release another send
      outstanding.delete(value.id);
      if (item.stream === undefined) reliableBytes -= item.size;
      else {
        const slot = latest.get(item.stream);
        if (slot?.id === value.id) {
          latest.delete(item.stream);
          if (slot.replacement) transmit('unreliable-latest', slot.replacement, item.stream);
        }
      }
      return;
    }
    if (value.id <= receivedId) { close('stale-port-frame'); return; }
    receivedId = value.id;
    const bytes = new Uint8Array(value.bytes);
    try { for (const cb of [...messages]) { if (closed) break; cb(value.kind, new Uint8Array(bytes)); } }
    catch { close('port-receiver-failed'); return; }
    post({ version: 1, type: 'ack', id: value.id });
  }
  function subscribe(register: () => Unsubscribe): void { const off = register(); if (closed) off(); else subscriptions.push(off); }
  try {
    subscribe(() => port.onMessage(receive));
    if (!closed) subscribe(() => port.onClose(() => close('port-closed', false)));
    if (!closed) port.start();
  } catch (error) { close('port-start-failed'); throw error; }
  return {
    peer, caps: { unreliable: true, maxDatagram: MAX_LATEST_BYTES, hidesPeerIp: true, p2p: false },
    send(kind, bytes) {
      if (closed) return;
      if (!(bytes instanceof Uint8Array) || !bytes.byteLength || (kind !== 'reliable-ordered' && kind !== 'unreliable-latest')) { close('invalid-port-send'); return; }
      if (kind === 'reliable-ordered') {
        // Also bound metadata for tiny packets; all posted bytes remain charged until ACK.
        if (reliableBytes + bytes.byteLength > MAX_RELIABLE_BYTES || outstanding.size >= 4096) { close('reliable-overflow'); return; }
        transmit(kind, new Uint8Array(bytes)); return;
      }
      if (bytes.byteLength > MAX_LATEST_BYTES) { close('latest-overflow'); return; }
      const owned = new Uint8Array(bytes);
      let key: string;
      try { key = options.latestStreamKey?.(new Uint8Array(owned)) ?? 'default'; } catch { close('invalid-latest-stream'); return; }
      if (typeof key !== 'string' || !key.length || key.length > 128) { close('invalid-latest-stream'); return; }
      const slot = latest.get(key);
      if (slot) slot.replacement = owned;
      else if (latest.size >= MAX_LATEST_STREAMS) close('latest-stream-overflow');
      else transmit(kind, owned, key);
    },
    onMessage(cb) { if (!closed) messages.add(cb); return () => { messages.delete(cb); }; },
    onClose(cb) { if (closed) cb(closeReason); else closes.add(cb); return () => { closes.delete(cb); }; },
    stats() { let bytes = reliableBytes; for (const slot of latest.values()) bytes += (outstanding.get(slot.id)?.size ?? 0) + (slot.replacement?.byteLength ?? 0);
      return { rttMs: 0, lossPct: 0, relayed: false, bufferedBytes: bytes }; },
    close
  };
}

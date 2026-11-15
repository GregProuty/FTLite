import type { ChannelKind, MonotonicClock } from '../../renderer/src/net/contracts';
import { RTC_MAX_HEADER_BYTES, RTC_MAX_PACKET_BYTES } from '../rtc/contracts';
import { copyImage, createTransportSequence, decodeControl, encodeDelta, encodeFull, encodeStatePacket, ImageStore, STATE_PACKET_OVERHEAD, type StateImage } from './imageCodec';

export interface StateSenderOptions {
  send(kind: ChannelKind, bytes: Uint8Array): void;
  latestPayloadLimit: number;
  clock: MonotonicClock;
  close(reason: string): void;
  nextTransportSequence?: () => number;
}
export function createStateSender(options: StateSenderOptions) {
  if (!Number.isSafeInteger(options.latestPayloadLimit) || options.latestPayloadLimit < 4096 || options.latestPayloadLimit > RTC_MAX_PACKET_BYTES - RTC_MAX_HEADER_BYTES) throw new Error('state-payload-limit');
  const images = new ImageStore(), sent = new Set<number>(), nextSequence = options.nextTransportSequence ?? createTransportSequence();
  let disposed = false, newest = 0, baseSequence = 0, ordinaryFull = 0, lastOrdinaryTick = -1, pending = false;
  let lastRefresh = -Infinity, resyncs = 0;
  function dispose(): void { disposed = true; images.clear(); sent.clear(); newest = baseSequence = ordinaryFull = 0; pending = false; }
  function fail(): void { if (disposed) return; dispose(); options.close('state-stream-invalid'); }
  function transmit(image: StateImage, immediate: boolean): void {
    if (disposed) return;
    const full = encodeFull(image), base = images.get(baseSequence);
    let bytes = full, kind: ChannelKind = 'reliable-ordered';
    if (!immediate && base && base.sequence < image.sequence && base.epoch === image.epoch && base.values.length === image.values.length) {
      // Dense deltas may exceed the full-image bound; this is a normal full fallback.
      let delta: Uint8Array | undefined;
      try { delta = encodeDelta(base, image); } catch { /* full fallback */ }
      if (delta && delta.length < full.length && delta.length + STATE_PACKET_OVERHEAD <= options.latestPayloadLimit) { bytes = delta; kind = 'unreliable-latest'; }
    }
    if (!immediate && kind === 'reliable-ordered' && ordinaryFull !== 0) { pending = true; return; }
    pending = false;
    if (!immediate && kind === 'reliable-ordered') ordinaryFull = image.sequence;
    sent.add(image.sequence);
    options.send(kind, encodeStatePacket(bytes, nextSequence()));
  }
  return {
    publish(image: StateImage, immediate: boolean): void {
      if (disposed) return;
      try {
        // Validation bounds the copy before retaining caller-controlled arrays.
        encodeFull(image);
        if (image.sequence <= newest) return;
        const owned = copyImage(image); newest = owned.sequence;
        images.put(owned, [newest, baseSequence]);
        for (const sequence of sent) if (!images.get(sequence)) sent.delete(sequence);
        if (immediate) { transmit(owned, true); return; }
        if (owned.tick % 3 !== 0 || owned.tick <= lastOrdinaryTick) return;
        lastOrdinaryTick = owned.tick; transmit(owned, false);
      } catch { fail(); }
    },
    receiveControl(bytes: Uint8Array): void {
      if (disposed) return;
      try {
        const control = decodeControl(bytes);
        if (control.kind === 'ack') {
          if (control.sequence > baseSequence && sent.has(control.sequence) && images.get(control.sequence)) baseSequence = control.sequence;
        } else if (control.kind === 'full-received') {
          if (control.sequence !== ordinaryFull) return;
          ordinaryFull = 0;
          // Only actual backpressure creates pending work. Non-cadence publications
          // update newest, so retirement never replays a historical blocked image.
          if (pending) { const latest = images.get(newest); pending = false; if (latest) transmit(latest, false); }
        } else {
          const now = options.clock.nowMs();
          if (!Number.isFinite(now)) { fail(); return; }
          if (now - lastRefresh < 1000) return;
          lastRefresh = now; const latest = images.get(newest);
          if (latest) { resyncs++; transmit(latest, true); }
        }
      } catch { fail(); }
    },
    dispose,
    stats: () => ({ ...images.stats(), resyncs, pendingOrdinary: pending }),
  };
}

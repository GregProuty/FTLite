import type { MonotonicClock } from '../../renderer/src/net/contracts';
import { copyImage, createTransportSequence, decodeState, decodeStatePacket, encodeControl, ImageStore, inspectState, StateCodecError, type StateControl, type StateImage } from './imageCodec';

export interface StateReceiverOptions {
  accept(image: StateImage): 'accepted' | 'ignored' | 'rejected';
  sendControl(bytes: Uint8Array): boolean;
  onAcknowledged?(image: StateImage): void;
  clock: MonotonicClock;
  close(reason: string): void;
  nextTransportSequence?: () => number;
}
export function createStateReceiver(options: StateReceiverOptions) {
  const images = new ImageStore(), nextSequence = options.nextTransportSequence ?? createTransportSequence();
  let disposed = false, highest = 0, invalidFulls = 0, lastRefresh = -Infinity, resyncs = 0, revision = 0;
  function dispose(): void { disposed = true; images.clear(); revision++; }
  function fail(): void { if (disposed) return; dispose(); options.close('state-stream-invalid'); }
  function control(kind: StateControl['kind'], sequence: number): boolean { return !disposed && options.sendControl(encodeControl({ kind, sequence }, nextSequence())); }
  function recover(full: boolean): void {
    if (disposed) return;
    if (full && ++invalidFulls >= 2) { fail(); return; }
    const now = options.clock.nowMs(); if (!Number.isFinite(now)) { fail(); return; }
    if (now - lastRefresh < 1000) return;
    lastRefresh = now; resyncs++; control('refresh', highest);
  }
  return {
    receive(packet: Uint8Array): void {
      if (disposed) return;
      const current = ++revision;
      try {
        const bytes = decodeStatePacket(packet), header = inspectState(bytes);
        if (header.kind === 'full') control('full-received', header.sequence);
        if (disposed || current !== revision || header.kind === 'delta' && header.sequence <= highest) return;
        let image: StateImage;
        try { image = decodeState(bytes, images.get(header.baseSequence)); }
        catch (error) {
          if (header.kind === 'full' || error instanceof StateCodecError && (error.code === 'checksum' || error.code === 'missing-base')) recover(header.kind === 'full');
          else fail();
          return;
        }
        if (header.sequence <= highest) return;
        // Neither acceptance nor notification callbacks can mutate the baseline.
        const result = options.accept(copyImage(image));
        if (disposed || current !== revision) return;
        if (result === 'ignored') return;
        if (result !== 'accepted') { recover(header.kind === 'full'); return; }
        highest = image.sequence; images.put(image);
        if (control('ack', image.sequence) && !disposed && current === revision) options.onAcknowledged?.(copyImage(image));
      } catch { fail(); }
    },
    dispose,
    stats: () => ({ ...images.stats(), resyncs }),
  };
}

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
  let disposed = false, highest = 0, acceptingSequence = 0, invalidFulls = 0, lastRefresh = -Infinity, resyncs = 0;
  function dispose(): void { disposed = true; images.clear(); acceptingSequence = 0; }
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
      try {
        const bytes = decodeStatePacket(packet), header = inspectState(bytes);
        if (header.kind === 'full') control('full-received', header.sequence);
        if (disposed || header.kind === 'delta' && header.sequence <= Math.max(highest, acceptingSequence)) return;
        let image: StateImage;
        try { image = decodeState(bytes, images.get(header.baseSequence)); }
        catch (error) {
          if (header.kind === 'full' || error instanceof StateCodecError && (error.code === 'checksum' || error.code === 'missing-base')) recover(header.kind === 'full');
          else fail();
          return;
        }
        if (header.sequence <= Math.max(highest, acceptingSequence)) return;
        // Neither acceptance nor notification callbacks can mutate the baseline.
        // An in-flight callback may already have applied this image. Block older
        // nested acceptance without committing ignored/rejected images as bases.
        const previousAccepting = acceptingSequence; acceptingSequence = image.sequence;
        let result: ReturnType<StateReceiverOptions['accept']>;
        try { result = options.accept(copyImage(image)); }
        finally { acceptingSequence = disposed ? 0 : previousAccepting; }
        if (disposed || image.sequence <= highest) return;
        if (result === 'ignored') return;
        if (result !== 'accepted') { recover(header.kind === 'full'); return; }
        highest = image.sequence; images.put(image);
        // Duplicate traffic cannot revoke successful readiness; only a newer
        // accepted image or disposal supersedes this acknowledgement.
        if (control('ack', image.sequence) && !disposed && highest === image.sequence) options.onAcknowledged?.(copyImage(image));
      } catch { fail(); }
    },
    dispose,
    stats: () => ({ ...images.stats(), resyncs }),
  };
}

import type { MonotonicClock, Scheduler } from '../../renderer/src/net/contracts';
export type { MonotonicClock, Scheduler } from '../../renderer/src/net/contracts';
export type PayloadClass = 'input' | 'state' | 'checkpoint' | 'control';
/** Transport ordinal, independent of semantic command/image sequence. */
export interface PayloadMetadata { class: PayloadClass; stream: string; sequence: number }
export type PayloadClassifier = (bytes: Uint8Array) => PayloadMetadata;
export const PAYLOAD_LIMITS = { input: 4096, state: 131072, checkpoint: 262144, control: 4096 } as const;
export const RTC_MAX_PACKET_BYTES = 16384;
export const RTC_HEADER_BYTES = 40;
export const RTC_MAX_STREAM_CHARS = 128;
export const RTC_MAX_HEADER_BYTES = RTC_HEADER_BYTES + RTC_MAX_STREAM_CHARS * 2;
export const RTC_RELIABLE_BYTES = 1048576;
export const RTC_RELIABLE_HIGH_WATER = 65536;
export const RTC_MAX_RECORDS = 4096;
export const RTC_MAX_STREAMS = 16;
export const RTC_ASSEMBLY_TTL_MS = 10000;
export const RTC_MAX_ASSEMBLIES = 2;
export const RTC_DRAIN_FRAMES = 16;
/** Native RTCDataChannel compatible; authentication/options are peer.ts responsibilities. */
export interface RtcDataChannel {
  readonly readyState: string;
  readonly bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  binaryType: BinaryType;
  send(data: ArrayBuffer): void;
  close(): void;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}
export interface RtcDataLinkOptions {
  peer: string; maxMessageSize: number; classify: PayloadClassifier; clock: MonotonicClock; scheduler: Scheduler;
}
export function validMetadata(metadata: PayloadMetadata): boolean {
  return !!metadata && Object.hasOwn(PAYLOAD_LIMITS, metadata.class)
    && typeof metadata.stream === 'string' && metadata.stream.length > 0 && metadata.stream.length <= RTC_MAX_STREAM_CHARS
    && Number.isSafeInteger(metadata.sequence) && metadata.sequence > 0;
}

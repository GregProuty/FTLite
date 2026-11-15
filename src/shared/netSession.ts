/** Data-only process boundary. Gameplay payloads belong to the selected mode. */
export const SESSION_PROTOCOL_VERSION = 2;
export const MAX_HOST_BYTES = 256 * 1024;
export const MAX_RELIABLE_BYTES = 1024 * 1024;
export const MAX_LATEST_BYTES = 16 * 1024;
export const MAX_LATEST_STREAMS = 16;
export type HostCommandInput =
  | { kind: 'start'; initBytes: Uint8Array }
  | { kind: 'restore'; checkpointBytes: Uint8Array }
  | { kind: 'checkpoint' }
  | { kind: 'pause'; reason: string }
  | { kind: 'dispose' };
export type HostCommand = HostCommandInput & { requestId: number; hostGeneration: number };
export type HostErrorCode = 'invalid-command' | 'stale-generation' | 'stale-request' | 'unavailable' | 'mode-error' | 'checkpoint-too-large';
export type HostResponse = ({ requestId: number; hostGeneration: number } & (
  | { ok: true; checkpointBytes?: Uint8Array }
  | { ok: false; error: { code: HostErrorCode; message: string } }
)) | {
  /** Protocol failure with no usable request stamp; consumers must never correlate it. */
  requestId: null; hostGeneration: number; ok: false;
  error: { code: 'invalid-command'; message: string };
};
export interface PortEndpoint {
  postMessage(data: unknown): void;
  onMessage(cb: (data: unknown) => void): () => void;
  onClose(cb: () => void): () => void;
  start(): void;
  close(): void;
}
export type PortFrame =
  | { version: 1; type: 'data'; id: number; kind: 'reliable-ordered' | 'unreliable-latest'; bytes: Uint8Array }
  | { version: 1; type: 'ack'; id: number }
  | { version: 1; type: 'close'; reason: string };
export const positiveSafeInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
export const boundedHostBytes = (value: unknown): value is Uint8Array => value instanceof Uint8Array && value.byteLength > 0 && value.byteLength <= MAX_HOST_BYTES;
export function isHostCommand(value: unknown): value is HostCommand {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!positiveSafeInteger(v.requestId) || !positiveSafeInteger(v.hostGeneration)) return false;
  let fields: string[];
  switch (v.kind) {
    case 'start': if (!boundedHostBytes(v.initBytes)) return false; fields = ['initBytes']; break;
    case 'restore': if (!boundedHostBytes(v.checkpointBytes)) return false; fields = ['checkpointBytes']; break;
    case 'pause': if (typeof v.reason !== 'string' || !v.reason.length || v.reason.length > 128) return false; fields = ['reason']; break;
    case 'checkpoint': case 'dispose': fields = []; break;
    default: return false;
  }
  return Object.keys(v).every(key => ['kind', 'requestId', 'hostGeneration', ...fields].includes(key));
}

import { isRoomToken, parseBoundedJson, ROOM_SMALL_BODY_BYTES } from '../../../src/shared/roomSession';
import { failure } from './errors';

export function bearerToken(request: Request, required = true): string | undefined {
  const value = request.headers.get('Authorization');
  if (value === null) { if (required) failure('unauthorized'); return undefined; }
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match || !isRoomToken(match[1])) failure('invalid-request');
  return match[1];
}
export async function readSmallJson(request: Request): Promise<Record<string, unknown>> {
  const bytes = await readBoundedBody(request, ROOM_SMALL_BODY_BYTES);
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes); } catch { return failure('invalid-request'); }
  const value = parseBoundedJson(text, ROOM_SMALL_BODY_BYTES);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) failure('invalid-request');
  return value as Record<string, unknown>;
}
export function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

/** One deadline covers the entire read. Cancellation is best effort and never
 * awaited: an untrusted stream's cancel promise must not extend that deadline. */
export async function readBoundedBody(request: Request, maxBytes: number, timeoutMs = 5000): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw Error('invalid-request');
  const expiresAt = Date.now() + timeoutMs;
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) {
    void request.body?.cancel().catch(() => {});
    throw Error('invalid-request');
  }
  if (length !== null && Number(length) > maxBytes) {
    void request.body?.cancel().catch(() => {});
    throw Error('too-large');
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let total = 0;
  let active = true;
  let reads = 0, emptyReads = 0;
  // A single allocation bounds retained bytes and avoids an unbounded list of
  // tiny (or empty) chunks supplied by an adversarial stream.
  const bytes = new Uint8Array(maxBytes);
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('timeout')), timeoutMs); });
  const checkDeadline = (): void => { if (!active || Date.now() >= expiresAt) throw Error('timeout'); };
  const consume = async (): Promise<Uint8Array> => {
    for (;;) {
      checkDeadline();
      const { done, value } = await reader.read();
      checkDeadline();
      // Workers clocks advance on I/O, not necessarily in a microtask loop.
      // Yield even at EOF before accepting success, and periodically while
      // productive immediate reads would otherwise starve the deadline timer.
      if (done || ++reads % 64 === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        checkDeadline();
      }
      if (done) return bytes.slice(0, total);
      if (value.byteLength === 0 && ++emptyReads > 64) throw Error('invalid-request');
      if (value.byteLength > maxBytes - total) throw Error('too-large');
      bytes.set(value, total); total += value.byteLength;
    }
  };
  try {
    // One race per body: a race per chunk would retain an unbounded number of
    // callbacks on the pending deadline when the source sends tiny chunks.
    return await Promise.race([consume(), deadline]);
  } finally {
    active = false;
    if (timer !== undefined) clearTimeout(timer);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

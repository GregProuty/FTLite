/** One deadline covers the entire read. Cancellation is best effort and never
 * awaited: an untrusted stream's cancel promise must not extend that deadline. */
export async function readBoundedBody(request: Request, maxBytes: number, timeoutMs = 5000): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw Error('invalid-request');
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
  // A single allocation bounds retained bytes and avoids an unbounded list of
  // tiny (or empty) chunks supplied by an adversarial stream.
  const bytes = new Uint8Array(maxBytes);
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('timeout')), timeoutMs); });
  const consume = async (): Promise<Uint8Array> => {
    for (;;) {
      const { done, value } = await reader.read();
      if (!active) throw Error('timeout');
      if (done) return bytes.slice(0, total);
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

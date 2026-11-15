import { describe, expect, it } from 'vitest';
import { parseClientFrame, parseServerEnvelope, encodeServerEnvelope, validateCompatibility } from '../../../src/shared/roomSession';
import { readBoundedBody } from '../src/http';
import { normalizeJoinCode, randomHex128, randomToken256, tokenHash } from '../src/crypto';
import { serviceError } from '../src/errors';

const id = 'a'.repeat(32), token = 'A'.repeat(43), hash = 'b'.repeat(64);
const compatibility = { protocolVersion: 2, modeId: 'opaque', schemaVersion: 1, simVersion: 35, contentDigest: hash, layoutHash: 'b87a0284' };
const signal = { attemptId: id, roomId: id, seatGeneration: 2, from: id, to: 'c'.repeat(32), hostGeneration: 1,
  kind: 'description', description: { type: 'offer', sdp: 'x' } };
const parse = (value: unknown) => parseClientFrame(JSON.stringify(value));

describe('strict client wire boundary', () => {
  it.each([
    { type: 'auth', ticket: token, connectionId: id }, { type: 'ack', sequence: 1 },
    { type: 'ready', requestId: 1, ready: true }, { type: 'remove-seat', requestId: 2, seatId: 3 },
    { type: 'start-propose', requestId: 3, expectedRosterRevision: 1, initBase64: 'AA==', initHash: hash },
    { type: 'start-commit', requestId: 4, expectedRosterRevision: 1, proposalId: id },
    { type: 'link-request', requestId: 5, guestSeatId: 1 }, { type: 'signal', requestId: 6, signal },
    { type: 'link-ready', requestId: 7, attemptId: id }, { type: 'lease-renew', requestId: 8, nonce: id },
    { type: 'host-release', requestId: 9 }, { type: 'rehost-claim', requestId: Number.MAX_SAFE_INTEGER, expectedHostGeneration: 2, nonce: id },
  ])('accepts the exact $type operation and rejects added fields', frame => {
    expect(parse(frame)).toEqual(frame);
    expect(parse({ ...frame, extra: true })).toBeUndefined();
  });
  it('rejects duplicate keys including escaped spellings, extra auth IDs and binary frames', () => {
    expect(parseClientFrame('{"type":"ack","sequence":1,"sequence":2}')).toBeUndefined();
    expect(parseClientFrame('{"type":"ack","sequence":1,"seque\\u006ece":2}')).toBeUndefined();
    expect(parse({ type: 'auth', ticket: token, connectionId: id, requestId: 1 })).toBeUndefined();
    expect(parseClientFrame(new Uint8Array([1]) as unknown as string)).toBeUndefined();
    expect(parseClientFrame('{"type":"ack","sequence":1}x')).toBeUndefined();
    expect(parseClientFrame('['.repeat(40) + ']'.repeat(40))).toBeUndefined();
  });
  it('checks exact wire bytes and parsed SDP/candidate limits, including UTF8', () => {
    const frame = { type: 'signal', requestId: 1, signal: { ...signal, description: { type: 'offer', sdp: 'x'.repeat(65_536) } } };
    expect(parse(frame)).toEqual(frame);
    expect(parse({ ...frame, signal: { ...signal, description: { type: 'offer', sdp: 'x'.repeat(65_537) } } })).toBeUndefined();
    expect(parse({ ...frame, signal: { ...signal, description: { type: 'offer', sdp: 'é'.repeat(32_769) } } })).toBeUndefined();
    const candidate = { type: 'signal', requestId: 1, signal: { ...signal, kind: 'candidate', description: undefined, candidate: { candidate: 'x'.repeat(4096) } } };
    expect(parse(candidate)).toBeDefined();
    candidate.signal.candidate.candidate += 'x';
    expect(parse(candidate)).toBeUndefined();
    const text = JSON.stringify({ type: 'ack', sequence: 1 });
    expect(parseClientFrame(text.padEnd(98_304))).toBeDefined();
    expect(parseClientFrame(text.padEnd(98_305))).toBeUndefined();
  });
  it('bounds decoded init and accepts only canonical base64, hashes and IDs', () => {
    const frame = { type: 'start-propose', requestId: 1, expectedRosterRevision: 1, initBase64: btoa('x'.repeat(65_536)), initHash: hash };
    expect(parse(frame)).toEqual(frame);
    expect(parse({ ...frame, initBase64: btoa('x'.repeat(65_537)) })).toBeUndefined();
    for (const initBase64 of ['!', 'AA', 'AB==', 'A===', 'AA==\n']) expect(parse({ ...frame, initBase64 })).toBeUndefined();
    for (const initHash of ['B'.repeat(64), 'b'.repeat(63), 'g'.repeat(64)]) expect(parse({ ...frame, initHash })).toBeUndefined();
    for (const connectionId of [id + 'a', id.slice(1), 'A'.repeat(32)]) expect(parse({ type: 'auth', ticket: token, connectionId })).toBeUndefined();
    for (const ticket of [token + 'A', token.slice(1), 'A'.repeat(42) + '+']) expect(parse({ type: 'auth', ticket, connectionId: id })).toBeUndefined();
    for (const requestId of [0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1]) expect(parse({ type: 'host-release', requestId })).toBeUndefined();
  });
  it('validates exact opaque compatibility without consulting game modes', () => {
    expect(validateCompatibility(compatibility)).toBe(true);
    expect(validateCompatibility({ ...compatibility, modeId: 'x'.repeat(64) })).toBe(true);
    for (const change of [{ extra: 1 }, { protocolVersion: 3 }, { modeId: 'x'.repeat(65) }, { modeId: '' }, { schemaVersion: 0 }, { simVersion: 1.5 }, { layoutHash: 'x'.repeat(8) }, { contentDigest: hash + 'b' }]) {
      expect(validateCompatibility({ ...compatibility, ...change })).toBe(false);
    }
  });
});

describe('sequenced server boundary', () => {
  const snapshot = { roomId: id, joinCode: '0123ABCD', runId: id, compatibility, capacity: 1, hostSeatId: 0, hostGeneration: 1,
    phase: 'lobby', rosterRevision: 1, seats: [{ seatId: 0, seatGeneration: 1, occupied: true, connected: true, ready: false }] };
  const lease = { roomId: id, hostGeneration: 1, hostSeatId: 0, nonce: id, expiresAtEpochMs: 1000 };
  const checkpoint = { version: 1, protocolVersion: 2, roomId: id, compatibility, runId: id, hostGeneration: 1, checkpointSequence: 1, capturedTick: 0, payloadSha256: hash };
  const started = { initBase64: 'AA==', initHash: hash, lease };
  const link = { attemptId: id, role: 'offerer', identity: { ...compatibility, runId: id, roomId: id, hostGeneration: 1, seatGeneration: 2, localConnectionId: id, remoteConnectionId: 'c'.repeat(32) }, localTicket: token, expectedRemoteTicket: 'B'.repeat(43), ticketExpiresAtEpochMs: 1000 };
  const payloads = [
    { type: 'authenticated', session: { snapshot, seatId: 0, seatGeneration: 1 } },
    { type: 'roster', snapshot }, { type: 'start-proposed', proposalId: id, expectedRosterRevision: 1, expiresAtEpochMs: 1000 },
    { type: 'started', ...started }, { type: 'link-issued', link }, { type: 'signal', signal },
    { type: 'link-state', attemptId: id, state: 'closed' }, { type: 'lease', lease },
    { type: 'checkpoint-status', metadata: checkpoint }, { type: 'host-departed', hostGeneration: 1 },
    { type: 'host-changed', snapshot, lease }, { type: 'error', error: { code: 'unavailable', retryable: true } },
    ...[{ kind: 'snapshot', snapshot }, { kind: 'proposal', proposalId: id }, { kind: 'attempt', attemptId: id },
      { kind: 'started', ...started }, { kind: 'lease', lease }, { kind: 'void' },
      { kind: 'error', error: { code: 'conflict', retryable: false } }].map(outcome => ({ type: 'reply', requestId: 1, outcome })),
  ];
  it.each(payloads)('roundtrips $type and rejects extra nested event fields', payload => {
    const envelope = { sequence: 1, payload };
    expect(parseServerEnvelope(JSON.stringify(envelope))).toEqual(envelope);
    expect(JSON.parse(encodeServerEnvelope(envelope as never))).toEqual(envelope);
    expect(parseServerEnvelope(JSON.stringify({ ...envelope, payload: { ...payload, extra: true } }))).toBeUndefined();
  });
  it('rejects leaked tokens, impossible rosters, malformed metadata and unknown errors', () => {
    const event = (payload: unknown) => parseServerEnvelope(JSON.stringify({ sequence: 1, payload }));
    expect(event({ type: 'authenticated', session: { snapshot, seatId: 0, seatGeneration: 1, seatToken: token } })).toBeUndefined();
    expect(event({ type: 'roster', snapshot: { ...snapshot, seats: [...snapshot.seats, ...snapshot.seats] } })).toBeUndefined();
    expect(event({ type: 'checkpoint-status', metadata: { ...checkpoint, capturedTick: -1 } })).toBeUndefined();
    expect(event({ type: 'error', error: { code: 'provider secret', retryable: false } })).toBeUndefined();
    expect(parseServerEnvelope('{"sequence":1,"sequence":2,"payload":{"type":"host-departed","hostGeneration":1}}')).toBeUndefined();
    expect(() => encodeServerEnvelope({ sequence: 0, payload: { type: 'host-departed', hostGeneration: 1 } } as never)).toThrow('invalid-frame');
  });
});

describe('bounded request reading', () => {
  const request = (stream: ReadableStream<Uint8Array>, headers?: Record<string, string>) => new Request('https://service/body', { method: 'POST', body: stream, headers });
  it('accepts exact bytes and rejects actual streamed bytes despite a small declared length', async () => {
    expect(await readBoundedBody(new Request('https://service/body', { method: 'POST', body: 'abcd' }), 4)).toEqual(new TextEncoder().encode('abcd'));
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(3)); c.enqueue(new Uint8Array(2)); }, cancel() { cancelled = true; } });
    await expect(readBoundedBody(request(stream, { 'Content-Length': '1' }), 4)).rejects.toThrow('too-large');
    expect(cancelled).toBe(true);
  });
  it('rejects a large declaration before reading, and bounds a stalled read by deadline', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    await expect(readBoundedBody(request(stream, { 'Content-Length': '5' }), 4)).rejects.toThrow('too-large');
    expect(cancelled).toBe(true);
    const stalled = new ReadableStream<Uint8Array>();
    await expect(readBoundedBody(request(stalled), 4, 10)).rejects.toThrow('timeout');
  });
  it('limits total read time even while chunks arrive and does not await a hanging cancellation', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(1)); }, cancel() { return new Promise(() => {}); } });
    await expect(readBoundedBody(request(stream), 4, 10)).rejects.toThrow('timeout');
  });
  it('rejects a stream of immediately available empty chunks with bounded work', async () => {
    let pulls = 0, cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) { if (++pulls <= 1024) c.enqueue(new Uint8Array()); else c.close(); },
      cancel() { cancelled = true; },
    });
    await expect(readBoundedBody(request(stream), 4)).rejects.toThrow('invalid-request');
    // One extra pull may have been prefetched by ReadableStream.
    expect(pulls).toBeLessThanOrEqual(66);
    expect(cancelled).toBe(true);
  });
  it('enforces the deadline while nonempty immediately resolved reads would starve timers', async () => {
    let pulls = 0, cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) { if (++pulls <= 65_536) c.enqueue(new Uint8Array([1])); else c.close(); },
      cancel() { cancelled = true; },
    });
    await expect(readBoundedBody(request(stream), 65_536, 1).then(() => 'unexpected success')).rejects.toThrow('timeout');
    expect(pulls).toBeLessThan(65_536);
    expect(cancelled).toBe(true);
    const afterCancellation = pulls;
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(pulls).toBe(afterCancellation);
  });
});

it('generates wire-shaped secrets, hashes rather than stores secrets, and normalizes valid join codes', async () => {
  expect(randomHex128()).toMatch(/^[a-f0-9]{32}$/);
  expect(randomToken256()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(randomHex128()).not.toBe(randomHex128());
  expect(randomToken256()).not.toBe(randomToken256());
  expect(await tokenHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(normalizeJoinCode('abcd0123')).toBe('ABCD0123');
  for (const code of ['ABCD012I', 'ABCD012L', 'ABCD012O', 'ABCD012U', ' ABCD0123', 'ABCD01234']) expect(normalizeJoinCode(code)).toBeUndefined();
});

it('returns only fixed no-store errors without reflected detail', async () => {
  const response = serviceError('rate-limited', 429, 1000);
  expect(response.status).toBe(429);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({ error: { code: 'rate-limited', retryable: true, retryAfterMs: 1000 } });
});

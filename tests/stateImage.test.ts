import { describe, expect, it } from 'vitest';
import { decodeState, encodeFull, encodeDelta, inspectState, encodeStatePacket, decodeStatePacket, encodeControl, decodeControl, encodeOpaquePacket, decodeOpaquePacket, classifyStreamPacket, isStatePacket, MAX_IMAGE_BYTES, type StateImage } from '../src/network/state/imageCodec';

const image = (sequence = 1, values = [0, -0, Number.MIN_VALUE, Number.MAX_VALUE]): StateImage => ({ sequence, tick: sequence * 3, epoch: 'opaque-🛰', metadata: new Uint8Array([1, 2, 3]), values: new Float64Array(values) });
describe('generic state images', () => {
  it('round trips finite Float64 values including negative zero and detached metadata', () => {
    const source = image(), decoded = decodeState(encodeFull(source));
    expect(decoded).toEqual(source); expect(Object.is(decoded.values[1], -0)).toBe(true);
    source.metadata[0] = 9; source.values[0] = 12;
    expect(decoded.metadata[0]).toBe(1); expect(decoded.values[0]).toBe(0);
  });
  it('reconstructs opaque second-mode values without mutating its base', () => {
    const base = image(1, [12.25, -0, 8, 9]), next = image(2, [-13, 0, 8, 9]); next.metadata = new Uint8Array([20]);
    const delta = encodeDelta(base, next);
    expect(decodeState(delta, base)).toEqual(next); expect(Object.is(base.values[1], -0)).toBe(true);
    expect(() => decodeState(delta)).toThrow(); expect(() => encodeDelta(base, { ...next, epoch: 'new' })).toThrow();
  });
  it('checks canonical identity, metadata and values, not merely changed values', () => {
    const full = encodeFull(image());
    for (const offset of [8, 16, 48, full.length - 1]) { const changed = full.slice(); changed[offset] = changed[offset]! ^ 1; expect(() => decodeState(changed)).toThrow(); }
    const metadata = full.slice(); metadata[48 + image().epoch.length * 2] = 44;
    expect(inspectState(metadata).kind).toBe('full'); expect(() => decodeState(metadata)).toThrow(/checksum/);
  });
  it('bounds metadata and encoded images exactly before decoding any value allocation', () => {
    const source = { ...image(), epoch: '', metadata: new Uint8Array(16384), values: new Float64Array(0) };
    expect(decodeState(encodeFull(source)).metadata.length).toBe(16384);
    expect(() => encodeFull({ ...source, metadata: new Uint8Array(16385) })).toThrow();
    const count = Math.floor((MAX_IMAGE_BYTES - 48) / 8);
    expect(encodeFull({ ...source, metadata: new Uint8Array(), values: new Float64Array(count) }).length).toBeLessThanOrEqual(131072);
    expect(() => encodeFull({ ...source, metadata: new Uint8Array(), values: new Float64Array(count + 1) })).toThrow();
    const forged = encodeFull(image()); new DataView(forged.buffer).setUint32(32, 0xffffffff, true);
    expect(() => inspectState(forged)).toThrow(); expect(() => decodeState(new Uint8Array(131073))).toThrow();
    const exact = { ...source, metadata: new Uint8Array(2), values: new Float64Array(count) };
    expect(encodeStatePacket(encodeFull(exact), 1)).toHaveLength(131072);
    expect(() => encodeFull({ ...exact, metadata: new Uint8Array(3) })).toThrow();
  });
  it('rejects nonfinite values, unsafe identities, bad epochs and truncated or trailing records', () => {
    for (const value of [NaN, Infinity, -Infinity]) expect(() => encodeFull(image(1, [value]))).toThrow();
    for (const sequence of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(() => encodeFull(image(sequence))).toThrow();
    expect(() => encodeFull({ ...image(), epoch: 'x'.repeat(129) })).toThrow();
    const bytes = encodeFull(image()); expect(() => decodeState(bytes.subarray(0, -1))).toThrow();
    expect(() => decodeState(new Uint8Array([...bytes, 0]))).toThrow();
  });
  it('rejects unordered, duplicate and out-of-range delta indices structurally', () => {
    const base = { ...image(1, [1, 2, 3]), epoch: '', metadata: new Uint8Array() };
    const next = { ...base, sequence: 2, values: new Float64Array([4, 5, 6]) }, delta = encodeDelta(base, next);
    for (const [offset, value] of [[60, 0], [48, 2], [72, 3]]) {
      const bad = delta.slice(); new DataView(bad.buffer).setUint32(offset!, value!, true);
      expect(() => decodeState(bad, base)).toThrow();
    }
  });
});
describe('bounded generic outer envelopes', () => {
  it('keeps image identity separate from the transport ordinal', () => {
    const bytes = encodeFull(image(7));
    const first = encodeStatePacket(bytes, 1), retry = encodeStatePacket(bytes, 2);
    expect(classifyStreamPacket(first)).toEqual({ class: 'state', stream: 'state', sequence: 1 });
    expect(classifyStreamPacket(retry).sequence).toBe(2); expect(decodeState(decodeStatePacket(retry)).sequence).toBe(7);
    expect(isStatePacket(first)).toBe(true);
  });
  it('validates ACK, receipt and refresh identities and rejects malformed controls', () => {
    for (const kind of ['ack', 'full-received', 'refresh'] as const) expect(decodeControl(encodeControl({ kind, sequence: 4 }, 9))).toEqual({ kind, sequence: 4 });
    expect(() => encodeControl({ kind: 'ack', sequence: 0 }, 1)).toThrow();
    const bad = encodeControl({ kind: 'ack', sequence: 4 }, 1); bad[bad.length - 1] = 255;
    expect(() => decodeControl(bad)).toThrow();
  });
  it('carries opaque retries without decoding commands and enforces total class caps', () => {
    const payload = new Uint8Array([11, 21, 31]);
    const first = encodeOpaquePacket('input', 'commands', 1, payload), retry = encodeOpaquePacket('input', 'commands', 2, payload);
    expect(decodeOpaquePacket(retry)).toEqual({ class: 'input', stream: 'commands', sequence: 2, bytes: payload });
    expect(classifyStreamPacket(first).sequence).toBe(1); expect(isStatePacket(first)).toBe(false);
    expect(encodeOpaquePacket('input', 'x', 1, new Uint8Array(4074)).length).toBe(4096);
    expect(() => encodeOpaquePacket('input', 'x', 1, new Uint8Array(4075))).toThrow();
    for (const stream of ['', 'x'.repeat(129)]) expect(() => encodeOpaquePacket('control', stream, 1, payload)).toThrow();
    const forged = first.slice(); forged[6] = 255; expect(() => classifyStreamPacket(forged)).toThrow();
  });
});

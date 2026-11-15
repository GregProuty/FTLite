import { describe, expect, it } from 'vitest';
import { createStateSender } from '../src/network/state/sender';
import { createStateReceiver } from '../src/network/state/receiver';
import { classifyStreamPacket, createTransportSequence, decodeControl, decodeState, decodeStatePacket, encodeControl, encodeFull, encodeDelta, encodeOpaquePacket, encodeStatePacket, type StateImage } from '../src/network/state/imageCodec';
import type { ChannelKind } from '../src/renderer/src/net/contracts';
const img = (sequence: number, tick = sequence * 3, size = 1000): StateImage => ({ sequence, tick, epoch: 'toy', metadata: new Uint8Array([7]), values: new Float64Array(size) });
function harness() {
  let now = 0, ordinal = 0; const packets: { kind: ChannelKind; bytes: Uint8Array }[] = [], closed: string[] = [];
  const clock = { nowMs: () => now };
  const sender = createStateSender({ send: (kind, bytes) => packets.push({ kind, bytes }), latestPayloadLimit: 4096, clock, close: reason => closed.push(reason) });
  const control = (kind: 'ack' | 'full-received' | 'refresh', sequence: number) => sender.receiveControl(encodeControl({ kind, sequence }, ++ordinal));
  return { sender, packets, closed, clock, control, advance: (ms: number) => { now += ms; } };
}
describe('bounded state sender', () => {
  it('publishes once per eligible tick and forces reliable immediate control fulls', () => {
    const h = harness(); h.sender.publish(img(1, 1), false); expect(h.packets).toHaveLength(0);
    h.sender.publish(img(2, 3), false); h.sender.publish(img(3, 3), false); expect(h.packets).toHaveLength(1);
    h.sender.publish(img(4, 4), true); expect(h.packets).toHaveLength(2); expect(h.packets.map(p => p.kind)).toEqual(['reliable-ordered', 'reliable-ordered']);
  });
  it('uses only exact sent ACK bases and detaches caller-owned images', () => {
    const h = harness(), base = img(1); h.sender.publish(base, true); base.values.fill(44);
    h.control('ack', 999); h.sender.publish(img(2), false); expect(h.packets[1]!.kind).toBe('reliable-ordered');
    h.control('ack', 1); h.sender.publish(img(3), false);
    expect(h.packets[2]!.kind).toBe('unreliable-latest'); expect(decodeState(decodeStatePacket(h.packets[2]!.bytes), img(1)).values[0]).toBe(0);
  });
  it('does not free a stalled full slot on overtaking delta ACKs and coalesces newest pending', () => {
    const h = harness(); h.sender.publish(img(1), true); h.control('ack', 1);
    const large = img(2); large.values.fill(5); h.sender.publish(large, false);
    h.sender.publish(img(3), false); h.control('ack', 3);
    const large2 = img(4); large2.values.fill(6); h.sender.publish(large2, false);
    h.sender.publish(img(5), false); h.control('ack', 5);
    const large3 = img(6); large3.values.fill(7); h.sender.publish(large3, false);
    expect(h.packets.map(p => p.kind)).toEqual(['reliable-ordered', 'reliable-ordered', 'unreliable-latest', 'unreliable-latest']);
    expect(h.sender.stats().pendingOrdinary).toBe(true); h.control('full-received', 4); expect(h.packets).toHaveLength(4);
    const freshest = img(7, 19); freshest.values.fill(8); h.sender.publish(freshest, false);
    h.control('full-received', 2); expect(h.packets).toHaveLength(5);
    expect(decodeState(decodeStatePacket(h.packets[4]!.bytes)).sequence).toBe(7);
    h.sender.publish(img(8, 20), true); expect(h.packets).toHaveLength(6);
  });
  it('clears historical pending after a newer delta or immediate full', () => {
    const h = harness(); h.sender.publish(img(1), true); h.control('ack', 1);
    const large = img(2); large.values.fill(1); h.sender.publish(large, false);
    h.sender.publish({ ...large, sequence: 3, tick: 9 }, false); h.sender.publish(img(4), false);
    h.control('full-received', 2); expect(h.packets).toHaveLength(3); expect(h.sender.stats().pendingOrdinary).toBe(false);
  });
  it('rate limits same-image refresh with fresh transport ordinals', () => {
    const h = harness(); h.sender.publish(img(1), true); h.control('refresh', 1); h.control('refresh', 1);
    expect(h.packets).toHaveLength(2); h.advance(1000); h.control('refresh', 1); expect(h.packets).toHaveLength(3);
    expect(h.packets.map(p => classifyStreamPacket(p.bytes).sequence)).toEqual([1, 2, 3]);
  });
  it('bounds retained copies and releases them on disposal', () => {
    const h = harness(); for (let i = 1; i <= 100; i++) h.sender.publish(img(i, i, 15000), true);
    expect(h.sender.stats().retainedImages).toBeLessThanOrEqual(64); expect(h.sender.stats().retainedBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
    h.sender.dispose(); expect(h.sender.stats().retainedBytes).toBe(0); h.sender.publish(img(101), true); expect(h.packets).toHaveLength(100);
  });
  it('uses the negotiated latest cap including the generic envelope', () => {
    const packets: ChannelKind[] = [];
    const sender = createStateSender({ send: kind => packets.push(kind), latestPayloadLimit: 4096, clock: { nowMs: () => 0 }, close: () => {} });
    const base = img(1, 0, 600); base.metadata = new Uint8Array(4); sender.publish(base, true); sender.receiveControl(encodeControl({ kind: 'ack', sequence: 1 }, 1));
    const exact = { ...base, sequence: 2, tick: 3, values: base.values.slice() }; exact.values.fill(1, 0, 334); sender.publish(exact, false);
    expect(packets.at(-1)).toBe('unreliable-latest');
    const over = { ...exact, sequence: 3, tick: 6, metadata: new Uint8Array(5) }; sender.publish(over, false); expect(packets.at(-1)).toBe('reliable-ordered');
  });
  it('handles synchronous receipt/ACK delivery and callback disposal without resurrecting state', () => {
    const sent: Uint8Array[] = [], nextTransportSequence = createTransportSequence();
    const sender = createStateSender({ latestPayloadLimit: 4096, clock: { nowMs: () => 0 }, nextTransportSequence, close: () => {}, send: (_kind, bytes) => { sent.push(bytes); const sequence = decodeState(decodeStatePacket(bytes)).sequence; sender.receiveControl(encodeControl({ kind: 'full-received', sequence }, 1)); sender.receiveControl(encodeControl({ kind: 'ack', sequence }, 2)); } });
    sender.publish(img(1), false); expect(sender.stats().pendingOrdinary).toBe(false);
    expect(classifyStreamPacket(encodeOpaquePacket('control', 'events', nextTransportSequence(), new Uint8Array())).sequence).toBe(2);
    const closing = createStateSender({ latestPayloadLimit: 4096, clock: { nowMs: () => 0 }, close: () => {}, send: () => closing.dispose() });
    closing.publish(img(1), true); expect(closing.stats().retainedImages).toBe(0);
  });
  it('does not revive disposed streams after malformed control or a throwing transport', () => {
    const h = harness(); h.sender.publish(img(1), true); h.sender.receiveControl(new Uint8Array([0])); expect(h.closed).toHaveLength(1); expect(h.sender.stats().retainedImages).toBe(0);
    h.sender.publish(img(2), true); expect(h.packets).toHaveLength(1);
    const closed: string[] = []; const sender = createStateSender({ send: () => { throw new Error('send failed'); }, latestPayloadLimit: 4096, clock: { nowMs: () => 0 }, close: reason => closed.push(reason) });
    sender.publish(img(1), true); expect(closed).toHaveLength(1); expect(sender.stats().retainedImages).toBe(0);
  });
});
describe('validated state receiver', () => {
  it('streams a second opaque thermostat mode end to end at 20Hz without gameplay schemas', () => {
    const h = harness(), temperatures: number[] = [];
    const receiver = createStateReceiver({ clock: h.clock, close: reason => h.closed.push(reason), accept: image => {
      if (new TextDecoder().decode(image.metadata) !== 'thermostat-v1' || image.values.length !== 3 || image.values[1]! <= 0) return 'rejected';
      temperatures.push(image.values[0]!); return 'accepted';
    }, sendControl: bytes => { h.sender.receiveControl(bytes); return true; } });
    let delivered = 0;
    for (let tick = 0; tick <= 120; tick++) {
      h.sender.publish({ sequence: tick + 1, tick, epoch: 'chamber', metadata: new TextEncoder().encode('thermostat-v1'), values: new Float64Array([20 + tick / 10, 101.325, 1]) }, tick === 0);
      while (delivered < h.packets.length) receiver.receive(h.packets[delivered++]!.bytes);
    }
    expect(temperatures).toHaveLength(41); expect(temperatures.slice(0, 3)).toEqual([20, 20.3, 20.6]); expect(temperatures.at(-1)).toBe(32);
    expect(h.packets.filter(p => p.kind === 'unreliable-latest')).toHaveLength(40); expect(h.closed).toEqual([]);
  });
  it('accepts and ACKs reconstructed toy mode values, retiring full before validation', () => {
    const order: string[] = [], received: StateImage[] = [];
    const receiver = createStateReceiver({ clock: { nowMs: () => 0 }, close: () => {}, accept: image => { order.push('accept'); received.push(image); return 'accepted'; }, sendControl: bytes => { order.push(decodeControl(bytes).kind); return true; }, onAcknowledged: () => order.push('ready') });
    const base = img(1); receiver.receive(encodeStatePacket(encodeFull(base), 1));
    const next = img(2); next.values[4] = -0; receiver.receive(encodeStatePacket(encodeDelta(base, next), 2));
    expect(order).toEqual(['full-received', 'accept', 'ack', 'ready', 'accept', 'ack', 'ready']); expect(Object.is(received[1]!.values[4], -0)).toBe(true);
    receiver.receive(encodeStatePacket(encodeFull(base), 3)); expect(order.at(-1)).toBe('full-received'); expect(received).toHaveLength(2);
  });
  it('never acknowledges ignored/rejected state or activates after failed ACK or synchronous disposal', () => {
    for (const mode of ['ignored', 'rejected', 'failed-ack', 'dispose-accept', 'dispose-ack'] as const) {
      const controls: string[] = [], ready: number[] = [];
      const receiver = createStateReceiver({ clock: { nowMs: () => 0 }, close: () => {}, accept: () => { if (mode === 'dispose-accept') receiver.dispose(); return mode === 'ignored' || mode === 'rejected' ? mode : 'accepted'; }, sendControl: bytes => { const kind = decodeControl(bytes).kind; controls.push(kind); if (kind === 'ack' && mode === 'dispose-ack') receiver.dispose(); return !(kind === 'ack' && mode === 'failed-ack'); }, onAcknowledged: image => ready.push(image.sequence) });
      receiver.receive(encodeStatePacket(encodeFull(img(1)), 1)); expect(ready).toEqual([]);
      if (mode === 'ignored' || mode === 'rejected' || mode === 'dispose-accept') expect(controls).not.toContain('ack');
    }
  });
  it('requests bounded refresh on missing bases and corruption, then closes repeated invalid fulls', () => {
    let now = 0; const controls: string[] = [], closed: string[] = [];
    const receiver = createStateReceiver({ clock: { nowMs: () => now }, close: reason => closed.push(reason), accept: () => 'accepted', sendControl: bytes => { controls.push(decodeControl(bytes).kind); return true; } });
    const delta = encodeStatePacket(encodeDelta(img(1), img(2)), 1); receiver.receive(delta); receiver.receive(delta); expect(controls).toEqual(['refresh']);
    now = 1000; receiver.receive(delta); expect(controls).toEqual(['refresh', 'refresh']);
    const bad = encodeFull(img(3)); bad[bad.length - 1] = 1;
    receiver.receive(encodeStatePacket(bad, 3)); expect(controls.at(-1)).toBe('full-received'); expect(closed).toHaveLength(0);
    receiver.receive(encodeStatePacket(bad, 4)); expect(closed).toHaveLength(1);
  });
  it('does not issue a retirement receipt for a malformed full header', () => {
    const controls: string[] = [], closed: string[] = [];
    const receiver = createStateReceiver({ clock: { nowMs: () => 0 }, close: reason => closed.push(reason), accept: () => 'accepted', sendControl: bytes => { controls.push(decodeControl(bytes).kind); return true; } });
    const bad = encodeFull(img(1)); new DataView(bad.buffer).setUint32(32, 0xffffffff, true);
    // The envelope codec intentionally validates framing, not inner image semantics.
    receiver.receive(encodeStatePacket(bad, 1)); expect(controls).toEqual([]); expect(closed).toHaveLength(1);
  });
  it('still detects repeated checksum-invalid fulls after their image sequence becomes stale', () => {
    const closed: string[] = [], controls: string[] = [];
    const receiver = createStateReceiver({ clock: { nowMs: () => 0 }, close: reason => closed.push(reason), accept: () => 'accepted', sendControl: bytes => { controls.push(decodeControl(bytes).kind); return true; } });
    receiver.receive(encodeStatePacket(encodeFull(img(2)), 1));
    const bad = encodeFull(img(1)); bad[bad.length - 1] = 1;
    receiver.receive(encodeStatePacket(bad, 2)); receiver.receive(encodeStatePacket(bad, 3));
    expect(controls.filter(kind => kind === 'full-received')).toHaveLength(3); expect(closed).toHaveLength(1);
  });
  it('bounds retained images, rejects an evicted base and owns immutable baseline copies', () => {
    const controls: string[] = [];
    const receiver = createStateReceiver({ clock: { nowMs: () => 0 }, close: () => {}, accept: image => { image.values[0] = 99; return 'accepted'; }, sendControl: bytes => { controls.push(decodeControl(bytes).kind); return true; } });
    for (let i = 1; i <= 70; i++) receiver.receive(encodeStatePacket(encodeFull(img(i, i, 15000)), i));
    expect(receiver.stats().retainedImages).toBeLessThanOrEqual(64); expect(receiver.stats().retainedBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
    receiver.receive(encodeStatePacket(encodeDelta(img(1, 1, 15000), img(71, 71, 15000)), 71)); expect(controls.at(-1)).toBe('refresh');
    receiver.dispose(); expect(receiver.stats().retainedBytes).toBe(0);
  });
  it('protects retained bases from accept and acknowledgement callbacks', () => {
    const accepted: number[] = [], closed: string[] = [];
    const receiver = createStateReceiver({ clock: { nowMs: () => 0 }, close: reason => closed.push(reason), accept: image => { accepted.push(image.values[10]!); image.values.fill(99); image.metadata.fill(99); return 'accepted'; }, sendControl: () => true, onAcknowledged: image => { image.values.fill(100); image.metadata.fill(100); } });
    const base = img(1); base.values[10] = 42;
    const next = { ...base, sequence: 2, tick: 6, values: base.values.slice() }; next.values[0] = 17;
    receiver.receive(encodeStatePacket(encodeFull(base), 1)); receiver.receive(encodeStatePacket(encodeDelta(base, next), 2));
    expect(accepted).toEqual([42, 42]); expect(closed).toEqual([]);
  });
  it('survives lost ACKs and reordered deltas while stale fulls only retire storage', () => {
    const h = harness(), accepted: number[] = [], controls: string[] = []; let dropAck = true;
    const receiver = createStateReceiver({ clock: h.clock, close: reason => h.closed.push(reason), accept: image => { accepted.push(image.sequence); return 'accepted'; }, sendControl: bytes => { const control = decodeControl(bytes); controls.push(control.kind); if (!(dropAck && control.kind === 'ack')) h.sender.receiveControl(bytes); return true; } });
    h.sender.publish(img(1), true); receiver.receive(h.packets[0]!.bytes);
    h.sender.publish(img(2), false); expect(h.packets[1]!.kind).toBe('reliable-ordered'); dropAck = false; receiver.receive(h.packets[1]!.bytes);
    h.sender.publish(img(3), false); h.sender.publish(img(4), false); receiver.receive(h.packets[3]!.bytes); receiver.receive(h.packets[2]!.bytes);
    expect(accepted).toEqual([1, 2, 4]); receiver.receive(h.packets[0]!.bytes); expect(controls.at(-1)).toBe('full-received'); expect(h.closed).toEqual([]);
  });
  it('lets callback reentrancy accept only the newest publication', () => {
    const ready: number[] = [], controls: ReturnType<typeof decodeControl>[] = [];
    const receiver = createStateReceiver({ clock: { nowMs: () => 0 }, close: () => {}, accept: image => { if (image.sequence === 1) receiver.receive(encodeStatePacket(encodeFull(img(2)), 2)); return 'accepted'; }, sendControl: bytes => { controls.push(decodeControl(bytes)); return true; }, onAcknowledged: image => ready.push(image.sequence) });
    receiver.receive(encodeStatePacket(encodeFull(img(1)), 1)); expect(ready).toEqual([2]); expect(controls.filter(c => c.kind === 'ack').map(c => c.sequence)).toEqual([2]);
  });
  it('does not apply older or duplicate state reentering an in-flight acceptance', () => {
    for (const nestedSequence of [1, 2]) {
      const applied: number[] = [], ready: number[] = [], controls: ReturnType<typeof decodeControl>[] = []; let nested = false;
      const receiver = createStateReceiver({ clock: { nowMs: () => 0 }, close: () => {}, accept: image => {
        applied.push(image.sequence);
        if (!nested) { nested = true; receiver.receive(encodeStatePacket(encodeFull(img(nestedSequence)), 2)); }
        return 'accepted';
      }, sendControl: bytes => { controls.push(decodeControl(bytes)); return true; }, onAcknowledged: image => ready.push(image.sequence) });
      receiver.receive(encodeStatePacket(encodeFull(img(2)), 1));
      expect(applied).toEqual([2]); expect(ready).toEqual([2]);
      expect(controls.filter(c => c.kind === 'ack').map(c => c.sequence)).toEqual([2]);
      expect(controls.filter(c => c.kind === 'full-received').map(c => c.sequence)).toEqual([2, nestedSequence]);
    }
  });
  it('notifies successful ACK readiness despite duplicate or stale traffic during transmission', () => {
    for (const nestedSequence of [1, 2]) {
      const applied: number[] = [], ready: number[] = [], controls: ReturnType<typeof decodeControl>[] = [];
      const receiver = createStateReceiver({ clock: { nowMs: () => 0 }, close: () => {}, accept: image => { applied.push(image.sequence); return 'accepted'; }, sendControl: bytes => {
        const control = decodeControl(bytes); controls.push(control);
        if (control.kind === 'ack') receiver.receive(encodeStatePacket(encodeFull(img(nestedSequence)), 2));
        return true;
      }, onAcknowledged: image => ready.push(image.sequence) });
      receiver.receive(encodeStatePacket(encodeFull(img(2)), 1));
      expect(applied).toEqual([2]); expect(ready).toEqual([2]);
      expect(controls.filter(c => c.kind === 'ack').map(c => c.sequence)).toEqual([2]);
    }
  });
  it('keeps ignored or rejected nested acceptance from superseding accepted state', () => {
    for (const result of ['ignored', 'rejected'] as const) {
      const applied: number[] = [], ready: number[] = [], acknowledgements: number[] = [];
      const receiver = createStateReceiver({ clock: { nowMs: () => 0 }, close: () => {}, accept: image => {
        if (image.sequence === 2) return result;
        applied.push(image.sequence); receiver.receive(encodeStatePacket(encodeFull(img(2)), 2)); return 'accepted';
      }, sendControl: bytes => { const control = decodeControl(bytes); if (control.kind === 'ack') acknowledgements.push(control.sequence); return true; }, onAcknowledged: image => ready.push(image.sequence) });
      receiver.receive(encodeStatePacket(encodeFull(img(1)), 1));
      expect(applied).toEqual([1]); expect(acknowledgements).toEqual([1]); expect(ready).toEqual([1]);
    }
  });
  it('suppresses older readiness when newer state is accepted during ACK transmission', () => {
    const applied: number[] = [], ready: number[] = [];
    const receiver = createStateReceiver({ clock: { nowMs: () => 0 }, close: () => {}, accept: image => { applied.push(image.sequence); return 'accepted'; }, sendControl: bytes => {
      const control = decodeControl(bytes);
      if (control.kind === 'ack' && control.sequence === 1) receiver.receive(encodeStatePacket(encodeFull(img(2)), 2));
      return true;
    }, onAcknowledged: image => ready.push(image.sequence) });
    receiver.receive(encodeStatePacket(encodeFull(img(1)), 1)); expect(applied).toEqual([1, 2]); expect(ready).toEqual([2]);
  });
  it('releases in-flight ordering after ignored or rejected acceptance', () => {
    for (const result of ['ignored', 'rejected'] as const) {
      const applied: number[] = [], ready: number[] = [];
      const receiver = createStateReceiver({ clock: { nowMs: () => 0 }, close: () => {}, accept: image => {
        if (image.sequence === 2) { receiver.receive(encodeStatePacket(encodeFull(img(1)), 2)); return result; }
        applied.push(image.sequence); return 'accepted';
      }, sendControl: () => true, onAcknowledged: image => ready.push(image.sequence) });
      receiver.receive(encodeStatePacket(encodeFull(img(2)), 1)); expect(applied).toEqual([]); expect(ready).toEqual([]);
      receiver.receive(encodeStatePacket(encodeFull(img(1)), 3)); expect(applied).toEqual([1]); expect(ready).toEqual([1]);
    }
  });
});

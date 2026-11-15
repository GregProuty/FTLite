import { describe, expect, it } from 'vitest';
import { createPortLink } from '../src/network/portLink';
import { portEndpoint } from './helpers/portEndpoint';

const data = (id: number, bytes = new Uint8Array([1]), kind = 'reliable-ordered') => ({ version: 1, type: 'data', id, kind, bytes });
const ack = (id: number) => ({ version: 1, type: 'ack', id });
describe('bounded port link', () => {
  it('counts actual in-flight reliable bytes while the receiver is stalled', () => {
    const p = portEndpoint(), link = createPortLink(p.port, 'peer');
    for (let n = 0; n < 64; n++) link.send('reliable-ordered', new Uint8Array(16384));
    expect(link.stats().bufferedBytes).toBe(1048576);
    expect(p.sent.filter((x: any) => x.type === 'data')).toHaveLength(64);
    link.send('reliable-ordered', new Uint8Array([1]));
    expect(p.closed).toBe(true); expect(p.listeners).toBe(0);
  });
  it('releases only the exact outstanding ACK once', () => {
    const p = portEndpoint(), link = createPortLink(p.port, 'peer');
    link.send('reliable-ordered', new Uint8Array(10)); link.send('reliable-ordered', new Uint8Array(20));
    p.receive(ack(999)); expect(link.stats().bufferedBytes).toBe(30);
    p.receive(ack(1)); p.receive(ack(1)); expect(link.stats().bufferedBytes).toBe(20);
    p.receive(ack(2)); expect(link.stats().bufferedBytes).toBe(0); link.close('done');
  });
  it('retains one in-flight latest and one replacement per mode stream', () => {
    const p = portEndpoint(), link = createPortLink(p.port, 'peer', { latestStreamKey: b => String(b[0]) });
    link.send('unreliable-latest', new Uint8Array([0, 1]));
    link.send('unreliable-latest', new Uint8Array([0, 2]));
    const replacement = new Uint8Array([0, 3]); link.send('unreliable-latest', replacement); replacement[1] = 99;
    link.send('unreliable-latest', new Uint8Array([1, 4]));
    expect(p.sent).toHaveLength(2); expect(link.stats().bufferedBytes).toBe(6);
    p.receive(ack(1)); expect(p.sent).toHaveLength(3);
    expect((p.sent[2] as any).bytes).toEqual(new Uint8Array([0, 3]));
    p.receive(ack(1)); expect(link.stats().bufferedBytes).toBe(4); link.close('done');
  });
  it('bounds latest packet size and stream cardinality', () => {
    const p = portEndpoint(), link = createPortLink(p.port, 'peer', { latestStreamKey: b => String(b[0]) });
    for (let n = 0; n < 17; n++) link.send('unreliable-latest', new Uint8Array([n]));
    expect(p.closed).toBe(true);
    const q = portEndpoint(); createPortLink(q.port, 'peer').send('unreliable-latest', new Uint8Array(16385));
    expect(q.closed).toBe(true);
  });
  it('owns sent and separately delivered listener bytes', () => {
    const p = portEndpoint(), link = createPortLink(p.port, 'peer');
    const bytes = new Uint8Array([7]); link.send('reliable-ordered', bytes); bytes[0] = 9;
    expect((p.sent[0] as any).bytes[0]).toBe(7);
    let observed = 0;
    link.onMessage((_, b) => { b[0] = 88; }); link.onMessage((_, b) => { observed = b[0]!; });
    p.receive(data(1, bytes)); expect(observed).toBe(9); expect(bytes[0]).toBe(9); link.close('done');
  });
  it.each([null, {}, { ...ack(1), id: 0 }, { ...data(1), bytes: [1] }, data(1, new Uint8Array(1048577)), data(1, new Uint8Array(16385), 'unreliable-latest'), { ...ack(1), bytes: 1 }])('closes malformed frames before delivery: %j', frame => {
    const p = portEndpoint(), link = createPortLink(p.port, 'peer'); let delivered = 0;
    link.onMessage(() => { delivered++; }); p.receive(frame);
    expect(delivered).toBe(0); expect(p.closed).toBe(true); expect(p.listeners).toBe(0);
  });
  it('rejects duplicate delivery and closes safely inside a delivery callback', () => {
    const p = portEndpoint(), link = createPortLink(p.port, 'peer'); let delivered = 0, closed = 0;
    link.onMessage(() => { delivered++; }); link.onClose(() => { closed++; });
    p.receive(data(1)); p.receive(data(1)); link.close('again');
    expect(delivered).toBe(1); expect(closed).toBe(1); expect(p.listeners).toBe(0);
    const q = portEndpoint(), other = createPortLink(q.port, 'peer');
    other.onMessage(() => other.close('inside')); expect(() => q.receive(data(1))).not.toThrow(); expect(q.listeners).toBe(0);
  });
  it('cleans partially installed listeners when start fails', () => {
    const p = portEndpoint(); p.port.start = () => { throw Error('transfer failed'); };
    expect(() => createPortLink(p.port, 'peer')).toThrow(); expect(p.closed).toBe(true); expect(p.listeners).toBe(0);
  });
  it('bounds arbitrarily many latest replacements and tiny reliable packet metadata', () => {
    const p = portEndpoint(), link = createPortLink(p.port, 'peer', { latestStreamKey: b => String(b[0]) });
    for (let i = 0; i < 1024; i++) { const bytes = new Uint8Array(16384); bytes[0] = i % 16; link.send('unreliable-latest', bytes); }
    expect(p.sent).toHaveLength(16); expect(link.stats().bufferedBytes).toBe(16 * 2 * 16384); link.close('done');
    const q = portEndpoint(), tiny = createPortLink(q.port, 'peer');
    for (let i = 0; i < 4097; i++) tiny.send('reliable-ordered', new Uint8Array([1]));
    expect(q.closed).toBe(true);
  });
  it('handles synchronous ACK, platform-send failure, and throwing close listeners without leaks', () => {
    const p = portEndpoint(), link = createPortLink(p.port, 'peer');
    p.port.postMessage = frame => { if ((frame as any).type === 'data') p.receive(ack((frame as any).id)); };
    link.send('reliable-ordered', new Uint8Array([1])); expect(link.stats().bufferedBytes).toBe(0);
    link.send('unreliable-latest', new Uint8Array([1])); expect(link.stats().bufferedBytes).toBe(0);
    let closed = 0; link.onClose(() => { throw Error('listener'); }); link.onClose(() => { closed++; });
    p.port.postMessage = () => { throw Error('platform'); };
    expect(() => link.send('reliable-ordered', new Uint8Array([1]))).not.toThrow();
    expect(closed).toBe(1); expect(p.listeners).toBe(0); expect(link.stats().bufferedBytes).toBe(0);
  });
});

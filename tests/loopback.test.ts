import { describe, it, expect } from 'vitest';
import { createLoopbackHarness } from '../src/renderer/src/net/loopback';
import { encodeMessage, decodeMessage } from '../src/renderer/src/net/codec';
import type { Link } from '../src/renderer/src/net/contracts';
import { compatibility, commandMessage, heldMessage } from './helpers/net';

async function pair(options?: Parameters<typeof createLoopbackHarness>[1]) {
  const harness = createLoopbackHarness(compatibility, options), host = harness.createSession(), client = harness.createSession();
  const { joinCode } = await host.host(compatibility); await client.join(joinCode, '');
  return { ...harness, host, client, a: client.links[0]!, b: host.links[0]! };
}
describe('local loopback session', () => {
  it('synchronous local bootstrap uses the same queued bytes and teardown as Session host/join', async () => {
    const normal = await pair(), harness = createLoopbackHarness(compatibility), local = harness.connectLocal();
    const first: unknown[] = [], second: unknown[] = [];
    normal.b.onMessage((_, bytes) => first.push(decodeMessage(bytes)));
    local.authorityLink.onMessage((_, bytes) => second.push(decodeMessage(bytes)));
    const bytes = encodeMessage(commandMessage());
    normal.a.send('reliable-ordered', bytes); local.clientLink.send('reliable-ordered', bytes);
    expect(first).toEqual([]); expect(second).toEqual([]); normal.drain(); harness.drain(); expect(second).toEqual(first);
    normal.host.close('done'); local.host.close('done'); expect(local.client.links).toHaveLength(0); expect(normal.client.links).toHaveLength(0);
  });
  it('copies at send and for every delivery listener, queues callbacks, and delivers reliable FIFO', async () => {
    const p = await pair(), first: number[] = [], second: number[] = [];
    p.b.onMessage((_, bytes) => { first.push(bytes[0]!); bytes[0] = 99; });
    p.b.onMessage((_, bytes) => second.push(bytes[0]!));
    const bytes = new Uint8Array([1]); p.a.send('reliable-ordered', bytes); bytes[0] = 42;
    p.a.send('reliable-ordered', new Uint8Array([2])); expect(first).toEqual([]); p.drain();
    expect(first).toEqual([1, 2]); expect(second).toEqual([1, 2]); expect(p.a.stats().bufferedBytes).toBe(0);
    expect(p.a.caps).toEqual({ unreliable: true, maxDatagram: 65536, hidesPeerIp: true, p2p: false });
    expect(p.a.stats()).toEqual({ rttMs: 0, lossPct: 0, relayed: false, bufferedBytes: 0 });
  });
  it('keeps latest streams independent for two players and runs, rejects obsolete pending sequence replacement', async () => {
    const p = await pair(), received: unknown[] = []; p.b.onMessage((_, b) => received.push(decodeMessage(b)));
    for (const message of [heldMessage(0, 2), heldMessage(1, 1), heldMessage(0, 1), heldMessage(0, 3, 'old-run'), heldMessage(0, 4)]) p.a.send('unreliable-latest', encodeMessage(message));
    p.drain(); expect(received).toEqual([heldMessage(1, 1), heldMessage(0, 3, 'old-run'), heldMessage(0, 4)]);
    p.a.send('unreliable-latest', encodeMessage(heldMessage(0, 3))); p.drain(); expect(received).toEqual([heldMessage(1, 1), heldMessage(0, 3, 'old-run'), heldMessage(0, 4), heldMessage(0, 3)]);
  });
  it('does not deliver reentrant sends in the same drain', async () => {
    const p = await pair(), seen: number[] = [];
    p.b.onMessage((_, b) => { seen.push(b[0]!); if (b[0] === 1) p.a.send('reliable-ordered', new Uint8Array([2])); });
    p.a.send('reliable-ordered', new Uint8Array([1])); p.drain(); expect(seen).toEqual([1]); p.drain(); expect(seen).toEqual([1, 2]);
  });
  it('honors unsubscribe during drain and closes/lost callbacks once with zero accounting', async () => {
    const p = await pair(), seen: string[] = [], lost: string[] = [];
    const remove = p.b.onMessage(() => seen.push('removed'));
    p.b.onMessage(() => { remove(); p.a.close('done'); });
    const off = p.a.onClose((r) => seen.push(r)); off();
    p.a.onClose((r) => seen.push(r)); p.b.onClose((r) => seen.push(r)); p.host.onLinkLost((peer) => lost.push(peer));
    remove(); p.a.send('reliable-ordered', new Uint8Array([1])); p.a.send('reliable-ordered', new Uint8Array([2])); p.drain();
    p.a.close('again'); p.b.close('again'); expect(seen).toEqual(['done', 'done']); expect(lost).toEqual([p.b.peer]);
    expect(p.a.stats().bufferedBytes).toBe(0); expect(p.b.stats().bufferedBytes).toBe(0);
    expect(p.host.links).toEqual([]); expect(p.client.links).toEqual([]);
  });
  it('rejects unknown codes and protocol/content/sim mismatches; tokens are reserved', async () => {
    const harness = createLoopbackHarness(compatibility), host = harness.createSession();
    await expect(harness.createSession().join('missing')).rejects.toThrow();
    const { joinCode } = await host.host(compatibility);
    for (const expected of [{ ...compatibility, protocolVersion: 2 }, { ...compatibility, simVersion: 35 }, { ...compatibility, contentDigest: 'b'.repeat(64) }]) {
      await expect(harness.createSession(expected).join(joinCode)).rejects.toThrow(/compatib/i);
    }
    await expect(harness.createSession().host({ ...compatibility, contentDigest: 'b'.repeat(64) })).rejects.toThrow();
    const client = harness.createSession(); await expect(client.join(joinCode, 'reserved-token')).resolves.toBeUndefined();
    host.close('end'); await expect(harness.createSession().join(joinCode)).rejects.toThrow();
  });
  it('unsubscribes session observers and closes sessions before host/join reuse', async () => {
    const harness = createLoopbackHarness(compatibility), host = harness.createSession(), client = harness.createSession();
    const seen: Link[] = []; const off = host.onLink((l) => seen.push(l)); off();
    const { joinCode } = await host.host(compatibility); await client.join(joinCode); expect(seen).toEqual([]);
    client.close('done'); await expect(client.join(joinCode)).rejects.toThrow();
  });
  it.each(['reliable-ordered', 'unreliable-latest'] as const)('closes oversize %s packets without throwing', async (channel) => {
    const p = await pair(), reasons: string[] = []; p.a.onClose((r) => reasons.push(r));
    expect(() => p.a.send(channel, new Uint8Array(65537))).not.toThrow(); expect(reasons).toEqual(['oversize']);
    expect(p.a.stats().bufferedBytes).toBe(0);
  });
  it('closes reliable queue overflow, clears both directions and ignores sends after close', async () => {
    const p = await pair(), reasons: string[] = []; p.a.onClose((r) => reasons.push(r));
    p.b.send('reliable-ordered', new Uint8Array([1]));
    for (let i = 0; i < 16; i++) p.a.send('reliable-ordered', new Uint8Array(65536));
    expect(p.a.stats().bufferedBytes).toBe(1048576); p.a.send('reliable-ordered', new Uint8Array([1]));
    expect(reasons).toEqual(['reliable-overflow']); expect(p.a.stats().bufferedBytes).toBe(0); expect(p.b.stats().bufferedBytes).toBe(0);
    p.a.send('reliable-ordered', new Uint8Array([1])); expect(p.a.stats().bufferedBytes).toBe(0);
  });
  it('bounds latest overload without evicting another stream or reliable packets', async () => {
    const p = await pair(); for (let i = 0; i < 15; i++) p.a.send('reliable-ordered', new Uint8Array(65536));
    p.a.send('unreliable-latest', encodeMessage(heldMessage(0, 1)));
    for (let i = 0; i < 2000; i++) p.a.send('unreliable-latest', encodeMessage(heldMessage(1, i + 1)));
    expect(p.a.stats().bufferedBytes).toBeLessThanOrEqual(1048576);
    const received: unknown[] = []; p.b.onMessage((kind, b) => { if (kind === 'unreliable-latest') received.push(decodeMessage(b)); });
    p.drain(); expect(received).toEqual([heldMessage(0, 1), heldMessage(1, 2000)]);
  });
  it('supports injected latest drop/delay/reorder and reliable delay while retaining reliable FIFO', async () => {
    const p = await pair({ impairment: ({ ordinal }) => ordinal === 1 ? { delayDrains: 2 } : ordinal === 3 ? { drop: true } : {}, reverseLatest: true });
    const seen: unknown[] = []; p.b.onMessage((kind, b) => seen.push(kind === 'reliable-ordered' ? b[0] : decodeMessage(b)));
    p.a.send('reliable-ordered', new Uint8Array([1])); p.a.send('reliable-ordered', new Uint8Array([2]));
    p.a.send('unreliable-latest', encodeMessage(heldMessage(0, 1))); p.a.send('unreliable-latest', encodeMessage(heldMessage(1, 1)));
    p.a.send('unreliable-latest', encodeMessage(heldMessage(2, 1)));
    p.drain(); expect(seen).toEqual([heldMessage(2, 1), heldMessage(1, 1)]); p.drain(); expect(seen).toHaveLength(2);
    p.drain(); expect(seen).toEqual([heldMessage(2, 1), heldMessage(1, 1), 1, 2]);
  });
  it('closes unsupported channels and invalid latest framing explicitly', async () => {
    for (const invalid of [true, false]) {
      const p = await pair(), reasons: string[] = []; p.a.onClose((r) => reasons.push(r));
      if (invalid) p.a.send('other' as never, new Uint8Array([1])); else p.a.send('unreliable-latest', encodeMessage(commandMessage()));
      expect(reasons).toHaveLength(1); expect(p.a.stats().bufferedBytes).toBe(0);
    }
  });
});


describe('loopback queue boundary cases', () => {
  it('applies observer unsubscribe before its turn in the same delivery', async () => {
    const p = await pair(), seen: string[] = []; let off = () => {};
    p.b.onMessage(() => { seen.push('first'); off(); });
    off = p.b.onMessage(() => seen.push('second'));
    p.a.send('reliable-ordered', new Uint8Array([1])); p.drain(); expect(seen).toEqual(['first']);
  });
  it('drops latest overload within the byte cap without closing or replacing other streams', async () => {
    const p = await pair(), seen: unknown[] = [], closed: string[] = [];
    p.a.onClose((r) => closed.push(r)); p.b.onMessage((kind, b) => { if (kind === 'unreliable-latest') seen.push(decodeMessage(b)); });
    for (let i = 0; i < 15; i++) p.a.send('reliable-ordered', new Uint8Array(65536));
    p.a.send('unreliable-latest', encodeMessage(heldMessage(0, 1))); p.a.send('unreliable-latest', encodeMessage(heldMessage(1, 1)));
    for (let i = 0; i < 1000; i++) p.a.send('unreliable-latest', encodeMessage(heldMessage(2, 1, 'r'.repeat(120) + i)));
    expect(p.a.stats().bufferedBytes).toBeLessThanOrEqual(1048576);
    p.drain(); expect(seen).toContainEqual(heldMessage(0, 1)); expect(seen).toContainEqual(heldMessage(1, 1));
    expect(seen.length).toBeLessThan(1002); expect(closed).toEqual([]); expect(p.a.stats().bufferedBytes).toBe(0);
  });
  it('reports injected latest loss and never drops reliable messages through impairment', async () => {
    const p = await pair({ impairment: () => ({ drop: true }) }), seen: number[] = [];
    p.b.onMessage((_, b) => seen.push(b[0]!)); p.a.send('reliable-ordered', new Uint8Array([7]));
    p.a.send('unreliable-latest', encodeMessage(heldMessage())); p.drain();
    expect(seen).toEqual([7]); expect(p.a.stats().lossPct).toBe(50); expect(p.a.stats().bufferedBytes).toBe(0);
  });
});
describe('loopback empty payloads', () => {
  it.each(['reliable-ordered', 'unreliable-latest'] as const)('closes empty %s payloads without queueing or delivery', async (channel) => {
    const p = await pair(), delivered: number[] = [], aReasons: string[] = [], bReasons: string[] = [];
    p.a.onMessage((_, bytes) => delivered.push(bytes[0]!));
    p.b.onMessage((_, bytes) => delivered.push(bytes[0]!));
    p.a.onClose((reason) => aReasons.push(reason)); p.b.onClose((reason) => bReasons.push(reason));
    p.a.send('reliable-ordered', new Uint8Array([1])); p.b.send('reliable-ordered', new Uint8Array([2]));
    expect(() => p.a.send(channel, new Uint8Array(0))).not.toThrow();
    expect(p.a.stats().bufferedBytes).toBe(0); expect(p.b.stats().bufferedBytes).toBe(0);
    p.a.send(channel, new Uint8Array(0)); p.b.send('reliable-ordered', new Uint8Array([3]));
    p.a.close('again'); p.b.close('again'); p.drain();
    expect(aReasons).toEqual(['empty-payload']); expect(bReasons).toEqual(['empty-payload']);
    expect(delivered).toEqual([]); expect(p.client.links).toEqual([]); expect(p.host.links).toEqual([]);
  });
});

// Perf-i (spec 2026-11-19-perf-i-design): the host's stream bindings build a state image only for a publication the
// sender can transmit (a cadence tick or a reliable one), and the bindings of one authority share that image.
import { describe, expect, it } from 'vitest';
import { createMessageCodec } from '../src/renderer/src/net/codec';
import type { ChannelKind, Link, PublishedState } from '../src/renderer/src/net/contracts';
import { createModeStreamBinding, createSharedStateImage, type SharedStateImage } from '../src/network/modes/streamBinding';
import { STATE_CADENCE_TICKS } from '../src/network/state/sender';
import { decodeStatePacket, inspectState, type StateImage } from '../src/network/state/imageCodec';
import { flattenDuel } from '../src/renderer/src/sim/duel/hash';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { flattenTactical } from '../src/renderer/src/sim/tactical/hash';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { ownTestCleanup } from './helpers/simLifetime';

function endpoint() {
  const sent: { kind: ChannelKind; bytes: Uint8Array }[] = [], reasons: string[] = [];
  const link: Link = { peer: 'test', caps: { unreliable: true, maxDatagram: 16088, hidesPeerIp: true, p2p: false },
    send(kind, bytes) { sent.push({ kind, bytes: bytes.slice() }); },
    onMessage() { return () => {}; }, onClose() { return () => {}; }, close(reason) { reasons.push(reason); },
    stats: () => ({ rttMs: 0, lossPct: 0, relayed: false, bufferedBytes: 0 }) };
  return { link, sent, reasons };
}
const publication = (tick: number, sequence: number): PublishedState => ({ tick, publicationSequence: sequence }) as PublishedState;
function rig(images?: SharedStateImage) {
  const wire = endpoint(), built: number[] = [];
  const toImage = (p: PublishedState): StateImage => { built.push(p.publicationSequence);
    return { sequence: p.publicationSequence, tick: p.tick, epoch: 'e', metadata: new Uint8Array(0), values: new Float64Array([p.tick, 7]) }; };
  const binding = createModeStreamBinding(wire.link, { clock: { nowMs: () => 0 }, latestPayloadLimit: 4096, toImage, codec: createMessageCodec(),
    notificationStream: 'toy-notification', label: 'toy', images });
  ownTestCleanup(() => binding.dispose());
  return { wire, built, sink: binding.attachOptions.publicationSink! };
}
const sequences = (wire: ReturnType<typeof endpoint>): number[] => wire.sent.map((s) => inspectState(decodeStatePacket(s.bytes)).sequence);

describe('the stream binding builds only what it can send (Perf-i)', () => {
  it('skips an ordinary publication off the cadence before building its image', () => {
    const r = rig();
    r.sink(publication(0, 1), true);                         // the attach's reliable full
    r.sink(publication(1, 2), false); r.sink(publication(2, 3), false);
    expect(r.built).toEqual([1]);
    r.sink(publication(STATE_CADENCE_TICKS, 4), false);
    expect(r.built).toEqual([1, 4]);
    expect(r.wire.reasons).toEqual([]);
  });
  it('still builds and sends a reliable publication on any tick', () => {
    const r = rig();
    r.sink(publication(1, 1), true); r.sink(publication(2, 2), true);
    expect(r.built).toEqual([1, 2]);
    expect(sequences(r.wire)).toEqual([1, 2]);
    expect(r.wire.sent.every((s) => s.kind === 'reliable-ordered')).toBe(true);
  });
  it('builds one image for every binding that shares a store, and one each without', () => {
    const images = createSharedStateImage(), a = rig(images), b = rig(images);
    a.sink(publication(0, 1), true); b.sink(publication(0, 1), true);
    expect([a.built, b.built]).toEqual([[1], []]);
    expect([sequences(a.wire), sequences(b.wire)]).toEqual([[1], [1]]);
    b.sink(publication(3, 2), true); a.sink(publication(3, 2), true);   // whichever binding is first builds it
    expect([a.built, b.built]).toEqual([[1], [2]]);
    const c = rig(), d = rig();
    c.sink(publication(0, 1), true); d.sink(publication(0, 1), true);
    expect([c.built, d.built]).toEqual([[1], [1]]);
  });
  it('never hands a later binding a failed build', () => {
    const images = createSharedStateImage(), wire = endpoint();
    const bad = createModeStreamBinding(wire.link, { clock: { nowMs: () => 0 }, latestPayloadLimit: 4096, toImage() { throw Error('invalid'); },
      codec: createMessageCodec(), notificationStream: 'toy-notification', label: 'toy', images });
    ownTestCleanup(() => bad.dispose());
    bad.attachOptions.publicationSink!(publication(0, 1), true);
    expect(wire.reasons).toEqual(['toy-stream-invalid']);
    const good = rig(images); good.sink(publication(0, 1), true);
    expect(good.built).toEqual([1]);
  });
});

describe('flatten writes -0 as 0 (Perf-i: the plain loop keeps the canonical values)', () => {
  it('flattenTactical and flattenDuel hold no -0', () => {
    const s = createTacticalState(2026); s.ships[0].vx = -0; s.ships[1].vy = -0;
    expect([...flattenTactical(s)].some((v) => Object.is(v, -0))).toBe(false);
    const d = createDuel(DUEL_LAYOUT, 2026); ownTestCleanup(() => disposeDuel(d));
    d.tactical.ships[0].vx = -0;
    const values = flattenDuel(d);
    expect(values).toBeInstanceOf(Float64Array);
    expect([...values].some((v) => Object.is(v, -0))).toBe(false);
  });
});

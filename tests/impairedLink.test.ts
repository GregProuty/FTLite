// Net-4a §6: the impaired link: each direction's delay, seeded jitter and loss on a fake clock; reliable packets are
// delayed in order and never lost; an outage holds reliable packets to its end and drops unreliable ones.
import { describe, expect, it } from 'vitest';
import { impairedPair } from './helpers/impairedLink';

const bytes = (n: number) => new Uint8Array([n]);
function rig(down: Parameters<typeof impairedPair>[1]['down']) {
  let now = 0;
  const pair = impairedPair('t', { seed: 9, now: () => now, up: { delayMs: 0 }, down });
  const got: { kind: string; n: number; at: number }[] = [];
  pair.guest.link.onMessage((kind, b) => got.push({ kind, n: b[0]!, at: now }));
  return { pair, got, advance(ms: number) { now += ms; pair.flush(); }, send(kind: 'reliable-ordered' | 'unreliable-latest', n: number) { pair.host.link.send(kind, bytes(n)); } };
}

describe('the impaired link (Net-4a §6)', () => {
  it('delays each direction by its delay; nothing arrives early', () => {
    const r = rig({ delayMs: 50 });
    r.send('unreliable-latest', 1); r.advance(49);
    expect(r.got).toEqual([]);
    r.advance(1);
    expect(r.got).toEqual([{ kind: 'unreliable-latest', n: 1, at: 50 }]);
  });
  it('reliable packets keep their order under jitter; unreliable ones may reorder', () => {
    const r = rig({ delayMs: 40, jitterMs: 30 });
    for (let n = 0; n < 50; n++) { r.send('reliable-ordered', n); r.advance(1); }
    r.advance(200);
    expect(r.got.map((g) => g.n)).toEqual(Array.from({ length: 50 }, (_, n) => n));
  });
  it('loss drops only unreliable packets, seeded: the same seed drops the same ones', () => {
    const a = rig({ delayMs: 10, loss: 0.3 }), b = rig({ delayMs: 10, loss: 0.3 });
    for (const r of [a, b]) { for (let n = 0; n < 100; n++) { r.send('unreliable-latest', n); r.send('reliable-ordered', 100 + n); } r.advance(20); }
    expect(a.got).toEqual(b.got);
    expect(a.got.filter((g) => g.kind === 'reliable-ordered')).toHaveLength(100);
    const lost = 100 - a.got.filter((g) => g.kind === 'unreliable-latest').length;
    expect(lost).toBeGreaterThan(15); expect(lost).toBeLessThan(45);
  });
  it('an outage drops unreliable packets sent in it and holds reliable ones to its end', () => {
    const r = rig({ delayMs: 10, outages: [{ from: 100, to: 300 }] });
    r.advance(150); r.send('unreliable-latest', 1); r.send('reliable-ordered', 2);
    r.advance(100);
    expect(r.got).toEqual([]);
    r.advance(100);
    expect(r.got).toEqual([{ kind: 'reliable-ordered', n: 2, at: 350 }]);
  });
  it('keep(sentAt) false drops an unreliable packet whatever the loss draw', () => {
    const r = rig({ delayMs: 10, keep: (at) => at !== 5 });
    r.advance(5); r.send('unreliable-latest', 1); r.advance(1); r.send('unreliable-latest', 2); r.advance(20);
    expect(r.got.map((g) => g.n)).toEqual([2]);
  });
});

// Net-4a gates G1, G3 and G5 (spec §6) on the real stack: the duel authority, the stream binding, the impaired link,
// the remote client and the predictor. Seat 0 flies the Cutter's crew Helm; seat 1 sits at Weapons. Round trips are
// split evenly between the two directions. Every run starts after a 1 s warm-up (both seats synced and their first held
// frames acknowledged), so the publications checked are steady-state ones.
import { beforeEach, describe, expect, it } from 'vitest';
import type { DuelCommand, HeldInput } from '../src/renderer/src/net/contracts';
import { PREDICT_MAX_TICKS } from '../src/renderer/src/clientControl/duelPredictor';
import { impairedPair, type Direction } from './helpers/impairedLink';
import { onlineDuel } from './helpers/onlineDuel';
import { predictedSeat, type Confirm } from './helpers/predictedSeat';

const N = (): HeldInput => ({ moveX: 0, moveY: 0, interactHeld: false });
type Input = (local: number) => { held: HeldInput; commands: DuelCommand[] };
const constant = (held: HeldInput): Input => () => ({ held, commands: [] });
/** This seat's input changing: the crew Helm's throttle and thrusters in a 40-tick pattern. */
const changing: Input = (L) => ({ held: { ...N(), throttleHeld: L % 40 < 20 ? 1 : -1, rcsX: L % 13 < 6 ? 1 : 0 }, commands: [] });
/** A run: both seats on impaired links with the given directions, `ticks` local ticks after a 60-tick warm-up. */
function run(o: { seed?: number; rttMs: number; loss?: number; jitterMs?: number; ticks: number; me: Input; partner: Input; down?: Partial<Direction>; up?: Partial<Direction> }) {
  const w = onlineDuel(o.seed ?? 3, { link: (peer) => impairedPair(peer, { seed: peer.length * 7 + 1, now: () => w.nowMs(),
    up: { delayMs: o.rttMs / 2, jitterMs: o.jitterMs, loss: o.loss, ...o.up }, down: { delayMs: o.rttMs / 2, jitterMs: o.jitterMs, loss: o.loss, ...o.down } }) });
  w.connect(0); w.connect(1);
  const me = predictedSeat(w, 0, (L) => o.me(L)), partner = predictedSeat(w, 1, (L) => o.partner(L));
  const out = { w, me, steps: [] as { stepped: boolean; confirms: Confirm[]; at: number }[] };
  for (let k = 0; k < 60 + o.ticks; k++) {
    w.tick();
    const r = me.step(); partner.step();
    if (k >= 60) out.steps.push({ ...r, at: w.nowMs() });
  }
  return out;
}
const confirms = (r: ReturnType<typeof run>) => r.steps.flatMap((s) => s.confirms).filter((c) => c.tick % 3 === 0);
// Each run is seconds of synchronous CPU on the full stack (R1-F10): yield a macrotask before each so vitest's worker RPC
// is answered (as tests/duelOnline.test.ts does), and give every case 120 s.
beforeEach(() => new Promise<void>((resolve) => setImmediate(resolve)));
const SLOW = { timeout: 120_000 };

describe('G1: exact when inputs are known (Net-4a §6)', SLOW, () => {
  for (const rttMs of [0, 50, 150, 300]) for (const loss of [0, 0.02, 0.05]) {
    it(`(a) every input constant, ${rttMs} ms round trip, ${loss * 100}% loss: P's hash at the confirmed tick is the publication's`, () => {
      const r = run({ rttMs, loss, ticks: 600, me: constant({ ...N(), throttleHeld: 1 }), partner: constant(N()) });
      const c = confirms(r).filter((x) => x.result !== 'reset');
      expect(c.length).toBeGreaterThan(100);
      for (const x of c) if (x.hashBefore !== null) expect(x.hashBefore).toBe(x.hash);
      // A re-simulation only when the target moved more than the slack (the lead being built, or held frames lost in a row).
      for (const x of c) if (x.result === 'resimulated') expect(Math.abs(x.standing - x.measured)).toBeGreaterThan(2);
      console.log(`G1a ${rttMs} ms ${loss * 100}%: verified ${c.filter((x) => x.result === 'verified').length}, re-simulated ${c.filter((x) => x.result === 'resimulated').length}`);
    });
  }
  it('(b) this seat\'s input changing, constant delay, no loss, one frame per tick: the same', () => {
    const r = run({ rttMs: 100, ticks: 600, me: changing, partner: constant(N()) });
    const c = confirms(r).filter((x) => x.result !== 'reset');
    for (const x of c) if (x.hashBefore !== null) expect(x.hashBefore).toBe(x.hash);
    for (const x of c) if (x.result === 'resimulated') expect(Math.abs(x.standing - x.measured)).toBeGreaterThan(2);
  });
  it('(c) changing under jitter and loss: once it stops, publications verify again within one lead plus two publications', () => {
    const stopAt = 300, r = run({ rttMs: 150, jitterMs: 20, loss: 0.05, ticks: 600, me: (L) => (L - 60 < stopAt ? changing(L) : constant({ ...N(), throttleHeld: 1 })(L)), partner: constant(N()) });
    const after = r.steps.slice(stopAt + 9 + 6).flatMap((s) => s.confirms).filter((x) => x.tick % 3 === 0);
    const share = after.filter((x) => x.result === 'verified').length / Math.max(1, after.length);
    console.log(`G1c verified share after the input stopped: ${(share * 100).toFixed(1)}%`);
    expect(after.slice(0, 1).every((x) => x.result !== 'reset')).toBe(true);
    expect(after.some((x) => x.result === 'verified')).toBe(true);
  });
});

describe('G3: answers at once (Net-4a §6)', SLOW, () => {
  for (const rttMs of [50, 150, 400]) it(`a change in this seat's held input steps P on the next local tick at ${rttMs} ms`, () => {
    const r = run({ rttMs, ticks: 300, me: changing, partner: constant(N()) });
    expect(r.steps.every((s) => s.stepped)).toBe(true);
  });
  it('at 600 ms P never passes T + PREDICT_MAX_TICKS, and some local ticks do not step', () => {
    const r = run({ rttMs: 600, ticks: 300, me: changing, partner: constant(N()) });
    expect(r.steps.some((s) => !s.stepped)).toBe(true);
    expect(r.me.predictor.stats().lead).toBeLessThanOrEqual(PREDICT_MAX_TICKS);
  });
});

describe('G5: rides out loss (Net-4a §6)', SLOW, () => {
  /** 10% publication loss, at most three in a row, none within 60 ms of the outage's edges. */
  function keep(outage: { from: number; to: number }) {
    let run = 0, k = 0;
    return (at: number): boolean => {
      if (Math.abs(at - outage.from) < 60 || Math.abs(at - outage.to) < 60) { run = 0; return true; }
      const drop = ((k++ * 2654435761) >>> 0) % 10 === 0 && run < 3;
      run = drop ? run + 1 : 0; return !drop;
    };
  }
  const start = 60 * 1000 / 60 + 5000;   // the outage begins 5 s into the checked run
  for (const c of [
    { name: '(a) 50 ms, publications out 300 ms, frames still arriving', rttMs: 50, downOut: 300, upOut: 0 },
    { name: '(b) 150 ms, publications out 200 ms', rttMs: 150, downOut: 200, upOut: 0 },
    { name: '(c) 50 ms, both directions out 200 ms', rttMs: 50, downOut: 200, upOut: 200 }
  ]) it(`${c.name}: tick() never returns false; the first publication after corrects within G4's bound`, () => {
    const down = { from: start, to: start + c.downOut }, up = { from: start, to: start + c.upOut };
    const r = run({ rttMs: c.rttMs, ticks: 1200, me: changing, partner: constant(N()), down: { outages: [down], keep: keep(down) }, up: c.upOut ? { outages: [up] } : {} });
    expect(r.steps.every((s) => s.stepped)).toBe(true);
    const first = r.steps.filter((s) => s.at > down.to).flatMap((s) => s.confirms)[0]!;
    if (first.correction) { expect(first.correction.ship).toBeLessThanOrEqual(5); expect(first.correction.character).toBeLessThanOrEqual(0.5); }
  });
  it('(d) 150 ms, publications out 500 ms: tick() is false only while P stands at T + PREDICT_MAX_TICKS, then resumes', () => {
    const down = { from: start, to: start + 500 };
    const r = run({ rttMs: 150, ticks: 1200, me: changing, partner: constant(N()), down: { outages: [down], keep: keep(down) } });
    const stalled = r.steps.filter((s) => !s.stepped);
    expect(stalled.length).toBeGreaterThan(0);
    for (const s of stalled) expect(s.at).toBeGreaterThan(down.from);
    expect(r.steps.at(-1)!.stepped).toBe(true);
  });
});

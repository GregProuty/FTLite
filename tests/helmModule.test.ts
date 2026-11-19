// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, §4, §5, §7): the helm module's new fields, the duel
// option helmBars, the round-start split, the pure crew-Helm rules (ramp, cap and floor, compressor, losing bars), and the
// fields in the hash, the flatten order, the snapshot and its bounds.
import { describe, expect, it } from 'vitest';
import { hashF64 } from '../src/shared/hash';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { flattenDuel, hashDuel } from '../src/renderer/src/sim/duel/hash';
import { compress, compressorAfterLoss, compressorMax, crewThrust, engineBars, heldAxis, noVent, rampThrottle, rampTicks, throttleCap, throttleFloor, vents } from '../src/renderer/src/sim/duel/helmFlight';
import { DUEL_MODULES, DUEL_NOT_SNAPSHOTTED } from '../src/renderer/src/sim/duel/modules';
import { moduleLength, type SimModule } from '../src/renderer/src/sim/module';
import { loadDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { COMPRESSOR_RATE, HELM_BARS, RCS_GAS_PER_TICK, RCS_TANK, THR_MAX, THR_MIN, THR_RAMP, THR_RETURN } from '../src/renderer/src/sim/duel/tuning';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
/** The flattened offset of helm.throttle: after SIM_VERSION and every module before helm. */
function helmOffset(d: DuelState): number {
  let at = 1;
  for (const { module, state } of DUEL_MODULES) { if (module.id === 'helm') return at; at += moduleLength(module as SimModule<unknown>, state(d)); }
  throw new Error('no helm module');
}

describe('the numbers (spec §3, §4, §5)', () => {
  it('are the spec\'s start values', () => {
    expect([THR_MIN, THR_MAX, THR_RAMP, THR_RETURN, RCS_TANK, RCS_GAS_PER_TICK, HELM_BARS]).toEqual([-250, 1000, 7, 34, 1000, 8, 4]);
    expect(COMPRESSOR_RATE).toEqual([0, 50, 100, 150]);
  });
});

describe('a fresh duel (spec §4, §5)', () => {
  it('starts at throttle 0 with a full tank, no remainder, compressor 1 of 4 bars and nothing vented', () => {
    const d = createDuel(CUTTER, 5);
    try {
      expect([d.thrMille, d.rcsGas, d.rcsAcc, d.compressor, d.helmBars, engineBars(d)]).toEqual([0, RCS_TANK, 0, 1, 4, 3]);
      expect(d.helmVent).toEqual({ x: 0, y: 0, boosted: false, turn: 0 });
    } finally { disposeDuel(d); }
  });
  it('takes helmBars 0..5 as a duel option; the start split is min(1, helmBars); anything else throws', () => {
    for (const [bars, compressor] of [[0, 0], [1, 1], [3, 1], [5, 1]] as const) {
      const d = createDuel(CUTTER, 5, 0, 2, undefined, { helmBars: bars });
      try { expect([d.helmBars, d.compressor]).toEqual([bars, compressor]); } finally { disposeDuel(d); }
    }
    for (const bad of [-1, 6, 1.5, Number.NaN]) expect(() => createDuel(CUTTER, 5, 0, 2, undefined, { helmBars: bad }), String(bad)).toThrow(/invalid duel helm bars/);
  });
  it('a rematch carries helmBars into the next round, with a fresh helm', () => {
    const d = createSeatedDuel(CUTTER, 5, 0, 2, undefined, { helmBars: 2 });
    try {
      Object.assign(d, { thrMille: 500, rcsGas: 10, rcsAcc: 7, compressor: 0 });
      d.tactical.outcome = Outcome.CrewWins; d.decidedTick = d.interior.tick;
      stepDuelTick(d, { held: [NONE, NONE], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: d.interior.tick, command: { kind: 'rematch' } }] });
      expect(d.round).toBe(1);
      expect([d.helmBars, d.compressor, d.thrMille, d.rcsGas, d.rcsAcc]).toEqual([2, 1, 0, RCS_TANK, 0]);
    } finally { disposeDuel(d); }
  });
});

describe('the pure rules (spec §3, §4, §5)', () => {
  it('crewThrust is a quarter per 250 in reverse and a thousandth per mille forward', () => {
    expect([-250, -125, 0, 250, 500, 1000].map(crewThrust)).toEqual([-1, -0.5, 0, 0.25, 0.5, 1]);
  });
  it('heldAxis reads 1 and −1, and anything else as 0', () => {
    expect([1, -1, 0, undefined, 2, 0.5, '1', true].map(heldAxis)).toEqual([1, -1, 0, 0, 0, 0, 0, 0]);
  });
  it('the cap is min(ENGINE, 4) × 250 and the floor −250 from ENGINE 1; the compressor tops out at min(3, bars)', () => {
    expect([0, 1, 2, 3, 4, 5].map(throttleCap)).toEqual([0, 250, 500, 750, 1000, 1000]);
    expect([0, 1, 4].map(throttleFloor)).toEqual([0, -250, -250]);
    expect([0, 2, 3, 4, 5].map(compressorMax)).toEqual([0, 2, 3, 3, 3]);
  });
  it('held W reaches 1000 in 143 ticks at cap 1000 and stops at 750 at cap 750; held S reaches −250 in 36', () => {
    expect(rampTicks(0, 1, -250, 1000, 142)).toBe(994); expect(rampTicks(0, 1, -250, 1000, 143)).toBe(1000);
    expect(rampTicks(0, 1, -250, 750, 200)).toBe(750);
    expect(rampTicks(0, -1, -250, 1000, 35)).toBe(-245); expect(rampTicks(0, -1, -250, 1000, 36)).toBe(-250); expect(rampTicks(0, -1, -250, 1000, 99)).toBe(-250);
  });
  it('let go, it returns to 0 by 34 a tick from either side and stops there', () => {
    const down: number[] = [];
    for (let m = 1000, k = 0; k < 31; k++) { m = rampThrottle(m, 0, -250, 1000); down.push(m); }
    expect(down.slice(0, 3)).toEqual([966, 932, 898]); expect(down[28]).toBe(14); expect(down[29]).toBe(0); expect(down[30]).toBe(0);
    expect(down.every((m) => m >= 0)).toBe(true);
    expect(rampTicks(-250, 0, -250, 1000, 7)).toBe(-12); expect(rampTicks(-250, 0, -250, 1000, 8)).toBe(0);
  });
  it('the clamp holds the cap and the floor: ENGINE 0 holds it at 0 whatever is held', () => {
    expect(rampThrottle(1000, 0, -250, 750)).toBe(750);   // a cap that drops clamps the same tick
    expect([rampTicks(0, 1, 0, 0, 10), rampTicks(0, -1, 0, 0, 10)]).toEqual([0, 0]);
  });
  it('the compressor refills an empty tank in exactly 1200, 600 and 400 ticks at 1, 2 and 3 bars, and never at 0', () => {
    for (const [bars, ticks] of [[1, 1200], [2, 600], [3, 400]] as const) {
      let s = { gas: 0, acc: 0 };
      for (let k = 0; k < ticks - 1; k++) s = compress(s.gas, s.acc, bars);
      expect(s.gas, `${bars} bars at ${ticks - 1}`).toBeLessThan(RCS_TANK);
      s = compress(s.gas, s.acc, bars);
      expect([s.gas, s.acc], `${bars} bars at ${ticks}`).toEqual([RCS_TANK, 0]);
      expect(compress(s.gas, s.acc, bars)).toEqual({ gas: RCS_TANK, acc: 0 });   // a full tank holds no remainder
    }
    let z = { gas: 0, acc: 0 };
    for (let k = 0; k < 2000; k++) z = compress(z.gas, z.acc, 0);
    expect(z).toEqual({ gas: 0, acc: 0 });
    expect(compress(990, 50, 3)).toEqual({ gas: 993, acc: 20 });
  });
  it('an axis vents only when held and the tank holds a tick\'s gas', () => {
    expect([vents(1, 8), vents(-1, 1000), vents(0, 1000), vents(1, 7)]).toEqual([true, true, false, false]);
  });
  it('losing bars comes off COMPRESSOR first', () => {
    expect(compressorAfterLoss(2, 1, 3)).toBe(1); expect(compressorAfterLoss(1, 2, 2)).toBe(0); expect(compressorAfterLoss(3, 0, 2)).toBe(2); expect(compressorAfterLoss(3, 0, 5)).toBe(3);
  });
  it('noVent is a fresh unvented record each call', () => {
    const a = noVent(), b = noVent();
    expect(a).toEqual({ x: 0, y: 0, boosted: false, turn: 0 }); expect(a).not.toBe(b);
  });
});

describe('the fields in the hash, the flatten and the snapshot (spec §7)', () => {
  it('thrMille, rcsGas, rcsAcc and compressor move the hash; helmBars and helmVent do not', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const base = hashDuel(d);
      for (const [key, value] of [['thrMille', 7], ['rcsGas', 992], ['rcsAcc', 50], ['compressor', 2]] as const) {
        const was = d[key]; d[key] = value;
        expect(hashDuel(d), key).not.toBe(base);
        d[key] = was;
      }
      expect(hashDuel(d)).toBe(base);
      d.helmBars = 3; d.helmVent = { x: 1, y: -1, boosted: true, turn: 1 };
      expect(hashDuel(d)).toBe(base);
      expect(Object.keys(DUEL_NOT_SNAPSHOTTED)).toEqual(expect.arrayContaining(['helmBars', 'helmVent']));
    } finally { disposeDuel(d); }
  });
  it('flatten carries the helm module as throttle, holdHeading, thrMille, rcsGas, rcsAcc, compressor', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(d, { thrMille: -100, rcsGas: 437, rcsAcc: 17, compressor: 2 });
      const at = helmOffset(d);
      expect(Array.from(flattenDuel(d)).slice(at, at + 6)).toEqual([d.throttle, d.holdHeading, -100, 437, 17, 2]);
    } finally { disposeDuel(d); }
  });
  it('round-trips through the snapshot; a restore takes the default helmBars and no vent', () => {
    const d = createSeatedDuel(CUTTER, 5, 0, 2, undefined, { helmBars: 3 });
    try {
      Object.assign(d, { thrMille: -100, rcsGas: 437, rcsAcc: 17, compressor: 2, helmVent: { x: 1, y: 0, boosted: true, turn: 1 } });
      const r = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(saveDuelSnapshot(d, DIGEST))), DIGEST);
      try {
        expect([r.thrMille, r.rcsGas, r.rcsAcc, r.compressor, r.helmBars, hashDuel(r)]).toEqual([-100, 437, 17, 2, HELM_BARS, hashDuel(d)]);
        expect(r.helmVent).toEqual({ x: 0, y: 0, boosted: false, turn: 0 });
      } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
  it('refuses values out of bounds, even rehashed', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const snap = saveDuelSnapshot(d, DIGEST), at = helmOffset(d);
      for (const [k, bad, name] of [[2, 1001, 'thrMille'], [2, -251, 'thrMille'], [2, 0.5, 'thrMille'], [3, -1, 'rcsGas'], [3, 1001, 'rcsGas'], [4, 60, 'rcsAcc'], [4, -1, 'rcsAcc'], [5, 4, 'compressor'], [5, -1, 'compressor']] as const) {
        const s = structuredClone(snap); s.values[at + k] = bad; s.header.hash = hashF64(Float64Array.from(s.values));
        expect(() => validateDuelSnapshot(CUTTER, s, DIGEST), `${name} ${bad}`).toThrow(new RegExp(`${name} ${bad} is invalid`));
      }
    } finally { disposeDuel(d); }
  });
});

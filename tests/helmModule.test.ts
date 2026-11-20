// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, §4, §7): the helm module's new field, the pure crew-Helm
// rules (ramp, cap and floor), and the field in the hash, the flatten order, the snapshot and its bounds. Owner 2026-11-19
// (replaced rule, kind a): no duel option helmBars, no COMPRESSOR share and no losing-bars rule (the cap and the floor read
// Engineering's effective Engines bars), and no cold gas tank (rcsGas, rcsAcc, the compressor and vents are gone).
import { describe, expect, it } from 'vitest';
import { hashF64 } from '../src/shared/hash';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { flattenDuel, hashDuel } from '../src/renderer/src/sim/duel/hash';
import { crewThrust, engineBars, heldAxis, noVent, rampThrottle, rampTicks, throttleCap, throttleFloor } from '../src/renderer/src/sim/duel/helmFlight';
import { DUEL_MODULES, DUEL_NOT_SNAPSHOTTED } from '../src/renderer/src/sim/duel/modules';
import { moduleLength, type SimModule } from '../src/renderer/src/sim/module';
import { loadDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import * as duelTuning from '../src/renderer/src/sim/duel/tuning';
import { GAS_MAX, GAS_REFILL, GAS_REFILL_DELAY, GAS_SPEND, THR_MAX, THR_MIN, THR_RAMP } from '../src/renderer/src/sim/duel/tuning';
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
    expect([THR_MIN, THR_MAX, THR_RAMP]).toEqual([-500, 1000, 17]);   // helm round 2 §2.1, §2.2
    for (const gone of ['THR_RETURN', 'RCS_TANK', 'RCS_GAS_PER_TICK', 'RCS_TURN_GAS', 'COMPRESSOR_RATE', 'COMPRESSOR_MAX', 'HELM_BARS', 'HELM_BARS_MAX']) expect(Object.keys(duelTuning), gone).not.toContain(gone);   // owner 2026-11-19
  });
});

describe('a fresh duel (spec §4; owner 2026-11-19)', () => {
  it('starts at throttle 0 with nothing vented, on Engineering\'s 3 Engines bars, with no split and no tank', () => {
    const d = createDuel(CUTTER, 5);
    try {
      expect([d.thrMille, engineBars(d)]).toEqual([0, 3]);
      for (const gone of ['rcsGas', 'rcsAcc']) expect(Object.keys(d), gone).not.toContain(gone);
      expect(d.helmVent).toEqual({ x: 0, y: 0 });
      expect(Object.keys(d)).not.toContain('compressor');
      expect(Object.keys(d)).not.toContain('helmBars');
    } finally { disposeDuel(d); }
  });
  it('a rematch starts the next round with a fresh helm', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(d, { thrMille: 500 });
      d.tactical.outcome = Outcome.CrewWins; d.decidedTick = d.interior.tick;
      stepDuelTick(d, { held: [NONE, NONE], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: d.interior.tick, command: { kind: 'rematch' } }] });
      expect(d.round).toBe(1);
      expect(d.thrMille).toBe(0);
    } finally { disposeDuel(d); }
  });
});

describe('the pure rules (spec §3, §4, §5)', () => {
  it('crewThrust is a five-hundredth per mille in reverse and a thousandth forward (helm round 2 §2.2)', () => {
    expect([-500, -250, 0, 250, 500, 1000].map(crewThrust)).toEqual([-1, -0.5, 0, 0.25, 0.5, 1]);
  });
  it('heldAxis reads 1 and −1, and anything else as 0', () => {
    expect([1, -1, 0, undefined, 2, 0.5, '1', true].map(heldAxis)).toEqual([1, -1, 0, 0, 0, 0, 0, 0]);
  });
  it('the cap is min(Engines bars, 4) × 250 and the floor −500 from 1 Engines bar (owner 2026-11-19; helm round 2 §2.2)', () => {
    expect([0, 1, 2, 3, 4, 5].map(throttleCap)).toEqual([0, 250, 500, 750, 1000, 1000]);
    expect([0, 1, 4, 5].map(throttleFloor)).toEqual([0, -500, -500, -500]);
  });
  it('engineBars reads Engineering\'s effective Engines bars: the powered bars less the Engines Room\'s damage', () => {
    const d = createDuel(CUTTER, 5);
    try {
      const sys = d.tactical.systems[0];
      expect([0, 1, 2, 3, 4, 5].map((b) => { sys.bars[2] = b; return engineBars(d); })).toEqual([0, 1, 2, 3, 4, 5]);
      sys.rooms[2] = 1; expect(engineBars(d)).toBe(2);   // knock(Engines) = 3 slots a level
      sys.rooms[2] = 2; expect(engineBars(d)).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('held W reaches 1000 in 59 ticks at cap 1000 and stops at 750 at cap 750; held S reaches −500 in 30 (helm round 2 §2.1)', () => {
    expect(rampTicks(0, 1, -500, 1000, 58)).toBe(986); expect(rampTicks(0, 1, -500, 1000, 59)).toBe(1000);
    expect(rampTicks(0, 1, -500, 750, 200)).toBe(750);
    expect(rampTicks(0, -1, -500, 1000, 29)).toBe(-493); expect(rampTicks(0, -1, -500, 1000, 30)).toBe(-500); expect(rampTicks(0, -1, -500, 1000, 99)).toBe(-500);
  });
  it('let go, it stays where it is, on either side (helm round 2 §2.1)', () => {
    expect([rampThrottle(1000, 0, -500, 1000), rampThrottle(-321, 0, -500, 1000), rampTicks(470, 0, -500, 1000, 600)]).toEqual([1000, -321, 470]);
  });
  it('the clamp holds the cap and the floor: 0 Engines bars hold it at 0 whatever is held', () => {
    expect(rampThrottle(1000, 0, -500, 750)).toBe(750);   // a cap that drops clamps the same tick
    expect([rampTicks(0, 1, 0, 0, 10), rampTicks(0, -1, 0, 0, 10)]).toEqual([0, 0]);
  });
  it('noVent is a fresh unvented record each call', () => {
    const a = noVent(), b = noVent();
    expect(a).toEqual({ x: 0, y: 0 }); expect(a).not.toBe(b);
  });
});

describe('the fields in the hash, the flatten and the snapshot (spec §7)', () => {
  it('thrMille, thrCut, gas and gasIdle move the hash; helmVent does not', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const base = hashDuel(d);
      for (const [key, value] of [['thrMille', 7], ['gas', 700], ['gasIdle', 3]] as const) {   // helm round 2 §8
        const was = d[key]; d[key] = value;
        expect(hashDuel(d), key).not.toBe(base);
        d[key] = was;
      }
      d.thrCut = true; expect(hashDuel(d), 'thrCut').not.toBe(base); d.thrCut = false;   // helm round 2 §8
      expect(hashDuel(d)).toBe(base);
      d.helmVent = { x: 1, y: -1 };
      expect(hashDuel(d)).toBe(base);
      expect(Object.keys(DUEL_NOT_SNAPSHOTTED)).toContain('helmVent');
      expect(Object.keys(DUEL_NOT_SNAPSHOTTED)).not.toContain('helmBars');
    } finally { disposeDuel(d); }
  });
  it('flatten carries the helm module as throttle, holdHeading, thrMille, thrCut, gas, gasIdle, then the power module (helm round 2 §8)', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(d, { thrMille: -100, thrCut: true, gas: 312, gasIdle: 7 });
      d.power.heat[0] = 9;
      const at = helmOffset(d);
      expect(Array.from(flattenDuel(d)).slice(at, at + 7)).toEqual([d.throttle, d.holdHeading, -100, 1, 312, 7, 9]);
    } finally { disposeDuel(d); }
  });
  it('round-trips through the snapshot; a restore holds no vent', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(d, { thrMille: -100, thrCut: true, gas: 312, gasIdle: 7, helmVent: { x: 1, y: 0 } });
      const r = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(saveDuelSnapshot(d, DIGEST))), DIGEST);
      try {
        expect([r.thrMille, r.thrCut, r.gas, r.gasIdle, hashDuel(r)]).toEqual([-100, true, 312, 7, hashDuel(d)]);   // helm round 2 §8
        expect(r.helmVent).toEqual({ x: 0, y: 0 });
      } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
  it('refuses values out of bounds, even rehashed', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const snap = saveDuelSnapshot(d, DIGEST), at = helmOffset(d);
      for (const [k, bad, name] of [[2, 1001, 'thrMille'], [2, -501, 'thrMille'], [2, 0.5, 'thrMille'],
        [3, 2, 'thrCut'], [3, 0.5, 'thrCut'], [3, -1, 'thrCut'], [4, 721, 'gas'], [4, -1, 'gas'], [4, 0.5, 'gas'], [5, 31, 'gasIdle'], [5, -1, 'gasIdle'], [5, 1.5, 'gasIdle']] as const) {   // helm round 2 §8
        const s = structuredClone(snap); s.values[at + k] = bad; s.header.hash = hashF64(Float64Array.from(s.values));
        expect(() => validateDuelSnapshot(CUTTER, s, DIGEST), `${name} ${bad}`).toThrow(new RegExp(`${name} ${bad} is invalid`));
      }
    } finally { disposeDuel(d); }
  });
});

describe('helm round 2: the latch and the gas charge in the helm module (spec §2.3, §3.3, §8)', () => {
  it('are the spec\'s start values', () => {
    expect([GAS_MAX, GAS_SPEND, GAS_REFILL, GAS_REFILL_DELAY]).toEqual([720, 8, 3, 30]);
  });
  it('a fresh duel holds no latch and a full charge idle for the whole delay; a rematch starts them again', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      expect([d.thrCut, d.gas, d.gasIdle]).toEqual([false, GAS_MAX, GAS_REFILL_DELAY]);
      Object.assign(d, { thrCut: true, gas: 100, gasIdle: 0 });
      d.tactical.outcome = Outcome.CrewWins; d.decidedTick = d.interior.tick;
      stepDuelTick(d, { held: [NONE, NONE], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: d.interior.tick, command: { kind: 'rematch' } }] });
      expect([d.round, d.thrCut, d.gas, d.gasIdle]).toEqual([1, false, GAS_MAX, GAS_REFILL_DELAY]);
    } finally { disposeDuel(d); }
  });
});

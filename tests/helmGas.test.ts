// Helm round 2 (spec 2026-11-19-helm-round2-design §3.3, §8): the cold gas charge. What one or two held axes spend, the
// fore/aft axis first, no refill while an axis is held, the 0.5 s wait and the 4 s refill, a full charge at a round's start,
// an unattended Helm, the stronger push, crewAxes venting by the same test, and a snapshot round-trip mid-burst.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { gasTick } from '../src/renderer/src/sim/duel/helmFlight';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { crewAxes, stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { GAS_MAX, GAS_REFILL, GAS_REFILL_DELAY, GAS_SPEND } from '../src/renderer/src/sim/duel/tuning';
import { flyShip } from '../src/renderer/src/sim/tactical/physics';
import { createTacticalState, type Ship } from '../src/renderer/src/sim/tactical/state';
import { RCS_THRUST, type FlightTuning } from '../src/renderer/src/sim/tactical/tuning';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const step = (d: DuelState, h: HeldInput = NONE) => stepDuelTick(d, { held: [h, NONE], commands: [] });
/** Step `ticks` ticks with `h` held at the Helm: each tick's [gas, vented y, vented x]. */
const run = (d: DuelState, h: HeldInput, ticks: number): [number, number, number][] => {
  const out: [number, number, number][] = [];
  for (let k = 0; k < ticks; k++) { step(d, h); out.push([d.gas, d.helmVent.y, d.helmVent.x]); }
  return out;
};

describe('the cold gas charge (spec §3.3)', () => {
  it('the pure tick: fore/aft first, then port/starboard, each while the charge covers GAS_SPEND; a held axis resets the idle count', () => {
    expect(gasTick(720, 30, 1, 1)).toEqual({ gas: 704, gasIdle: 0, x: 1, y: 1 });
    expect(gasTick(8, 30, -1, -1)).toEqual({ gas: 0, gasIdle: 0, x: 0, y: -1 });   // only fore/aft is served
    expect(gasTick(7, 30, 1, 0)).toEqual({ gas: 7, gasIdle: 0, x: 0, y: 0 });      // short of a spend: nothing vents, and no refill
    expect(gasTick(100, 29, 0, 0)).toEqual({ gas: 103, gasIdle: 30, x: 0, y: 0 });  // the 30th idle tick refills
    expect(gasTick(100, 3, 0, 0)).toEqual({ gas: 100, gasIdle: 4, x: 0, y: 0 });
    expect(gasTick(719, 30, 0, 0)).toEqual({ gas: 720, gasIdle: 30, x: 0, y: 0 });  // capped at GAS_MAX
  });
  it('one axis held vents for 90 ticks from full and then stops; the idle count stays 0', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const ticks = run(d, { ...NONE, rcsY: 1 }, 100);
      expect(ticks.slice(0, 90).every(([, y]) => y === 1)).toBe(true);
      expect(ticks[89]).toEqual([0, 1, 0]);
      expect(ticks.slice(90).every(([g, y]) => g === 0 && y === 0)).toBe(true);
      expect(d.gasIdle).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('two held vent for 45 ticks; when the charge covers one, fore/aft is served first', () => {
    const d = createSeatedDuel(CUTTER, 5), e = createSeatedDuel(CUTTER, 5);
    try {
      const ticks = run(d, { ...NONE, rcsX: 1, rcsY: -1 }, 50);
      expect(ticks.slice(0, 45).every(([, y, x]) => y === -1 && x === 1)).toBe(true);
      expect([ticks[44], ticks[45]]).toEqual([[0, -1, 1], [0, 0, 0]]);
      e.gas = GAS_SPEND;
      expect(run(e, { ...NONE, rcsX: 1, rcsY: -1 }, 1)).toEqual([[0, -1, 0]]);
    } finally { disposeDuel(d); disposeDuel(e); }
  });
  it('nothing refills while an axis is held, an empty charge included', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(d, { gas: 0, gasIdle: 0 });
      expect(run(d, { ...NONE, rcsX: -1 }, 200).every(([g]) => g === 0)).toBe(true);
      expect(d.gasIdle).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('released from empty, the first refill is on the 30th tick after, and the 240th refill tick (tick 269) fills it', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(d, { gas: 0, gasIdle: 0 });   // as after a last held tick
      const gas = run(d, NONE, 300).map(([g]) => g);
      expect([gas[28], gas[29], gas[30]]).toEqual([0, GAS_REFILL, 2 * GAS_REFILL]);   // released tick 30 is index 29
      expect(gas.indexOf(GAS_MAX)).toBe(29 + 239);   // 720 / 3 = 240 refill ticks: 0.5 s, then 4 s
      expect(gas[267]).toBe(GAS_MAX - GAS_REFILL);
    } finally { disposeDuel(d); }
  });
  it('a round starts full with gasIdle 30, and an unheld tick keeps it full', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      expect([d.gas, d.gasIdle]).toEqual([GAS_MAX, GAS_REFILL_DELAY]);
      step(d);
      expect([d.gas, d.gasIdle]).toEqual([GAS_MAX, GAS_REFILL_DELAY]);
    } finally { disposeDuel(d); }
  });
  it('an unattended Helm vents nothing and refills', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(d, { gas: 400, gasIdle: GAS_REFILL_DELAY });
      stepDuelTick(d, { held: [{ ...NONE, rcsX: 1, rcsY: 1 }, NONE], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: d.interior.tick, command: { kind: 'stand' } }] });
      expect([d.helmVent, d.gas]).toEqual([{ x: 0, y: 0 }, 400 + GAS_REFILL]);
      run(d, { ...NONE, rcsX: 1, rcsY: 1 }, 10);   // the standing player's held thrusters reach no Helm
      expect([d.helmVent, d.gas]).toEqual([{ x: 0, y: 0 }, 400 + 11 * GAS_REFILL]);
    } finally { disposeDuel(d); }
  });
  it('the push is RCS_THRUST 70 u/s²: a full charge on one thruster is 105 u/s before drag', () => {
    expect(RCS_THRUST).toBe(70);
    const s: Ship = { ...createTacticalState(1).ships[0], x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0 };
    const NO_FIELD: FlightTuning = { gravity: false, edge: false, drag: 0, stabilise: 0 };
    for (let k = 0; k < GAS_MAX / GAS_SPEND; k++) flyShip(s, { turn: 0, thrust: 0, rcsY: 1 }, NO_FIELD);
    expect(s.vy).toBeCloseTo(-105, 9);   // nose north: forward is −y
  });
  it('crewAxes vents an axis by the same test and order, from the state\'s charge', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const h: HeldInput = { ...NONE, rcsX: 1, rcsY: 1 }, vented = () => [crewAxes(d, h).rcsX, crewAxes(d, h).rcsY];
      expect(vented()).toEqual([1, 1]);
      d.gas = GAS_SPEND; expect(vented()).toEqual([0, 1]);
      d.gas = 0; expect(vented()).toEqual([0, 0]);
      d.gas = GAS_SPEND; step(d, h);
      expect(d.helmVent).toEqual({ x: 0, y: 1 });   // the step vents what crewAxes predicted
    } finally { disposeDuel(d); }
  });
  it('a snapshot taken mid-burst round-trips the charge and the idle count', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      run(d, { ...NONE, rcsY: 1 }, 20);
      expect([d.gas, d.gasIdle]).toEqual([GAS_MAX - 20 * GAS_SPEND, 0]);
      const r = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(saveDuelSnapshot(d, DIGEST))), DIGEST);
      try { expect([r.gas, r.gasIdle, hashDuel(r)]).toEqual([d.gas, d.gasIdle, hashDuel(d)]); } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
});

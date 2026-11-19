// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §4, §7, §8): the cold gas thrusters in the duel step: the
// ship-relative push at two headings, 8 gas an axis, fore/aft before side, never below 0, the compressor's exact refill
// every running tick attended or not, the thrusters working with the Engines failed, and helmVent as unhashed scratch.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { RCS_TANK } from '../src/renderer/src/sim/duel/tuning';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { DT, RCS_THRUST } from '../src/renderer/src/sim/tactical/tuning';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const step = (d: DuelState, h: HeldInput = NONE, other: HeldInput = NONE) => stepDuelTick(d, { held: [h, other], commands: [] });
/** Two identical seated duels at heading `heading`, still: the second is the no-input twin. */
function pair(heading: number): [DuelState, DuelState] {
  const out = [createSeatedDuel(CUTTER, 5), createSeatedDuel(CUTTER, 5)] as [DuelState, DuelState];
  for (const d of out) Object.assign(d.tactical.ships[0], { heading, headingAcc: 0, vx: 0, vy: 0 });
  return out;
}

describe('the push (spec §4)', () => {
  it('each key pushes the right ship-relative way at two headings', () => {
    for (const heading of [0, 64]) for (const [held, fx, fy] of [[{ rcsY: 1 }, 1, 0], [{ rcsY: -1 }, -1, 0], [{ rcsX: 1 }, 0, 1], [{ rcsX: -1 }, 0, -1]] as const) {
      const [d, twin] = pair(heading);
      try {
        step(d, { ...NONE, ...held }); step(twin);
        const f = [hx(heading), hy(heading)], r = [-hy(heading), hx(heading)];   // the nose and its right
        const ex = (fx * f[0]! + fy * r[0]!) * RCS_THRUST * DT, ey = (fx * f[1]! + fy * r[1]!) * RCS_THRUST * DT;
        expect(d.tactical.ships[0].vx - twin.tactical.ships[0].vx, `${heading} ${JSON.stringify(held)}`).toBeCloseTo(ex, 9);
        expect(d.tactical.ships[0].vy - twin.tactical.ships[0].vy, `${heading} ${JSON.stringify(held)}`).toBeCloseTo(ey, 9);
        expect(d.helmVent).toEqual({ x: held.rcsX ?? 0, y: held.rcsY ?? 0, boosted: false });
      } finally { disposeDuel(d); disposeDuel(twin); }
    }
  });
  it('Engines failed (level 2): the main engine is off and the thrusters still push', () => {
    const [d, twin] = pair(0);
    try {
      for (const x of [d, twin]) x.tactical.systems[0].rooms[Room.Engines] = 2;
      step(d, { ...NONE, rcsY: 1, throttleHeld: 1 }); step(twin, { ...NONE, throttleHeld: 1 });
      expect(d.tactical.ships[0].vy - twin.tactical.ships[0].vy).toBeCloseTo(-RCS_THRUST * DT, 9);
    } finally { disposeDuel(d); disposeDuel(twin); }
  });
});

describe('the gas (spec §4)', () => {
  it('each vented axis costs 8; with 8 gas and both held only rcsY vents; the tank never goes below 0', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.compressor = 0;
      step(d, { ...NONE, rcsY: 1 }); expect(d.rcsGas).toBe(RCS_TANK - 8);
      step(d, { ...NONE, rcsX: -1, rcsY: -1 }); expect(d.rcsGas).toBe(RCS_TANK - 24);
      d.rcsGas = 8;
      step(d, { ...NONE, rcsX: 1, rcsY: 1 });
      expect([d.rcsGas, d.helmVent]).toEqual([0, { x: 0, y: 1, boosted: false }]);
      d.rcsGas = 5;
      for (let k = 0; k < 10; k++) step(d, { ...NONE, rcsX: 1, rcsY: 1 });
      expect([d.rcsGas, d.helmVent]).toEqual([5, { x: 0, y: 0, boosted: false }]);
    } finally { disposeDuel(d); }
  });
  it('only the Helm attendant vents: Weapons holding a thruster spends nothing', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try { d.compressor = 0; step(d, NONE, { ...NONE, rcsX: 1, rcsY: 1 }); expect([d.rcsGas, d.helmVent.x, d.helmVent.y]).toEqual([RCS_TANK, 0, 0]); } finally { disposeDuel(d); }
  });
  it('the compressor refills an empty tank in exactly 1200, 600 and 400 ticks at 1 to 3 bars, attended or not; rcsAcc resets full', () => {
    for (const [bars, ticks] of [[1, 1200], [2, 600], [3, 400]] as const) {
      const d = createSeatedDuel(CUTTER, 5);
      try {
        Object.assign(d, { compressor: bars, rcsGas: 0, rcsAcc: 0 });
        for (let k = 0; k < ticks - 1; k++) step(d);
        expect(d.rcsGas, `${bars} bars at ${ticks - 1}`).toBeLessThan(RCS_TANK);
        step(d);
        expect([d.rcsGas, d.rcsAcc], `${bars} bars`).toEqual([RCS_TANK, 0]);
      } finally { disposeDuel(d); }
    }
    const u = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(u, { compressor: 2, rcsGas: 0, rcsAcc: 0 });
      stepDuelTick(u, { held: [NONE, NONE], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: u.interior.tick, command: { kind: 'stand' } }] });
      for (let k = 1; k < 600; k++) step(u);
      expect(u.rcsGas).toBe(RCS_TANK);   // the compressor runs with the Helm empty
    } finally { disposeDuel(u); }
    const z = createSeatedDuel(CUTTER, 5);
    try { Object.assign(z, { compressor: 0, rcsGas: 0 }); for (let k = 0; k < 600; k++) step(z); expect(z.rcsGas).toBe(0); } finally { disposeDuel(z); }
  });
  it('helmVent is recomputed every tick and never moves the hash', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      step(d, { ...NONE, rcsX: 1 }); expect(d.helmVent.x).toBe(1);
      step(d); expect(d.helmVent).toEqual({ x: 0, y: 0, boosted: false });
      const base = hashDuel(d); d.helmVent = { x: -1, y: 1, boosted: true }; expect(hashDuel(d)).toBe(base);
    } finally { disposeDuel(d); }
  });
});

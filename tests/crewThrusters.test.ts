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
        expect(d.helmVent).toEqual({ x: held.rcsX ?? 0, y: held.rcsY ?? 0, boosted: false, turn: 0 });
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
      step(d, { ...NONE, rcsY: 1 }); expect(d.rcsGas).toBe(RCS_TANK - 8);
      d.rcsAcc = 0;   // owner 2026-11-19: one compressor rate, no share to switch off; 50 sixtieths add nothing in one tick
      step(d, { ...NONE, rcsX: -1, rcsY: -1 }); expect(d.rcsGas).toBe(RCS_TANK - 24);
      d.rcsGas = 8; d.rcsAcc = 0;
      step(d, { ...NONE, rcsX: 1, rcsY: 1 });
      expect([d.rcsGas, d.helmVent]).toEqual([0, { x: 0, y: 1, boosted: false, turn: 0 }]);
      d.rcsGas = 5; d.rcsAcc = 0;
      step(d, { ...NONE, rcsX: 1, rcsY: 1 });
      expect([d.rcsGas, d.helmVent]).toEqual([5, { x: 0, y: 0, boosted: false, turn: 0 }]);
    } finally { disposeDuel(d); }
  });
  it('only the Helm attendant vents: Weapons holding a thruster spends nothing', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try { step(d, NONE, { ...NONE, rcsX: 1, rcsY: 1 }); expect([d.rcsGas, d.helmVent.x, d.helmVent.y]).toEqual([RCS_TANK, 0, 0]); } finally { disposeDuel(d); }
  });
  it('the compressor refills an empty tank in exactly 1200 ticks, attended or not; rcsAcc resets full (owner 2026-11-19: one rate)', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(d, { rcsGas: 0, rcsAcc: 0 });
      for (let k = 0; k < 1199; k++) step(d);
      expect(d.rcsGas).toBeLessThan(RCS_TANK);
      step(d);
      expect([d.rcsGas, d.rcsAcc]).toEqual([RCS_TANK, 0]);
    } finally { disposeDuel(d); }
    const u = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(u, { rcsGas: 0, rcsAcc: 0 });
      stepDuelTick(u, { held: [NONE, NONE], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: u.interior.tick, command: { kind: 'stand' } }] });
      for (let k = 1; k < 1200; k++) step(u);
      expect(u.rcsGas).toBe(RCS_TANK);   // the compressor runs with the Helm empty
    } finally { disposeDuel(u); }
  });
  it('helmVent is recomputed every tick and never moves the hash', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      step(d, { ...NONE, rcsX: 1 }); expect(d.helmVent.x).toBe(1);
      step(d); expect(d.helmVent).toEqual({ x: 0, y: 0, boosted: false, turn: 0 });
      const base = hashDuel(d); d.helmVent = { x: -1, y: 1, boosted: true, turn: 1 }; expect(hashDuel(d)).toBe(base);
    } finally { disposeDuel(d); }
  });
});

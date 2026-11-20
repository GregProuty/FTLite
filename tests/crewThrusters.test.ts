// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §4, §7, §8): the cold gas thrusters in the duel step: the
// ship-relative push at two headings, the thrusters working with the Engines failed, and helmVent as unhashed scratch.
// Helm round 2 §3.3 (replaced rule, kind a): the gas is a charge; its spend and refill are in tests/helmGas.test.ts.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { CREW_DRAG, DT, RCS_THRUST } from '../src/renderer/src/sim/tactical/tuning';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const step = (d: DuelState, h: HeldInput = NONE, other: HeldInput = NONE) => stepDuelTick(d, { held: [h, other], commands: [] });
const KEEP = 1 - CREW_DRAG * DT;   // helm round 2 §3.1: the push is flown before drag
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
        const ex = (fx * f[0]! + fy * r[0]!) * RCS_THRUST * DT * KEEP, ey = (fx * f[1]! + fy * r[1]!) * RCS_THRUST * DT * KEEP;
        expect(d.tactical.ships[0].vx - twin.tactical.ships[0].vx, `${heading} ${JSON.stringify(held)}`).toBeCloseTo(ex, 9);
        expect(d.tactical.ships[0].vy - twin.tactical.ships[0].vy, `${heading} ${JSON.stringify(held)}`).toBeCloseTo(ey, 9);
        expect(d.helmVent).toEqual({ x: held.rcsX ?? 0, y: held.rcsY ?? 0 });
      } finally { disposeDuel(d); disposeDuel(twin); }
    }
  });
  it('Engines failed (level 2): the main engine is off and the thrusters still push', () => {
    const [d, twin] = pair(0);
    try {
      for (const x of [d, twin]) x.tactical.systems[0].rooms[Room.Engines] = 2;
      step(d, { ...NONE, rcsY: 1, throttleHeld: 1 }); step(twin, { ...NONE, throttleHeld: 1 });
      expect(d.tactical.ships[0].vy - twin.tactical.ships[0].vy).toBeCloseTo(-RCS_THRUST * DT * KEEP, 9);
    } finally { disposeDuel(d); disposeDuel(twin); }
  });
});

describe('the cold gas thrusters (helm round 2 §3.3: a charge, tests/helmGas.test.ts)', () => {
  it('pushes at 0 Engines bars too: the thrusters are not the Engines', () => {
    const [d, twin] = pair(0);
    try {
      for (const x of [d, twin]) x.tactical.systems[0].bars[2] = 0;
      step(d, { ...NONE, rcsY: 1 }); step(twin);
      expect(d.tactical.ships[0].vy - twin.tactical.ships[0].vy).toBeCloseTo(-RCS_THRUST * DT * KEEP, 9);
      expect(d.helmVent.y).toBe(1);
    } finally { disposeDuel(d); disposeDuel(twin); }
  });
  it('only the Helm attendant vents: Weapons holding a thruster vents nothing', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try { step(d, NONE, { ...NONE, rcsX: 1, rcsY: 1 }); expect([d.helmVent.x, d.helmVent.y]).toEqual([0, 0]); } finally { disposeDuel(d); }
  });
  it('an unattended Helm vents nothing', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      stepDuelTick(d, { held: [NONE, NONE], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: d.interior.tick, command: { kind: 'stand' } }] });
      step(d, { ...NONE, rcsX: 1, rcsY: 1 });
      expect([d.helmVent.x, d.helmVent.y]).toEqual([0, 0]);
    } finally { disposeDuel(d); }
  });
  it('helmVent is recomputed every tick and never moves the hash', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      step(d, { ...NONE, rcsX: 1 }); expect(d.helmVent.x).toBe(1);
      step(d); expect(d.helmVent).toEqual({ x: 0, y: 0 });
      const base = hashDuel(d); d.helmVent = { x: -1, y: 1 }; expect(hashDuel(d)).toBe(base);
    } finally { disposeDuel(d); }
  });
});

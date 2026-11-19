// W-1 pew pew (spec 2026-11-18-pew-pew-weapons-design §1, §5): the Hunter's pew. Attack: only with the crew inside its
// cone and 450, aimed with lead and a seeded error, in bursts of up to 3 rounds 12 ticks apart, then a wait for a full
// charge. Defence: a crew torpedo within 300 inside its cone is tried for once a tick at 0.5 a second; defence first.
import { describe, expect, it } from 'vitest';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { hunterThink } from '../src/renderer/src/sim/tactical/hunter';
import { pewLead } from '../src/renderer/src/sim/tactical/pew';
import { createTacticalState, missileOf, placeMissile, type DuelEvent, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { DT } from '../src/renderer/src/sim/tuning';
import { AIM_STEPS, HUNTER_PD_CHANCE, HUNTER_PD_ODDS, HUNTER_PEW_ERROR, HUNTER_PEW_ERROR_STEPS, HUNTER_PEW_GAP } from '../src/renderer/src/sim/tactical/tuning';
import { UNCREWED_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { makeHostile } from './helpers/hostile';

/** The Hunter still at its spawn with its nose north, hostile; the crew ship `dist` from it at heading index `bearing`,
 *  still (both in the spawn's clear 300). The crew sits at no console. */
function facing(seed: number, dist: number, bearing = 0): TacticalState {
  const st = makeHostile(createTacticalState(seed)), h = st.ships[1];
  Object.assign(h, { vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(st.ships[0], { x: h.x + hx(bearing) * dist, y: h.y + hy(bearing) * dist, vx: 0, vy: 0 });
  return st;
}
const hunterShots = (events: readonly DuelEvent[]) => events.filter((e) => e.kind === 'pewFire' && e.ship === 1).length;
/** The fine difference a − b in −AIM_STEPS/2..AIM_STEPS/2. */
const fineDiff = (a: number, b: number) => ((a - b + AIM_STEPS + AIM_STEPS / 2) % AIM_STEPS) - AIM_STEPS / 2;
/** The first seed (1..60) whose crew torpedo the Hunter shoots down, pinned from the defence test's console line (Step 5);
 *  Task 6 re-pins it by the same rule if it moves HUNTER_PEW_ERROR, HUNTER_PEW_GAP or HUNTER_PD_CHANCE. */
const PD_SEED = 4;

describe('the Hunter attacks (spec §1)', () => {
  it('aims at the crew\'s lead point with an error within ±HUNTER_PEW_ERROR', () => {
    // Derived from the knobs, so Task 6's tuning moves them without breaking this test (728 and 120 at the start values).
    expect(HUNTER_PEW_ERROR_STEPS).toBe(Math.floor((HUNTER_PEW_ERROR / 360) * AIM_STEPS));
    expect(HUNTER_PD_ODDS).toBe(Math.round(1 / (HUNTER_PD_CHANCE * DT)));
    for (let seed = 1; seed <= 20; seed++) {
      const st = facing(seed, 250), lead = pewLead(st, 1, st.ships[0].x, st.ships[0].y, 0, 0);
      expect(lead).toBe(0);   // the crew dead ahead and still: straight north
      const aim = hunterThink(st, 1).pewAim;
      expect(Math.abs(fineDiff(aim, lead)), `seed ${seed}`).toBeLessThanOrEqual(HUNTER_PEW_ERROR_STEPS);
    }
  });
  it('leads a crossing target: the aim is ahead of the target\'s motion', () => {
    const st = facing(3, 250);
    st.ships[0].vx = 200;   // moving east across the Hunter's nose
    expect(fineDiff(pewLead(st, 1, st.ships[0].x, st.ships[0].y, 200, 0), 0)).toBeGreaterThan(0);   // clockwise of north
  });
  it('fires in bursts of 3, 12 ticks apart, then waits for a full charge', () => {
    const st = facing(5, 250), at: number[] = [];
    for (let k = 0; k < 260; k++) { stepDuel(st, UNCREWED_INPUT); if (hunterShots(st.events) > 0) at.push(k); }
    expect(at.slice(0, 3)).toEqual([at[0], at[0]! + HUNTER_PEW_GAP, at[0]! + 2 * HUNTER_PEW_GAP]);
    expect(at[3]! - at[2]!).toBeGreaterThanOrEqual(150);   // a full refill from about 24 ticks of charge
  });
  it('fires only with the crew inside its cone and within 450', () => {
    // 20 ticks: the Hunter turns toward the crew at 150°/s, so a crew 135° off is still outside the cone (about 84° off).
    for (const [dist, bearing] of [[250, 128], [250, 96], [600, 0]] as const) {   // astern, 135° off, out of range
      const st = facing(5, dist, bearing);
      let shots = 0;
      for (let k = 0; k < 20; k++) { stepDuel(st, UNCREWED_INPUT); shots += hunterShots(st.events); }
      expect(shots, `dist ${dist} bearing ${bearing}`).toBe(0);
    }
  });
});

describe('the Hunter defends (spec §1, §5)', () => {
  /** A crew torpedo 250 ahead of the Hunter coming straight at it at 300 u/s, the crew ship 500 ahead beyond it (out of
   *  the attack range, so the Hunter's nose stays on the torpedo); returns how the torpedo's flight ended. */
  function torpedoRun(seed: number): string {
    const st = makeHostile(createTacticalState(seed)), h = st.ships[1];
    Object.assign(h, { vx: 0, vy: 0, heading: 0, headingAcc: 0 });
    Object.assign(st.ships[0], { x: h.x, y: h.y - 500, vx: 0, vy: 0 });
    placeMissile(st, 0, { x: h.x, y: h.y - 250, vx: 0, vy: 300, heading: 128, headingAcc: 0, age: 30 });
    for (let k = 0; k < 120 && missileOf(st, 0); k++) {
      stepDuel(st, UNCREWED_INPUT);
      const end = st.events.find((e) => e.kind === 'missileEnd' && e.ship === 0);
      if (end && end.kind === 'missileEnd') return end.cause;
    }
    return 'flying';
  }
  it('sometimes shoots a crew torpedo down: a known seed, and a rate over 60 seeds within a band', () => {
    const runs = Array.from({ length: 60 }, (_, k) => torpedoRun(k + 1));
    console.log(`defence: ${runs.map((c, k) => `${k + 1}:${c}`).join(' ')}`);
    expect(runs[PD_SEED - 1]).toBe('shot');
    const rate = runs.filter((c) => c === 'shot').length / runs.length;
    expect(rate).toBeGreaterThanOrEqual(0.02);
    expect(rate).toBeLessThanOrEqual(0.6);
  }, 60_000);
});

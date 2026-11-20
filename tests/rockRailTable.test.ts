// Asteroids-iii §14 (the cost fix): the per-step rail table. At beginRockStep every rail slot's position and velocity at the
// phase tick is worked out once; the accessors read it while the step runs and the slot is unchanged, and the memo
// otherwise. Same railPos maths, so the reads are bit-identical to the memo's.
import { describe, expect, it } from 'vitest';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { railPos, type RailOut } from '../src/renderer/src/sim/tactical/rails';
import { beginRockStep, endRockStep, isRail, railSources, rockAt, RockKind, rockSlots, ROCK_STRIDE, rockX, rockY, writeRock } from '../src/renderer/src/sim/tactical/rocks';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { stressInput, switchOff } from './helpers/rockStress';

describe('the per-step rail table (spec §14, the cost fix)', () => {
  it('reads bit-identically to the memo for every rail slot at every tick of a 2,000-tick stress run', () => {
    const st = createTacticalState(3); switchOff(st, 1);
    let rows = 0;
    const wrong: string[] = [];
    for (let t = 0; t < 2000; t++) {
      beginRockStep(st);
      for (let k = 0; k < rockSlots(st); k++) {
        if (!isRail(st.rocks[k * ROCK_STRIDE]!)) continue;
        const { table, memo } = railSources(st, k);
        if (table === null) { wrong.push(`tick ${st.tick} rock ${k}: no table row`); continue; }
        rows++;
        if (!table.every((x, i) => Object.is(x, memo[i]))) wrong.push(`tick ${st.tick} rock ${k}: table ${table} memo ${memo}`);
      }
      endRockStep(st);
      expect(railSources(st, 0).table).toBeNull();   // between ticks: the memo only
      stepDuel(st, stressInput(st));
      if (wrong.length > 0) break;
    }
    expect(wrong).toEqual([]);
    expect(rows).toBeGreaterThan(2000 * 50);
  }, 120000);
  it('a slot written mid-step is read through the memo at its new values; a shallow copy never reads the table', () => {
    const st = createTacticalState(4); switchOff(st, 1);
    beginRockStep(st);
    expect(railSources(st, 0).table).not.toBeNull();
    writeRock(st, 0, RockKind.Tumble, 0, 1900, 50, 0, 20, 2, st.tick);
    expect(railSources(st, 0).table).toBeNull();
    const out: RailOut = { x: 0, y: 0, vx: 0, vy: 0 };
    railPos(0, 1900, 50, 0, st.tick, st.tick + 1, true, out);
    expect([rockX(st, 0), rockY(st, 0), rockAt(st, 0).vx, rockAt(st, 0).vy]).toEqual([out.x, out.y, out.vx, out.vy]);
    const copy = { ...st };
    expect(railSources(copy, 1).table).toBeNull();
    endRockStep(st);
  });
});

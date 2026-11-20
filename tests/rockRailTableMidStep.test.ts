// Asteroids-iii §14 (the cost fix, Task 13 review): the per-step rail table checked inside the step. freeRock and
// settleRocks are wrapped (vi.mock) so that after each call, mid-pass, every rail slot the table still answers for is
// compared bit for bit with the memo (which checks every input). A writer that rewrote a rail slot without
// railRowChanged would leave a stale row here, and the comparison would catch it.
import { describe, expect, it, vi } from 'vitest';
import type { TacticalState } from '../src/renderer/src/sim/tactical/state';

const seen = { free: 0, settle: 0, rows: 0, wrong: [] as string[] };
function checkTable(s: TacticalState, where: string, rocks: typeof import('../src/renderer/src/sim/tactical/rocks')): void {
  for (let k = 0; k < rocks.rockSlots(s); k++) {
    if (!rocks.isRail(s.rocks[k * rocks.ROCK_STRIDE]!)) continue;
    const { table, memo } = rocks.railSources(s, k);
    if (table === null) continue;
    seen.rows++;
    if (!table.every((x, i) => Object.is(x, memo[i]))) seen.wrong.push(`${where} tick ${s.tick} rock ${k}: table ${table} memo ${memo}`);
  }
}
vi.mock('../src/renderer/src/sim/tactical/rocks', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/renderer/src/sim/tactical/rocks')>();
  return { ...real, freeRock: (s: TacticalState, k: number) => { real.freeRock(s, k); if (real.inRockStep(s)) { seen.free++; checkTable(s, 'after freeRock', real); } } };
});
vi.mock('../src/renderer/src/sim/tactical/rockSettle', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/renderer/src/sim/tactical/rockSettle')>();
  const rocks = await import('../src/renderer/src/sim/tactical/rocks');
  return { ...real, settleRocks: (s: TacticalState) => { real.settleRocks(s); seen.settle++; checkTable(s, 'after settleRocks', rocks); } };
});

describe('the per-step rail table inside the step (spec §14, Task 13 review)', () => {
  it('after every mid-pass freeRock and every settleRocks of a stress run, each row the table answers for equals the memo', async () => {
    const { stepDuel } = await import('../src/renderer/src/sim/tactical/duel');
    const { createTacticalState } = await import('../src/renderer/src/sim/tactical/state');
    const { stressInput, switchOff } = await import('./helpers/rockStress');
    for (const seed of [1, 2]) {
      const st = createTacticalState(seed); switchOff(st, 1);
      for (let t = 0; t < 3000; t++) stepDuel(st, stressInput(st));
    }
    expect(seen.wrong).toEqual([]);
    expect(seen.free).toBeGreaterThan(0);
    expect(seen.settle).toBe(6000);
    expect(seen.rows).toBeGreaterThan(6000 * 50);
  }, 120000);
});

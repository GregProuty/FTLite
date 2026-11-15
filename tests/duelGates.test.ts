// The H-0 telemetry gates (parent spec §16, H-0c-ii-a spec §5): the scripted pair against the hunter over seeds 1 to
// 10, capped at 15 minutes. Always runs; one test per seed, then the gates over all ten. Tuning tool:
// `npx tsx scripts/duel-telemetry.ts`.
import { describe, expect, it } from 'vitest';
import { endedFromPlanet } from '../src/renderer/src/sim/duel/telemetry';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { TICK_HZ } from '../src/renderer/src/sim/tuning';
import { CAP_TICKS, gateSummary, GATE_SEEDS, median, PLANET_END_MIN_TICKS, runDuel, telemetryLine, type DuelRun } from './helpers/scriptedDuel';

const runs = new Map<number, DuelRun>();

describe('the H-0 telemetry gates: scripted pair against the hunter, seeds 1 to 10', () => {
  for (const seed of GATE_SEEDS) it(`seed ${seed}: ends before the cap, the crew uses both weapons, no planet-contact end under 30 s`, () => {
    const r = runDuel(seed, 'scripted'), t = r.telemetry;
    runs.set(seed, r);
    expect(t.outcome, telemetryLine(r)).not.toBe(Outcome.Running);
    expect(t.ticks).toBeLessThan(CAP_TICKS);
    expect(t.ships[0].laserReleases, telemetryLine(r)).toBeGreaterThanOrEqual(1);
    expect(t.ships[0].missilesLaunched, telemetryLine(r)).toBeGreaterThanOrEqual(1);
    expect(endedFromPlanet(t) && t.ticks < PLANET_END_MIN_TICKS, telemetryLine(r)).toBe(false);
  }, 60_000);
  it('the median duel lasts 3 to 5 minutes, and the crew both wins and loses', () => {
    const all = GATE_SEEDS.map((seed) => runs.get(seed) ?? runDuel(seed, 'scripted')), summary = gateSummary(all);
    console.log(`${all.map(telemetryLine).join('\n')}\n${summary}`);
    const length = median(all.map((r) => r.telemetry.ticks)) / TICK_HZ;
    expect(length, summary).toBeGreaterThanOrEqual(180);
    expect(length, summary).toBeLessThanOrEqual(300);
    expect(all.some((r) => r.telemetry.outcome === Outcome.CrewWins), summary).toBe(true);
    expect(all.some((r) => r.telemetry.outcome === Outcome.EnemyWins), summary).toBe(true);
  }, 120_000);
  it('reports how long a passive crew survives (recorded, not gated; above 60 s is the hope)', () => {
    const lines = GATE_SEEDS.map((seed) => {
      const t = runDuel(seed, 'passive').telemetry;
      return `seed ${seed}: passive crew ${(t.ticks / TICK_HZ).toFixed(1)} s, ${t.outcome === Outcome.EnemyWins ? 'lost' : t.outcome === Outcome.Running ? 'alive at the cap' : 'other'}`;
    });
    console.log(lines.join('\n'));
    expect(lines).toHaveLength(GATE_SEEDS.length);
  }, 120_000);
});

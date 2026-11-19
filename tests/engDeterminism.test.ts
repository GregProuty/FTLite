// Engineering spike spec §8 determinism: with bars, heat (an overheat), doors, airlocks, oxygen, fire spread and breaches
// all running, two duels from one seed and one command script hash alike every 60 ticks over a seed sweep, every
// scripted command is applied, and a mid-run snapshot reload continues with the same hashes. Both players stay present
// and standing (no one at Weapons, so the crew never fires and the enemy holds until rt 1800: no hits change the bars).
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { DuelSystem } from '../src/renderer/src/sim/duel/power';
import { HEAT_MAX } from '../src/renderer/src/sim/tuning';
import { Life, LifeState } from '../src/renderer/src/sim/components';

const HOUND = parseShip(hound);
const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
/** The engineering script (spec §10.1 start: 1 spare bar): Engines to its overdrive bar with no coolant (heat +2 per
 *  hazard tick, so it overheats near tick 640), coolant on Shields, the R–H door held (edge 1, off the crew's air path:
 *  O and Q only leak to the Hold through closed doors), airlock 0 (the Hold) opened and closed, then the freed bars into Sensors and Oxygen. */
const SCRIPT: readonly [number, number, DuelCommand][] = [
  [30, 0, { kind: 'shipPower', system: DuelSystem.Engines, delta: 1 }], [31, 1, { kind: 'shipPower', system: DuelSystem.Sensors, delta: -1 }],
  [40, 0, { kind: 'shipPower', system: DuelSystem.Engines, delta: 1 }], [60, 1, { kind: 'shipCoolant', system: DuelSystem.Shields }],
  [400, 0, { kind: 'shipDoor', edge: 1 }], [420, 1, { kind: 'shipAirlock', index: 0 }], [900, 1, { kind: 'shipAirlock', index: 0 }],
  [1200, 0, { kind: 'shipPower', system: DuelSystem.Sensors, delta: 1 }], [1201, 0, { kind: 'shipPower', system: DuelSystem.Oxygen, delta: 1 }]
];
let seq = 0;
function tickOf(d: DuelState): DuelEnvelope[] {
  const t = d.interior.tick - d.baseTick;
  return SCRIPT.filter(([at]) => at === t).map(([, player, command]) => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command }));
}
/** Play `ticks` ticks; push a hash every 60; return the statuses of the script's results and the highest Engines heat. */
function play(d: DuelState, ticks: number, hashes: string[]): { statuses: string[]; maxHeat: number; failed: boolean } {
  const statuses: string[] = [];
  let maxHeat = 0, failed = false;
  for (let k = 0; k < ticks; k++) {
    for (const r of stepDuelTick(d, { held: [NONE, NONE], commands: tickOf(d) })) statuses.push(r.status);
    maxHeat = Math.max(maxHeat, d.power.heat[DuelSystem.Engines]!); failed ||= d.power.failed[DuelSystem.Engines] === 1;
    if (d.interior.tick % 60 === 0) hashes.push(hashDuel(d));
  }
  return { statuses, maxHeat, failed };
}

describe('engineering spike: determinism (spec §8)', () => {
  it('two runs of one seed and script agree every 60 ticks over seeds 1 to 5; every command applies; Engines overheats', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const a = createDuel(HOUND, seed), b = createDuel(HOUND, seed), ha: string[] = [], hb: string[] = [];
      try {
        const ra = play(a, 1800, ha); play(b, 1800, hb);
        expect(ha, `seed ${seed}`).toEqual(hb);
        expect(ra.statuses, `seed ${seed}`).toEqual(SCRIPT.map(() => 'applied'));
        expect(ra.maxHeat, `seed ${seed}`).toBe(HEAT_MAX); expect(ra.failed, `seed ${seed}`).toBe(true);
        for (let p = 0; p < 2; p++) expect(Life.state[a.interior.crew[p]!], `seed ${seed} player ${p}`).toBe(LifeState.Conscious);
      } finally { disposeDuel(a); disposeDuel(b); }
    }
  }, 120_000);
  it('a snapshot at tick 950 reloads and continues with the same hashes', () => {
    const a = createDuel(HOUND, 2), ha: string[] = [], hb: string[] = [];
    try {
      play(a, 950, []);
      const b = loadDuelSnapshot(HOUND, saveDuelSnapshot(a, DIGEST), DIGEST);
      try { play(a, 900, ha); play(b, 900, hb); expect(hb).toEqual(ha); } finally { disposeDuel(b); }
    } finally { disposeDuel(a); }
  }, 60_000);
});

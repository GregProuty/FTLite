// The merge of the Helm-flight spike with the Engineering spike (owner 2026-11-19): the Valkyrn (not newtonianHelm) keeps
// master's flight and bots bit for bit. The pinned digests were computed on master 2ced83cf (SIM 58) with the same digest
// over the first 3000 ticks of five duels: the scripted pilot (crew of one) at seeds 1 to 3 and the scripted pair on the
// Hound as a Valkyrn at seeds 1 and 2. Each tick hashes the tactical state (both ships' flight, the Hunter included), the
// throttle level, the held heading, the power module and the command results; it leaves out SIM_VERSION and the helm
// module's crew-Helm field (thrMille), which only the Cutter's Newtonian Helm uses. A pinned whole-run number (kind b):
// a deliberate Valkyrn change re-records it, with a "was" note.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { createScriptedPilot, scriptedPilotInput } from '../src/renderer/src/sim/duel/scriptedPilot';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { flattenTactical } from '../src/renderer/src/sim/tactical/hash';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { VALKYRN } from './helpers/valkyrnGate';

const HOUND = parseShip(hound), TICKS = 3000;
function run(kind: 'pilot' | 'pair', seed: number): string {
  const d = kind === 'pilot' ? createDuel(VALKYRN, seed, 0, 1) : createDuel(HOUND, seed, 0, 2, ShipClass.Valkyrn);
  const pilot = createScriptedPilot(), pair = createScriptedPair(seed), h = createHash('sha256');
  try {
    for (let k = 0; k < TICKS && d.tactical.outcome === Outcome.Running; k++) {
      const input = kind === 'pilot' ? scriptedPilotInput(pilot, d) : scriptedInput(pair, d);
      const r = stepDuelTick(d, input);
      h.update(Buffer.from(Float64Array.from([...flattenTactical(d.tactical), d.throttle, d.holdHeading, ...d.power.heat, ...d.power.coolant, ...d.power.failed.map(Number)]).buffer));
      h.update(JSON.stringify(r));
    }
    return `${kind}-${seed}:${d.interior.tick}:${h.digest('hex').slice(0, 16)}`;
  } finally { disposeDuel(d); }
}

describe('the Valkyrn after the merge (owner 2026-11-19)', () => {
  it('flies and fights exactly as on master: five duels, 3000 ticks each, every tick identical', { timeout: 120_000 }, () => {
    expect([run('pilot', 1), run('pilot', 2), run('pilot', 3), run('pair', 1), run('pair', 2)]).toEqual([
      'pilot-1:3000:663e629155fe584b', 'pilot-2:3000:113670d9223b854b', 'pilot-3:3000:18e78e4191de122e',
      'pair-1:3000:f13a7b16f6e43c4d', 'pair-2:3000:1f4e367769a2700d'
    ]);
  });
});

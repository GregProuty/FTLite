// The merge of the Helm-flight spike with the Engineering spike (owner 2026-11-19): the Valkyrn (not newtonianHelm) keeps
// master's flight and bots bit for bit. The pinned digests were first computed on master 2ced83cf (SIM 58), and re-recorded
// for asteroids-iii's orbiting belt (SIM 60, unchanged per tick at 61: the rocks it flies among changed), with the same digest
// over the first 3000 ticks of five duels: the scripted pilot (crew of one) at seeds 1 to 3 and the scripted pair on the
// Hound as a Valkyrn at seeds 1 and 2. Each tick hashes the tactical state (both ships' flight, the Hunter included), the
// throttle level, the held heading, the power module and the command results; it leaves out SIM_VERSION and the helm
// module's crew-Helm field (thrMille), which only the Cutter's Newtonian Helm uses. A pinned whole-run number (kind b):
// a deliberate Valkyrn change re-records it, with a "was" note.
// W-4 spec §13.4 (W-4b): the hashed array leaves out pewTurret, gunTurret, pewManual and gunManual by name and the two round pools' room fields (rounds.<k>.room, pew.<k>.room; W-4 amendment §3.3) (they are always 0 / false
// on the Valkyrn, and a nonzero one appends `:TURRET`, failing the pin); the digests are unchanged.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { createScriptedPilot, scriptedPilotInput } from '../src/renderer/src/sim/duel/scriptedPilot';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { TACTICAL_MODULES } from '../src/renderer/src/sim/tactical/hash';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import type { TacticalState } from '../src/renderer/src/sim/tactical/state';
import { VALKYRN } from './helpers/valkyrnGate';

const HOUND = parseShip(hound), TICKS = 3000;
/** W-4 spec §13.4: the four W-4b fields and each round's room (always 0 / false on the Valkyrn, asserted per tick below) are left out by name, so
 *  the hashed array is flattenTactical before W-4b's fields, element for element: every tactical module's fields in order, −0 as 0. */
const W4B_FIELDS = /^(systems\.\d+\.(pewTurret|gunTurret|pewManual|gunManual)|(rounds|pew)\.\d+\.room)$/;
function flattenWithoutTurrets(t: TacticalState): number[] {
  const out: number[] = [];
  for (const m of TACTICAL_MODULES) for (const f of m.fields(t)) if (!W4B_FIELDS.test(f.name)) f.read(t, out);
  return out.map((v) => (v === 0 ? 0 : v));
}
function run(kind: 'pilot' | 'pair', seed: number): string {
  const d = kind === 'pilot' ? createDuel(VALKYRN, seed, 0, 1) : createDuel(HOUND, seed, 0, 2, ShipClass.Valkyrn);
  const pilot = createScriptedPilot(), pair = createScriptedPair(seed), h = createHash('sha256');
  let zero = true;
  try {
    for (let k = 0; k < TICKS && d.tactical.outcome === Outcome.Running; k++) {
      const input = kind === 'pilot' ? scriptedPilotInput(pilot, d) : scriptedInput(pair, d);
      const r = stepDuelTick(d, input);
      h.update(Buffer.from(Float64Array.from([...flattenWithoutTurrets(d.tactical), d.throttle, d.holdHeading, ...d.power.heat, ...d.power.coolant, ...d.power.failed.map(Number)]).buffer));
      h.update(JSON.stringify(r));
      for (const s of d.tactical.systems) zero &&= s.pewTurret === 0 && s.gunTurret === 0 && !s.pewManual && !s.gunManual;
      for (const r of d.tactical.rounds) zero &&= r.room === 0; for (const r of d.tactical.pew) zero &&= r.room === 0;
    }
    return `${kind}-${seed}:${d.interior.tick}:${h.digest('hex').slice(0, 16)}${zero ? '' : ':TURRET'}`;
  } finally { disposeDuel(d); }
}

describe('the Valkyrn after the merge (owner 2026-11-19)', () => {
  it('flies and fights as pinned (master 2ced83cf\'s flight and bots, among asteroids-iii\'s orbiting belt): five duels, 3000 ticks each, every tick identical', { timeout: 120_000 }, () => {
    expect([run('pilot', 1), run('pilot', 2), run('pilot', 3), run('pair', 1), run('pair', 2)]).toEqual([
      'pilot-1:3000:1fa7d204fd2384ab', 'pilot-2:3000:562d9353cf1b24cb', 'pilot-3:3000:fe1c1c5f45f53820',
      'pair-1:3000:fbdac76dabfa5d5f', 'pair-2:3000:79db86d8fa6233ff'
    ]);   // the slingshot (SIM 66), ships feel twice the planet's pull: was 'pilot-1:3000:39bfd9e47ecb8fbf', 'pilot-2:3000:be8d0e2c30aa73ed',
    // 'pilot-3:3000:76cc78e68d50b24d', 'pair-1:3000:6c4a9f01eeb4792a', 'pair-2:3000:6ad96a3d6b7dd6e4'
    // UI round (SIM 64), Hunter 95 / Valkyrn thrust 200: was 'pilot-1:3000:ebade52a9952e496', 'pilot-2:3000:56df6c0cc22dedf6',
    // 'pilot-3:3000:5d30f3e5493bc4b6', 'pair-1:3000:1e4c62e39497d371', 'pair-2:3000:1176eae486500499'
    // asteroids-iii orbiting belt (SIM_VERSION 60, a deliberate change of the rocks the Valkyrn flies among; kind b): was
    // 'pilot-1:3000:663e629155fe584b', 'pilot-2:3000:113670d9223b854b', 'pilot-3:3000:18e78e4191de122e', 'pair-1:3000:f13a7b16f6e43c4d',
    // 'pair-2:3000:1f4e367769a2700d' (master 2ced83cf, SIM 58)
  });
});

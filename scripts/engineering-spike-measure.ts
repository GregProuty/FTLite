// Engineering spike spec §1 deliverables: the duel snapshot's size and the sim's tick cost, before and after the spike.
// `npx tsx scripts/engineering-spike-measure.ts` prints one JSON line: the flattened duel length (values) on a fresh
// Hound duel, and the mean milliseconds per tick of a 3600-tick scripted Cutter duel (seed 1), best of three runs.
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { flattenDuel } from '../src/renderer/src/sim/duel/hash';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { runDuel } from '../tests/helpers/scriptedDuel';

const TICKS = 3600;
const d = createDuel(parseShip(hound), 1);
const values = flattenDuel(d).length;
disposeDuel(d);
let best = Infinity;
for (let k = 0; k < 3; k++) {
  const t0 = performance.now();
  const r = runDuel(1, 'scripted', TICKS);
  const ms = (performance.now() - t0) / r.telemetry.ticks;
  if (ms < best) best = ms;
}
console.log(JSON.stringify({ simVersion: SIM_VERSION, houndDuelValues: values, msPerTick: Number(best.toFixed(4)), ticks: TICKS }));

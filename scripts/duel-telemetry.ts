// The duel tuning tool (H-0c-ii-a spec §4, §5): runs the scripted pair against the hunter over the chosen seeds (default
// 1 to 10, the gate's), prints each duel's telemetry and the gate summary, then how long a passive crew survives.
// Usage: npx tsx scripts/duel-telemetry.ts [seed ...]
import { TICK_HZ } from '../src/renderer/src/sim/tuning';
import { gateSummary, GATE_SEEDS, median, OUTCOME_NAMES, runDuel, telemetryLine } from '../tests/helpers/scriptedDuel';

const args = process.argv.slice(2).map(Number);
if (args.some((n) => !Number.isInteger(n))) throw Error('usage: npx tsx scripts/duel-telemetry.ts [seed ...]');
const seeds = args.length > 0 ? args : GATE_SEEDS;
const runs = seeds.map((seed) => runDuel(seed, 'scripted'));
for (const r of runs) console.log(telemetryLine(r));
console.log(`\n${gateSummary(runs)}`);
const passive = seeds.map((seed) => runDuel(seed, 'passive').telemetry);
console.log(`\npassive crew (nobody at either console), not gated: ${passive.map((t, i) => `seed ${seeds[i]} ${(t.ticks / TICK_HZ).toFixed(1)} s ${OUTCOME_NAMES[t.outcome]}`).join('; ')}`);
console.log(`passive median ${(median(passive.map((t) => t.ticks)) / TICK_HZ).toFixed(1)} s, shortest ${(Math.min(...passive.map((t) => t.ticks)) / TICK_HZ).toFixed(1)} s`);

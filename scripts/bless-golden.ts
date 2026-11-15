import { computeContentDigest } from '../build/contentDigest';
import { writeFileSync, mkdirSync, existsSync, openSync, readSync, closeSync } from 'node:fs';
import { blessRefusal, readMarkerVersion } from './golden/blessGuard';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { runSemanticReplay } from '../tests/helpers/semanticReplay';
import { scriptedSemanticReplay } from '../tests/helpers/script';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { DUEL_GOLDEN, DUEL_GOLDEN_EVERY, DUEL_GOLDEN_SEED, runDuel } from '../tests/helpers/scriptedDuel';

// A version-bump bless needs a passing per-tick canonical-trace check first; a same-version bless is a deliberate gameplay change.
function storedVersion(path: string): number | undefined {
  if (!existsSync(path)) return undefined;
  const fd = openSync(path, 'r'), buf = Buffer.alloc(4096);
  try { return Number(/"simVersion":(\d+)/.exec(buf.toString('utf8', 0, readSync(fd, buf, 0, buf.length, 0)))?.[1] ?? NaN) || undefined; } finally { closeSync(fd); }
}
const refusal = blessRefusal({ storedVersion: storedVersion('tests/golden/basic.json'), currentVersion: SIM_VERSION, markerVersion: readMarkerVersion() });
if (refusal) { console.error(refusal); process.exit(1); }

const layout = parseShip(starter);
const contentDigest = computeContentDigest(process.cwd());
const replay = scriptedSemanticReplay(2026, 4, 60 * 120, contentDigest);   // 2 minutes, 4 players
const { hashes, finalHash } = runSemanticReplay(layout, replay, 60, contentDigest);
mkdirSync('tests/golden', { recursive: true });
writeFileSync('tests/golden/basic.json', JSON.stringify({ replay, hashes, finalHash }));
console.log(`blessed tests/golden/basic.json: ${hashes.length} checkpoints, final ${finalHash}`);

// The duel golden (H-0c-ii-a spec §6): the scripted pair at one seed, a hash every DUEL_GOLDEN_EVERY ticks.
const duel = runDuel(DUEL_GOLDEN_SEED, 'scripted', undefined, DUEL_GOLDEN_EVERY), t = duel.telemetry;
writeFileSync(DUEL_GOLDEN, JSON.stringify({ simVersion: SIM_VERSION, seed: DUEL_GOLDEN_SEED, outcome: t.outcome, ticks: t.ticks, finalHash: duel.finalHash, every: DUEL_GOLDEN_EVERY, hashes: duel.hashes }, null, 2) + '\n');
console.log(`blessed ${DUEL_GOLDEN}: ${duel.hashes.length} checkpoints, ${t.ticks} ticks, outcome ${t.outcome}, final ${duel.finalHash}`);

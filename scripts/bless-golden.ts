// `npm run bless`: the one command that regenerates every pinned artifact (engine refactor spec §7, R-0):
//   tests/golden/basic.json (the sector golden), tests/golden/duel-1.json (the duel golden) and the expectations of
//   tests/fixtures/determinism-v2.json. If ANY of them is stored at a version other than the current SIM_VERSION, a
//   version change is in progress, and the bless is refused unless the per-tick canonical comparison
//   (scripts/golden/versionOnly.ts, re-run here) proves it version-only; a same-version bless is a deliberate gameplay
//   change. All three are computed and validated in memory first and written only when every one is staged, so a
//   staging failure writes nothing; a write failure can leave a mixed-version set, which the next run guards again. tests/fixtures/net1a-baseline.json is a retired
//   historical oracle and is never written: `npm run bless -- --baseline` only checks it and writes nothing.
//   tests/fixtures/net1a-gates.json is never written.
import { computeContentDigest } from '../build/contentDigest';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basicVersionFromText, duelVersionFromText, readStoredVersion } from './golden/storedVersion';
import { blessRefusal, writeAllOrNothing } from './golden/blessGuard';
import { verifyVersionOnly } from './golden/versionOnly';
import { checkNet1aBaseline } from './golden/baselineCheck';
import { DETERMINISM_FIXTURE, stageDeterminismFixture, storedFixtureVersion } from './determinism/bless';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { runSemanticReplay } from '../tests/helpers/semanticReplay';
import { scriptedSemanticReplay } from '../tests/helpers/script';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { DUEL_GOLDEN, DUEL_GOLDEN_EVERY, DUEL_GOLDEN_SEED, runDuel } from '../tests/helpers/scriptedDuel';

const BASIC = 'tests/golden/basic.json';
const contentDigest = computeContentDigest(process.cwd());
if (process.argv.includes('--baseline')) {
  const r = checkNet1aBaseline(contentDigest);
  if (!r.ok) { console.error(r.message); process.exit(1); }
  console.log(r.message);
  process.exit(0);
}

const stored = [readStoredVersion(BASIC, basicVersionFromText), readStoredVersion(DUEL_GOLDEN, duelVersionFromText), existsSync(DETERMINISM_FIXTURE) ? storedFixtureVersion() : undefined];
const refusal = blessRefusal({ storedVersions: stored, currentVersion: SIM_VERSION, verify: verifyVersionOnly });
if (refusal) { console.error(refusal); process.exit(1); }

const messages = writeAllOrNothing([
  { path: BASIC, stage() {
    const replay = scriptedSemanticReplay(2026, 4, 60 * 120, contentDigest);   // 2 minutes, 4 players
    const { hashes, finalHash } = runSemanticReplay(parseShip(starter), replay, 60, contentDigest);
    return { content: JSON.stringify({ replay, hashes, finalHash }), message: `blessed ${BASIC}: ${hashes.length} checkpoints, final ${finalHash}` };
  } },
  // The duel golden (H-0c-ii-a spec §6): the scripted pair at one seed, a hash every DUEL_GOLDEN_EVERY ticks.
  { path: DUEL_GOLDEN, stage() {
    const duel = runDuel(DUEL_GOLDEN_SEED, 'scripted', undefined, DUEL_GOLDEN_EVERY), t = duel.telemetry;
    return { content: JSON.stringify({ simVersion: SIM_VERSION, seed: DUEL_GOLDEN_SEED, outcome: t.outcome, ticks: t.ticks, finalHash: duel.finalHash, every: DUEL_GOLDEN_EVERY, hashes: duel.hashes }, null, 2) + '\n',
      message: `blessed ${DUEL_GOLDEN}: ${duel.hashes.length} checkpoints, ${t.ticks} ticks, outcome ${t.outcome}, final ${duel.finalHash}` };
  } },
  // The determinism fixture's expectations (version-only checked on a bump).
  { path: DETERMINISM_FIXTURE, stage: () => stageDeterminismFixture(contentDigest) }
], (path, content) => { mkdirSync('tests/golden', { recursive: true }); writeFileSync(path, content); });
for (const line of messages) console.log(line);

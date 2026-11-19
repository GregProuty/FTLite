// CLI for the duel migration oracle (engine refactor spec §5, R-2). The comparison itself is verifyDuelOracle() in
// duelOracle.ts, which `npm run bless` re-runs on every SIM_VERSION bump.
// Usage (no shell features needed; the baseline lives in the same temp folder as the canonical trace):
//   npx tsx scripts/golden/duel-oracle.ts baseline   before the change: records every oracle run per tick
//   npx tsx scripts/golden/duel-oracle.ts check      after a bump, before any bless: exits 1 unless every run matches
//                                                    through MIGRATIONS and SIM_VERSION is the baseline's plus 1
//   npx tsx scripts/golden/duel-oracle.ts same       after a change that keeps SIM_VERSION: exits 1 unless every run
//                                                    matches field for field
//   npx tsx scripts/golden/duel-oracle.ts added      after an additive change that keeps SIM_VERSION: exits 1 unless every run matches with only ADDITIONS' fields new
import { mkdirSync, writeFileSync } from 'node:fs';
import { oracleCounts, oracleTrace, ORACLE_FILE, verifyDuelAdditive, verifyDuelOracle, verifyDuelUnchanged } from './duelOracle';
import { dir } from './versionOnly';

const mode = process.argv[2];
if (mode === 'baseline') {
  mkdirSync(dir, { recursive: true });
  const t = oracleTrace();
  writeFileSync(ORACLE_FILE, JSON.stringify(t));
  console.log(`duel oracle baseline at sim version ${t.simVersion}: ${oracleCounts(t)}; written to ${ORACLE_FILE}`);
} else if (mode === 'check' || mode === 'same' || mode === 'added') {
  const r = mode === 'check' ? verifyDuelOracle() : mode === 'same' ? verifyDuelUnchanged() : verifyDuelAdditive();
  if (!r.ok) { console.error(r.message); process.exit(1); }
  console.log(r.message);
} else throw Error('usage: npx tsx scripts/golden/duel-oracle.ts baseline|check|same|added');

// Version-independent per-tick check for a SIM_VERSION bump (H-0c-ii-a plan, Task 4). The sector goldens hash
// SIM_VERSION, and the independent gameplay checks sample only every 60 ticks, so a bump alone cannot prove that
// nothing between samples changed. This script replays every sector replay the goldens record, hashing the canonical
// flattened state at EVERY tick with the version value (flatten index 0) zeroed:
//   - the golden replay `npm run bless` writes (scriptedSemanticReplay(2026, 4, 7200) on the starter layout);
//   - every schedule of tests/fixtures/determinism-v2.json (its checkpoints moved to the current SIM_VERSION first).
// Usage (no shell features needed; the temp folder comes from os.tmpdir()):
//   npx tsx scripts/golden/canonical-trace.ts baseline   before the bump: records the trace and a copy of basic.json
//   npx tsx scripts/golden/canonical-trace.ts check      after the bump, before any bless: exits 1 unless identical
//   npx tsx scripts/golden/canonical-trace.ts golden     after `npm run bless`: basic.json differs only in version,
//                                                        content digest and hashes
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeContentDigest } from '../../build/contentDigest';
import { hashF64 } from '../../src/shared/hash';
import { flatten } from '../../src/renderer/src/sim/flatten';
import starter from '../../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import type { SimState } from '../../src/renderer/src/sim/state';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { runSemanticReplay } from '../../tests/helpers/semanticReplay';
import { scriptedSemanticReplay } from '../../tests/helpers/script';
import { actions, coreFor, unpackFixture, type Fixture } from '../determinism/fixture';

const dir = join(tmpdir(), 'ftlite-canonical-trace'), traceFile = join(dir, 'trace.json'), basicCopy = join(dir, 'basic-before.json');
const GOLDEN = 'tests/golden/basic.json', FIXTURE = 'tests/fixtures/determinism-v2.json';
interface Trace { simVersion: number; golden: string[]; determinism: Record<string, string[]> }

/** The canonical hash of a state with the version value zeroed. */
function canonical(state: SimState): string {
  const v = Float64Array.from(flatten(state));
  v[0] = 0;
  return hashF64(v);
}

function trace(): Trace {
  const digest = computeContentDigest(process.cwd()), golden: string[] = [];
  runSemanticReplay(parseShip(starter), scriptedSemanticReplay(2026, 4, 60 * 120, digest), 1, digest, (state) => golden.push(canonical(state)));
  const fixture = unpackFixture(JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture), determinism: Record<string, string[]> = {};
  for (const run of fixture.runs) {
    const cp = run.checkpoint, out: string[] = [];
    cp.init.simVersion = cp.snapshot.header.simVersion = SIM_VERSION;
    cp.snapshot.values[0] = SIM_VERSION;
    const h = coreFor(run, digest);
    try {
      for (const action of actions(run)) {
        h.core.replayFrame({ tick: h.state.tick, eventSequenceBefore: h.core.cursors().eventSequence, action, results: [], events: [] });
        if (action.kind === 'tick') out.push(canonical(h.state));
      }
    } finally { h.core.dispose(); }
    determinism[cp.init.runId] = out;
  }
  return { simVersion: SIM_VERSION, golden, determinism };
}

const counts = (t: Trace): string => {
  const runs = Object.values(t.determinism);
  return `golden ${t.golden.length} ticks, determinism-v2 ${runs.reduce((n, r) => n + r.length, 0)} ticks in ${runs.length} runs`;
};

function firstDiff(a: readonly string[] | undefined, b: readonly string[] | undefined): number {
  if (!a || !b) return 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return i;
  return -1;
}

const mode = process.argv[2];
if (mode === 'baseline') {
  mkdirSync(dir, { recursive: true });
  const t = trace();
  writeFileSync(traceFile, JSON.stringify(t));
  copyFileSync(GOLDEN, basicCopy);
  console.log(`baseline at sim version ${t.simVersion}: ${counts(t)}; written to ${traceFile}`);
} else if (mode === 'check') {
  if (!existsSync(traceFile)) throw Error(`no baseline at ${traceFile}: run the baseline before the bump`);
  const was = JSON.parse(readFileSync(traceFile, 'utf8')) as Trace, now = trace();
  if (was.simVersion === now.simVersion) throw Error(`the baseline is already at sim version ${now.simVersion}: bump SIM_VERSION first`);
  const problems: string[] = [];
  const g = firstDiff(was.golden, now.golden);
  if (g >= 0) problems.push(`golden replay differs at tick ${g + 1}`);
  for (const runId of new Set([...Object.keys(was.determinism), ...Object.keys(now.determinism)])) {
    const k = firstDiff(was.determinism[runId], now.determinism[runId]);
    if (k >= 0) problems.push(`determinism-v2 ${runId} differs at its tick ${k + 1}`);
  }
  if (problems.length > 0) { console.error(`NOT version-only, bless nothing:\n${problems.join('\n')}`); process.exit(1); }
  console.log(`per-tick canonical trace identical, sim version ${was.simVersion} → ${now.simVersion}: ${counts(now)}`);
} else if (mode === 'golden') {
  if (!existsSync(basicCopy)) throw Error(`no copy of ${GOLDEN} at ${basicCopy}: run the baseline before the bump`);
  const a: unknown = JSON.parse(readFileSync(basicCopy, 'utf8')), b: unknown = JSON.parse(readFileSync(GOLDEN, 'utf8')), diffs: string[] = [];
  const walk = (x: unknown, y: unknown, p: string): void => {
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], `${p}.${k}`);
      return;
    }
    diffs.push(p);
  };
  walk(a, b, '');
  const other = diffs.filter((p) => !/(simVersion|contentDigest|\.values\.0|\.hash|^\.hashes\.\d+|^\.finalHash)$/.test(p));
  console.log(`${GOLDEN}: ${diffs.length} leaves differ, ${other.length} outside version, digest and hashes`);
  if (other.length > 0) { console.error(other.slice(0, 10).join('\n')); process.exit(1); }
} else throw Error('usage: npx tsx scripts/golden/canonical-trace.ts baseline|check|golden');

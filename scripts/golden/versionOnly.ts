// Version-independent per-tick comparison for a SIM_VERSION bump (H-0c-ii-a plan, Task 4). The sector goldens hash
// SIM_VERSION, and the independent gameplay checks sample only every 60 ticks, so a bump alone cannot prove that
// nothing between samples changed. This replays every sector replay the goldens record, hashing the canonical
// flattened state at EVERY tick with the version value (flatten index 0) zeroed:
//   - the golden replay `npm run bless` writes (scriptedSemanticReplay(2026, 4, 7200) on the starter layout);
//   - every schedule of tests/fixtures/determinism-v2.json (its checkpoints moved to the current SIM_VERSION first).
// No side effects on import. canonical-trace.ts is the CLI; bless-golden.ts and rebless-version.ts call
// verifyVersionOnly() right before they write.
import { existsSync, readFileSync } from 'node:fs';
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

export const dir = join(tmpdir(), 'ftlite-canonical-trace');
export const TRACE_FILE = join(dir, 'trace.json');
export const basicCopy = join(dir, 'basic-before.json');
const FIXTURE = 'tests/fixtures/determinism-v2.json';
export interface Trace { simVersion: number; golden: string[]; determinism: Record<string, string[]> }
export interface VersionOnlyResult { ok: boolean; message: string }

/** The canonical hash of a state with the version value zeroed. */
function canonical(state: SimState): string {
  const v = Float64Array.from(flatten(state));
  v[0] = 0;
  return hashF64(v);
}

export function trace(): Trace {
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

export const counts = (t: Trace): string => {
  const runs = Object.values(t.determinism);
  return `golden ${t.golden.length} ticks, determinism-v2 ${runs.reduce((n, r) => n + r.length, 0)} ticks in ${runs.length} runs`;
};

export function firstDiff(a: readonly string[] | undefined, b: readonly string[] | undefined): number {
  if (!a || !b) return 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return i;
  return -1;
}

/**
 * Re-run the per-tick comparison now: the pre-bump baseline in the temp folder against a fresh trace of the current
 * code. Not ok when there is no baseline, when the baseline is already at the current SIM_VERSION (stale), or when any
 * tick differs. Nothing is trusted from an earlier run.
 */
export function verifyVersionOnly(): VersionOnlyResult {
  if (!existsSync(TRACE_FILE)) return { ok: false, message: `no baseline at ${TRACE_FILE}: run \`canonical-trace.ts baseline\` before the bump` };
  const was = JSON.parse(readFileSync(TRACE_FILE, 'utf8')) as Trace, now = trace();
  if (was.simVersion === now.simVersion) return { ok: false, message: `the baseline is already at sim version ${now.simVersion}: it is stale or SIM_VERSION was not bumped` };
  const problems: string[] = [];
  const g = firstDiff(was.golden, now.golden);
  if (g >= 0) problems.push(`golden replay differs at tick ${g + 1}`);
  for (const runId of new Set([...Object.keys(was.determinism), ...Object.keys(now.determinism)])) {
    const k = firstDiff(was.determinism[runId], now.determinism[runId]);
    if (k >= 0) problems.push(`determinism-v2 ${runId} differs at its tick ${k + 1}`);
  }
  if (problems.length > 0) return { ok: false, message: `NOT version-only, bless nothing:\n${problems.join('\n')}` };
  return { ok: true, message: `per-tick canonical trace identical, sim version ${was.simVersion} → ${now.simVersion}: ${counts(now)}` };
}

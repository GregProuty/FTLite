// Version-independent per-tick comparison for a SIM_VERSION bump (H-0c-ii-a plan, Task 4). The sector goldens hash
// SIM_VERSION, and the independent gameplay checks sample only every 60 ticks, so a bump alone cannot prove that
// nothing between samples changed. This replays every sector replay the goldens record, hashing the canonical
// flattened state at EVERY tick with the version value (flatten index 0) zeroed:
//   - the golden replay `npm run bless` writes (scriptedSemanticReplay(2026, 4, 7200) on the starter layout);
//   - every schedule of tests/fixtures/determinism-v2.json (its checkpoints moved to the current SIM_VERSION first).
// No side effects on import. canonical-trace.ts is the CLI; bless-golden.ts calls verifyVersionOnly() right before it
// writes. verifyUnchanged() is the same comparison for a refactor that keeps SIM_VERSION (engine refactor R-1): the
// per-tick canonical trace must be identical at the same version.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

/** The repo root this process runs in; the baseline is keyed by it so two worktrees never share one. */
export const repoRoot = (): string => resolve(process.cwd());
export const dirFor = (root: string): string => join(tmpdir(), `ftlite-canonical-trace-${createHash('sha256').update(root).digest('hex').slice(0, 8)}`);
export const dir = dirFor(repoRoot());
export const TRACE_FILE = join(dir, 'trace.json');
export const basicCopy = join(dir, 'basic-before.json');
const FIXTURE = 'tests/fixtures/determinism-v2.json';
export interface Trace { simVersion: number; cwd?: string; head?: string; golden: string[]; determinism: Record<string, string[]> }
export interface VersionOnlyResult { ok: boolean; message: string }

/** The canonical hash of flattened values with the version value (index 0) zeroed. */
export function canonicalValues(values: ArrayLike<number>): string {
  const v = Float64Array.from(values);
  v[0] = 0;
  return hashF64(v);
}

/** The canonical hash of a state with the version value zeroed. */
export function canonical(state: SimState): string {
  return canonicalValues(flatten(state));
}

function gitHead(): string {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
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
  return { simVersion: SIM_VERSION, cwd: repoRoot(), head: gitHead(), golden, determinism };
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

/** Not ok when the baseline was recorded from another repo root (or an old trace without one). */
function rootRefusal(was: Trace, root: string): VersionOnlyResult | undefined {
  if (was.cwd === root) return undefined;
  return { ok: false, message: `the baseline was recorded from ${was.cwd ?? 'an unknown repo root'} (HEAD ${was.head ?? 'unknown'}), not from ${root}: record it again with \`canonical-trace.ts baseline\` here` };
}
const recorded = (was: Trace): string => ` (baseline HEAD ${was.head ?? 'unknown'})`;

/** The bump comparison against a (lazily taken) fresh trace. Pure: `was` undefined means no baseline. */
export function judgeVersionOnly(was: Trace | undefined, nowTrace: () => Trace, root: string): VersionOnlyResult {
  if (!was) return { ok: false, message: `no baseline at ${TRACE_FILE}: run \`canonical-trace.ts baseline\` before the bump` };
  const refused = rootRefusal(was, root);
  if (refused) return refused;
  const now = nowTrace();
  if (was.simVersion === now.simVersion) return { ok: false, message: `the baseline is already at sim version ${now.simVersion}: it is stale or SIM_VERSION was not bumped` };
  const problems = differences(was, now);
  if (problems.length > 0) return { ok: false, message: `NOT version-only, bless nothing:\n${problems.join('\n')}` };
  return { ok: true, message: `per-tick canonical trace identical, sim version ${was.simVersion} → ${now.simVersion}: ${counts(now)}${recorded(was)}` };
}

/** The same-version comparison against a (lazily taken) fresh trace. Pure. */
export function judgeUnchanged(was: Trace | undefined, nowTrace: () => Trace, root: string): VersionOnlyResult {
  if (!was) return { ok: false, message: `no baseline at ${TRACE_FILE}: run \`canonical-trace.ts baseline\` before the change` };
  const refused = rootRefusal(was, root);
  if (refused) return refused;
  const now = nowTrace();
  if (was.simVersion !== now.simVersion) return { ok: false, message: `the baseline is at sim version ${was.simVersion}, the code at ${now.simVersion}: use \`check\` for a bump` };
  const problems = differences(was, now);
  if (problems.length > 0) return { ok: false, message: `canonical trace CHANGED:\n${problems.join('\n')}${recorded(was)}` };
  return { ok: true, message: `per-tick canonical trace unchanged at sim version ${now.simVersion}: ${counts(now)}${recorded(was)}` };
}

const readBaseline = (): Trace | undefined => existsSync(TRACE_FILE) ? JSON.parse(readFileSync(TRACE_FILE, 'utf8')) as Trace : undefined;

/**
 * Re-run the per-tick comparison now: the pre-bump baseline in the temp folder against a fresh trace of the current
 * code. Not ok when there is no baseline, when it is from another repo root, when it is already at the current
 * SIM_VERSION (stale), or when any tick differs. Nothing is trusted from an earlier run.
 */
export function verifyVersionOnly(): VersionOnlyResult {
  return judgeVersionOnly(readBaseline(), trace, repoRoot());
}

export function differences(was: Trace, now: Trace): string[] {
  const problems: string[] = [];
  const g = firstDiff(was.golden, now.golden);
  if (g >= 0) problems.push(`golden replay differs at tick ${g + 1}`);
  for (const runId of new Set([...Object.keys(was.determinism), ...Object.keys(now.determinism)])) {
    const k = firstDiff(was.determinism[runId], now.determinism[runId]);
    if (k >= 0) problems.push(`determinism-v2 ${runId} differs at its tick ${k + 1}`);
  }
  return problems;
}

/** The refactor check: the baseline recorded before a change that keeps SIM_VERSION against a fresh trace. */
export function verifyUnchanged(): VersionOnlyResult {
  return judgeUnchanged(readBaseline(), trace, repoRoot());
}

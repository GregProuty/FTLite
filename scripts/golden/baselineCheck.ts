// The opt-in historical check of tests/fixtures/net1a-baseline.json (engine refactor spec §7, R-0). The fixture pins
// 19 gameplay scenarios recorded at SIM 34 as named projections; it is never re-blessed. It left the default suite in
// R-0: its role as the independent gameplay oracle passes to the per-tick canonical trace (versionOnly.ts) and, from
// R-4, to the pre-refactor oracle. Run it with `npm run bless -- --baseline`, which writes nothing.
import { readFileSync } from 'node:fs';
import starter from '../../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import type { ReplayV2 } from '../../src/renderer/src/sim/replay';
import { firstDifference, projectGameplay, runScenario, scenarios } from '../../tests/helpers/gameplayTrace';
import { runSemanticReplay } from '../../tests/helpers/semanticReplay';

const BASELINE = 'tests/fixtures/net1a-baseline.json';
const GOLDEN = 'tests/golden/basic.json';
type Observation = { tick: number; state: Record<string, unknown> };
type Scenario = ReturnType<typeof runScenario>;

export interface BaselineResult { ok: boolean; message: string }

/** Every pinned scenario re-run against its stored observations, plus the semantic golden replay's 60-tick projections. */
export function checkNet1aBaseline(contentDigest: string): BaselineResult {
  const pinned = JSON.parse(readFileSync(BASELINE, 'utf8')) as { scenarios: Scenario[] }, problems: string[] = [];
  for (const spec of scenarios) {
    const expected = pinned.scenarios.find((s) => s.name === spec.name);
    if (!expected) { problems.push(`${spec.name}: missing from ${BASELINE}`); continue; }
    const actual = runScenario(spec, contentDigest), diff = firstDifference(expected.observations, actual.observations);
    if (diff) { problems.push(`${spec.name}: first difference at tick ${diff.tick}, ${diff.field}`); continue; }
    // The pinned summary records SIM 34; only that version field may differ.
    const rest = firstDifference({ ...expected, summary: { ...expected.summary, simVersion: 0 } }, { ...actual, summary: { ...actual.summary, simVersion: 0 } });
    if (rest) problems.push(`${spec.name}: ${rest.field || 'scenario'} differs at tick ${rest.tick}`);
  }
  const replay = (JSON.parse(readFileSync(GOLDEN, 'utf8')) as { replay: ReplayV2 }).replay;
  replay.initial.header.contentDigest = replay.init.contentDigest = contentDigest;
  replay.checkpoint.init.contentDigest = replay.checkpoint.snapshot.header.contentDigest = contentDigest;
  const observations: Observation[] = [];
  try {
    runSemanticReplay(parseShip(starter), replay, 60, contentDigest, (state) => observations.push({ tick: state.tick, state: projectGameplay(state) }));
    const golden = pinned.scenarios.find((s) => s.name === 'golden-2026-four-7200')!.observations.filter((o) => o.tick > 0);
    const diff = firstDifference(golden, observations);
    if (diff) problems.push(`${GOLDEN} replay: first difference at tick ${diff.tick}, ${diff.field}`);
  } catch (error) { problems.push(`${GOLDEN} replay: ${String(error)}`); }
  if (problems.length > 0) return { ok: false, message: `net1a-baseline differs at sim version ${SIM_VERSION}:\n${problems.join('\n')}` };
  return { ok: true, message: `net1a-baseline: ${scenarios.length} scenarios and the golden replay's ${observations.length} projections match (sim version ${SIM_VERSION})` };
}

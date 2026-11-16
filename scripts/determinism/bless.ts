// The determinism fixture's part of `npm run bless` (engine refactor spec §7, R-0: one command blesses every pinned
// artifact). tests/fixtures/determinism-v2.json keeps its checked-in schedules; only its expectations are rewritten.
// - Same SIM_VERSION (a deliberate gameplay change, like a same-version golden bless): re-execute the schedules and
//   write the new expectations.
// - A SIM_VERSION bump: move every recorded checkpoint to the current version (init, snapshot header and the
//   snapshot's flattened version value), re-execute, and refuse unless the new expectations differ from the old only
//   in the version: every canonical field but `$simVersion`, every sample's place and every result/event boundary
//   unchanged. The caller (scripts/bless-golden.ts) has already passed the per-tick canonical guard for a bump.
// Nothing here writes: the caller stages this with the goldens and writes all three only when every one is valid.
import { readFileSync } from 'node:fs';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { executeFixture, packFixture, unpackFixture, type Fixture } from './fixture';
import { firstDifference } from './protocol';

export const DETERMINISM_FIXTURE = 'tests/fixtures/determinism-v2.json';

/** The sim version the fixture's checkpoints record (they must all agree). */
export function fixtureVersion(fixture: Fixture): number {
  const from = fixture.runs[0]!.checkpoint.init.simVersion;
  for (const run of fixture.runs) {
    const cp = run.checkpoint;
    if (cp.init.simVersion !== from || cp.snapshot.header.simVersion !== from || cp.snapshot.values[0] !== from) throw Error(`${cp.init.runId}: mixed sim versions`);
  }
  return from;
}

/** The sim version the stored fixture records. */
export function storedFixtureVersion(): number {
  return fixtureVersion(unpackFixture(JSON.parse(readFileSync(DETERMINISM_FIXTURE, 'utf8')) as Fixture));
}

/** The fixture with re-executed expectations, as file content, and its summary line. Throws on a bump that is not version-only. */
export function stageDeterminismFixture(contentDigest: string): { content: string; message: string } {
  const old = unpackFixture(JSON.parse(readFileSync(DETERMINISM_FIXTURE, 'utf8')) as Fixture), from = fixtureVersion(old);
  const fixture = structuredClone(old);
  for (const run of fixture.runs) {
    const cp = run.checkpoint;
    cp.init.simVersion = cp.snapshot.header.simVersion = SIM_VERSION;
    cp.snapshot.values[0] = SIM_VERSION;
  }
  fixture.expected = executeFixture(fixture, contentDigest, false);
  const was = old.expected, now = fixture.expected;
  if (from !== SIM_VERSION) {
    if (was.samples.length !== now.samples.length) throw Error(`sample count changed: ${was.samples.length} → ${now.samples.length}`);
    now.samples.forEach((s, i) => {
      const o = was.samples[i]!, { $simVersion: a, ...oldFields } = o.fields, { $simVersion: b, ...newFields } = s.fields;
      const place = firstDifference({ ...o, hash: '', fields: oldFields }, { ...s, hash: '', fields: newFields }, `sample ${i}`);
      if (place) throw Error(`not version-only: ${place}`);
      if (a !== from || b !== SIM_VERSION) throw Error(`sample ${i}: $simVersion ${String(a)} → ${String(b)}`);
    });
    const boundaries = firstDifference(was.boundaries, now.boundaries, 'boundaries');
    if (boundaries) throw Error(`not version-only: ${boundaries}`);
  }
  return { content: JSON.stringify(packFixture(fixture)), message: from === SIM_VERSION
    ? `blessed ${DETERMINISM_FIXTURE}: sim version ${SIM_VERSION}, ${now.samples.length} samples and ${now.boundaries.length} boundaries re-executed`
    : `blessed ${DETERMINISM_FIXTURE}: sim version ${from} → ${SIM_VERSION}, ${now.samples.length} samples and ${now.boundaries.length} boundaries unchanged apart from the version and hashes` };
}

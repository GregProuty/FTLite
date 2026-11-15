// Version-only re-bless of tests/fixtures/determinism-v2.json after a SIM_VERSION bump (H-0c-ii-a spec §6). The gate
// never runs this. It moves every recorded checkpoint to the current SIM_VERSION (init, snapshot header and the
// snapshot's flattened version value), re-executes the fixture's own schedules, and refuses to write unless the new
// expectations differ from the old only in the version: every canonical field but `$simVersion`, every sample's place
// and every result/event boundary must be unchanged; only the sample hashes (which hash the version) may move.
import { readFileSync, writeFileSync } from 'node:fs';
import { computeContentDigest } from '../../build/contentDigest';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { executeFixture, packFixture, unpackFixture, type Fixture } from './fixture';
import { firstDifference } from './protocol';
import { blessRefusal, readMarkerVersion } from '../golden/blessGuard';

const path = 'tests/fixtures/determinism-v2.json';
const old = unpackFixture(JSON.parse(readFileSync(path, 'utf8')) as Fixture);
const from = old.runs[0]!.checkpoint.init.simVersion;
if (from === SIM_VERSION) throw Error(`${path} is already at sim version ${SIM_VERSION}`);
const refusal = blessRefusal({ storedVersion: from, currentVersion: SIM_VERSION, markerVersion: readMarkerVersion(), versionOnly: true });
if (refusal) throw Error(refusal);
const fixture = structuredClone(old);
for (const run of fixture.runs) {
  const cp = run.checkpoint;
  if (cp.init.simVersion !== from || cp.snapshot.header.simVersion !== from || cp.snapshot.values[0] !== from) throw Error(`${cp.init.runId}: mixed sim versions`);
  cp.init.simVersion = cp.snapshot.header.simVersion = SIM_VERSION;
  cp.snapshot.values[0] = SIM_VERSION;
}
fixture.expected = executeFixture(fixture, computeContentDigest(process.cwd()), false);
const was = old.expected, now = fixture.expected;
if (was.samples.length !== now.samples.length) throw Error(`sample count changed: ${was.samples.length} → ${now.samples.length}`);
now.samples.forEach((s, i) => {
  const o = was.samples[i]!, { $simVersion: a, ...oldFields } = o.fields, { $simVersion: b, ...newFields } = s.fields;
  const place = firstDifference({ ...o, hash: '', fields: oldFields }, { ...s, hash: '', fields: newFields }, `sample ${i}`);
  if (place) throw Error(`not version-only: ${place}`);
  if (a !== from || b !== SIM_VERSION) throw Error(`sample ${i}: $simVersion ${String(a)} → ${String(b)}`);
});
const boundaries = firstDifference(was.boundaries, now.boundaries, 'boundaries');
if (boundaries) throw Error(`not version-only: ${boundaries}`);
writeFileSync(path, JSON.stringify(packFixture(fixture)));
console.log(`re-blessed ${path}: sim version ${from} → ${SIM_VERSION}, ${now.samples.length} samples and ${now.boundaries.length} boundaries unchanged apart from the version and hashes`);

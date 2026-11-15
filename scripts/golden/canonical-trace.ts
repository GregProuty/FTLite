// CLI for the version-independent per-tick check on a SIM_VERSION bump (H-0c-ii-a plan, Task 4). The comparison itself
// is verifyVersionOnly() in versionOnly.ts, which `npm run bless` and rebless-version.ts re-run right before they write.
// Usage (no shell features needed; the temp folder comes from os.tmpdir()):
//   npx tsx scripts/golden/canonical-trace.ts baseline   before the bump: records the trace and a copy of basic.json
//   npx tsx scripts/golden/canonical-trace.ts check      after the bump, before any bless: exits 1 unless identical
//   npx tsx scripts/golden/canonical-trace.ts golden     after `npm run bless`: basic.json differs only in version,
//                                                        content digest and hashes
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basicCopy, counts, dir, trace, TRACE_FILE, verifyVersionOnly } from './versionOnly';

const GOLDEN = 'tests/golden/basic.json';

const mode = process.argv[2];
if (mode === 'baseline') {
  mkdirSync(dir, { recursive: true });
  const t = trace();
  writeFileSync(TRACE_FILE, JSON.stringify(t));
  copyFileSync(GOLDEN, basicCopy);
  console.log(`baseline at sim version ${t.simVersion}: ${counts(t)}; written to ${TRACE_FILE}`);
} else if (mode === 'check') {
  const r = verifyVersionOnly();
  if (!r.ok) { console.error(r.message); process.exit(1); }
  console.log(r.message);
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

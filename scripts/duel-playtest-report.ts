// The duel playtest report (H-2 spec §8): `npx tsx scripts/duel-playtest-report.ts <file or directory ...> [--checklist=<file>]`.
// Reads every duel-*.jsonl given (a directory contributes its duel-*.jsonl files and, when present, its checklist.json),
// merges the host and guest records into rooms and prints the report (scripts/duel-playtest-model.ts) for
// docs/gates.md's "Helm demo" section and a playtest report under reports/. Reads only the files named; writes nothing.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { formatReport, parseRecords, validateChecklist, type Checklist } from './duel-playtest-model';
import type { DuelPlaytestRecord } from '../src/renderer/src/net/duelRecord';

const RECORD_FILE = /^duel-\d{4}-\d{2}-\d{2}\.jsonl$/;
function main(): void {
  const args = process.argv.slice(2), paths = args.filter((a) => !a.startsWith('--')), flags = args.filter((a) => a.startsWith('--'));
  if (!paths.length || flags.some((f) => !f.startsWith('--checklist='))) throw Error('usage: npx tsx scripts/duel-playtest-report.ts <file or directory ...> [--checklist=<file>]');
  const files: string[] = [];
  let checklistPath = flags.find((f) => f.startsWith('--checklist='))?.slice('--checklist='.length);
  for (const path of paths) {
    if (!existsSync(path)) throw Error(`no such file or directory: ${path}`);
    if (statSync(path).isDirectory()) {
      files.push(...readdirSync(path).filter((f) => RECORD_FILE.test(f)).sort().map((f) => join(path, f)));
      if (!checklistPath && existsSync(join(path, 'checklist.json'))) checklistPath = join(path, 'checklist.json');
    } else if (RECORD_FILE.test(basename(path)) || path.endsWith('.jsonl')) files.push(path);
    else throw Error(`not a duel-*.jsonl record file: ${path}`);
  }
  const records: DuelPlaytestRecord[] = []; let invalid = 0;
  for (const file of files) { const parsed = parseRecords(readFileSync(file, 'utf8')); records.push(...parsed.records); invalid += parsed.invalid; }
  const checklist: Checklist | null = checklistPath ? validateChecklist(JSON.parse(readFileSync(checklistPath, 'utf8'))) : null;
  process.stdout.write(formatReport({ records, invalid, checklist, files: files.length }));
  if (!records.length) { console.error('no valid duel playtest records'); process.exitCode = 1; }
}
try { main(); } catch (error) { console.error(String((error as Error)?.message ?? error).slice(0, 300)); process.exitCode = 1; }

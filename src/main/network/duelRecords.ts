// The duel playtest log (H-2 spec §8): main appends each validated record as one line to
// userData/playtest/duel-YYYY-MM-DD.jsonl (the local date). Records are strict and size-capped (net/duelRecord.ts), so
// nothing but the record's own fields ever reaches the file.
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { validateDuelRecord } from '../../renderer/src/net/duelRecord';

export function duelRecordPath(userData: string, now: Date): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return join(userData, 'playtest', `duel-${day}.jsonl`);
}
/** Validate and append one record; false (and nothing written) when it is invalid or the write fails. */
export async function appendDuelRecord(userData: string, value: unknown, now = new Date()): Promise<boolean> {
  let line: string;
  try { line = JSON.stringify(validateDuelRecord(value)) + '\n'; } catch { return false; }
  try { await mkdir(join(userData, 'playtest'), { recursive: true }); await appendFile(duelRecordPath(userData, now), line, 'utf8'); return true; }
  catch { return false; }
}

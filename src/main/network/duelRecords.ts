// The duel playtest log (H-2 spec §8): main appends each validated record as one line to
// userData/playtest/duel-YYYY-MM-DD.jsonl (the local date). Records are strict and size-capped (net/duelRecord.ts), so
// nothing but the record's own fields ever reaches the file.
import { appendFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { validateDuelRecord } from '../../renderer/src/net/duelRecord';

export function duelRecordPath(userData: string, now: Date): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return join(userData, 'playtest', `duel-${day}.jsonl`);
}
/** A day's file stops growing here, so a renderer bug looping on round events cannot fill the disk (8 KiB per record). */
export const DUEL_RECORD_FILE_MAX_BYTES = 16 * 1024 * 1024;
/** Validate and append one record; false (and nothing written) when it is invalid, the day's file is full or the write fails. */
export async function appendDuelRecord(userData: string, value: unknown, now = new Date(), maxFileBytes = DUEL_RECORD_FILE_MAX_BYTES): Promise<boolean> {
  let line: string;
  try { line = JSON.stringify(validateDuelRecord(value)) + '\n'; } catch { return false; }
  const path = duelRecordPath(userData, now);
  try {
    await mkdir(join(userData, 'playtest'), { recursive: true });
    const size = await stat(path).then((s) => s.size, (error: { code?: string }) => { if (error?.code === 'ENOENT') return 0; throw error; });
    if (size + Buffer.byteLength(line, 'utf8') > maxFileBytes) return false;
    await appendFile(path, line, 'utf8'); return true;
  } catch { return false; }
}
/** The duel:record channel's caller check, trusted as the fullscreen channel is: only the window's own main frame, with
 *  exactly one argument. `contents` is null once the window or its web contents is destroyed. */
export function duelRecordCallAllowed(contents: { mainFrame: unknown } | null, event: { sender: unknown; senderFrame: unknown }, args: readonly unknown[]): boolean {
  return !!contents && event.sender === contents && event.senderFrame === contents.mainFrame && args.length === 1;
}

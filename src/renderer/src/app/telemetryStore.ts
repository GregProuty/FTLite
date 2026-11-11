import type { TelemetryRecord } from '../sim/telemetry';
import { TELEMETRY_KEEP } from '../sim/tuning';

export const TELEMETRY_KEY = 'ftlite-telemetry';
export interface RecordStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** Append one record to the capped history. A missing key, unparsable JSON or a non-array root counts as an empty history; storage failures are swallowed (spec 4-ii section 7). */
export function appendTelemetry(storage: RecordStorage, record: TelemetryRecord, keep = TELEMETRY_KEEP): void {
  try {
    const raw = storage.getItem(TELEMETRY_KEY);                      // an access failure throws to the outer catch: nothing is written
    let history: unknown = null;
    try { history = JSON.parse(raw ?? 'null'); } catch { history = null; }   // malformed data is replaced
    const list = Array.isArray(history) ? history : [];
    list.push(record);
    storage.setItem(TELEMETRY_KEY, JSON.stringify(list.slice(-keep)));
  } catch { /* storage unavailable or full */ }
}

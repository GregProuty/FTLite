import { EMPTY_PROGRESS, UNLOCKS, type Progress } from '../sim/progress';
import type { RecordStorage } from './telemetryStore';
export const PROGRESS_KEY = 'ftlite-progress';
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
/** Read progress, field by field; anything malformed falls back per field, a bad root to EMPTY_PROGRESS (spec Run-iii section 4). */
export function loadProgress(storage: RecordStorage): Progress {
  try {
    const raw = JSON.parse(storage.getItem(PROGRESS_KEY) ?? 'null') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || (raw as { version?: unknown }).version !== 1) return { ...EMPTY_PROGRESS, unlocked: [] };
    const o = raw as Record<string, unknown>, ids = Array.isArray(o['unlocked']) ? (o['unlocked'] as unknown[]) : [];
    return { version: 1, runs: num(o['runs']), victories: num(o['victories']), bestScore: num(o['bestScore']), bestNodes: num(o['bestNodes']), unlocked: UNLOCKS.filter((u) => ids.includes(u.id)).map((u) => u.id) };
  } catch { return { ...EMPTY_PROGRESS, unlocked: [] }; }
}
export function saveProgress(storage: RecordStorage, p: Progress): void { try { storage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch { /* storage unavailable or full */ } }

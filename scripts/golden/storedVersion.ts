// Readers for the stored SIM_VERSION of the two golden files, on text so tests need no real artifact. A file that
// exists but yields no version throws: only a missing file counts as absent (blessGuard treats undefined as absent).
import { existsSync, readFileSync } from 'node:fs';

function parse(text: string, label: string): unknown {
  try { return JSON.parse(text); } catch (e) { throw new Error(`${label}: not valid JSON (${(e as Error).message})`); }
}
const asVersion = (v: unknown, label: string, where: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) throw new Error(`${label}: no simVersion at ${where}`);
  return v;
};

/** basic.json: { replay: { init: { simVersion } } }. */
export function basicVersionFromText(text: string, label = 'basic.json'): number {
  const j = parse(text, label) as { replay?: { init?: { simVersion?: unknown } } } | null;
  return asVersion(j?.replay?.init?.simVersion, label, 'replay.init.simVersion');
}
/** duel-1.json: { simVersion }. */
export function duelVersionFromText(text: string, label = 'duel-1.json'): number {
  return asVersion((parse(text, label) as { simVersion?: unknown } | null)?.simVersion, label, 'simVersion');
}
/** The stored version, undefined only when the file is missing. */
export function readStoredVersion(path: string, fromText: (text: string, label: string) => number): number | undefined {
  return existsSync(path) ? fromText(readFileSync(path, 'utf8'), path) : undefined;
}

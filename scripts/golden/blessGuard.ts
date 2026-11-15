// The guard that keeps a SIM_VERSION-bump bless honest: the per-tick canonical-trace `check` must have passed at the
// current version first. `check` writes the marker; a failing check deletes it. Shared by scripts/bless-golden.ts,
// scripts/determinism/rebless-version.ts and scripts/golden/canonical-trace.ts.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const TRACE_DIR = join(tmpdir(), 'ftlite-canonical-trace');
export const MARKER_FILE = join(TRACE_DIR, 'verified.json');

export interface VerifiedMarker { simVersion: number; baselineSimVersion: number; checkedAt: string }

/** The marker's sim version, or undefined when there is no readable marker. */
export function readMarkerVersion(file = MARKER_FILE): number | undefined {
  try {
    if (!existsSync(file)) return undefined;
    const v = (JSON.parse(readFileSync(file, 'utf8')) as Partial<VerifiedMarker>).simVersion;
    return typeof v === 'number' ? v : undefined;
  } catch { return undefined; }
}

export function writeMarker(simVersion: number, baselineSimVersion: number, file = MARKER_FILE): void {
  mkdirSync(TRACE_DIR, { recursive: true });
  const m: VerifiedMarker = { simVersion, baselineSimVersion, checkedAt: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(m));
}

export function clearMarker(file = MARKER_FILE): void { rmSync(file, { force: true }); }

/**
 * Decide whether a bless may write. `storedVersion` is the version the existing golden records (undefined when there is
 * none); a version-only bless (`versionOnly`, or a stored version different from the current one) needs a marker
 * for the current version. Returns undefined to allow, or the refusal message.
 */
export function blessRefusal(opts: { storedVersion: number | undefined; currentVersion: number; markerVersion: number | undefined; versionOnly?: boolean }): string | undefined {
  const { storedVersion, currentVersion, markerVersion, versionOnly } = opts;
  const bump = versionOnly === true || (storedVersion !== undefined && storedVersion !== currentVersion);
  if (!bump) return undefined;
  if (markerVersion === currentVersion) return undefined;
  return `refusing to bless a SIM_VERSION bump (${storedVersion ?? '?'} → ${currentVersion}) without a passing per-tick check: ` +
    `run \`npx tsx scripts/golden/canonical-trace.ts check\` at sim version ${currentVersion} first (marker ${markerVersion === undefined ? 'missing' : `is for version ${markerVersion}`}, ${MARKER_FILE})`;
}

// The guard that keeps a SIM_VERSION-bump bless honest: just before writing, the per-tick canonical comparison
// (versionOnly.ts) is re-run, so nothing from an earlier run is trusted. This file is the pure decision; the callers
// (scripts/bless-golden.ts, scripts/determinism/rebless-version.ts) inject the comparison.
import type { VersionOnlyResult } from './versionOnly';

/**
 * Returns undefined to allow the bless, or the refusal message. A bump (`versionOnly`, or a stored version different
 * from the current one) runs `verify` and is allowed only when it returns ok; a same-version bless (a deliberate
 * gameplay change) never calls it.
 */
export function blessRefusal(opts: { storedVersion: number | undefined; currentVersion: number; verify: () => VersionOnlyResult; versionOnly?: boolean }): string | undefined {
  const { storedVersion, currentVersion, verify, versionOnly } = opts;
  const bump = versionOnly === true || (storedVersion !== undefined && storedVersion !== currentVersion);
  if (!bump) return undefined;
  const r = verify();
  if (r.ok) return undefined;
  return `refusing to bless a SIM_VERSION bump (${storedVersion ?? '?'} → ${currentVersion}): the per-tick canonical comparison failed.\n${r.message}`;
}

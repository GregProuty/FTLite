// The guards that keep `npm run bless` honest. This file is pure; scripts/bless-golden.ts injects the comparison and
// the file system.
// - blessRefusal: a SIM_VERSION change is in progress whenever ANY pinned artifact's stored version differs from the
//   current one (a half-finished earlier bless can leave them mixed). Then the per-tick canonical comparison
//   (versionOnly.ts) is re-run, so nothing from an earlier run is trusted, and the bless is allowed only when it is ok.
//   The sector comparison does not cover the duel, so a bump also re-runs the duel migration oracle (duelOracle.ts,
//   engine refactor R-2): duel-1.json is never re-blessed on a bump unless every duel run matches its pre-bump
//   baseline per tick, through the alias table when the duel's schema changed. Both proofs are required options.
// - writeAllOrNothing: every artifact is staged (computed and validated) in memory before any file is written, so a
//   failure while staging any of them writes none.
import type { VersionOnlyResult } from './versionOnly';

/**
 * Returns undefined to allow the bless, or the refusal message. A bump (any stored version different from the current one) runs `verify` (the sector) and then `duel` (the duel oracle) and is allowed only when both return ok; a same-version bless (every artifact
 * already at the current version: a deliberate gameplay change) never calls it. An absent artifact (undefined) does
 * not count as a bump.
 */
export function blessRefusal(opts: { storedVersions: readonly (number | undefined)[]; currentVersion: number; verify: () => VersionOnlyResult; duel: () => VersionOnlyResult }): string | undefined {
  const { storedVersions, currentVersion, verify, duel } = opts;
  const stale = storedVersions.filter((v): v is number => v !== undefined && v !== currentVersion);
  if (stale.length === 0) return undefined;
  const bump = `refusing to bless a SIM_VERSION bump (${[...new Set(stale)].join(', ') || '?'} → ${currentVersion})`;
  const r = verify();
  if (!r.ok) return `${bump}: the per-tick canonical comparison failed.\n${r.message}`;
  const d = duel();
  if (!d.ok) return `${bump}: the duel migration oracle failed.\n${d.message}`;
  return undefined;
}

export interface StagedArtifact { path: string; stage(): { content: string; message: string } }

/** Stage every artifact first; write them only when all staged. Returns the messages in order. */
export function writeAllOrNothing(artifacts: readonly StagedArtifact[], write: (path: string, content: string) => void): string[] {
  const staged = artifacts.map((a) => ({ path: a.path, ...a.stage() }));
  for (const s of staged) write(s.path, s.content);
  return staged.map((s) => s.message);
}

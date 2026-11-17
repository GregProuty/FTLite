import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Build/CLI only: the app version (package.json) and the commit it was built from, shown on the main menu (owner
 *  2026-11-17) so testers can say which build they run. `rev` is the short HEAD, with `+` when the tree has changes, or
 *  `dev` without git. */
export function computeBuildInfo(root: string): { version: string; rev: string; sim: number } {
  const version = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version;
  let rev = 'dev';
  try {
    rev = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no', '--', 'src', 'public', 'package.json'], { cwd: root, encoding: 'utf8' }).trim();
    if (dirty) rev += '+';
  } catch { /* no git: dev */ }
  return { version, rev, sim: readSimVersion(root) };
}

/** SIM_VERSION read from the sim's tuning source, so the UI's version line needs no runtime import from sim (the UI
 *  boundary). Throws if the declaration is not found, so a rename fails the build loudly. */
export function readSimVersion(root: string): number {
  const m = /export const SIM_VERSION = (\d+);/.exec(readFileSync(join(root, 'src/renderer/src/sim/tuning.ts'), 'utf8'));
  if (!m) throw new Error('SIM_VERSION not found in src/renderer/src/sim/tuning.ts');
  return Number(m[1]);
}

import { SIM_VERSION } from '../sim/tuning';

/** The main menu's version line (owner 2026-11-17): the app version, the sim version (which must match for
 *  multiplayer) and the build's commit, e.g. `v0.0.1 · sim 42 · 40af1a3`. */
export function versionText(build: { version: string; rev: string } = __FTLITE_BUILD__): string {
  return `v${build.version} · sim ${SIM_VERSION} · ${build.rev}`;
}

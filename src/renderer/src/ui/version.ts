/** The main menu's version line (owner 2026-11-17): the app version, the sim version (which must match for
 *  multiplayer) and the build's commit, e.g. `v0.0.1 · sim 42 · 40af1a3`. The sim version comes with the build info (read
 *  from the sim's source at build time), so the UI imports no runtime value from sim. */
export function versionText(build: { version: string; rev: string; sim: number } = __FTLITE_BUILD__): string {
  return `v${build.version} · sim ${build.sim} · ${build.rev}`;
}

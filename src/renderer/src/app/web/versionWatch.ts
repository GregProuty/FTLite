// The update check (web build spec §5.4, deviation W-9): version.json at start and every 5 minutes while the menu or a
// lobby shows; a different build raises the "New version: reload" banner once. Browser only (main.ts).
import { isPlaying, type UiState } from '../../ui/menuState';

export interface BuildVersion { build: { version: string; rev: string; sim: number }; sim: number; digest: string }
export const VERSION_POLL_MS = 300000;
export interface VersionWatchDeps {
  fetch(url: string, init: { cache: 'no-store'; credentials: 'same-origin' }): Promise<{ ok: boolean; json(): Promise<unknown> }>;
  local: BuildVersion; active(): boolean; onUpdate(): void;
  setInterval(cb: () => void, ms: number): unknown; clearInterval(handle: unknown): void;
}
export function parseVersion(value: unknown): BuildVersion | null {
  const v = value as BuildVersion | null;
  if (!v || typeof v !== 'object' || Object.keys(v).sort().join() !== 'build,digest,sim' || !Number.isSafeInteger(v.sim)
    || typeof v.digest !== 'string' || !/^[0-9a-f]{64}$/.test(v.digest) || !v.build || typeof v.build !== 'object'
    || Object.keys(v.build).sort().join() !== 'rev,sim,version' || typeof v.build.version !== 'string' || typeof v.build.rev !== 'string' || !Number.isSafeInteger(v.build.sim)) return null;
  return { build: { version: v.build.version, rev: v.build.rev, sim: v.build.sim }, sim: v.sim, digest: v.digest };
}
export function versionDiffers(remote: BuildVersion, local: BuildVersion): boolean {
  return remote.digest !== local.digest || remote.sim !== local.sim || remote.build.version !== local.build.version || remote.build.rev !== local.build.rev || remote.build.sim !== local.build.sim;
}
/** On the menu or in a lobby (spec §5.4); never in a match (W-4: Single player is one). */
export function versionPollActive(s: Pick<UiState, 'menu' | 'online'>): boolean {
  return s.menu.page !== 'single' && (!isPlaying(s.menu) || s.online.status?.phase === 'lobby');
}
export function watchVersion(deps: VersionWatchDeps): () => void {
  let stopped = false, busy = false;
  const stop = (): void => { if (!stopped) { stopped = true; deps.clearInterval(handle); } };
  const check = async (): Promise<void> => {
    if (stopped || busy || !deps.active()) return;
    busy = true;
    try {
      const response = await deps.fetch('./version.json', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      const remote = parseVersion(await response.json());
      if (!stopped && remote && versionDiffers(remote, deps.local)) { stop(); deps.onUpdate(); }
    } catch { /* offline, signed out (the passcode page is not JSON) or mid-deploy: try again next time */ }
    finally { busy = false; }
  };
  const handle = deps.setInterval(() => { void check(); }, VERSION_POLL_MS);
  void check();
  return stop;
}

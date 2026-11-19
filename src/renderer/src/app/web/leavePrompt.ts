// Leaving the page (web build spec §7.6, deviation W-4): while hosting, in a lobby or in a match, beforeunload asks for
// the browser's standard leave prompt (browsers show their own text). Skipped in Electron (main.ts installs it only
// without window.ftlite; Electron main also allows will-prevent-unload).
import type { OnlinePhase } from '../../../../shared/onlineSession';
import type { UiState } from '../../ui/menuState';

const QUIET: readonly OnlinePhase[] = ['idle', 'ended', 'error', 'saved'];
export function leaveWanted(s: Pick<UiState, 'menu' | 'online'>): boolean {
  if (s.menu.page === 'single') return true;
  const phase = s.online.status?.phase;
  return !!phase && !QUIET.includes(phase);
}
export function installLeavePrompt(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, wanted: () => boolean): () => void {
  const listener = (event: Event): void => {
    if (!wanted()) return;
    event.preventDefault();
    try { (event as unknown as { returnValue: unknown }).returnValue = ''; } catch { /* the older Chromium form of the same request; read-only outside BeforeUnloadEvent */ }
  };
  target.addEventListener('beforeunload', listener);
  return () => target.removeEventListener('beforeunload', listener);
}

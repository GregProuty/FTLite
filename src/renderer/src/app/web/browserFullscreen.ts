// Fullscreen in the browser (web build spec §7.2): window.ftlite.window is absent, so the Settings toggle uses the
// Fullscreen API. The path is chosen by whether navigator.keyboard.lock(['Escape']) resolves, not by browser name. With
// the lock (Chrome, Edge) Esc reaches the game and holding Esc leaves fullscreen (the browser's rule). Without it
// (Firefox, or a failed lock) Esc leaves fullscreen first, and that exit is one Escape press if the page did not start it,
// a match is running and no Escape keydown reached the game in the last 100 ms.
// UI round §1.6: with preventF11 the page takes F11 and toggles this path, so the Settings switch follows it.
export const ESCAPE_DEDUPE_MS = 100;
/** The page's own exitFullscreen: its fullscreenchange may arrive after the promise resolves; this long counts it as ours. */
export const PAGE_EXIT_WINDOW_MS = 1000;
export interface FullscreenDocument {
  readonly fullscreenEnabled: boolean; readonly fullscreenElement: unknown;
  documentElement: { requestFullscreen(): Promise<void> }; exitFullscreen(): Promise<void>;
  addEventListener(type: 'fullscreenchange', fn: () => void): void; removeEventListener(type: 'fullscreenchange', fn: () => void): void;
}
export interface KeyboardLockApi { lock?(codes: string[]): Promise<void>; unlock?(): void }
export interface FullscreenWindow {
  addEventListener(type: 'keydown', fn: (e: { code: string; preventDefault?(): void }) => void, capture: boolean): void;
  removeEventListener(type: 'keydown', fn: (e: { code: string; preventDefault?(): void }) => void, capture: boolean): void;
  /** One Escape press for the game: keydown then keyup. */
  dispatchEscape(): void;
  /** UI round §1.6: the page takes F11 (the web build). */
  readonly preventF11?: boolean;
}
export interface BrowserFullscreenDeps { document: FullscreenDocument; keyboard: KeyboardLockApi | undefined; window: FullscreenWindow; matchRunning(): boolean; now(): number; onChange?(): void }
export interface BrowserFullscreen { readonly available: boolean; get(): Promise<boolean>; set(on: boolean): Promise<boolean>; toggle(): Promise<boolean>; dispose(): void }

export function createBrowserFullscreen(deps: BrowserFullscreenDeps): BrowserFullscreen {
  const doc = deps.document;
  let locked = false, pageExitAt = -Infinity, lastEscapeAt = -Infinity;
  const isOn = (): boolean => doc.fullscreenElement !== null && doc.fullscreenElement !== undefined;
  let api: BrowserFullscreen;
  const keydown = (e: { code: string; preventDefault?(): void }): void => {
    if (e.code === 'Escape') lastEscapeAt = deps.now();
    if (e.code === 'F11' && deps.window.preventF11) { e.preventDefault?.(); void api.toggle().catch(() => {}); }   // UI round §1.6
  };
  const change = (): void => {
    if (!isOn()) {
      const wasLocked = locked, own = deps.now() - pageExitAt <= PAGE_EXIT_WINDOW_MS;
      locked = false; pageExitAt = -Infinity;
      try { deps.keyboard?.unlock?.(); } catch { /* nothing locked */ }
      if (!wasLocked && !own && deps.matchRunning() && deps.now() - lastEscapeAt > ESCAPE_DEDUPE_MS) deps.window.dispatchEscape();
    }
    deps.onChange?.();
  };
  deps.window.addEventListener('keydown', keydown, true);
  doc.addEventListener('fullscreenchange', change);
  api = {
    available: doc.fullscreenEnabled,
    async get() { return isOn(); },
    async set(on) {
      if (on && !isOn()) {
        await doc.documentElement.requestFullscreen();
        try { if (!deps.keyboard?.lock) throw Error('no-keyboard-lock'); await deps.keyboard.lock(['Escape']); locked = isOn(); } catch { locked = false; }
      } else if (!on && isOn()) {
        pageExitAt = deps.now();
        try { await doc.exitFullscreen(); } catch { pageExitAt = -Infinity; }
      }
      return isOn();
    },
    toggle() { return api.set(!isOn()); },
    dispose() { deps.window.removeEventListener('keydown', keydown, true); doc.removeEventListener('fullscreenchange', change); }
  };
  return api;
}

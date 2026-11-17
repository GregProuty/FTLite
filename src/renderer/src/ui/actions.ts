// What the menu can do (React UI spec §2, §5): the preload calls, the router callbacks and the menu's transitions, moved
// line for line from render/sessionMenu.ts. Components only call these; each change is one store setState.
import type { OnlinePreloadApi, OnlineResult, OnlineStatus } from '../../../shared/onlineSession';
import { applyStatus, failureText, ROOM_CODE, type MenuState } from './menuState';
import type { UiStore } from './store';

export type MenuApi = Pick<OnlinePreloadApi, 'host' | 'join' | 'ready' | 'start' | 'removeSeat' | 'reconnect' | 'rehost' | 'retry' | 'leave' | 'forgetSeat'>;
export interface UiActionDeps {
  store: UiStore;
  /** The online bridge; absent when the app has none (the buttons that need it are disabled). */
  api?: MenuApi;
  single(): void; online(): void; pause(): void; home?(): void;
  setVolume?(volume: number): void;
  fullscreen?: { get(): Promise<boolean>; set(on: boolean): Promise<boolean> };
  /** performance.now(), injectable for tests. */
  perfNow?(): number;
}

export function createUiActions(deps: UiActionDeps) {
  const { store } = deps, perfNow = deps.perfNow ?? (() => performance.now());
  let disposed = false;
  const menu = (): MenuState => store.getState().menu;
  const setMenu = (patch: Partial<MenuState>): void => store.setState((s) => ({ menu: { ...s.menu, ...patch } }));
  const api = (): MenuApi => deps.api!;

  /** One preload request: `enter` moves to the session page; `interrupt` runs even while another request is pending. */
  async function invoke(run: () => Promise<OnlineResult>, enter = true, interrupt = false): Promise<void> {
    if ((menu().pending && !interrupt) || disposed) return;
    const id = menu().operation + 1;
    setMenu({ operation: id, pending: true, localError: '', ...(enter ? { page: 'session' as const } : {}) });
    if (enter) deps.online();
    try { const result = await run(); if (menu().operation === id && !result.ok) setMenu({ localError: failureText(result.code) }); }
    catch { if (menu().operation === id) setMenu({ localError: 'Online request failed. Try again.' }); }
    finally { if (menu().operation === id && !disposed) setMenu({ pending: false }); }
  }
  function readFullscreen(): void { void deps.fullscreen?.get().then((on) => { if (!disposed) setMenu({ fullscreen: on }); }, () => {}); }

  return {
    setStatus(next: OnlineStatus): void {
      const { menu: nextMenu, goHome } = applyStatus(menu(), next);
      if (goHome) deps.home?.();   // as sessionMenu did: the router goes home before the menu shows it
      store.setState((s) => ({ menu: nextMenu, online: { ...s.online, status: next, receivedAt: perfNow() } }));
    },
    single(): void { setMenu({ localError: '', page: 'single' }); deps.single(); },
    openMultiplayer(): void { setMenu({ localError: '', page: 'multiplayer' }); },
    openSettings(): void { setMenu({ localError: '', page: 'settings' }); readFullscreen(); },
    openHost(): void { setMenu({ hadView: false, page: 'host' }); },
    openJoin(): void { setMenu({ hadView: false, page: 'join' }); },
    /** Multiplayer and Settings go home; the Host and Join forms go back to Multiplayer. */
    back(): void {
      const page = menu().page;
      if (page === 'multiplayer') setMenu({ page: 'home', localError: '' });
      else if (page === 'settings') setMenu({ page: 'home' });
      else if (page === 'host' || page === 'join') setMenu({ page: 'multiplayer', localError: '' });
    },
    host(capacity: number): void { if (!menu().pending) void invoke(() => api().host(capacity)); },
    join(raw: string): void {
      if (menu().pending) return;
      const code = raw.trim().toUpperCase();
      if (!ROOM_CODE.test(code)) { setMenu({ localError: 'Enter an eight-character room code.' }); return; }
      void invoke(() => api().join(code));
    },
    ready(next: boolean): void { void invoke(() => api().ready(next)); },
    start(): void { void invoke(() => api().start()); },
    removeSeat(pid: number): void { void invoke(() => api().removeSeat(pid)); },
    reconnect(): void { void invoke(() => api().reconnect()); },
    rehost(): void { void invoke(() => api().rehost()); },
    retry(): void { void invoke(() => api().retry()); },
    /** Multiplayer's Forget saved seat: waits for any pending request, stays on the page. */
    forgetSavedSeat(): void { void invoke(() => api().forgetSeat(), false); },
    /** The session page's Forget saved seat: interrupts a pending request. */
    forgetSeatNow(): void { void invoke(() => api().forgetSeat(), false, true); },
    leave(): void {
      setMenu({ leaving: true });
      void invoke(() => api().leave(), false, true).then(() => {
        const s = store.getState();
        if (s.online.status?.phase === 'idle' && s.menu.page === 'session') { deps.home?.(); setMenu({ leaving: false, hadView: false, page: 'home' }); }
      });
    },
    tryAnotherCode(): void { setMenu({ hadView: false, page: 'join' }); },
    returnHome(): void { deps.home?.(); setMenu({ hadView: false, page: 'home', resetEpoch: menu().resetEpoch + 1 }); },
    pause(): void { deps.pause(); },
    setVolume(volume: number): void { store.setState((s) => ({ settings: { ...s.settings, volume } })); deps.setVolume?.(volume); },
    toggleFullscreen(): void {
      const on = menu().fullscreen;
      if (!deps.fullscreen || on === null) return;
      void deps.fullscreen.set(!on).then((next) => { if (!disposed) setMenu({ fullscreen: next }); }, () => {});
    },
    /** Single player has ended (M in the duel): show the main menu again. */
    leaveSingle(): void { if (menu().page === 'single') setMenu({ page: 'home' }); },
    home(): void {
      const status = store.getState().online.status;
      if (!status || status.phase === 'idle' || status.phase === 'error') { deps.home?.(); setMenu({ hadView: false, page: 'home', localError: '' }); }
    },
    /** The window resized (F11 or the Settings toggle changes fullscreen): refresh the Fullscreen label. */
    windowResized(): void { if (menu().page === 'settings') readFullscreen(); },
    setStripHeight(height: number): void {
      if (store.getState().layout.stripHeight !== height) store.setState((s) => ({ layout: { ...s.layout, stripHeight: height } }));
    },
    dispose(): void { disposed = true; }
  };
}
export type UiActions = ReturnType<typeof createUiActions>;

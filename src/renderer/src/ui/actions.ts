// What the menu can do (React UI spec §2, §5): the preload calls, the router callbacks and the menu's transitions, moved
// line for line from render/sessionMenu.ts. Components only call these; each change is one store setState.
import type { ConsoleInput } from '../app/duel/input';
import type { ContactActions } from '../app/duel/contactController';
import type { ShipCommand } from '../render/duel/shipControls';
import type { DuelCrewSize, OnlinePreloadApi, OnlineResult, OnlineStatus } from '../../../shared/onlineSession';
import { applyStatus, failureText, helmPlayerOf, isDuel, NO_PLAYTEST_RECORDS_TEXT, PLAYTEST_LOG_FAILED_TEXT, ROOM_CODE, type MenuState } from './menuState';
import type { UiStore } from './store';
import type { VolumeChannel } from '../app/settingsStore';

export type MenuApi = Pick<OnlinePreloadApi, 'host' | 'join' | 'ready' | 'start' | 'removeSeat' | 'reconnect' | 'rehost' | 'retry' | 'leave' | 'forgetSeat'>;
export interface UiActionDeps {
  store: UiStore;
  /** The online bridge; absent when the app has none (the buttons that need it are disabled). */
  api?: MenuApi;
  single(ship?: string): void; online(): void; pause(): void; home?(): void;
  /** Valkyrn spec §8: the laser-fit switch changed (main saves it). */
  setLaserFit?(on: boolean): void;
  /** Quit the app (owner 2026-11-17: Quit on the main menu): closes the window, as its close button does. */
  quit?(): void;
  /** Web build spec §5.4: the update banner's reload (location.reload in the page). */
  reload?(): void;
  /** Web build spec §7.4: save the browser's playtest log; the saved file's name, or null when there are no records. */
  downloadPlaytestLog?(): Promise<string | null>;
  setVolume?(channel: VolumeChannel, volume: number): void;
  /** Feel-i: the screen shake setting changed (main saves it and hands it to the renderer). */
  setShake?(shake: import('../render/shake').ShakeSetting): void;
  /** The map grid setting changed (main saves it and hands it to the renderer). */
  setMapGrid?(grid: import('../render/tactical/mapGrid').MapGridSetting): void;
  /** Helm round 2 §6.3: the throttle tap time changed (main saves it; the keyboards read it live). */
  setThrottleTap?(ms: number): void;
  /** UI round §1.7: the FPS counter setting changed (main saves it). */
  setFpsCounter?(on: boolean): void;
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

  // The console's clicks (Artemis spec §6.2) go to the duel mode's keyboard while one is set; a no-op otherwise.
  let consoleInput: ConsoleInput | null = null;
  const consoleActions: ConsoleInput = {
    press: (action) => consoleInput?.press(action),
    hold: (code, on) => consoleInput?.hold(code, on),
    lock: (room) => consoleInput?.lock(room),
    torpLock: (room) => consoleInput?.torpLock(room),
    rockLock: (weapon, rock) => consoleInput?.rockLock?.(weapon, rock),
    throttle: (level) => consoleInput?.throttle(level),
    frequency: (freq) => consoleInput?.frequency(freq),
    ship: (command) => consoleInput?.ship?.(command),
    weaponPower: (slot, delta) => consoleInput?.weaponPower?.(slot, delta),
    select: (slot) => consoleInput?.select?.(slot),   // W-4 spec §10: a card click selects
    mode: (slot) => consoleInput?.mode?.(slot)   // W-4 amendment §2.5: a tag click
  };
  // Engineering spike §6: the ship view's HUD clicks, through the same console slot (the duel keyboard queues them).
  const send = (command: ShipCommand): void => consoleInput?.ship?.(command);
  const shipActions = {
    power: (system: number, delta: 1 | -1): void => send({ kind: 'shipPower', system, delta }),
    coolant: (system: number): void => send({ kind: 'shipCoolant', system }),
    door: (edge: number): void => send({ kind: 'shipDoor', edge }),
    airlock: (index: number): void => send({ kind: 'shipAirlock', index })
  };

  // The contact window's clicks (enemy ship window spec §6.6) go to the duel mode's contact controller while one is set;
  // a pick locks through the console input, the same path as the WEAP/SHLD/ENG buttons. SCAN asks the controller for a scan
  // request (Sci-1 spec §7.2). FTL targeting spec §1: a Weapons card picks a weapon up, and a pick sets the target of the
  // weapon picked up (the laser through lock, the torpedo through torpLock). A no-op otherwise.
  let contactInput: ContactActions | null = null;
  const contactActions = {
    close: (): void => contactInput?.close(),
    arm: (): void => contactInput?.arm(),
    cancelAim: (): void => contactInput?.cancelAim(),
    pick: (room: number): void => contactInput?.pick(room, (r, weapon) => (weapon === 'torpedo' ? consoleActions.torpLock(r) : consoleActions.lock(r))),
    scan: (): void => contactInput?.scan(),
    pickUp: (weapon: 'laser' | 'torpedo'): void => contactInput?.pickUp(weapon)
  };

  return {
    console: consoleActions,
    contact: contactActions,
    ship: shipActions,
    setConsole(input: ConsoleInput | null): void { consoleInput = input; },
    setContact(controller: ContactActions | null): void { contactInput = controller; },
    setStatus(next: OnlineStatus): void {
      const { menu: nextMenu, goHome } = applyStatus(menu(), next);
      if (goHome) deps.home?.();   // as sessionMenu did: the router goes home before the menu shows it
      store.setState((s) => ({ menu: nextMenu, online: { ...s.online, status: next, receivedAt: perfNow() } }));
    },
    /** Valkyrn spec §9: Home's Single player opens the ship choice. */
    openShips(): void { setMenu({ localError: '', page: 'ship' }); },
    /** Start Single player on `ship` (a picker button, remembered), or on the remembered choice. */
    single(ship?: string): void {
      if (ship !== undefined) store.setState((s) => ({ settings: { ...s.settings, soloShip: ship } }));
      setMenu({ localError: '', page: 'single' }); deps.single(ship);
    },
    setFpsCounter(on: boolean): void { store.setState((s) => ({ settings: { ...s.settings, fpsCounter: on } })); deps.setFpsCounter?.(on); },
    setLaserFit(on: boolean): void { store.setState((s) => ({ settings: { ...s.settings, valkyrnLaserFit: on } })); deps.setLaserFit?.(on); },
    openMultiplayer(): void { setMenu({ localError: '', page: 'multiplayer' }); },
    quit(): void { deps.quit?.(); },
    /** Web build spec §5.4: version.json names another build (the version watch); shown by the menu outside a match. */
    updateAvailable(): void { if (!store.getState().browser.update) store.setState((s) => ({ browser: { ...s.browser, update: true } })); },
    reload(): void { deps.reload?.(); },
    /** Settings' Download playtest log (web build spec §7.4): says what was saved, or that there is nothing yet. */
    downloadPlaytestLog(): void {
      const run = deps.downloadPlaytestLog; if (!run) return;
      const say = (text: string): void => { if (!disposed) store.setState((s) => ({ browser: { ...s.browser, playtestLogText: text } })); };
      void run().then((name) => say(name ? `Saved ${name}.` : NO_PLAYTEST_RECORDS_TEXT), () => say(PLAYTEST_LOG_FAILED_TEXT));
    },
    openSettings(): void { setMenu({ localError: '', page: 'settings' }); readFullscreen(); },
    openHost(): void { setMenu({ hadView: false, page: 'host' }); },
    openJoin(): void { setMenu({ hadView: false, page: 'join' }); },
    /** Multiplayer and Settings go home; the Host and Join forms go back to Multiplayer. */
    back(): void {
      const page = menu().page;
      if (page === 'multiplayer') setMenu({ page: 'home', localError: '' });
      else if (page === 'settings') setMenu({ page: 'home' });
      else if (page === 'ship') setMenu({ page: 'home' });   // Valkyrn spec §9: the ship choice's Back
      else if (page === 'host' || page === 'join') setMenu({ page: 'multiplayer', localError: '' });
    },
    /** The host form's crew choice (Sci-2 spec §5.3). */
    setCrew(crew: DuelCrewSize): void { setMenu({ crew }); },
    /** Multiplayer is the duel (H-2 spec §2): Host creates a duel room for `crew` players, the menu's choice by default (Sci-2 spec §4.5). */
    host(crew: DuelCrewSize = menu().crew): void { if (!menu().pending) void invoke(() => api().host({ mode: 'duel', capacity: crew })); },
    join(raw: string): void {
      if (menu().pending) return;
      const code = raw.trim().toUpperCase();
      if (!ROOM_CODE.test(code)) { setMenu({ localError: 'Enter an eight-character room code.' }); return; }
      void invoke(() => api().join(code));
    },
    ready(next: boolean): void { void invoke(() => api().ready(next)); },
    /** Start: a duel room carries the Helm player (the host's seat, helmPlayerOf); any other room starts as before. */
    start(): void {
      const status = store.getState().online.status;
      if (status && isDuel(status)) { const helmPlayer = helmPlayerOf(status); void invoke(() => api().start(helmPlayer)); }
      else void invoke(() => api().start());
    },
    removeSeat(pid: number): void { void invoke(() => api().removeSeat(pid)); },
    reconnect(): void { void invoke(() => api().reconnect()); },
    rehost(): void { void invoke(() => api().rehost()); },
    retry(): void { void invoke(() => api().retry()); },
    /** Multiplayer's Forget saved seat: waits for any pending request, stays on the page. */
    forgetSavedSeat(): void { void invoke(() => api().forgetSeat(), false); },
    /** The session page's Forget saved seat: interrupts a pending request. */
    forgetSeatNow(): void { void invoke(() => api().forgetSeat(), false, true); },
    /** Net-3d's Leave: the Leave button, and the online duel's confirmed Escape on its end card (H-2 spec §7, deps.leave).
     *  Runs only while the status offers Leave and the app has an online bridge, as the button is shown and enabled. */
    leave(): void {
      if (!deps.api || !store.getState().online.status?.actions.includes('leave')) return;
      setMenu({ leaving: true });
      void invoke(() => api().leave(), false, true).then(() => {
        const s = store.getState();
        if (s.online.status?.phase === 'idle' && s.menu.page === 'session') { deps.home?.(); setMenu({ leaving: false, hadView: false, page: 'home' }); }
      });
    },
    tryAnotherCode(): void { setMenu({ hadView: false, page: 'join' }); },
    returnHome(): void { deps.home?.(); setMenu({ hadView: false, page: 'home', resetEpoch: menu().resetEpoch + 1 }); },
    pause(): void { deps.pause(); },
    setVolume(channel: VolumeChannel, volume: number): void { store.setState((s) => ({ settings: { ...s.settings, [channel]: volume } })); deps.setVolume?.(channel, volume); },
    setShake(shake: import('../render/shake').ShakeSetting): void { store.setState((s) => ({ settings: { ...s.settings, shake } })); deps.setShake?.(shake); },
    setMapGrid(mapGrid: import('../render/tactical/mapGrid').MapGridSetting): void { store.setState((s) => ({ settings: { ...s.settings, mapGrid } })); deps.setMapGrid?.(mapGrid); },
    setThrottleTap(throttleTapMs: number): void { store.setState((s) => ({ settings: { ...s.settings, throttleTapMs } })); deps.setThrottleTap?.(throttleTapMs); },   // helm round 2 §6.3
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

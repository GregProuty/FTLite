import cutter from './sim/ship/cutter.json';
import hound from './sim/ship/hound.json';
import skiff from './sim/ship/skiff.json';
import { parseShip } from './sim/ship/schema';
import { isSoloShipId, SOLO_SHIPS, soloShip } from './sim/ship/fleet';
import { classIndexById } from './sim/tactical/defs';
import { loadAssets, loadBytes } from './render/assets';
import { createRenderer } from './render/renderer';
import { createKeyboardSources } from './input/sources';
import { createAudio } from './app/audio';
import { createSectorAudio } from './app/sectorAudio';
import { loadSettings, saveSettings } from './app/settingsStore';
import { controlSections } from './app/controlsList';
import { DEFAULT_SEED, readMode, readSeed } from './app/duel/mode';
import { startFlightMode } from './app/duel/flightMode';
import { startDuelMode } from './app/duel/duelMode';
import { createOnlineBridge } from './app/onlineBridge';
import { createPageOnline } from './app/online/pageSession';
import { watchHostVisibility } from './app/online/hostVisibility';
import { versionPollActive, watchVersion } from './app/web/versionWatch';
import { inMatch, installPageGuards } from './app/web/pageGuards';
import { createBrowserFullscreen, type KeyboardLockApi } from './app/web/browserFullscreen';
import { checkBrowserSupport, ONE_TAB_TEXT, SAFARI_NOTE, UNSUPPORTED_TEXT, type SupportGlobals } from './app/web/browserSupport';
import { acquireOnlineLock, type OnlineLock } from './app/web/onlineLock';
import { installAudioUnlock } from './app/audioUnlock';
import { createIndexedDbDuelRecordStore } from './app/web/duelRecordStore';
import { downloadText } from './app/web/download';
import { installLeavePrompt, leaveWanted } from './app/web/leavePrompt';
import type { DuelPlaytestRecord } from './net/duelRecord';
import { validatePageOnlineConfig } from '../../shared/onlineConfig';
import { createOnlineRendererSession } from './app/onlineSession';
import { createOnlineModeSession } from './app/onlineModeSession';
import { createOnlineDuelSession } from './app/duel/onlineDuel';
import { createSessionRouter } from './app/sessionRouter';
import { createUiStore, setCrtSetting, setLayout, type UiStore } from './ui/store';
import { createDuelSink, createFlightSink, createHudSink, createLatencySink } from './ui/sinks';
import { buildImageCache, hudImageNames } from './ui/images';
import { createPixiImageSource } from './app/uiImages';
import { ICON_KINDS } from './render/roomIconModel';
import { computeLetterbox } from './render/letterbox';
import { createUiActions } from './ui/actions';
import { inputBlockedOf } from './ui/menuState';
import { mountUi } from './ui/mount';
import { createUiPerf } from './ui/perf';
import { installFeel } from './app/feelBoot';
import { installCrew3d } from './app/crew3dBoot';
import { installCrt } from './app/crtBoot';
import type { Renderer } from './render/renderer';
import type { OnlineStatus } from '../../shared/onlineSession';
import { INTERNAL_H, INTERNAL_W } from '../../shared/resolution';

/** The dev UI budget counter (?uiperf=1): shared by the app and both dev views' sinks. */
const perf = createUiPerf(new URLSearchParams(location.search).get('uiperf') === '1');

declare global { interface Window { ftlite?: import('../../shared/onlineSession').FtlitePreloadApi } }

/** Startup failures (invalid ship, invalid manifest, missing required asset) stop here with the message on screen (spec §7, parent §9). */
function showFatal(err: unknown): void {
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#f88;background:#000;margin:0;padding:16px;font:14px monospace;white-space:pre-wrap';
  pre.textContent = `FTLite cannot start.

${err instanceof Error ? err.message : String(err)}`;
  document.body.replaceChildren(pre);
}

/** The feel setting (Art-i spec section 7): read once at boot inside a try/catch (loadFeel), F9 cycles it in dev builds. */
function bootFeel(renderer: Renderer): void {
  installFeel(renderer, { storage: () => localStorage, keys: window, dev: import.meta.env.DEV, log: (m) => console.info(m) });
  installCrew3d(renderer, { storage: () => localStorage, keys: window, dev: import.meta.env.DEV, log: (m) => console.info(m) });   // Crew3D spec section 4: F8 in dev
}

/** The CRT setting (CRT map spec section 4): read once at boot (loadCrt), F10 cycles it in dev builds; it reaches the
 *  console views' Pixi filter through the renderer and the CRT overlay through the store. */
function bootCrt(renderer: Renderer, store: UiStore): void {
  installCrt({ crt: renderer.crt, setCrt(s) { renderer.setCrt(s); setCrtSetting(store, s); } }, { storage: () => localStorage, keys: window, dev: import.meta.env.DEV, log: (m) => console.info(m) });
}

/** The app (main menu spec, 2026-11-16; React UI spec UI-i): the menu with Single player (the solo duel), Multiplayer
 *  (today's online flow) and Settings, drawn by React over one UI store. One renderer serves both modes; the router
 *  owns at most one of them at a time. */
async function startApp(): Promise<void> {
  const ships = { cutter: parseShip(cutter), skiff: parseShip(skiff), hound: parseShip(hound) };   // throws with a clear message on invalid ship data (spec §9)
  const soloLayouts = new Map(SOLO_SHIPS.map((s) => [s.id as string, parseShip(s.layout)]));   // Valkyrn spec §9: throws on invalid ship data
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  bootFeel(renderer);
  const images = buildImageCache(hudImageNames(assets.missing), ICON_KINDS, createPixiImageSource(renderer, assets));
  const keyboard = createKeyboardSources(window);
  const audio = createAudio();
  void audio.load(assets.sounds ?? [], loadBytes);   // Audio-i spec section 2: in the background; the synth tones play until it lands
  let settings = (() => { try { return loadSettings(localStorage); } catch { return loadSettings({ getItem: () => null, setItem() {} }); } })();
  audio.setVolumes(settings);
  renderer.setShake?.(settings.shake);   // Feel-i: the console maps' screen shake
  renderer.setMapGrid?.(settings.mapGrid);   // the console maps' grid (gravity or square)
  const scheduler = { schedule(delay: number, cb: () => void) { const timer = window.setTimeout(cb, delay); return () => window.clearTimeout(timer); } };
  // The online session runs in this page (web build spec §3.3): Electron's preload hands it main's resolved config, and
  // the web build bakes its own in (§5.1). A browser must have the online APIs (§7.7), and only the tab holding the
  // ftlite-online lock runs the session (§7.5).
  const web = !window.ftlite;
  const support = web ? checkBrowserSupport(globalThis as unknown as SupportGlobals) : null;
  const configured = window.ftlite ? window.ftlite.onlineConfig : support?.ok ? __FTLITE_WEB_CONFIG__ : null;
  const lock: OnlineLock = web && configured ? await acquireOnlineLock(navigator.locks) : { state: 'unavailable' };
  const onlineConfig = configured && (!web || lock.state === 'held') ? configured : null;
  const pageOnline = onlineConfig && validatePageOnlineConfig(onlineConfig)
    ? createPageOnline(onlineConfig, { window, persistStorage: web ? () => navigator.storage?.persist?.() : undefined }) : null;
  // A lock manager that fails or never answers (review R1-F2, R1-F6) leaves online off with the unsupported text, not
  // the "configured local service" one.
  const browserInit = web ? { web: true, unsupported: support?.ok ? null : UNSUPPORTED_TEXT, note: support?.safari ? SAFARI_NOTE : null,
    onlineBlocked: lock.state === 'busy' ? ONE_TAB_TEXT : lock.state === 'unavailable' && configured ? UNSUPPORTED_TEXT : null, playtestLog: true } : undefined;
  // Web build spec §7.4: the browser keeps duel records in IndexedDB; Electron still writes them to disk through main.
  const duelRecords = web ? createIndexedDbDuelRecordStore() : null;
  const recordDuel = (record: DuelPlaytestRecord): Promise<boolean> | undefined => window.ftlite?.recordDuel ? window.ftlite.recordDuel(record) : duelRecords?.append(record);
  const bridge = pageOnline ? createOnlineBridge(pageOnline) : null;
  const offVisibility = bridge && !window.ftlite ? watchHostVisibility({ document, onStatus: cb => bridge.onStatus(cb) }) : undefined;   // Electron does not throttle its page, so the warning is browser-only
  const offPrepareExit = window.ftlite?.onPrepareExit?.(() => pageOnline ? pageOnline.prepareExit() : Promise.resolve());
  let online: ReturnType<typeof createOnlineModeSession> | null = null, status: OnlineStatus | null = null;
  let blocked = true;
  const win = window.ftlite?.window;
  // Web build spec §7.2: no preload window API in the browser, so the Fullscreen API with the keyboard-lock rule.
  const pageFullscreen = window.ftlite ? null : createBrowserFullscreen({ document,
    keyboard: (navigator as Navigator & { keyboard?: KeyboardLockApi }).keyboard,
    window: { addEventListener: (type, fn, capture) => window.addEventListener(type, fn as (e: KeyboardEvent) => void, capture),
      removeEventListener: (type, fn, capture) => window.removeEventListener(type, fn as (e: KeyboardEvent) => void, capture),
      dispatchEscape: () => { for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { code: 'Escape', key: 'Escape', bubbles: true })); } },
    matchRunning: () => inMatch(store.getState().menu), now: () => performance.now(), onChange: () => actions.windowResized() });
  const store = createUiStore({ onlineAvailable: !!bridge, browser: browserInit, settings: { master: settings.master, music: settings.music, effects: settings.effects, shake: settings.shake, mapGrid: settings.mapGrid, throttleTapMs: settings.throttleTapMs, fullscreenAvailable: !!win || !!pageFullscreen?.available, controls: controlSections(),
    ships: SOLO_SHIPS.map(({ id, name, line }) => ({ id, name, line })), soloShip: settings.soloShip, valkyrnLaserFit: settings.valkyrnLaserFit } });   // Valkyrn spec §9
  bootCrt(renderer, store);
  const offGuards = installPageGuards(window, () => inMatch(store.getState().menu));   // web build spec §7.1 (harmless in Electron)
  const hud = createHudSink(store, perf), duelSink = createDuelSink(store, perf), latencySink = createLatencySink(store, perf);
  const session = createSessionRouter({ resetInput: keyboard.reset,
    single: () => {
      const pick = soloShip(settings.soloShip), layout = soloLayouts.get(pick.id)!;   // Valkyrn spec §9: the picked ship
      const cls = settings.valkyrnLaserFit && pick.laserFit !== null ? classIndexById(pick.laserFit) : undefined;   // §8: the developer laser fit
      const dispose = startDuelMode({ renderer, seed: DEFAULT_SEED, layout, cls, lifecycle: window.ftlite, ui: duelSink, audio,   // Audio-i: Single player was silent
        onExit: () => { session.home(); actions.leaveSingle(); }, recordDuel, setConsole: (input) => actions.setConsole(input),
        setContact: (contact) => actions.setContact(contact), throttleTapMs: () => settings.throttleTapMs });
      return { frame() { /* the duel runs on its own ticker callback */ }, dispose };
    },
    // Multiplayer (H-2 spec §3): the wrapper builds the duel's or the sector's session when the first port arrives.
    online: () => {
      const resolveLayout = (id: string) => { const layout = Object.values(ships).find(ship => ship.id === id); if (!layout) throw Error('unknown-layout'); return layout; };
      online = createOnlineModeSession({
        duel: () => createOnlineDuelSession({ renderer, ui: duelSink, latency: latencySink, now: () => performance.now(), scheduler, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout, api: bridge!,
          leave: () => actions.leave(), audio, recordDuel, setConsole: (input) => actions.setConsole(input),
          setContact: (contact) => actions.setContact(contact), throttleTapMs: () => settings.throttleTapMs }),   // Audio-i: local duel sounds; the replicated cues would play twice
        sector: () => createOnlineRendererSession({ sampleDevices: keyboard.sample, resetInput: keyboard.reset, renderer, hud, now: () => performance.now(), scheduler,
          resolveLayout, api: bridge!, playCue: audio.play, sound: createSectorAudio(audio) })
      });
      if (status) online.setStatus(status); online.setInputBlocked(blocked); return online;
    }
  });
  // The actual transferred endpoint has exactly one owner before any menu action can dispatch.
  const offPort = bridge?.onPort((descriptor, port) => {
    if (session.mode !== 'online') { port.close(); return; }
    session.selectOnline().attach(descriptor, port);
  });
  const actions = createUiActions({ store, api: bridge ?? undefined,
    single(ship) {
      if (isSoloShipId(ship) && ship !== settings.soloShip) { settings = { ...settings, soloShip: ship }; try { saveSettings(localStorage, settings); } catch { /* storage denied */ } }
      online = null; session.selectSingle();
    },
    online() { session.selectOnline(); },
    setLaserFit(on) { settings = { ...settings, valkyrnLaserFit: on }; try { saveSettings(localStorage, settings); } catch { /* storage denied */ } },
    home() { session.home(); online = null; }, pause() { online?.pause(); },
    setVolume(channel, volume) { settings = { ...settings, [channel]: volume }; audio.setVolumes(settings); try { saveSettings(localStorage, settings); } catch { /* storage denied */ } },
    setShake(shake) { settings = { ...settings, shake }; renderer.setShake?.(shake); try { saveSettings(localStorage, settings); } catch { /* storage denied */ } },
    setMapGrid(mapGrid) { settings = { ...settings, mapGrid }; renderer.setMapGrid?.(mapGrid); try { saveSettings(localStorage, settings); } catch { /* storage denied */ } },
    setThrottleTap(throttleTapMs) { settings = { ...settings, throttleTapMs }; try { saveSettings(localStorage, settings); } catch { /* storage denied */ } },   // helm round 2 §6.3: the keyboards read it live
    fullscreen: win ? { get: () => win.isFullScreen(), set: (on) => win.setFullScreen(on) }
      : pageFullscreen ? { get: () => pageFullscreen.get(), set: (on) => pageFullscreen.set(on) } : undefined,
    reload() { location.reload(); },   // web build spec §5.4: the update banner
    downloadPlaytestLog: duelRecords ? async () => { const log = await duelRecords.exportLog(); if (!log) return null; downloadText(document, URL, log.name, log.text); return log.name; } : undefined,
    quit() { window.close(); }   // the main window's close: main quits the app on window-all-closed, as the close button does
  });
  // Online input is blocked everywhere but a viewed session (React UI spec §2), applied when the derived value changes.
  const setBlocked = (value: boolean): void => { if (blocked !== value) keyboard.reset(); blocked = value; online?.setInputBlocked(value); };
  setBlocked(inputBlockedOf(store.getState()));
  const offBlocked = store.subscribe((s) => { const value = inputBlockedOf(s); if (value !== blocked) setBlocked(value); });
  const offStatus = bridge?.onStatus(next => { status = next; online?.setStatus(next); actions.setStatus(next); });
  // Web build spec §5.4: version.json at start and every 5 minutes on the menu or in a lobby (the browser only).
  const offVersion = window.ftlite ? undefined : watchVersion({ fetch: (url, init) => fetch(url, init),
    local: { build: __FTLITE_BUILD__, sim: __FTLITE_BUILD__.sim, digest: __GAMEPLAY_CONTENT_DIGEST__ },
    active: () => versionPollActive(store.getState()), onUpdate: () => actions.updateAvailable(),
    setInterval: (cb, ms) => window.setInterval(cb, ms), clearInterval: handle => window.clearInterval(handle as number) });
  if (document.hidden || !document.hasFocus()) session.pause();
  // The session strip's height (written by the menu while it is the strip, 0 otherwise) moves the canvas down.
  const resize = (): void => {
    const top = store.getState().layout.stripHeight;
    renderer.app.canvas.style.cssText = `position:fixed;left:0;top:${top}px;display:block`;
    renderer.resize(window.innerWidth, Math.max(1, window.innerHeight - top));
    const lb = computeLetterbox(window.innerWidth, Math.max(1, window.innerHeight - top), INTERNAL_W, INTERNAL_H);
    setLayout(store, { scale: lb.scale, offsetX: lb.offsetX, offsetY: lb.offsetY, dpr: window.devicePixelRatio || 1 });
  };
  let strip = store.getState().layout.stripHeight;
  const offStrip = store.subscribe((s) => { if (s.layout.stripHeight !== strip) { strip = s.layout.stripHeight; resize(); } });
  window.addEventListener('resize', resize); resize();
  window.addEventListener('resize', () => actions.windowResized());   // F11 fullscreen changes keep the Settings label true
  const uiRoot = document.createElement('div'); uiRoot.id = 'ui'; document.body.append(uiRoot);
  const unmountUi = await mountUi({ el: uiRoot, store, actions, images });
  const offAudio = installAudioUnlock(window, audio);   // web build spec §7.3: the first gesture (and every focus) resumes a suspended AudioContext
  const offLeave = web ? installLeavePrompt(window, () => leaveWanted(store.getState())) : undefined;   // web build spec §7.6
  window.addEventListener('blur', () => session.pause());
  document.addEventListener('visibilitychange', () => {   // Audio-i spec section 5: a hidden window is paused and silent
    if (document.hidden) { session.pause(); audio.suspend(); }
    else { audio.unlock(); if (document.hasFocus()) session.resume(); }
  });
  window.addEventListener('focus', () => session.resume());
  renderer.app.ticker.add(() => session.frame());
  renderer.app.ticker.add(() => audio.tick(performance.now() / 1000));   // Audio-i spec section 5: the music, the hum and the fire loop
  // Teardown when the page is really going (web build spec §7.6): not on beforeunload, where a "Stay" answer to the leave
  // prompt would keep a dead game; a back-forward-cache pagehide only suspends (the page session handles it).
  let tornDown = false;
  window.addEventListener('pagehide', (event) => {
    if (event.persisted || tornDown) return;
    tornDown = true;
    offLeave?.(); offVersion?.(); offGuards(); pageFullscreen?.dispose(); offAudio();
    offPrepareExit?.(); offVisibility?.(); offPort?.(); offStatus?.(); offStrip(); setBlocked(true); offBlocked(); actions.dispose(); unmountUi();
    session.dispose(); bridge?.dispose(); keyboard.destroy();
    if (lock.state === 'held') lock.release();   // review R1-F2: hand ftlite-online on at once, so a reload gets it
  });
}

/** The dev flight view (H-1 spec §9): the renderer and its letterbox, but no sector session. */
async function startFlight(seed: number): Promise<void> {
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  bootFeel(renderer);
  const store = createUiStore({ onlineAvailable: false });
  bootCrt(renderer, store);
  const actions = createUiActions({ store, single() {}, online() {}, pause() {} });
  const uiRoot = document.createElement('div'); uiRoot.id = 'ui'; document.body.append(uiRoot);
  await mountUi({ el: uiRoot, store, actions, menu: false });
  const resize = (): void => {
    renderer.resize(window.innerWidth, window.innerHeight);
    const lb = computeLetterbox(window.innerWidth, window.innerHeight, INTERNAL_W, INTERNAL_H);
    setLayout(store, { scale: lb.scale, offsetX: lb.offsetX, offsetY: lb.offsetY, dpr: window.devicePixelRatio || 1 });
  };
  window.addEventListener('resize', resize); resize();
  startFlightMode({ renderer, seed, ui: createFlightSink(store, perf), lifecycle: window.ftlite });
}

/** The solo duel (H-1 spec §4, §11a): the renderer and its letterbox, the Hound, but no sector session. */
async function startDuel(seed: number): Promise<void> {
  const layout = parseShip(hound);   // throws with a clear message on invalid ship data (spec §9)
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  bootFeel(renderer);
  const store = createUiStore({ onlineAvailable: false });
  bootCrt(renderer, store);
  const actions = createUiActions({ store, single() {}, online() {}, pause() {} });
  const uiRoot = document.createElement('div'); uiRoot.id = 'ui'; document.body.append(uiRoot);
  await mountUi({ el: uiRoot, store, actions, menu: false });
  const resize = (): void => {
    renderer.resize(window.innerWidth, window.innerHeight);
    const lb = computeLetterbox(window.innerWidth, window.innerHeight, INTERNAL_W, INTERNAL_H);
    setLayout(store, { scale: lb.scale, offsetX: lb.offsetX, offsetY: lb.offsetY, dpr: window.devicePixelRatio || 1 });
  };
  window.addEventListener('resize', resize); resize();
  startDuelMode({ renderer, seed, layout, ui: createDuelSink(store, perf), lifecycle: window.ftlite, setConsole: (input) => actions.setConsole(input), setContact: (contact) => actions.setContact(contact) });
}

/** The text-parity probe (UI-ii Task 5): Pixi text on the left half, React text on the right, for the pixel comparison. */
async function startProbe(): Promise<void> {
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  const store = createUiStore({ onlineAvailable: false });
  const actions = createUiActions({ store, single() {}, online() {}, pause() {} });
  const uiRoot = document.createElement('div'); uiRoot.id = 'ui'; document.body.append(uiRoot);
  const { mountProbe } = await import('./ui/probe/mountProbe');
  const { startUiProbe, duelProbeFixture } = await import('./app/uiProbe');
  const q = new URLSearchParams(location.search), duelProbe = q.get('probe') === 'duel', hudProbe = q.get('probe') === 'hud';
  const reactHud = hudProbe;   // the Pixi engine arm is gone (UI-iii Task 5): probe=hud is the React HUD
  const images = reactHud ? buildImageCache(hudImageNames(assets.missing), ICON_KINDS, createPixiImageSource(renderer, assets)) : undefined;
  if (duelProbe || reactHud) await mountUi({ el: uiRoot, store, actions, menu: false, images }); else if (!hudProbe) await mountProbe({ el: uiRoot, store, actions });
  const resize = (): void => {
    renderer.resize(window.innerWidth, window.innerHeight);
    const lb = computeLetterbox(window.innerWidth, window.innerHeight, INTERNAL_W, INTERNAL_H);
    setLayout(store, { scale: lb.scale, offsetX: lb.offsetX, offsetY: lb.offsetY, dpr: window.devicePixelRatio || 1 });
  };
  window.addEventListener('resize', resize); resize();
  startUiProbe(renderer, !duelProbe && !hudProbe);
  if (duelProbe) createDuelSink(store).frame(duelProbeFixture(q.get('console') === 'helm' || q.get('console') === 'weapons' ? (q.get('console') as 'helm' | 'weapons') : undefined));
  if (hudProbe) {   // UI-iii: a fixture HUD model drawn by the React HUD (dynamic imports, the probe only)
    const { HUD_FIXTURES } = await import('./app/hudFixtures');
    const raw = q.get('fixture') ?? '0', idx = Number(raw);
    const valid = Number.isInteger(idx) && idx >= 0 && idx < HUD_FIXTURES.length;
    if (!valid) console.error(`[probe=hud] fixture "${raw}" is not valid; expected an integer from 0 to ${HUD_FIXTURES.length - 1}. Using fixture 0.`);
    const model = HUD_FIXTURES[valid ? idx : 0]!();
    if (reactHud) {
      const sink = createHudSink(store, perf);
      sink.update(model);
      if (q.get('uiperf') === '1') {   // every animation frame for 60 s is a real change (tick, simSeconds, player 0's health and progress), as in a running sector
        const { replaceEqualDeep } = await import('./ui/share');
        const next = (i: number): typeof model => ({ ...model, tick: model.tick + i, simSeconds: model.simSeconds + i, players: model.players.map((pl, k) => (k === 0 ? { ...pl, health: (i % 100) / 100, progress: (i % 50) / 50 } : pl)) });
        const t0 = performance.now(); let i = 0;
        const step = (): void => {
          if (performance.now() - t0 > 60000) { const cands = Array.from({ length: 1000 }, (_, r) => next(r + 1)), t = performance.now(); for (const cand of cands) replaceEqualDeep(model, cand); const each = (performance.now() - t) / 1000; console.info(`[uiperf-done] frames ${i} sharing mean ${each.toFixed(4)} ms per replaceEqualDeep (1000 runs, timed as one batch because performance.now() is coarse)`); return; }
          sink.update(next(++i)); requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }
  }
}

/** One mode per launch (H-1 spec §3): the dev views `?mode=flight` and `?mode=duel`, or the app with its main menu. */
function start(): Promise<void> {
  const mode = readMode(location.search);
  if (mode === 'uiprobe') return startProbe();
  return mode === 'flight' ? startFlight(readSeed(location.search)) : mode === 'duel' ? startDuel(readSeed(location.search)) : startApp();
}
start().catch(showFatal);

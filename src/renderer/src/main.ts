import cutter from './sim/ship/cutter.json';
import hound from './sim/ship/hound.json';
import skiff from './sim/ship/skiff.json';
import { parseShip } from './sim/ship/schema';
import { loadAssets } from './render/assets';
import { createRenderer } from './render/renderer';
import { createKeyboardSources } from './input/sources';
import { createAudio } from './app/audio';
import { loadSettings, saveSettings } from './app/settingsStore';
import { controlSections } from './app/controlsList';
import { DEFAULT_SEED, readMode, readSeed } from './app/duel/mode';
import { startFlightMode } from './app/duel/flightMode';
import { startDuelMode } from './app/duel/duelMode';
import { createOnlineBridge } from './app/onlineBridge';
import { createOnlineRendererSession } from './app/onlineSession';
import { createOnlineModeSession } from './app/onlineModeSession';
import { createOnlineDuelSession } from './app/duel/onlineDuel';
import { createSessionRouter } from './app/sessionRouter';
import { createUiStore, setLayout } from './ui/store';
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
}

/** The app (main menu spec, 2026-11-16; React UI spec UI-i): the menu with Single player (the solo duel), Multiplayer
 *  (today's online flow) and Settings, drawn by React over one UI store. One renderer serves both modes; the router
 *  owns at most one of them at a time. */
async function startApp(): Promise<void> {
  const ships = { cutter: parseShip(cutter), skiff: parseShip(skiff), hound: parseShip(hound) };   // throws with a clear message on invalid ship data (spec §9)
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  bootFeel(renderer);
  const images = await buildImageCache(hudImageNames(assets.missing), ICON_KINDS, createPixiImageSource(renderer, assets));
  const keyboard = createKeyboardSources(window);
  const audio = createAudio();
  let settings = (() => { try { return loadSettings(localStorage); } catch { return loadSettings({ getItem: () => null, setItem() {} }); } })();
  audio.setVolume(settings.volume);
  const scheduler = { schedule(delay: number, cb: () => void) { const timer = window.setTimeout(cb, delay); return () => window.clearTimeout(timer); } };
  const bridge = window.ftlite?.online ? createOnlineBridge(window, window.ftlite.online) : null;
  let online: ReturnType<typeof createOnlineModeSession> | null = null, status: OnlineStatus | null = null;
  let blocked = true;
  const win = window.ftlite?.window;
  const store = createUiStore({ onlineAvailable: !!bridge, settings: { volume: settings.volume, fullscreenAvailable: !!win, controls: controlSections() } });
  const hud = createHudSink(store, perf), duelSink = createDuelSink(store, perf), latencySink = createLatencySink(store, perf);
  const session = createSessionRouter({ resetInput: keyboard.reset,
    single: () => {
      const dispose = startDuelMode({ renderer, seed: DEFAULT_SEED, layout: ships.hound, lifecycle: window.ftlite, ui: duelSink,
        onExit: () => { session.home(); actions.leaveSingle(); }, recordDuel: record => window.ftlite?.recordDuel?.(record) });
      return { frame() { /* the duel runs on its own ticker callback */ }, dispose };
    },
    // Multiplayer (H-2 spec §3): the wrapper builds the duel's or the sector's session when the first port arrives.
    online: () => {
      const resolveLayout = (id: string) => { const layout = Object.values(ships).find(ship => ship.id === id); if (!layout) throw Error('unknown-layout'); return layout; };
      online = createOnlineModeSession({
        duel: () => createOnlineDuelSession({ renderer, ui: duelSink, latency: latencySink, now: () => performance.now(), scheduler, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout, api: bridge!,
          leave: () => actions.leave(), playCue: audio.play, recordDuel: record => window.ftlite?.recordDuel?.(record) }),
        sector: () => createOnlineRendererSession({ sampleDevices: keyboard.sample, resetInput: keyboard.reset, renderer, hud, now: () => performance.now(), scheduler,
          resolveLayout, api: bridge!, playCue: audio.play })
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
    single() { online = null; session.selectSingle(); }, online() { session.selectOnline(); },
    home() { session.home(); online = null; }, pause() { online?.pause(); },
    setVolume(volume) { settings = { ...settings, volume }; audio.setVolume(volume); try { saveSettings(localStorage, settings); } catch { /* storage denied */ } },
    fullscreen: win ? { get: () => win.isFullScreen(), set: (on) => win.setFullScreen(on) } : undefined
  });
  // Online input is blocked everywhere but a viewed session (React UI spec §2), applied when the derived value changes.
  const setBlocked = (value: boolean): void => { if (blocked !== value) keyboard.reset(); blocked = value; online?.setInputBlocked(value); };
  setBlocked(inputBlockedOf(store.getState()));
  const offBlocked = store.subscribe((s) => { const value = inputBlockedOf(s); if (value !== blocked) setBlocked(value); });
  const offStatus = bridge?.onStatus(next => { status = next; online?.setStatus(next); actions.setStatus(next); });
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
  const unlockOnce = (): void => audio.unlock();   // first gesture (and every focus) resumes a suspended AudioContext; guarded inside
  window.addEventListener('keydown', unlockOnce, { once: true }); window.addEventListener('pointerdown', unlockOnce, { once: true }); window.addEventListener('focus', unlockOnce);
  window.addEventListener('blur', () => session.pause());
  document.addEventListener('visibilitychange', () => { if (document.hidden) session.pause(); else if (document.hasFocus()) session.resume(); });
  window.addEventListener('focus', () => session.resume());
  renderer.app.ticker.add(() => session.frame());
  window.addEventListener('beforeunload', () => {
    offPort?.(); offStatus?.(); offStrip(); setBlocked(true); offBlocked(); actions.dispose(); unmountUi();
    session.dispose(); bridge?.dispose(); keyboard.destroy();
  }, { once: true });
}

/** The dev flight view (H-1 spec §9): the renderer and its letterbox, but no sector session. */
async function startFlight(seed: number): Promise<void> {
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  bootFeel(renderer);
  const store = createUiStore({ onlineAvailable: false });
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
  const actions = createUiActions({ store, single() {}, online() {}, pause() {} });
  const uiRoot = document.createElement('div'); uiRoot.id = 'ui'; document.body.append(uiRoot);
  await mountUi({ el: uiRoot, store, actions, menu: false });
  const resize = (): void => {
    renderer.resize(window.innerWidth, window.innerHeight);
    const lb = computeLetterbox(window.innerWidth, window.innerHeight, INTERNAL_W, INTERNAL_H);
    setLayout(store, { scale: lb.scale, offsetX: lb.offsetX, offsetY: lb.offsetY, dpr: window.devicePixelRatio || 1 });
  };
  window.addEventListener('resize', resize); resize();
  startDuelMode({ renderer, seed, layout, ui: createDuelSink(store, perf), lifecycle: window.ftlite });
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
  const reactHud = hudProbe && q.get('engine') === 'react';
  const images = reactHud ? await buildImageCache(hudImageNames(assets.missing), ICON_KINDS, createPixiImageSource(renderer, assets)) : undefined;
  if (duelProbe || reactHud) await mountUi({ el: uiRoot, store, actions, menu: false, images }); else if (!hudProbe) await mountProbe({ el: uiRoot, store, actions });
  const resize = (): void => {
    renderer.resize(window.innerWidth, window.innerHeight);
    const lb = computeLetterbox(window.innerWidth, window.innerHeight, INTERNAL_W, INTERNAL_H);
    setLayout(store, { scale: lb.scale, offsetX: lb.offsetX, offsetY: lb.offsetY, dpr: window.devicePixelRatio || 1 });
  };
  window.addEventListener('resize', resize); resize();
  startUiProbe(renderer, !duelProbe && !hudProbe);
  if (duelProbe) createDuelSink(store).frame(duelProbeFixture());
  if (hudProbe) {   // UI-iii: a fixture HUD model drawn by the React HUD (dynamic imports, the probe only)
    const { HUD_FIXTURES } = await import('./app/hudFixtures');
    const model = HUD_FIXTURES[Number(q.get('fixture') ?? 0)]!();
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

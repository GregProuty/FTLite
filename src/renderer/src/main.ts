import cutter from './sim/ship/cutter.json';
import skiff from './sim/ship/skiff.json';
import { parseShip } from './sim/ship/schema';
import { loadAssets } from './render/assets';
import { createRenderer } from './render/renderer';
import { createHud } from './render/hud';
import { createKeyboardSources } from './input/sources';
import { createAudio } from './app/audio';
import { loadSettings, saveSettings } from './app/settingsStore';
import { controlSections } from './app/controlsList';
import { DEFAULT_SEED, readMode, readSeed } from './app/duel/mode';
import { startFlightMode } from './app/duel/flightMode';
import { startDuelMode } from './app/duel/duelMode';
import { createOnlineBridge } from './app/onlineBridge';
import { createOnlineRendererSession } from './app/onlineSession';
import { createSessionRouter } from './app/sessionRouter';
import { createSessionMenu } from './render/sessionMenu';
import { installFeel } from './app/feelBoot';
import type { Renderer } from './render/renderer';
import type { OnlineStatus } from '../../shared/onlineSession';

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

/** The app (main menu spec, 2026-11-16): the menu with Single player (the solo duel), Multiplayer (today's online
 *  flow) and Settings. One renderer serves both; the router owns at most one of them at a time. */
async function startApp(): Promise<void> {
  const ships = { cutter: parseShip(cutter), skiff: parseShip(skiff) };   // throws with a clear message on invalid ship data (spec §9)
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  bootFeel(renderer);
  const hud = createHud(renderer.hud, assets);
  const keyboard = createKeyboardSources(window);
  const audio = createAudio();
  let settings = (() => { try { return loadSettings(localStorage); } catch { return loadSettings({ getItem: () => null, setItem() {} }); } })();
  audio.setVolume(settings.volume);
  const scheduler = { schedule(delay: number, cb: () => void) { const timer = window.setTimeout(cb, delay); return () => window.clearTimeout(timer); } };
  const bridge = window.ftlite?.online ? createOnlineBridge(window, window.ftlite.online) : null;
  let online: ReturnType<typeof createOnlineRendererSession> | null = null, status: OnlineStatus | null = null;
  let blocked = true;
  let menu: ReturnType<typeof createSessionMenu> | null = null;
  const session = createSessionRouter({ resetInput: keyboard.reset,
    single: () => {
      const dispose = startDuelMode({ renderer, seed: DEFAULT_SEED, layout: ships.cutter, lifecycle: window.ftlite,
        onExit: () => { session.home(); menu?.leaveSingle(); } });
      return { frame() { /* the duel runs on its own ticker callback */ }, dispose };
    },
    online: () => {
      online = createOnlineRendererSession({ sampleDevices: keyboard.sample, resetInput: keyboard.reset, renderer, hud, now: () => performance.now(), scheduler,
        resolveLayout: id => { const layout = Object.values(ships).find(ship => ship.id === id); if (!layout) throw Error('unknown-layout'); return layout; },
        api: bridge!, playCue: audio.play });
      if (status) online.setStatus(status); online.setInputBlocked(blocked); return online;
    }
  });
  // The actual transferred endpoint has exactly one owner before any menu action can dispatch.
  const offPort = bridge?.onPort((descriptor, port) => {
    if (session.mode !== 'online') { port.close(); return; }
    session.selectOnline().attach(descriptor, port);
  });
  const menuRoot = document.createElement('div'); document.body.append(menuRoot);
  const win = window.ftlite?.window;
  menu = createSessionMenu({ root: menuRoot, document, api: bridge ?? undefined,
    single() { online = null; session.selectSingle(); }, online() { session.selectOnline(); },
    home() { session.home(); online = null; }, pause() { online?.pause(); },
    inputBlocked(value) { if (blocked !== value) keyboard.reset(); blocked = value; online?.setInputBlocked(value); },
    settings: {
      volume: () => settings.volume,
      setVolume(volume) { settings = { ...settings, volume }; audio.setVolume(volume); try { saveSettings(localStorage, settings); } catch { /* storage denied */ } },
      fullscreen: win ? { get: () => win.isFullScreen(), set: (on) => win.setFullScreen(on) } : undefined,
      controls: controlSections()
    }
  });
  const offStatus = bridge?.onStatus(next => { status = next; online?.setStatus(next); menu?.setStatus(next); });
  if (document.hidden || !document.hasFocus()) session.pause();
  const resize = (): void => {
    const top = menu?.reservedHeight() ?? 0;
    renderer.app.canvas.style.cssText = `position:fixed;left:0;top:${top}px;display:block`;
    renderer.resize(window.innerWidth, Math.max(1, window.innerHeight - top));
  };
  // Reflow can wrap the strip without a window resize (status/roster changes).
  const menuResize = new ResizeObserver(resize); menuResize.observe(menuRoot);
  window.addEventListener('resize', resize); resize();
  window.addEventListener('resize', () => menu?.windowResized());   // F11 fullscreen changes keep the Settings label true
  const unlockOnce = (): void => audio.unlock();   // first gesture (and every focus) resumes a suspended AudioContext; guarded inside
  window.addEventListener('keydown', unlockOnce, { once: true }); window.addEventListener('pointerdown', unlockOnce, { once: true }); window.addEventListener('focus', unlockOnce);
  window.addEventListener('blur', () => session.pause());
  document.addEventListener('visibilitychange', () => { if (document.hidden) session.pause(); else if (document.hasFocus()) session.resume(); });
  window.addEventListener('focus', () => session.resume());
  renderer.app.ticker.add(() => { session.frame(); menu?.frame(); });
  window.addEventListener('beforeunload', () => { offPort?.(); offStatus?.(); menuResize.disconnect(); menu?.dispose(); session.dispose(); bridge?.dispose(); keyboard.destroy(); }, { once: true });
}

/** The dev flight view (H-1 spec §9): the renderer and its letterbox, but no sector session. */
async function startFlight(seed: number): Promise<void> {
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  bootFeel(renderer);
  const resize = (): void => renderer.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize); resize();
  startFlightMode({ renderer, seed, lifecycle: window.ftlite });
}

/** The solo duel (H-1 spec §4, §11a): the renderer and its letterbox, the Cutter, but no sector session. */
async function startDuel(seed: number): Promise<void> {
  const layout = parseShip(cutter);   // throws with a clear message on invalid ship data (spec §9)
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  bootFeel(renderer);
  const resize = (): void => renderer.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize); resize();
  startDuelMode({ renderer, seed, layout, lifecycle: window.ftlite });
}

/** One mode per launch (H-1 spec §3): the dev views `?mode=flight` and `?mode=duel`, or the app with its main menu. */
function start(): Promise<void> {
  const mode = readMode(location.search);
  return mode === 'flight' ? startFlight(readSeed(location.search)) : mode === 'duel' ? startDuel(readSeed(location.search)) : startApp();
}
start().catch(showFatal);

import cutter from './sim/ship/cutter.json';
import skiff from './sim/ship/skiff.json';
import { shipForCrew } from './sim/ship/fleet';
import { parseShip } from './sim/ship/schema';
import { loadAssets } from './render/assets';
import { createRenderer } from './render/renderer';
import { createHud } from './render/hud';
import { createKeyboardSources, sampleGamepads } from './input/sources';
import { createSession } from './app/session';
import { appendTelemetry } from './app/telemetryStore';
import { loadProgress, saveProgress } from './app/progressStore';
import { createAudio } from './app/audio';
import { EMPTY_PROGRESS } from './sim/progress';
import { CREDITS } from './render/credits.generated';
import { createOnlineBridge } from './app/onlineBridge';
import { createOnlineRendererSession } from './app/onlineSession';
import { createSessionRouter } from './app/sessionRouter';
import { createSessionMenu } from './render/sessionMenu';
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

async function start(): Promise<void> {
  const ships = { cutter: parseShip(cutter), skiff: parseShip(skiff) };   // throws with a clear message on invalid ship data (spec §9)
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  const hud = createHud(renderer.hud, assets);
  const keyboard = createKeyboardSources(window);
  const audio = createAudio();
  const scheduler = { schedule(delay: number, cb: () => void) { const timer = window.setTimeout(cb, delay); return () => window.clearTimeout(timer); } };
  const sampleDevices = () => [...keyboard.sample(), ...sampleGamepads()];
  const createCouch = () => createSession({
    layout: (players) => ships[shipForCrew(players)],   // the Skiff for one or two, the cutter for three or four (spec Demo-x-a section 3)
    sampleDevices,
    renderer, hud,
    now: () => performance.now(),
    scheduler,
    canResume: () => !document.hidden && document.hasFocus(),
    credits: CREDITS,
    playCue: audio.play,
    saveCrash: (payload) => { try { localStorage.setItem('ftlite-crash', JSON.stringify(payload)); } catch { /* storage unavailable */ } },
    saveTelemetry: (record) => { try { appendTelemetry(localStorage, record); } catch { /* storage denied: evaluating localStorage itself can throw, and the callback runs inside the session's sim-fault try */ } },
    loadProgress: () => { try { return loadProgress(localStorage); } catch { return EMPTY_PROGRESS; } },
    saveProgress: (p) => { try { saveProgress(localStorage, p); } catch { /* storage denied */ } }
  });
  const bridge = window.ftlite?.online ? createOnlineBridge(window, window.ftlite.online) : null;
  let online: ReturnType<typeof createOnlineRendererSession> | null = null, status: OnlineStatus | null = null;
  let blocked = true;
  const session = createSessionRouter({ couch: createCouch, resetInput: keyboard.reset,
    online: () => {
      online = createOnlineRendererSession({ sampleDevices, resetInput: keyboard.reset, renderer, hud, now: () => performance.now(), scheduler,
        resolveLayout: id => { const layout = Object.values(ships).find(ship => ship.id === id); if (!layout) throw Error('unknown-layout'); return layout; },
        api: bridge!, playCue: audio.play });
      if (status) online.setStatus(status); online.setInputBlocked(blocked); return online;
    }
  });
  // The actual transferred endpoint has exactly one owner before any menu action can dispatch.
  const offPort = bridge?.onPort((descriptor, port) => session.selectOnline().attach(descriptor, port));
  const menuRoot = document.createElement('div'); document.body.append(menuRoot);
  const menu = createSessionMenu({ root: menuRoot, document, api: bridge ?? undefined,
    couch() { session.selectCouch(); online = null; }, online() { session.selectOnline(); },
    leaveCouch() { session.home(); }, home() { session.home(); online = null; }, pause() { online?.pause(); },
    inputBlocked(value) { if (blocked !== value) keyboard.reset(); blocked = value; online?.setInputBlocked(value); }
  });
  const offStatus = bridge?.onStatus(next => { status = next; online?.setStatus(next); menu.setStatus(next); });
  if (document.hidden || !document.hasFocus()) session.pause('initial-focus');
  const resize = (): void => {
    const top = menu.reservedHeight();
    renderer.app.canvas.style.cssText = `position:fixed;left:0;top:${top}px;display:block`;
    renderer.resize(window.innerWidth, Math.max(1, window.innerHeight - top));
  };
  // Reflow can wrap the strip without a window resize (status/roster changes).
  const menuResize = new ResizeObserver(resize); menuResize.observe(menuRoot);
  window.addEventListener('resize', resize); resize();
  const unlockOnce = (): void => audio.unlock();   // first gesture (and every focus) resumes a suspended AudioContext; guarded inside
  window.addEventListener('keydown', unlockOnce, { once: true }); window.addEventListener('pointerdown', unlockOnce, { once: true }); window.addEventListener('focus', unlockOnce);
  window.addEventListener('blur', () => session.pause('blur'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) session.pause('hidden'); else if (session.mode === 'couch' || document.hasFocus()) session.resume('visible'); });
  window.addEventListener('focus', () => session.resume('focus'));
  const offSuspend = window.ftlite?.onSuspend(() => session.pause('os-suspend'));
  const offResume = window.ftlite?.onResume(() => { if (session.mode === 'couch') session.resume('os-resume'); });
  renderer.app.ticker.add(() => { session.frame(); menu.frame(); });
  window.addEventListener('beforeunload', () => { offPort?.(); offStatus?.(); offSuspend?.(); offResume?.(); menuResize.disconnect(); menu.dispose(); session.dispose(); bridge?.dispose(); keyboard.destroy(); }, { once: true });
}
start().catch(showFatal);

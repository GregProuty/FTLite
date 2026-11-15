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
  const session = createSession({
    layout: (players) => ships[shipForCrew(players)],   // the Skiff for one or two, the cutter for three or four (spec Demo-x-a section 3)
    sampleDevices: () => [...keyboard.sample(), ...sampleGamepads()],
    renderer, hud,
    now: () => performance.now(),
    scheduler: { schedule(delay, cb) { const timer = window.setTimeout(cb, delay); return () => window.clearTimeout(timer); } },
    canResume: () => !document.hidden && document.hasFocus(),
    credits: CREDITS,
    playCue: audio.play,
    saveCrash: (payload) => { try { localStorage.setItem('ftlite-crash', JSON.stringify(payload)); } catch { /* storage unavailable */ } },
    saveTelemetry: (record) => { try { appendTelemetry(localStorage, record); } catch { /* storage denied: evaluating localStorage itself can throw, and the callback runs inside the session's sim-fault try */ } },
    loadProgress: () => { try { return loadProgress(localStorage); } catch { return EMPTY_PROGRESS; } },
    saveProgress: (p) => { try { saveProgress(localStorage, p); } catch { /* storage denied */ } }
  });
  const resize = (): void => renderer.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize); resize();
  const unlockOnce = (): void => audio.unlock();   // first gesture (and every focus) resumes a suspended AudioContext; guarded inside
  window.addEventListener('keydown', unlockOnce, { once: true }); window.addEventListener('pointerdown', unlockOnce, { once: true }); window.addEventListener('focus', unlockOnce);
  window.addEventListener('blur', () => session.pause('blur'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) session.pause('hidden'); else session.resume('visible'); });
  window.addEventListener('focus', () => session.resume('focus'));
  window.ftlite?.onSuspend(() => session.pause('os-suspend'));
  window.ftlite?.onResume(() => session.resume('os-resume'));
  renderer.app.ticker.add(() => session.frame());
  window.addEventListener('beforeunload', () => session.dispose(), { once: true });
}
start().catch(showFatal);

import starter from './sim/ship/starter.json';
import { parseShip } from './sim/ship/schema';
import { loadAssets } from './render/assets';
import { createRenderer } from './render/renderer';
import { createHud } from './render/hud';
import { createKeyboardSources, sampleGamepads } from './input/sources';
import { createSession } from './app/session';
import { CREDITS } from './render/credits.generated';

declare global { interface Window { ftlite?: { onSuspend(cb: () => void): void; onResume(cb: () => void): void } } }

/** Startup failures (invalid ship, invalid manifest, missing required asset) stop here with the message on screen (spec §7, parent §9). */
function showFatal(err: unknown): void {
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#f88;background:#000;margin:0;padding:16px;font:14px monospace;white-space:pre-wrap';
  pre.textContent = `FTLite cannot start.

${err instanceof Error ? err.message : String(err)}`;
  document.body.replaceChildren(pre);
}

async function start(): Promise<void> {
  const layout = parseShip(starter);          // throws with a clear message on invalid ship data (spec §9)
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  const hud = createHud(renderer.hud, assets);
  const keyboard = createKeyboardSources(window);
  const session = createSession({
    layout,
    sampleDevices: () => [...keyboard.sample(), ...sampleGamepads()],
    renderer, hud,
    now: () => performance.now(),
    canResume: () => !document.hidden && document.hasFocus(),
    credits: CREDITS,
    saveCrash: (payload) => { try { localStorage.setItem('ftlite-crash', JSON.stringify(payload)); } catch { /* storage unavailable */ } }
  });
  const resize = (): void => renderer.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize); resize();
  window.addEventListener('blur', () => session.pause());
  document.addEventListener('visibilitychange', () => { if (document.hidden) session.pause(); else session.resume(); });
  window.addEventListener('focus', () => session.resume());
  window.ftlite?.onSuspend(() => session.pause());
  window.ftlite?.onResume(() => session.resume());
  renderer.app.ticker.add(() => session.frame());
}
start().catch(showFatal);

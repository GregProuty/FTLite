import starter from './sim/ship/starter.json';
import { parseShip } from './sim/ship/schema';
import { createRenderer } from './render/renderer';
import { createHud } from './render/hud';
import { createKeyboardSources, sampleGamepads } from './input/sources';
import { createSession } from './app/session';

declare global { interface Window { ftlite?: { onSuspend(cb: () => void): void; onResume(cb: () => void): void } } }

async function start(): Promise<void> {
  const layout = parseShip(starter);          // throws with a clear message on invalid ship data (spec §9)
  const renderer = await createRenderer();
  const hud = createHud(renderer.hud);
  const keyboard = createKeyboardSources(window);
  const session = createSession({
    layout,
    sampleDevices: () => [...keyboard.sample(), ...sampleGamepads()],
    renderer, hud,
    now: () => performance.now(),
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
void start();

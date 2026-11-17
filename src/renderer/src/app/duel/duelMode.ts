// The solo duel's boot (H-1 spec §3, §4, §11a): reuses the renderer's Pixi application, stage and letterbox through the
// duel scene (scene.ts, H-2 spec §3), and steps the duel locally with the duel runtime. The sector session is never
// created.
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import type { ShipLayout } from '../../sim/ship/schema';
import type { Renderer } from '../../render/renderer';
import { computeLetterbox } from '../../render/letterbox';
import { endModel } from '../../render/duel/endScreen';
import { createDuelKeyboard, createPointerSource, type EventSource } from './input';
import { createDuelRuntime } from './runtime';
import { createDuelScene } from './scene';

export interface DuelModeDeps {
  renderer: Renderer;
  seed: number;
  /** The Cutter. */
  layout: ShipLayout;
  /** The preload bridge's suspend and resume hooks, when present; their unsubscribes run on dispose. */
  lifecycle?: { onSuspend(cb: () => void): (() => void) | void; onResume(cb: () => void): (() => void) | void };
  /** Inside the app (main menu spec): M while paused or on the end screen calls this, and the banners show the key. The
   *  caller disposes the duel. Absent for `?mode=duel`, which has no menu to return to. */
  onExit?: () => void;
}

export function startDuelMode(deps: DuelModeDeps): () => void {
  const { renderer } = deps, viewport = { w: INTERNAL_W, h: INTERNAL_H };
  const exitHint = deps.onExit ? '   M: MAIN MENU' : '', pauseText = `PAUSED   ESC: RESUME${exitHint}`;
  const scene = createDuelScene(renderer, { seed: deps.seed, pauseText });
  const canvas = renderer.app.canvas;
  const keyboard = createDuelKeyboard(window as unknown as EventSource);
  const pointer = createPointerSource(canvas as unknown as EventSource, (cx, cy) => {
    const rect = canvas.getBoundingClientRect(), lb = computeLetterbox(rect.width, rect.height, INTERNAL_W, INTERNAL_H);
    return { x: (cx - rect.left - lb.offsetX) / lb.scale, y: (cy - rect.top - lb.offsetY) / lb.scale };
  });
  const runtime = createDuelRuntime({
    now: () => performance.now(),
    scheduler: { schedule(delay, cb) { const timer = window.setTimeout(cb, delay); return () => window.clearTimeout(timer); } },
    sampleKeys: () => keyboard.sample(), samplePointer: () => pointer.sample(),
    clearKeys: () => { keyboard.clear(); pointer.clear(); },
    seed: deps.seed, viewport, layout: deps.layout
  });

  const onBlur = (): void => runtime.pause('blur');
  const onFocus = (): void => runtime.resume('blur');
  const onVisibility = (): void => { if (document.hidden) runtime.pause('hidden'); else runtime.resume('hidden'); };
  window.addEventListener('blur', onBlur); window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
  const offSuspend = deps.lifecycle?.onSuspend(() => runtime.pause('suspend'));
  const offResume = deps.lifecycle?.onResume(() => runtime.resume('suspend'));

  const frame = (ticker: { deltaMS: number }): void => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000);
    runtime.frame(dt);
    if (deps.onExit && runtime.menuRequested()) { deps.onExit(); return; }   // the caller disposes this duel
    const d = runtime.duel, userPaused = runtime.reasons().has('user');
    const ticks = (d.decidedTick >= 0 ? d.decidedTick : d.tactical.tick) - d.baseTick;
    scene.draw(runtime, dt, { banner: userPaused ? pauseText : null, layerPaused: userPaused, end: endModel(d.tactical.outcome, ticks, `ENTER: REMATCH${exitHint}`) });
  };
  renderer.app.ticker.add(frame);

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return; disposed = true;
    renderer.app.ticker.remove(frame);
    window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('beforeunload', dispose);
    offSuspend?.(); offResume?.();
    keyboard.destroy(); pointer.destroy(); runtime.dispose(); scene.dispose();
  };
  window.addEventListener('beforeunload', dispose, { once: true });
  return dispose;
}

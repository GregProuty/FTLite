// The solo duel's boot (H-1 spec §3, §4, §11a): reuses the renderer's Pixi application, stage and letterbox through the
// duel scene (scene.ts, H-2 spec §3), and steps the duel locally with the duel runtime. The sector session is never
// created. Each decided round is written as a solo playtest record (H-2 spec §8) through `recordDuel`.
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import type { ShipLayout } from '../../sim/ship/schema';
import type { Renderer } from '../../render/renderer';
import { computeLetterbox } from '../../render/letterbox';
import { endModel } from '../../render/duel/endModel';
import type { DuelPlaytestRecord } from '../../net/duelRecord';
import { createDuelKeyboard, createPointerSource, type EventSource } from './input';
import { createDuelRuntime } from './runtime';
import type { DuelSink } from '../../ui/sinks';
import type { AudioOut } from '../audio';
import { createDuelScene } from './scene';
import { soloRecorder } from './soloRecorder';

export interface DuelModeDeps {
  renderer: Renderer;
  seed: number;
  ui: DuelSink;
  /** The duel ship (the Hound). */
  layout: ShipLayout;
  /** The preload bridge's suspend and resume hooks, when present; their unsubscribes run on dispose. */
  lifecycle?: { onSuspend(cb: () => void): (() => void) | void; onResume(cb: () => void): (() => void) | void };
  /** Inside the app (main menu spec): M while paused or on the end screen calls this, and the banners show the key. The
   *  caller disposes the duel. Absent for `?mode=duel`, which has no menu to return to. */
  onExit?: () => void;
  /** Append a solo playtest record (the preload's recordDuel); absent outside the app. */
  recordDuel?(record: DuelPlaytestRecord): Promise<boolean> | void;
  /** The app's audio (Audio-i spec section 4b); absent for `?mode=duel`, which stays silent as before. */
  audio?: AudioOut;
}

export function startDuelMode(deps: DuelModeDeps): () => void {
  const { renderer } = deps, viewport = { w: INTERNAL_W, h: INTERNAL_H };
  const exitHint = deps.onExit ? '   M: MAIN MENU' : '', pauseText = `PAUSED   ESC: RESUME${exitHint}`;
  const scene = createDuelScene(renderer, { seed: deps.seed, pauseText, ui: deps.ui, audio: deps.audio });
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
    seed: deps.seed, viewport, layout: deps.layout, onRound: (summary) => { void Promise.resolve(deps.recordDuel?.(solo.record(summary))).catch(() => {}); }
  });
  // The solo record (H-2 spec §8, Helm §11a); `seat` is the character the keyboard drives when the round is decided.
  const solo = soloRecorder({ now: () => new Date().toISOString(), active: () => runtime.active(), helmPlayer: () => runtime.duel.helmPlayer });

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
    solo.framePaused(userPaused);
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

// The dev flight view's boot (H-1 spec §3, §9): reuses the renderer's Pixi application, stage and letterbox, hides the
// sector children, and adds the Helm map view with the feel panel. The sector session is never created in this mode.
import { Container } from 'pixi.js';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import type { Renderer } from '../../render/renderer';
import { computeLetterbox } from '../../render/letterbox';
import { createFeelPanel, FEEL_PANEL_MARGIN, FEEL_PANEL_W } from '../../render/tactical/feelPanel';
import { feelReadout, feelRows } from '../../render/tactical/feelModel';
import { createTacticalLayer } from '../../render/tactical/tacticalLayer';
import { tacticalModel } from '../../render/tactical/tacticalModel';
import { createDuelKeyboard, createPointerSource, type EventSource } from './input';
import { createFlightRuntime } from './runtime';

export interface FlightModeDeps {
  renderer: Renderer;
  seed: number;
  /** The preload bridge's suspend and resume hooks, when present. */
  lifecycle?: { onSuspend(cb: () => void): void; onResume(cb: () => void): void };
}

/** Screen pixels on the right that the off-screen arrows keep clear of: the feel panel and its margins. */
export const FLIGHT_RESERVE_RIGHT = FEEL_PANEL_W + 2 * FEEL_PANEL_MARGIN;

export function startFlightMode(deps: FlightModeDeps): () => void {
  const { renderer } = deps, viewport = { w: INTERNAL_W, h: INTERNAL_H };
  for (const child of renderer.app.stage.children) child.visible = false;   // world, enemy window, projectiles, callouts, HUD
  const scene = new Container();
  const layer = createTacticalLayer({ fontFamily: renderer.assets.fontFamily, viewport, seed: deps.seed });
  const panel = createFeelPanel({ fontFamily: renderer.assets.fontFamily, x: INTERNAL_W - FEEL_PANEL_W - FEEL_PANEL_MARGIN, y: FEEL_PANEL_MARGIN });
  scene.addChild(layer.container, panel.container);
  renderer.app.stage.addChild(scene);

  const canvas = renderer.app.canvas;
  const keyboard = createDuelKeyboard(window as unknown as EventSource);
  const pointer = createPointerSource(canvas as unknown as EventSource, (cx, cy) => {
    const rect = canvas.getBoundingClientRect(), lb = computeLetterbox(rect.width, rect.height, INTERNAL_W, INTERNAL_H);
    return { x: (cx - rect.left - lb.offsetX) / lb.scale, y: (cy - rect.top - lb.offsetY) / lb.scale };
  });
  const runtime = createFlightRuntime({
    now: () => performance.now(),
    scheduler: { schedule(delay, cb) { const timer = window.setTimeout(cb, delay); return () => window.clearTimeout(timer); } },
    sampleKeys: () => keyboard.sample(), samplePointer: () => pointer.sample(),
    seed: deps.seed, viewport
  });

  const onBlur = (): void => runtime.pause('blur');
  const onFocus = (): void => runtime.resume('blur');
  const onVisibility = (): void => { if (document.hidden) runtime.pause('hidden'); else runtime.resume('hidden'); };
  window.addEventListener('blur', onBlur); window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
  deps.lifecycle?.onSuspend(() => runtime.pause('suspend'));
  deps.lifecycle?.onResume(() => runtime.resume('suspend'));

  const frame = (ticker: { deltaMS: number }): void => {
    runtime.frame(Math.min(0.1, ticker.deltaMS / 1000));
    const ship = runtime.state.ships[0];
    layer.draw(tacticalModel({
      state: runtime.state, prev: runtime.prev, alpha: runtime.alpha(), camera: runtime.camera, viewport, console: 'helm',
      axes: runtime.axes(), ships: [0], paused: runtime.reasons().has('user'), reserveRight: FLIGHT_RESERVE_RIGHT
    }));
    panel.draw(feelRows(feelReadout(runtime.feel, ship, runtime.state.map.planet)));
  };
  renderer.app.ticker.add(frame);

  const dispose = (): void => {
    renderer.app.ticker.remove(frame);
    window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
    keyboard.destroy(); pointer.destroy(); runtime.dispose();
  };
  window.addEventListener('beforeunload', dispose, { once: true });
  return dispose;
}

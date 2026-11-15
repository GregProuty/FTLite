// The solo duel's boot (H-1 spec §3, §4, §11a): reuses the renderer's Pixi application, stage and letterbox, hides the
// sector children, and adds the duel's scene: the console map view (Helm or Weapons) or the interior for the active
// character, the readout column, the effects and shake, and the end screen. The sector session is never created.
import { BitmapText, Container } from 'pixi.js';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import type { ShipLayout } from '../../sim/ship/schema';
import type { Renderer } from '../../render/renderer';
import { computeLetterbox } from '../../render/letterbox';
import { createEndScreen, endModel } from '../../render/duel/endScreen';
import { READOUT_COLUMN } from '../../render/duel/interiorModel';
import { createInteriorView, type InteriorView } from '../../render/duel/interiorView';
import { createReadoutPanel } from '../../render/duel/readoutPanel';
import { readoutHelp, readoutRows } from '../../render/duel/readoutModel';
import { createFx, pushEvents, recordTrails, resetFx, shakeOffset, stepFx } from '../../render/tactical/fxModel';
import { createTacticalLayer } from '../../render/tactical/tacticalLayer';
import { tacticalModel } from '../../render/tactical/tacticalModel';
import { combatModel } from '../../render/tactical/weaponsModel';
import { FONT_SIZE, TEXT } from '../../render/theme';
import { createDuelKeyboard, createPointerSource, type EventSource } from './input';
import { createDuelRuntime } from './runtime';

export interface DuelModeDeps {
  renderer: Renderer;
  seed: number;
  /** The Cutter. */
  layout: ShipLayout;
  /** The preload bridge's suspend and resume hooks, when present. */
  lifecycle?: { onSuspend(cb: () => void): void; onResume(cb: () => void): void };
}

export function startDuelMode(deps: DuelModeDeps): () => void {
  const { renderer } = deps, viewport = { w: INTERNAL_W, h: INTERNAL_H }, font = renderer.assets.fontFamily;
  for (const child of renderer.app.stage.children) child.visible = false;   // world, enemy window, projectiles, callouts, HUD
  const root = new Container(), scene = new Container();
  const layer = createTacticalLayer({ fontFamily: font, viewport, seed: deps.seed });
  let interior: InteriorView = createInteriorView(renderer.assets);
  const panel = createReadoutPanel({ fontFamily: font }), end = createEndScreen({ fontFamily: font });
  const paused = new BitmapText({ text: 'PAUSED   ESC: RESUME', style: { fontFamily: font, fontSize: FONT_SIZE * 1.5 } });
  paused.tint = TEXT; paused.anchor.set(0.5, 0.5); paused.position.set((INTERNAL_W - READOUT_COLUMN) / 2, 80); paused.visible = false;
  scene.addChild(layer.container, interior.container, panel.container);
  root.addChild(scene, paused, end.container);   // the shake moves the scene; the banner and the end card stay still
  renderer.app.stage.addChild(root);

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
  const fx = createFx();
  let epoch = runtime.epoch();

  const onBlur = (): void => runtime.pause('blur');
  const onFocus = (): void => runtime.resume('blur');
  const onVisibility = (): void => { if (document.hidden) runtime.pause('hidden'); else runtime.resume('hidden'); };
  window.addEventListener('blur', onBlur); window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
  deps.lifecycle?.onSuspend(() => runtime.pause('suspend'));
  deps.lifecycle?.onResume(() => runtime.resume('suspend'));

  const frame = (ticker: { deltaMS: number }): void => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000);
    runtime.frame(dt);
    if (runtime.epoch() !== epoch) {   // a restart (spec §4): every view-owned cache starts again
      epoch = runtime.epoch();
      resetFx(fx); layer.reset(); layer.reseed(runtime.seed);   // the next duel's star field
      interior.destroy(); interior = createInteriorView(renderer.assets); scene.addChildAt(interior.container, 1);
    }
    const d = runtime.duel, view = runtime.view(), alpha = runtime.alpha(), userPaused = runtime.reasons().has('user');
    pushEvents(fx, runtime.drainEvents());
    stepFx(fx, runtime.paused() ? 0 : dt);
    recordTrails(fx, d.tactical, runtime.missilePrev, alpha);
    layer.container.visible = view !== 'interior'; interior.container.visible = view === 'interior';
    if (view === 'interior') interior.draw(d, runtime.crewPrev, alpha, dt);
    else {
      const input = {
        state: d.tactical, prev: runtime.prev, alpha, camera: runtime.cameras[view], viewport, console: view, axes: runtime.axes(),
        ships: [0, 1], paused: userPaused, reserveRight: READOUT_COLUMN, spreadArrows: true, missilePrev: runtime.missilePrev, steer: runtime.steer(), fx
      } as const;
      layer.draw(tacticalModel(input), combatModel(input));
    }
    paused.visible = userPaused && view === 'interior';
    panel.draw(readoutRows({ duel: d, mode: view, active: runtime.active(), other: runtime.otherStatus() }), readoutHelp(view));
    const shake = shakeOffset(fx);
    scene.position.set(shake.x, shake.y);
    end.draw(endModel(d.tactical.outcome, d.tactical.tick, runtime.seed));
  };
  renderer.app.ticker.add(frame);

  const dispose = (): void => {
    renderer.app.ticker.remove(frame);
    window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
    keyboard.destroy(); pointer.destroy(); runtime.dispose(); interior.destroy();
  };
  window.addEventListener('beforeunload', dispose, { once: true });
  return dispose;
}

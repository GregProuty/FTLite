// The local runtime for the dev flight view (H-1 spec §4, §9): the renderer steps the tactical sim itself on a 60 Hz
// wall-clock driver until H-0c-ii puts the duel behind the authority. H-1b adds the duel runtime beside it.
import { createTickDriver } from '../../authority/tickDriver';
import type { Scheduler } from '../../net/contracts';
import { stepSoloFlight } from '../../sim/tactical/physics';
import { createTacticalState, NO_AXES, type Axes, type TacticalState } from '../../sim/tactical/state';
import { TICK_HZ } from '../../sim/tuning';
import { createCamera, pan, snapBack, updateCamera, zoomBy, type Camera, type Viewport } from '../../render/tactical/camera';
import { createFeelTracker, recordFeel, type FeelTracker } from '../../render/tactical/feelModel';
import { followTarget, type PrevBody } from '../../render/tactical/tacticalModel';
import { accumulateWheel, helmAxes, WHEEL_IDLE_MS, type KeySample, type PointerSample } from './input';

export type PauseReason = 'user' | 'blur' | 'hidden' | 'suspend';

export interface FlightRuntimeDeps {
  now(): number;
  scheduler: Scheduler;
  /** Called once per frame: held keys and the press edges since the last call. */
  sampleKeys(): KeySample;
  /** Called once per frame: the pointer position, wheel and drag since the last call. */
  samplePointer(): PointerSample;
  seed: number;
  viewport: Viewport;
}

export interface FlightRuntime {
  readonly state: TacticalState;
  /** Each ship's position and continuous heading before the last tick (for interpolation). */
  readonly prev: readonly PrevBody[];
  /** The Helm axes the last tick sent to the sim (zero before the first tick). */
  axes(): Axes;
  readonly camera: Camera;
  readonly feel: FeelTracker;
  /** Render interpolation, fixed once per frame(): (now − last tick time) · 60 / 1000, clamped to 0..1; 1 before the first tick. */
  alpha(): number;
  /** One render frame: input, pause toggles and the camera. `dt` in seconds. */
  frame(dt: number): void;
  pause(reason: PauseReason): void;
  resume(reason: PauseReason): void;
  paused(): boolean;
  /** The pause reasons now set; the user banner shows while 'user' is among them. */
  reasons(): ReadonlySet<PauseReason>;
  dispose(): void;
}

export function createFlightRuntime(deps: FlightRuntimeDeps): FlightRuntime {
  const state = createTacticalState(deps.seed);
  const prev: PrevBody[] = state.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
  const camera = createCamera(state.ships[0].x, state.ships[0].y);
  const feel = createFeelTracker();
  const reasons = new Set<PauseReason>();
  let held: Axes = NO_AXES, sent: Axes = NO_AXES, lastTickTime: number | null = null;
  const driver = createTickDriver({ nowMs: deps.now }, deps.scheduler, (_tick, tickTimeMs) => {
    state.ships.forEach((s, i) => { const p = prev[i]!; p.x = s.x; p.y = s.y; p.h = s.heading + s.headingAcc; });
    sent = held;
    stepSoloFlight(state, sent);
    recordFeel(feel, state.ships[0], state.map.planet);
    lastTickTime = tickTimeMs;
  });
  const sync = (): void => driver.setPaused(reasons.size > 0);
  const computeAlpha = (): number => lastTickTime === null ? 1 : Math.max(0, Math.min(1, (deps.now() - lastTickTime) * TICK_HZ / 1000));
  let frameAlpha = 1, wheelAcc = 0, lastWheelAt = -Infinity;
  const alpha = (): number => frameAlpha;
  return {
    state, prev, camera, feel, alpha,
    axes: () => sent,
    frame(dt) {
      const k = deps.sampleKeys(), p = deps.samplePointer(), vp = deps.viewport;
      held = helmAxes(k);
      driver.pump();   // run any due ticks with this frame's held axes before drawing
      frameAlpha = computeAlpha();
      for (let n = 0; n < k.presses.pause; n++) { if (reasons.has('user')) reasons.delete('user'); else reasons.add('user'); }
      sync();
      if (k.presses.camera > 0) snapBack(camera);
      zoomBy(camera, vp, k.presses.zoomIn - k.presses.zoomOut);
      pan(camera, p.dragX, p.dragY);   // before the wheel: pan clears the zoom anchor, so a drag and a wheel in one frame still zoom about the cursor
      const t = deps.now();
      if (p.wheel !== 0) lastWheelAt = t; else if (t - lastWheelAt > WHEEL_IDLE_MS) wheelAcc = 0;
      const w = accumulateWheel(wheelAcc, p.wheel); wheelAcc = w.acc;
      zoomBy(camera, vp, w.notches, p.x !== null && p.y !== null ? { x: p.x, y: p.y } : null);
      updateCamera(camera, vp, dt, followTarget(state, prev, frameAlpha, camera.follow));
    },
    pause(reason) { reasons.add(reason); sync(); },
    resume(reason) { reasons.delete(reason); sync(); },
    paused: () => reasons.size > 0,
    reasons: () => reasons,
    dispose() { driver.dispose(); }
  };
}

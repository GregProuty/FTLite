import type { ShipLayout } from '../sim/ship/schema';
import { createSimState, type SimState } from '../sim/state';
import { step } from '../sim/step';
import { saveSnapshot, type Snapshot } from '../sim/snapshot';
import { encodeIntent, type CompactIntent } from '../sim/replay';
import { TICK_HZ, DT } from '../sim/tuning';
import { createDeviceManager, type SourceSample, type SlotInfo } from '../input/deviceManager';
import { createIntentFeed } from './intents';
import { stepAccumulator } from './loop';
import { buildHudModel, type HudModel } from '../render/hud';
import { EndReason } from '../sim/crew';

export const DEFAULT_SEED = 2026;
const CRASH_HISTORY = 300;

export interface SessionDeps {
  layout: ShipLayout;
  sampleDevices(): SourceSample[];
  renderer: { recordPrev(s: SimState): void; draw(s: SimState, alpha: number): void } | null;
  hud: { update(m: HudModel): void } | null;
  now(): number;
  saveCrash(payload: unknown): void;
  /** Whether a Confirm press may resume a paused session (false while the window is hidden or unfocused). */
  canResume?: () => boolean;
}

export function createSession(deps: SessionDeps) {
  const dm = createDeviceManager();
  let phase: HudModel['phase'] = 'lobby';
  let message = 'Press Interact to join, Confirm to start';
  let seed = DEFAULT_SEED;
  let state: SimState | null = null;
  let feed: ReturnType<typeof createIntentFeed> | null = null;
  let slots: SlotInfo[] = [];
  let accumulator = 0, lastNow: number | null = null;
  let baseline: Snapshot | null = null;
  let intentsSinceBaseline: CompactIntent[][] = [];

  function start(): void {
    const playerCount = slots.filter((s) => s.status !== 'empty').length;
    state = createSimState(deps.layout, playerCount, seed);
    feed = createIntentFeed(playerCount);
    accumulator = 0; baseline = null; intentsSinceBaseline = [];
    phase = 'running'; message = '';
  }

  function anyPress(frames: { confirmPresses: number; cancelPresses: number }[], key: 'confirmPresses' | 'cancelPresses'): boolean {
    return frames.some((f) => f[key] > 0);
  }

  function doResume(): void { if (phase === 'paused') { phase = 'running'; message = ''; lastNow = null; } }

  return {
    get phase() { return phase; }, get state() { return state; }, get seed() { return seed; },
    pause() { if (phase === 'running') { phase = 'paused'; message = 'PAUSED'; accumulator = 0; } },
    resume() { doResume(); },
    frame() {
      const now = deps.now();
      const delta = lastNow === null ? 0 : Math.min(0.25, (now - lastNow) / 1000);
      lastNow = now;
      const { frames, slots: s, joinedCount } = dm.update(deps.sampleDevices(), phase === 'lobby');
      slots = s;
      if (phase === 'paused' && anyPress(frames, 'confirmPresses') && (deps.canResume ?? (() => true))()) doResume();
      if (phase === 'lobby') {
        if (joinedCount > 0 && anyPress(frames, 'confirmPresses')) start();
      } else if (phase === 'running' && state && feed) {
        feed.beginFrame(frames);
        const r = stepAccumulator(accumulator, delta); accumulator = r.accumulator;
        try {
          for (let i = 0; i < r.ticks; i++) {
            deps.renderer?.recordPrev(state);   // before every tick, so interpolation spans only the last tick
            const intents = feed.tick();
            if (state.tick % CRASH_HISTORY === 0) { baseline = saveSnapshot(state); intentsSinceBaseline = []; }
            intentsSinceBaseline.push(intents.map(encodeIntent));
            step(state, intents);
            if (state.ended) {
              phase = 'gameover';
              message = `${state.endReason === EndReason.Hull ? 'HULL LOST' : 'CREW LOST'} after ${Math.floor(state.tick / TICK_HZ)}s. Confirm: same seed. Cancel: new seed.`;
              break;
            }
          }
        } catch (err) {
          phase = 'error';
          message = `Sim fault: ${(err as Error).message}. Crash data saved.`;
          let snapshotAfterFault: unknown = null;
          try { snapshotAfterFault = saveSnapshot(state); } catch { snapshotAfterFault = null; }
          deps.saveCrash({ tick: state.tick, seed, error: String(err), baseline, intentsSinceBaseline, snapshotAfterFault });
        }
      } else if (phase === 'gameover') {
        if (anyPress(frames, 'cancelPresses')) { seed += 1; phase = 'lobby'; message = 'New seed. Confirm to start'; }
        else if (anyPress(frames, 'confirmPresses')) { phase = 'lobby'; message = 'Same seed. Confirm to start'; }
      }
      // In the error phase the state may be corrupt: never read it again (the draw and HUD are outside the try).
      if (state && deps.renderer && phase !== 'error') deps.renderer.draw(state, phase === 'running' ? accumulator / DT : 1);
      deps.hud?.update(buildHudModel(phase === 'error' ? null : state, slots, phase, message));
    }
  };
}

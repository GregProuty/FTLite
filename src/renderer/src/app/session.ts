import type { ShipLayout } from '../sim/ship/schema';
import { createSimState, type SimState } from '../sim/state';
import { step } from '../sim/step';
import { saveSnapshot, type Snapshot } from '../sim/snapshot';
import { encodeIntent, type CompactIntent } from '../sim/replay';
import { TICK_HZ, DT } from '../sim/tuning';
import { createDeviceManager, type SourceSample, type SlotInfo } from '../input/deviceManager';
import { createIntentFeed, NEUTRAL_FRAME, type InputFrame } from './intents';
import { stepAccumulator } from './loop';
import { buildHudModel, type HudModel } from '../render/hudModel';
import { EndReason } from '../sim/crew';

export const DEFAULT_SEED = 2026;
const CRASH_HISTORY = 300;
export const CREDITS_SCROLL_MS = 150;

export interface SessionDeps {
  layout: ShipLayout;
  sampleDevices(): SourceSample[];
  renderer: { reset(): void; recordPrev(s: SimState): void; draw(s: SimState, alpha: number): void } | null;
  hud: { update(m: HudModel): void } | null;
  now(): number;
  saveCrash(payload: unknown): void;
  /** Whether a Confirm press may resume a paused session (false while the window is hidden or unfocused). */
  canResume?: () => boolean;
  credits?: readonly string[];
}

export function createSession(deps: SessionDeps) {
  const dm = createDeviceManager();
  const credits = deps.credits ?? [];
  const LOBBY_MSG = 'Press Interact to join. Confirm: start. Cancel: credits';
  let phase: HudModel['phase'] = 'lobby';
  let message = LOBBY_MSG;
  let seed = DEFAULT_SEED;
  let state: SimState | null = null;
  let feed: ReturnType<typeof createIntentFeed> | null = null;
  let slots: SlotInfo[] = [];
  let accumulator = 0, lastNow: number | null = null;
  let baseline: Snapshot | null = null;
  let intentsSinceBaseline: CompactIntent[][] = [];
  let creditsOpen = false, creditsScroll = 0, scrollHold = 0, scrollDir = 0;

  function start(): void {
    deps.renderer?.reset();
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

  function openCredits(): void { creditsOpen = true; creditsScroll = 0; scrollHold = 0; scrollDir = 0; }
  function closeCredits(): void { creditsOpen = false; }
  /** One line per CREDITS_SCROLL_MS while any active stick is held up or down; the first step in a new direction is immediate. */
  function scrollCredits(frames: readonly InputFrame[], deltaMs: number): void {
    let dir = 0;
    for (const f of frames) if (f.moveY > 0.5) { dir = 1; break; } else if (f.moveY < -0.5) { dir = -1; break; }
    const max = Math.max(0, credits.length - 1);
    const stepOnce = (): void => { creditsScroll = Math.max(0, Math.min(max, creditsScroll + dir)); };
    if (dir !== scrollDir) { scrollDir = dir; scrollHold = 0; if (dir !== 0) stepOnce(); return; }   // new direction: step now, hold from zero
    if (dir === 0) return;
    scrollHold += deltaMs;
    while (scrollHold >= CREDITS_SCROLL_MS) { scrollHold -= CREDITS_SCROLL_MS; stepOnce(); }
  }

  return {
    get phase() { return phase; }, get state() { return state; }, get seed() { return seed; }, get creditsOpen() { return creditsOpen; },
    pause() { if (phase === 'running') { phase = 'paused'; message = 'PAUSED'; accumulator = 0; } },
    resume() { doResume(); },
    frame() {
      const now = deps.now();
      const deltaMs = lastNow === null ? 0 : Math.min(250, now - lastNow);
      const delta = deltaMs / 1000;
      lastNow = now;
      const wasActive = slots.map((s) => s.status === 'active');
      const { frames: raw, slots: s, joinedCount } = dm.update(deps.sampleDevices(), phase === 'lobby' && !creditsOpen);
      // While the credits are open, a slot that became active this frame (a reclaim) gets no say this frame.
      const frames = creditsOpen ? raw.map((f, i) => (wasActive[i] && s[i]!.status === 'active') ? f : { ...NEUTRAL_FRAME }) : raw;
      slots = s;
      if (phase === 'paused' && anyPress(frames, 'confirmPresses') && (deps.canResume ?? (() => true))()) doResume();
      if (phase === 'lobby') {
        if (creditsOpen) {
          if (anyPress(frames, 'cancelPresses') || anyPress(frames, 'confirmPresses')) closeCredits();   // Cancel wins; Confirm closes without starting
          else scrollCredits(frames, deltaMs);
        } else if (anyPress(frames, 'cancelPresses')) openCredits();
        else if (joinedCount > 0 && anyPress(frames, 'confirmPresses')) start();
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
        if (anyPress(frames, 'cancelPresses')) { seed += 1; phase = 'lobby'; message = `New seed. ${LOBBY_MSG}`; }
        else if (anyPress(frames, 'confirmPresses')) { phase = 'lobby'; message = `Same seed. ${LOBBY_MSG}`; }
      }
      // In the error phase the state may be corrupt: never read it again (the draw and HUD are outside the try).
      if (state && deps.renderer && phase !== 'error') deps.renderer.draw(state, phase === 'running' ? accumulator / DT : 1);
      deps.hud?.update(buildHudModel(phase === 'error' ? null : state, slots, phase, message, creditsOpen ? { lines: credits, scroll: creditsScroll } : null));
    }
  };
}

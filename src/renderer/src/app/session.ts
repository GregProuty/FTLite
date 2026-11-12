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
import { telemetryRecord, type TelemetryRecord } from '../sim/telemetry';
import { EMPTY_PROGRESS, applyRun, unlockNames, type Progress } from '../sim/progress';
import { DEFAULT_CHARACTERS } from '../sim/characters';
import { cueCounters, audioCues, type Cue, type CueCounters } from './audioCues';
import { pressCallouts, bubbles, flashingKinds, type Callout, type Bubble } from '../render/calloutModel';

export const DEFAULT_SEED = 2026;
const CRASH_HISTORY = 300;
export const CREDITS_SCROLL_MS = 150;

export interface SessionDeps {
  layout: ShipLayout;
  sampleDevices(): SourceSample[];
  renderer: { reset(): void; recordPrev(s: SimState): void; draw(s: SimState, alpha: number, bubbles?: readonly Bubble[]): void } | null;
  hud: { update(m: HudModel): void } | null;
  now(): number;
  saveCrash(payload: unknown): void;
  /** Called once with the run's record on the tick it ends (spec 4-ii section 7). */
  saveTelemetry?: (record: TelemetryRecord) => void;
  /** Whether a Confirm press may resume a paused session (false while the window is hidden or unfocused). */
  canResume?: () => boolean;
  credits?: readonly string[];
  /** Progress across runs (spec Run-iii section 6): read once at creation, written when a run ends. */
  loadProgress?: () => Progress;
  saveProgress?: (p: Progress) => void;
  /** Plays one audio cue (spec Demo-ii section 5); optional so tests and headless runs need no audio. */
  playCue?: (cue: Cue) => void;
}

export function createSession(deps: SessionDeps) {
  const dm = createDeviceManager();
  const credits = deps.credits ?? [];
  const LOBBY_MSG = 'Press Interact to join. Confirm: start. Cancel: credits';
  let progress: Progress = EMPTY_PROGRESS; try { progress = deps.loadProgress?.() ?? EMPTY_PROGRESS; } catch { progress = EMPTY_PROGRESS; }   // a throwing loader must not stop the session
  let newUnlocks: string[] = [];
  let phase: HudModel['phase'] = 'lobby';
  let message = LOBBY_MSG;
  let seed = DEFAULT_SEED;
  let state: SimState | null = null;
  let feed: ReturnType<typeof createIntentFeed> | null = null;
  let slots: SlotInfo[] = [];
  let accumulator = 0, lastNow: number | null = null;
  let baseline: Snapshot | null = null;
  let intentsSinceBaseline: CompactIntent[][] = [];
  let prevCounters: CueCounters | null = null;
  let creditsOpen = false, creditsScroll = 0, scrollHold = 0, scrollDir = 0;
  let callouts: Callout[] = [];   // spec Coop-i section 3: app state only, never in Intent, replays or snapshots

  function start(): void {
    deps.renderer?.reset();
    const playerCount = slots.filter((s) => s.status !== 'empty').length;
    state = createSimState(deps.layout, playerCount, seed, DEFAULT_CHARACTERS, { unlocked: progress.unlocked }); newUnlocks = [];
    feed = createIntentFeed(playerCount);
    accumulator = 0; baseline = null; intentsSinceBaseline = []; callouts = [];
    prevCounters = cueCounters(state);
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
    get phase() { return phase; }, get state() { return state; }, get seed() { return seed; }, get creditsOpen() { return creditsOpen; }, get callouts(): readonly Callout[] { return callouts; },
    pause() { if (phase === 'running') { phase = 'paused'; message = 'PAUSED'; accumulator = 0; } },
    resume() { doResume(); },
    frame() {
      const now = deps.now();
      const deltaMs = lastNow === null ? 0 : Math.min(250, now - lastNow);
      const delta = deltaMs / 1000;
      lastNow = now;
      const wasActive = slots.map((s) => s.status === 'active');
      const { frames: raw, slots: s, joinedCount, callouts: calloutPresses } = dm.update(deps.sampleDevices(), phase === 'lobby' && !creditsOpen);
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
              const record = telemetryRecord(state, seed); deps.saveTelemetry?.(record);
              const next = applyRun(progress, record); newUnlocks = next.unlocked.filter((id) => !progress.unlocked.includes(id)); progress = next; deps.saveProgress?.(progress);
              phase = 'gameover';
              message = `${state.endReason === EndReason.Hull ? 'HULL LOST' : state.endReason === EndReason.Victory ? 'VICTORY' : 'CREW LOST'} after ${Math.floor(state.tick / TICK_HZ)}s. Confirm: same seed. Cancel: new seed.`;
              break;
            }
          }
          // Once per frame, after the tick loop (also on the ending frame, so it carries its terminal cue): spec Demo-ii section 5.
          const nextCounters = cueCounters(state);
          if (prevCounters) for (const c of audioCues(prevCounters, nextCounters)) deps.playCue?.(c);
          prevCounters = nextCounters;
          if (phase === 'running') {   // callouts, after the ticks: the text reads the state the players see this frame
            const pressed = calloutPresses.flatMap((n, pid) => (n > 0 ? [pid] : []));
            callouts = pressCallouts(callouts, state, pressed);
            if (pressed.some((pid) => pid < state!.playerCount)) deps.playCue?.('callout');
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
      if (state && deps.renderer && phase !== 'error') deps.renderer.draw(state, phase === 'running' ? accumulator / DT : 1, phase === 'running' || phase === 'paused' ? bubbles(state, callouts, state.tick) : []);
      deps.hud?.update(buildHudModel(phase === 'error' ? null : state, slots, phase, message, creditsOpen ? { lines: credits, scroll: creditsScroll } : null, phase === 'gameover' || phase === 'lobby' ? { bestScore: progress.bestScore, runs: progress.runs, victories: progress.victories, newUnlocks: unlockNames(newUnlocks), unlocked: unlockNames(progress.unlocked) } : null, state && phase === 'running' ? flashingKinds(callouts, state.tick) : []));
    }
  };
}

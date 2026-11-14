import type { ShipLayout } from '../sim/ship/schema';
import type { SimState } from '../sim/state';
import { TICK_HZ } from '../sim/tuning';
import { createLocalRuntime } from './localRuntime';
import type { createAuthority } from '../authority/authority';
import type { Scheduler, Unsubscribe } from '../net/contracts';
import { createDeviceManager, type SourceSample, type SlotInfo } from '../input/deviceManager';
import { NEUTRAL_FRAME, type InputFrame } from './intents';
import { createInputTimeline } from './inputTimeline';
import { buildHudModel, type HudModel } from '../render/hudModel';
import { EndReason } from '../sim/crew';
import { type TelemetryRecord } from '../sim/telemetry';
import { EMPTY_PROGRESS, applyRun, unlockNames, type Progress } from '../sim/progress';
import { DEFAULT_CHARACTERS } from '../sim/characters';
import { cueCounters, audioCues, type Cue, type CueCounters } from './audioCues';
import { pressCallouts, bubbles, flashingKinds, type Callout, type Bubble } from '../render/calloutModel';

export const DEFAULT_SEED = 2026;
export const CREDITS_SCROLL_MS = 150;

export interface SessionDeps {
  /** The ship, or the ship for the run's player count (spec Demo-x-a section 3). */
  layout: ShipLayout | ((playerCount: number) => ShipLayout);
  sampleDevices(): SourceSample[];
  renderer: { reset(): void; recordPrev(s: SimState): void; draw(s: SimState, alpha: number, bubbles?: readonly Bubble[]): void } | null;
  hud: { update(m: HudModel): void } | null;
  now(): number;
  scheduler?: Scheduler;
  contentDigest?: string;
  authorityFactory?: typeof createAuthority;
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
  let timeline: ReturnType<typeof createInputTimeline> | null = null;
  let slots: SlotInfo[] = [];
  let lastNow: number | null = null, runCounter = 0;
  let runtime: ReturnType<typeof createLocalRuntime> | null = null, cancelLobby: Unsubscribe | null = null;
  let disposed = false;
  const scheduler = deps.scheduler ?? { schedule: () => () => {} };
  let prevCounters: CueCounters | null = null;
  const pendingCues = new Set<Cue>();
  let creditsOpen = false, creditsScroll = 0, scrollHold = 0, scrollDir = 0;
  let callouts: Callout[] = [];   // spec Coop-i section 3: app state only, never in Intent, replays or snapshots

  function scheduleLobby(): void {
    cancelLobby?.();
    if (!disposed && phase !== 'running' && phase !== 'paused') cancelLobby = scheduler.schedule(1000 / 120, () => { pump(); scheduleLobby(); });
  }
  function start(): void {
    cancelLobby?.(); runtime?.dispose(); deps.renderer?.reset();
    const playerCount = slots.filter((s) => s.status !== 'empty').length;
    const layout = typeof deps.layout === 'function' ? deps.layout(playerCount) : deps.layout;
    timeline = createInputTimeline(playerCount); newUnlocks = []; callouts = []; prevCounters = null; pendingCues.clear();
    phase = 'running'; message = '';
    runtime = createLocalRuntime({
      layout, playerCount, seed, characters: DEFAULT_CHARACTERS, unlocked: progress.unlocked,
      runId: `couch-${++runCounter}`, contentDigest: deps.contentDigest ?? __GAMEPLAY_CONTENT_DIGEST__,
      clock: { nowMs: deps.now }, scheduler, authorityFactory: deps.authorityFactory,
      beforeControls: sampleControls,
      frames: (_tick, deadline) => timeline!.consume(deadline),
      recordPrev: (view) => deps.renderer?.recordPrev(view),
      onPublication(view, publication) {
        state = view;
        if (phase === 'running' || phase === 'paused') {
          if (publication.phase === 'paused') { phase = 'paused'; message = 'PAUSED'; }
          else if (publication.phase === 'running') { phase = 'running'; message = publication.lagTicks > 0 ? `CATCHING UP (${publication.lagTicks} ticks)` : ''; }
        }
        const next = cueCounters(view); if (prevCounters) for (const cue of audioCues(prevCounters, next)) pendingCues.add(cue); prevCounters = next;
      },
      onEvent(event) {
        if (event.payload.kind !== 'ended' || phase === 'gameover') return;
        const record = event.payload.record; deps.saveTelemetry?.(record);
        const next = applyRun(progress, record); newUnlocks = next.unlocked.filter((id) => !progress.unlocked.includes(id)); progress = next; deps.saveProgress?.(progress);
        phase = 'gameover';
        message = `${state!.endReason === EndReason.Hull ? 'HULL LOST' : state!.endReason === EndReason.Victory ? 'VICTORY' : 'CREW LOST'} after ${Math.floor(state!.tick / TICK_HZ)}s. Confirm: same seed. Cancel: new seed.`;
        scheduleLobby();
      },
      onCrash(record) { phase = 'error'; message = `Sim fault: ${record.error}. Crash data saved.`; deps.saveCrash(record); },
      draw(view, alpha) { deps.renderer?.draw(view, alpha, phase === 'running' || phase === 'paused' ? bubbles(view, callouts, view.tick) : []); }
    });
    state = runtime.state();
  }

  function anyPress(frames: { confirmPresses: number; cancelPresses: number }[], key: 'confirmPresses' | 'cancelPresses'): boolean {
    return frames.some((f) => f[key] > 0);
  }

  function doResume(reason?: string, player = 0): void {
    if (phase === 'paused') {
      if (reason) runtime?.requestLifecyclePause({ paused: false, reason });
      else runtime?.requestPause(false, player);
      phase = 'running'; message = ''; lastNow = null;
    }
  }

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

  function sampleControls(): void {
      const now = deps.now();
      const deltaMs = lastNow === null ? 0 : Math.min(250, now - lastNow);
      lastNow = now;
      const wasActive = slots.map((s) => s.status === 'active');
      const { frames: raw, slots: s, joinedCount, callouts: calloutPresses } = dm.update(deps.sampleDevices(), phase === 'lobby' && !creditsOpen);
      // While the credits are open, a slot that became active this frame (a reclaim) gets no say this frame.
      const frames = creditsOpen ? raw.map((f, i) => (wasActive[i] && s[i]!.status === 'active') ? f : { ...NEUTRAL_FRAME }) : raw;
      slots = s;
      if (phase === 'paused' && anyPress(frames, 'confirmPresses') && (deps.canResume ?? (() => true))()) doResume(undefined, frames.findIndex((f) => f.confirmPresses > 0));
      if (phase === 'lobby') {
        if (creditsOpen) {
          if (anyPress(frames, 'cancelPresses') || anyPress(frames, 'confirmPresses')) closeCredits();   // Cancel wins; Confirm closes without starting
          else scrollCredits(frames, deltaMs);
        } else if (anyPress(frames, 'cancelPresses')) openCredits();
        else if (joinedCount > 0 && anyPress(frames, 'confirmPresses')) start();
      } else if (phase === 'running' && state && timeline) {
        timeline.sample(now, frames);
        const pressed = calloutPresses.flatMap((n, pid) => n > 0 ? [pid] : []);
        callouts = pressCallouts(callouts, state, pressed);
        if (pressed.some((pid) => pid < state!.playerCount)) deps.playCue?.('callout');
      } else if (phase === 'gameover') {
        if (anyPress(frames, 'cancelPresses')) { seed += 1; phase = 'lobby'; message = `New seed. ${LOBBY_MSG}`; }
        else if (anyPress(frames, 'confirmPresses')) { phase = 'lobby'; message = `Same seed. ${LOBBY_MSG}`; }
      }
  }
  function pump(): void {
    if (disposed) return;
    if (runtime && (phase === 'running' || phase === 'paused')) runtime.pump(); else sampleControls();
  }
  scheduleLobby();
  return {
    get phase() { return phase; }, get state() { return state; }, get seed() { return seed; }, get creditsOpen() { return creditsOpen; }, get callouts(): readonly Callout[] { return callouts; },
    pause(reason = 'suspend') { if (phase === 'running') { timeline?.neutralize(deps.now()); runtime?.requestLifecyclePause({ paused: true, reason }); phase = 'paused'; message = 'PAUSED'; } },
    resume(reason = 'resume') { doResume(reason); }, pump,
    dispose() { disposed = true; cancelLobby?.(); runtime?.dispose(); },
    frame() {
      for (const cue of pendingCues) deps.playCue?.(cue); pendingCues.clear();
      if (phase !== 'error') runtime?.frame();
      deps.hud?.update(buildHudModel(phase === 'error' ? null : state, slots, phase, message, creditsOpen ? { lines: credits, scroll: creditsScroll } : null, phase === 'gameover' || phase === 'lobby' ? { bestScore: progress.bestScore, runs: progress.runs, victories: progress.victories, newUnlocks: unlockNames(newUnlocks), unlocked: unlockNames(progress.unlocked) } : null, state && phase === 'running' ? flashingKinds(callouts, state.tick) : []));
    }
  };
}

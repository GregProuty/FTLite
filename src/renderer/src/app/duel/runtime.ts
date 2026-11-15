// The local runtimes for the Helm demo views (H-1 spec §4, §9): the renderer steps the sim itself on a 60 Hz wall-clock
// driver until H-0c-ii puts the duel behind the authority. The flight runtime steps the single-ship flight; the duel
// runtime steps stepDuelTick with the solo player's commands (spec §5) and owns both console cameras.
import { createTickDriver } from '../../authority/tickDriver';
import type { HeldInput, Scheduler } from '../../net/contracts';
import { Position } from '../../sim/components';
import type { DuelCommand, DuelEnvelope, DuelResult } from '../../sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../../sim/duel/state';
import { stepDuelTick } from '../../sim/duel/step';
import type { ShipLayout } from '../../sim/ship/schema';
import { stepSoloFlight } from '../../sim/tactical/physics';
import { createTacticalState, NO_AXES, Outcome, type Axes, type TacticalState } from '../../sim/tactical/state';
import { TICK_HZ } from '../../sim/tuning';
import { createCamera, followBody, pan, snapBack, updateCamera, zoomBy, type Camera, type Viewport } from '../../render/tactical/camera';
import { createFeelTracker, recordFeel, type FeelTracker } from '../../render/tactical/feelModel';
import type { OtherStatus } from '../../render/duel/readoutModel';
import type { ViewEvent } from '../../render/tactical/fxModel';
import { followTarget, type PrevBody } from '../../render/tactical/tacticalModel';
import { consoleInReach, cycleLock, repairInReach, seatOf } from './controls';
import { accumulateWheel, emptyPresses, helmAxes, WHEEL_IDLE_MS, type KeySample, type PointerSample } from './input';

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

/**
 * The pause-reason set and the tick driver it gates. A pause discards the driver, and with it any ticks already due:
 * resuming (or `restart`) starts a fresh driver at the current wall time, so a delayed frame that pauses (or a long blur)
 * never catches up in a burst afterwards. `halted` stops the driver for good until the next restart (a duel's end).
 */
function createPacer(now: () => number, scheduler: Scheduler, onTick: (tick: number, tickTimeMs: number) => void, halted: () => boolean = () => false) {
  const reasons = new Set<PauseReason>();
  let driver: ReturnType<typeof createTickDriver> | null = null, disposed = false;
  const sync = (): void => {
    if (disposed) return;
    const run = reasons.size === 0 && !halted();
    if (!run && driver) { driver.dispose(); driver = null; }
    else if (run && !driver) driver = createTickDriver({ nowMs: now }, scheduler, onTick);
  };
  sync();
  return {
    reasons, sync,
    pump(): void { driver?.pump(); },
    toggleUser(n: number): void { for (let k = 0; k < n; k++) { if (reasons.has('user')) reasons.delete('user'); else reasons.add('user'); } },
    /** Drop the driver now and start a fresh one (if running is allowed) at the current wall time. */
    restart(): void { driver?.dispose(); driver = null; sync(); },
    dispose(): void { disposed = true; driver?.dispose(); driver = null; }
  };
}

/** The per-frame camera input shared by both runtimes: zoom keys, drag before wheel (a pan clears the zoom anchor, so a
 *  drag and a wheel in one frame still zoom about the cursor), and the wheel's notch accumulator with its idle reset. */
function createCameraInput(now: () => number, vp: Viewport) {
  let wheelAcc = 0, lastWheelAt = -Infinity;
  return {
    apply(camera: Camera, k: KeySample, p: PointerSample): void {
      zoomBy(camera, vp, k.presses.zoomIn - k.presses.zoomOut);
      pan(camera, p.dragX, p.dragY);
      const t = now();
      if (t - lastWheelAt > WHEEL_IDLE_MS) wheelAcc = 0;   // check the idle gap before recording this frame's wheel
      if (p.wheel !== 0) lastWheelAt = t;
      const w = accumulateWheel(wheelAcc, p.wheel); wheelAcc = w.acc;
      zoomBy(camera, vp, w.notches, p.x !== null && p.y !== null ? { x: p.x, y: p.y } : null);
    },
    reset(): void { wheelAcc = 0; lastWheelAt = -Infinity; }
  };
}

const alphaAt = (now: number, lastTickTime: number | null): number => lastTickTime === null ? 1 : Math.max(0, Math.min(1, (now - lastTickTime) * TICK_HZ / 1000));

export function createFlightRuntime(deps: FlightRuntimeDeps): FlightRuntime {
  const state = createTacticalState(deps.seed);
  const prev: PrevBody[] = state.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
  const camera = createCamera(state.ships[0].x, state.ships[0].y);
  const feel = createFeelTracker();
  let held: Axes = NO_AXES, sent: Axes = NO_AXES, lastTickTime: number | null = null;
  const onTick = (_tick: number, tickTimeMs: number): void => {
    state.ships.forEach((s, i) => { const p = prev[i]!; p.x = s.x; p.y = s.y; p.h = s.heading + s.headingAcc; });
    sent = held;
    stepSoloFlight(state, sent);
    recordFeel(feel, state.ships[0], state.map.planet);
    lastTickTime = tickTimeMs;
  };
  const pacer = createPacer(deps.now, deps.scheduler, onTick), cameraInput = createCameraInput(deps.now, deps.viewport);
  let frameAlpha = 1;
  const alpha = (): number => frameAlpha;
  return {
    state, prev, camera, feel, alpha,
    axes: () => sent,
    frame(dt) {
      const k = deps.sampleKeys(), p = deps.samplePointer();
      held = helmAxes(k);
      pacer.toggleUser(k.presses.pause);
      pacer.sync();     // an Escape this frame pauses before any due tick runs
      pacer.pump();     // run any due ticks with this frame's held axes before drawing (no driver while paused)
      frameAlpha = alphaAt(deps.now(), lastTickTime);
      if (k.presses.camera > 0) snapBack(camera);
      cameraInput.apply(camera, k, p);
      updateCamera(camera, deps.viewport, dt, followTarget(state, prev, frameAlpha, camera.follow));
    },
    pause(reason) { pacer.reasons.add(reason); pacer.sync(); },
    resume(reason) { pacer.reasons.delete(reason); pacer.sync(); },
    paused: () => pacer.reasons.size > 0,
    reasons: () => pacer.reasons,
    dispose() { pacer.dispose(); }
  };
}

/** What the active character's screen is (spec §1): its console's map view when seated, the interior when standing. */
export type DuelView = 'helm' | 'weapons' | 'interior';

export interface DuelRuntimeDeps extends FlightRuntimeDeps {
  /** The Cutter (spec parent §8). */
  layout: ShipLayout;
  /** Drop the keyboard's held keys and press edges (Tab and restart, spec §4, §5). */
  clearKeys?(): void;
}

export interface DuelRuntime {
  /** The duel now running; a restart replaces it. */
  readonly duel: DuelState;
  readonly seed: number;
  /** How many restarts so far: a view that sees it change rebuilds its caches (spec §4 restart). */
  epoch(): number;
  /** The player the keyboard drives (spec §5): 0 at the start of every duel. */
  active(): 0 | 1;
  view(): DuelView;
  /** The other character's status for the readouts (spec §7 item 9). */
  otherStatus(): OtherStatus;
  /** Before the last tick: each ship's position and heading, each ship's missile (or null), each character's position. */
  readonly prev: readonly PrevBody[];
  readonly missilePrev: readonly (PrevBody | null)[];
  readonly crewPrev: readonly { x: number; y: number }[];
  /** Each console's own camera, kept for whoever sits there next (spec §6). */
  readonly cameras: { readonly helm: Camera; readonly weapons: Camera };
  /** The Helm's axes and the gunner's steering the last tick sent (zero while that console is empty, spec §7). */
  axes(): Axes;
  steer(): number;
  /** The held input the last tick sent, per player. */
  held(): readonly HeldInput[];
  alpha(): number;
  frame(dt: number): void;
  pause(reason: PauseReason): void;
  resume(reason: PauseReason): void;
  paused(): boolean;
  reasons(): ReadonlySet<PauseReason>;
  /** The view events queued since the last call: the sim's events and the detected contacts (spec §7 item 8). */
  drainEvents(): ViewEvent[];
  /** The results of the last tick's commands (for tests and the console log). */
  lastResults(): readonly DuelResult[];
  /** True once the duel's outcome is decided: stepping has stopped and Enter restarts (spec §4). */
  ended(): boolean;
  dispose(): void;
}

const NEUTRAL: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const IDLE_KEYS = (): KeySample => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() });
const shipBody = (s: TacticalState['ships'][number]): PrevBody => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc });
const missileBody = (m: TacticalState['missiles'][number]): PrevBody | null => (m ? { x: m.x, y: m.y, h: m.heading + m.headingAcc } : null);
const hitCounts = (d: DuelState): number[][] => d.tactical.ships.map((s) => [s.planetHits, s.asteroidHits, s.shipHits]);

export function createDuelRuntime(deps: DuelRuntimeDeps): DuelRuntime {
  let seed = deps.seed, d = createDuel(deps.layout, seed), epoch = 0;
  let active: 0 | 1 = 0, firstTick = true, seq = [0, 0], pending: { player: number; command: DuelCommand }[] = [];
  // The sim checks sits and stands against presence before it applies that tick's presence commands, so a seat change
  // queued after a Tab waits here until the Tab's presence tick has run, then goes out on the following tick.
  let switching = false, deferred: { player: number; command: DuelCommand }[] = [];
  let activeHeld: HeldInput = NEUTRAL, sentHeld: readonly HeldInput[] = [NEUTRAL, NEUTRAL], sentAxes: Axes = NO_AXES, sentSteer = 0;
  let chargeSent = false, events: ViewEvent[] = [], results: DuelResult[] = [], counts = hitCounts(d), lastTickTime: number | null = null, frameAlpha = 1;
  let prev: PrevBody[] = [], missilePrev: (PrevBody | null)[] = [], crewPrev: { x: number; y: number }[] = [], cameras = { helm: createCamera(), weapons: createCamera() };
  const capture = (): void => {
    prev = d.tactical.ships.map(shipBody);
    missilePrev = d.tactical.missiles.map(missileBody);
    crewPrev = d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! }));
  };
  const freshCameras = (): void => { const s = d.tactical.ships[0]; cameras = { helm: createCamera(s.x, s.y), weapons: createCamera(s.x, s.y) }; };
  capture(); freshCameras();
  const ended = (): boolean => d.tactical.outcome !== Outcome.Running;
  /** The player seated at station i who is present, or −1 (the sim's attendant rule). */
  const attendant = (station: number): number => { const pid = d.interior.stations.occupant[station]!; return pid >= 0 && d.present[pid as 0 | 1] ? pid : -1; };

  const onTick = (_tick: number, tickTimeMs: number): void => {
    if (ended()) return;
    capture();
    const commands: DuelEnvelope[] = [];
    const envelope = (player: number, command: DuelCommand): DuelEnvelope => ({ id: { player, sequence: seq[player]!++ }, requestedTick: d.interior.tick, command });
    if (firstTick) { commands.push(envelope(1, { kind: 'presence', present: false })); firstTick = false; }   // the solo start rule (spec §4)
    for (const c of pending) commands.push(envelope(c.player, c.command));
    const sentSwitch = switching;
    pending = [];
    const held: HeldInput[] = [NEUTRAL, NEUTRAL];
    held[active] = activeHeld;
    results = stepDuelTick(d, { held, commands });
    sentHeld = held;
    const helm = attendant(d.nav), gunner = attendant(d.weapons);
    sentAxes = helm >= 0 ? helmAxes(held[helm]!) : NO_AXES;
    sentSteer = gunner >= 0 ? Math.sign(held[gunner]!.moveX) || 0 : 0;
    for (const e of d.tactical.events) events.push(e);
    // Contact sparks (spec §7 item 8): the sim emits no contact events, so an increase in a hit counter is one.
    const now = hitCounts(d);
    d.tactical.ships.forEach((s, i) => (['planet', 'asteroid', 'ship'] as const).forEach((body, k) => {
      if (now[i]![k]! > counts[i]![k]!) events.push({ kind: 'contact', ship: i, body, x: s.x, y: s.y });
    }));
    counts = now;
    if (sentSwitch) { switching = false; pending = deferred; deferred = []; }   // presence applied: the held seat changes go next tick
    lastTickTime = tickTimeMs;
    if (ended()) pacer.sync();   // the duel is decided: stop stepping (spec §4 End)
  };
  const pacer = createPacer(deps.now, deps.scheduler, onTick, ended), cameraInput = createCameraInput(deps.now, deps.viewport);
  const queue = (command: DuelCommand): void => {
    const seat = command.kind === 'sit' || command.kind === 'stand';
    (seat && switching ? deferred : pending).push({ player: active, command });
  };

  function restart(): void {
    disposeDuel(d);
    seed += 1; d = createDuel(deps.layout, seed); epoch++;
    active = 0; firstTick = true; seq = [0, 0]; pending = []; switching = false; deferred = [];
    activeHeld = NEUTRAL; sentHeld = [NEUTRAL, NEUTRAL]; sentAxes = NO_AXES; sentSteer = 0;
    chargeSent = false; events = []; results = []; counts = hitCounts(d); lastTickTime = null; frameAlpha = 1;
    capture(); freshCameras(); cameraInput.reset();
    deps.clearKeys?.();
    pacer.restart();   // a fresh driver: the new duel's ticks start from now
  }

  /** One frame's press edges for the active character, by where it is (spec §5 table). */
  function play(k: KeySample): KeySample {
    if (k.presses.switch > 0) {   // Tab: presence false for the character left, true for the one taken, same tick; nothing carries over
      for (let n = 0; n < k.presses.switch; n++) {
        queue({ kind: 'presence', present: false });
        active = active === 0 ? 1 : 0;
        queue({ kind: 'presence', present: true });
      }
      switching = true;
      chargeSent = false;   // the console left is empty from this tick: the sim lets go of Fire without firing
      deps.clearKeys?.();
      return IDLE_KEYS();
    }
    const seat = seatOf(d, active), p = k.presses;
    if (seat === 'standing') {
      if (p.interact > 0 && repairInReach(d, active) < 0) { const c = consoleInReach(d, active); if (c >= 0) queue({ kind: 'sit', station: c }); }
      return k;
    }
    if (p.stand > 0) { queue({ kind: 'stand' }); chargeSent = false; return k; }
    if (seat === 'helm') { if (p.camera > 0) snapBack(cameras.helm); return k; }
    const steps = p.interact - p.prevLock;
    if (p.interact + p.prevLock > 0) {
      const last = [...pending].reverse().find((c) => c.player === active && c.command.kind === 'laserLock')?.command;
      let room = last && last.kind === 'laserLock' ? last.room : d.tactical.ships[0].lock;
      for (let n = 0; n < Math.abs(steps); n++) room = cycleLock(room, steps > 0 ? 1 : -1);
      queue({ kind: 'laserLock', room });
    }
    const down = (): void => { queue({ kind: 'laserCharge', held: true }); chargeSent = true; };
    const up = (): void => { queue({ kind: 'laserCharge', held: false }); chargeSent = false; };
    if (p.fireDown > 0 && p.fireUp > 0) { if (k.fireHeld) { up(); down(); } else { down(); up(); } }
    else if (p.fireDown > 0) down();
    else if (p.fireUp > 0) up();
    else if (chargeSent && !k.fireHeld) up();   // a release the keyboard never saw (a blur cleared it): let go now
    if (p.launch > 0) queue({ kind: 'missileLaunch' });
    if (p.camera > 0) {
      const cam = cameras.weapons;
      snapBack(cam, d.tactical.missiles[0] && cam.follow !== 'missile' ? 'missile' : 'ship');
    }
    return k;
  }

  return {
    get duel() { return d; },
    get seed() { return seed; },
    get prev() { return prev; },
    get missilePrev() { return missilePrev; },
    get crewPrev() { return crewPrev; },
    get cameras() { return cameras; },
    epoch: () => epoch,
    active: () => active,
    view: () => { const s = seatOf(d, active); return s === 'standing' ? 'interior' : s; },
    otherStatus() {
      const other = active === 0 ? 1 : 0, s = seatOf(d, other);
      if (s !== 'standing') return s === 'helm' ? 'AT HELM' : 'AT WEAPONS';
      return d.present[other] && sentHeld[other]!.interactHeld && repairInReach(d, other) >= 0 ? 'REPAIRING' : 'WALKING';
    },
    axes: () => sentAxes,
    steer: () => sentSteer,
    held: () => sentHeld,
    alpha: () => frameAlpha,
    frame(dt) {
      let k = deps.sampleKeys();
      const p = deps.samplePointer();
      pacer.toggleUser(k.presses.pause);
      if (ended()) { if (k.presses.confirm > 0) { restart(); k = IDLE_KEYS(); } }
      else if (pacer.reasons.size === 0) k = play(k);   // while paused, gameplay presses are dropped; the camera still moves
      activeHeld = { moveX: k.moveX, moveY: k.moveY, interactHeld: k.interactHeld };
      pacer.sync();   // an Escape this frame pauses before any due tick runs
      pacer.pump();
      frameAlpha = alphaAt(deps.now(), lastTickTime);
      const view = seatOf(d, active), cam = view === 'helm' ? cameras.helm : view === 'weapons' ? cameras.weapons : null;
      if (cam) cameraInput.apply(cam, k, p);
      for (const c of [cameras.helm, cameras.weapons]) {
        if (c.follow === 'missile' && !d.tactical.missiles[0]) followBody(c, 'ship');   // the followed missile ended
        updateCamera(c, deps.viewport, dt, followTarget(d.tactical, prev, frameAlpha, c.follow));
      }
    },
    pause(reason) { pacer.reasons.add(reason); pacer.sync(); },
    resume(reason) { pacer.reasons.delete(reason); pacer.sync(); },
    paused: () => pacer.reasons.size > 0,
    reasons: () => pacer.reasons,
    drainEvents() { const out = events; events = []; return out; },
    lastResults: () => results,
    ended,
    dispose() { pacer.dispose(); disposeDuel(d); }
  };
}

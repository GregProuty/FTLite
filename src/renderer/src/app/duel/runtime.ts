// The local runtimes for the Helm demo views (H-1 spec §4, §9): the renderer steps the sim itself on a 60 Hz wall-clock
// driver until H-0c-ii puts the duel behind the authority. The flight runtime steps the single-ship flight; the duel
// runtime steps stepDuelTick with the solo player's commands (spec §5) and owns both console cameras. H-2 spec §3, §7:
// held axes are quantised to −1, 0 or 1 as online, and a decided round's end card keeps ticking until Enter sends the
// same `rematch` command the online duel sends. H-2b: the duel runtime keeps the round's telemetry accumulator, as the
// authority does, and hands each decided round's record to `onRound` (Single player's solo playtest records).
import { createTickDriver } from '../../authority/tickDriver';
import type { HeldInput, Scheduler } from '../../net/contracts';
import { Life, LifeState, Position } from '../../sim/components';
import { LOCAL_DUEL_RUN, type DuelCommand, type DuelEnvelope, type DuelResult } from '../../sim/duel/commands';
import { canCharge, canLaunch } from '../../sim/tactical/weapons';
import { createDuel, disposeDuel, type DuelState } from '../../sim/duel/state';
import { stepDuelTick } from '../../sim/duel/step';
import { throttleThrust } from '../../sim/duel/throttle';
import { duelEndSummary, duelRoundRecord, type DuelRoundRecord } from '../../sim/duel/summary';
import { createTelemetry, recordTick } from '../../sim/duel/telemetry';
import type { ShipLayout } from '../../sim/ship/schema';
import { stepSoloFlight } from '../../sim/tactical/physics';
import { createTacticalState, missileOf, NO_AXES, Outcome, type Axes, type Missile, type TacticalState } from '../../sim/tactical/state';
import { TICK_HZ } from '../../sim/tuning';
import { createCamera, followBody, pan, snapBack, updateCamera, zoomBy, type Camera, type Viewport } from '../../render/tactical/camera';
import { createFeelTracker, recordFeel, type FeelTracker } from '../../render/tactical/feelModel';
import { createInteriorCamera, interiorInput, refollowInteriorCamera, resetInteriorCamera, type InteriorCamera } from '../../render/duel/interiorCamera';
import type { OtherStatus } from '../../render/duel/readoutModel';
import { interpolatedMissile, type ViewEvent } from '../../render/tactical/fxModel';
import { followTarget, type PrevBody } from '../../render/tactical/tacticalModel';
import { consoleInReach, cycleLock, repairInReach, seatOf } from './controls';
import { accumulateWheel, emptyPresses, helmAxes, NO_HELD_FLAGS, throttleRequest, WHEEL_IDLE_MS, type HeldFlags, type KeySample, type PointerSample } from './input';

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

/** The per-frame camera input shared by the runtimes and the online duel: zoom keys, drag before wheel (a pan clears the
 *  zoom anchor, so a drag and a wheel in one frame still zoom about the cursor), and the wheel's notch accumulator with
 *  its idle reset. `applyInterior` feeds the interior's zoom camera (interior zoom spec) from the same accumulator, with
 *  C to follow the character again. */
export function createCameraInput(now: () => number, vp: Viewport) {
  let wheelAcc = 0, lastWheelAt = -Infinity;
  const notches = (wheel: number): number => {
    const t = now();
    if (t - lastWheelAt > WHEEL_IDLE_MS) wheelAcc = 0;   // check the idle gap before recording this frame's wheel
    if (wheel !== 0) lastWheelAt = t;
    const w = accumulateWheel(wheelAcc, wheel); wheelAcc = w.acc;
    return w.notches;
  };
  const cursor = (p: PointerSample): { x: number; y: number } | null => (p.x !== null && p.y !== null ? { x: p.x, y: p.y } : null);
  return {
    apply(camera: Camera, k: KeySample, p: PointerSample): void {
      zoomBy(camera, vp, k.presses.zoomIn - k.presses.zoomOut);
      pan(camera, p.dragX, p.dragY);
      zoomBy(camera, vp, notches(p.wheel), cursor(p));
    },
    applyInterior(camera: InteriorCamera, k: KeySample, p: PointerSample): void {
      const keys = k.presses.zoomIn - k.presses.zoomOut, wheel = notches(p.wheel);
      interiorInput(camera, { notches: keys + wheel, anchor: wheel !== 0 ? cursor(p) : null, dragX: p.dragX, dragY: p.dragY, follow: k.presses.camera > 0 });
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
export type DuelView = 'helm' | 'weapons' | 'science' | 'interior';

export interface DuelRuntimeDeps extends FlightRuntimeDeps {
  /** The duel ship, the Hound (spec parent §8). */
  layout: ShipLayout;
  /** Drop the keyboard's held keys and press edges (Tab and restart, spec §4, §5). */
  clearKeys?(): void;
  /** Each decided round's record, once, on the tick it is decided (H-2 spec §8: Single player's solo records). */
  onRound?(record: DuelRoundRecord): void;
}

export interface DuelRuntime {
  /** The duel now running; a rematch starts its next round in place. */
  readonly duel: DuelState;
  /** The current round's seed. */
  readonly seed: number;
  /** The round (H-2 spec §7): a view that sees it change rebuilds its caches. */
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
  readonly cameras: { readonly helm: Camera; readonly weapons: Camera; readonly science: Camera };
  /** The interior's zoom and follow (interior zoom spec): kept across pause, re-following on Tab, reset each round. */
  readonly interiorCamera: InteriorCamera;
  /** The Helm's axes the last tick flew: the held turn and the throttle's thrust (Artemis spec §5.3). Zero while the
   *  Helm is empty or the round is decided. The gunner's steering the last tick sent (zero while Weapons is empty). */
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
  /** True once the round is decided: the end card, where Enter sends a rematch (H-2 spec §7). */
  ended(): boolean;
  /** True once M was pressed while user-paused or on the end screen: the app returns to its main menu (main menu spec). */
  menuRequested(): boolean;
  /** Single player: Tab takes the other character (Artemis spec §6.3). */
  readonly mode: 'single';
  /** The merged held keys and console holds of the last frame (Artemis spec §6.1). */
  uiHeld(): HeldFlags;
  /** Not paused for any reason and not ended (Artemis spec §6.1: the console shows only then). */
  running(): boolean;
  /** The Helm throttle level the console shows (Artemis spec §6.1): the active player's latest queued throttle, else the duel's. */
  throttle(): number;
  dispose(): void;
}

const isWeaponsCommand = (c: DuelCommand): boolean => c.kind === 'laserLock' || c.kind === 'laserCharge' || c.kind === 'missileLaunch';
/** The commands only a seated console's player sends (Weapons and the Helm's throttle): a Tab or a stand drops them. */
const isConsoleCommand = (c: DuelCommand): boolean => isWeaponsCommand(c) || c.kind === 'throttle';
const NEUTRAL: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const IDLE_KEYS = (): KeySample => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() });
const shipBody = (s: TacticalState['ships'][number]): PrevBody => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc });
const missileBody = (m: Missile | null): PrevBody | null => (m ? { x: m.x, y: m.y, h: m.heading + m.headingAcc } : null);
const hitCounts = (d: DuelState): number[][] => d.tactical.ships.map((s) => [s.planetHits, s.asteroidHits, s.shipHits]);

export function createDuelRuntime(deps: DuelRuntimeDeps): DuelRuntime {
  const d = createDuel(deps.layout, deps.seed);
  let telemetry = createTelemetry(d);   // the round's accumulator, as the authority's duel rules keep it
  let round = 0, active: 0 | 1 = 0, firstTick = true, seq = [0, 0], pending: { player: number; command: DuelCommand }[] = [];
  // The sim checks sits and stands against presence before it applies that tick's presence commands, so a seat change
  // queued after a Tab waits here until the Tab's presence tick has run, then goes out on the following tick.
  let switching = false, deferred: { player: number; command: DuelCommand }[] = [];
  let lastHeld: HeldFlags = NO_HELD_FLAGS;   // the last frame's merged held flags (Artemis spec §6.1)
  let activeHeld: HeldInput = NEUTRAL, sentHeld: readonly HeldInput[] = [NEUTRAL, NEUTRAL], sentAxes: Axes = NO_AXES, sentSteer = 0;
  let menuAsked = false;
  let chargeSent = false, events: ViewEvent[] = [], results: DuelResult[] = [], counts = hitCounts(d), lastTickTime: number | null = null, frameAlpha = 1;
  let prev: PrevBody[] = [], missilePrev: (PrevBody | null)[] = [], crewPrev: { x: number; y: number }[] = [], cameras = { helm: createCamera(), weapons: createCamera(), science: createCamera() };
  const interiorCamera = createInteriorCamera();
  const capture = (): void => {
    prev = d.tactical.ships.map(shipBody);
    missilePrev = d.tactical.ships.map((_, i) => missileBody(missileOf(d.tactical, i)));   // by owner, as interpolatedMissile reads it
    crewPrev = d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! }));
  };
  const freshCameras = (): void => { const s = d.tactical.ships[0]; cameras = { helm: createCamera(s.x, s.y), weapons: createCamera(s.x, s.y), science: createCamera(s.x, s.y) }; };
  capture(); freshCameras();
  const ended = (): boolean => d.tactical.outcome !== Outcome.Running;
  /** The player seated at station i who is present, or −1 (the sim's attendant rule). */
  const attendant = (station: number): number => { const pid = d.interior.stations.occupant[station]!; return pid >= 0 && d.present[pid as 0 | 1] ? pid : -1; };

  const onTick = (_tick: number, tickTimeMs: number): void => {
    capture();
    const commands: DuelEnvelope[] = [];
    const envelope = (player: number, command: DuelCommand): DuelEnvelope => ({ runId: LOCAL_DUEL_RUN, id: { player, sequence: seq[player]!++ }, requestedTick: d.interior.tick, command });
    if (firstTick) { commands.push(envelope(1, { kind: 'presence', present: false })); firstTick = false; }   // the solo start rule (spec §4)
    // Weapons commands go out only when the sim would accept them (spec §7 table; canCharge / canLaunch), judged against the
    // state this tick will see. `chargeSent` is the truth about what the sim holds: a release goes out only after a press did.
    let launched = false;
    for (const c of pending) {
      const k = c.command;
      if (k.kind === 'laserCharge') {
        // The sim applies charge before launch within a tick (lock, charge, launch), so a launch in this tick never voids a
        // charge command; only a missile already flying does.
        if (!canCharge(d.tactical, 0)) { chargeSent = false; continue; }
        if (!k.held && !chargeSent) continue;   // a release for a press that was never sent
        chargeSent = k.held;
      } else if (k.kind === 'missileLaunch') {
        if (launched || !canLaunch(d.tactical, 0)) continue;
        launched = true;
      }
      commands.push(envelope(c.player, k));
    }
    if (launched) chargeSent = false;   // the launch lets go of Fire, after any charge command this tick
    const sentSwitch = switching;
    pending = [];
    const held: HeldInput[] = [NEUTRAL, NEUTRAL];
    held[active] = activeHeld;
    const roundBefore = d.round, running = d.tactical.outcome === Outcome.Running;
    results = stepDuelTick(d, { held, commands });
    if (d.round !== roundBefore) telemetry = createTelemetry(d);   // a rematch: a fresh accumulator
    else {
      recordTick(telemetry, d, { held, commands });
      if (running && d.tactical.outcome !== Outcome.Running) deps.onRound?.(duelRoundRecord(duelEndSummary(telemetry), d.round, d.tactical.seed, d.baseTick));
    }
    sentHeld = held;
    const helm = attendant(d.nav), gunner = attendant(d.weapons);
    sentAxes = helm >= 0 && !ended() ? { turn: Math.sign(held[helm]!.moveX) || 0, thrust: throttleThrust(d.throttle) } : NO_AXES;   // Artemis spec §5.3
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
    if (d.round !== round) newRound();   // the rematch applied: the next round began in place
  };
  const pacer = createPacer(deps.now, deps.scheduler, onTick), cameraInput = createCameraInput(deps.now, deps.viewport);
  const queue = (command: DuelCommand): void => {
    const seat = command.kind === 'sit' || command.kind === 'stand';
    (seat && switching ? deferred : pending).push({ player: active, command });
  };
  /** The level the Helm builds on and shows (Artemis spec §5.4): the active player's latest queued throttle, else the sim's. */
  const throttleBase = (): number => {
    const last = [...pending].reverse().find((c) => c.player === active && c.command.kind === 'throttle')?.command;
    return last && last.kind === 'throttle' ? last.level : d.throttle;
  };

  /** A new round (H-2 spec §7): its seed and presence came with the rematch; the view's state starts again. */
  function newRound(): void {
    round = d.round; pending = []; switching = false; deferred = [];
    activeHeld = NEUTRAL; sentHeld = [NEUTRAL, NEUTRAL]; sentAxes = NO_AXES; sentSteer = 0;
    chargeSent = false; events = []; counts = hitCounts(d);
    capture(); freshCameras(); cameraInput.reset(); resetInteriorCamera(interiorCamera);
    deps.clearKeys?.();
  }

  /** One frame's press edges for the active character, by where it is (spec §5 table). */
  function play(k: KeySample): KeySample {
    if (k.presses.switch > 0) {   // Tab: presence false for the character left, true for the one taken, same tick; nothing carries over
      // The left character's queued weapons commands would reach the sim after it has gone (not-at-weapons): drop them. A
      // charge already sent needs no release: the sim lets go of Fire when the seat empties, so chargeSent just resets.
      pending = pending.filter((c) => !isConsoleCommand(c.command));
      cameraInput.reset(); refollowInteriorCamera(interiorCamera);
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
    if (p.stand > 0) { pending = pending.filter((c) => !isConsoleCommand(c.command)); queue({ kind: 'stand' }); chargeSent = false; return k; }   // the stand empties the seat first, as a Tab does
    if (seat === 'helm') {
      if (p.camera > 0) snapBack(cameras.helm);
      const level = throttleRequest(throttleBase(), p, k.throttleTo);   // W/S a notch, or a notch click (Artemis spec §5.4)
      if (level !== null) queue({ kind: 'throttle', level });
      return k;
    }
    if (seat === 'science') {   // Sci-1 spec §7.3: the requests arrive in Task 11; C snaps the Science camera back
      if (p.camera > 0) snapBack(cameras.science);
      return k;
    }
    const steps = p.interact - p.prevLock;
    if (p.interact + p.prevLock > 0) {
      const last = [...pending].reverse().find((c) => c.player === active && c.command.kind === 'laserLock')?.command;
      let room = last && last.kind === 'laserLock' ? last.room : d.tactical.systems[0].lock;
      for (let n = 0; n < Math.abs(steps); n++) room = cycleLock(room, steps > 0 ? 1 : -1);
      queue({ kind: 'laserLock', room });
    }
    if (k.lockTo !== undefined && k.lockTo !== null && k.lockTo >= 0 && k.lockTo <= 2) queue({ kind: 'laserLock', room: k.lockTo });   // a console lock click (Artemis spec §4.1)
    const down = (): void => queue({ kind: 'laserCharge', held: true });
    const up = (): void => queue({ kind: 'laserCharge', held: false });   // onTick drops it when no press was sent
    if (p.fireDown > 0 && p.fireUp > 0) { if (k.fireHeld) { up(); down(); } else { down(); up(); } }
    else if (p.fireDown > 0) down();
    else if (p.fireUp > 0) up();
    else if (chargeSent && !k.fireHeld) up();   // a release the keyboard never saw (a blur cleared it): let go now
    if (p.launch > 0) queue({ kind: 'missileLaunch' });
    if (p.camera > 0) {
      const cam = cameras.weapons;
      snapBack(cam, missileOf(d.tactical, 0) && cam.follow !== 'missile' ? 'missile' : 'ship');
    }
    return k;
  }

  return {
    get duel() { return d; },
    get seed() { return d.tactical.seed; },
    get prev() { return prev; },
    get missilePrev() { return missilePrev; },
    get crewPrev() { return crewPrev; },
    get cameras() { return cameras; },
    interiorCamera,
    epoch: () => d.round,
    active: () => active,
    view: () => { const s = seatOf(d, active); return s === 'standing' ? 'interior' : s; },
    otherStatus() {
      const other = active === 0 ? 1 : 0, s = seatOf(d, other);
      if (Life.state[d.interior.crew[other]!] === LifeState.Downed) return 'DOWNED';   // duel-health spec §2
      if (s !== 'standing') return s === 'helm' ? 'AT HELM' : s === 'weapons' ? 'AT WEAPONS' : 'AT SCIENCE';
      if (!d.present[other]) return 'STANDING BY';   // away and on foot: the solo start's partner (start-aboard spec §1)
      return d.present[other] && sentHeld[other]!.interactHeld && repairInReach(d, other) >= 0 ? 'REPAIRING' : 'WALKING';
    },
    axes: () => sentAxes,
    steer: () => sentSteer,
    held: () => sentHeld,
    alpha: () => frameAlpha,
    frame(dt) {
      let k = deps.sampleKeys();
      lastHeld = k.held ?? NO_HELD_FLAGS;
      const sampled = deps.samplePointer();
      let pointer = sampled;
      pacer.toggleUser(k.presses.pause);
      if (k.presses.menu > 0 && (ended() || pacer.reasons.has('user'))) menuAsked = true;
      // A Tab or a rematch changes which camera the pointer would move: this frame's sampled drag and wheel belong to the old one.
      const moved = (): void => { pointer = { ...sampled, wheel: 0, dragX: 0, dragY: 0 }; };
      if (ended()) { if (k.presses.confirm > 0 && !pending.some((c) => c.command.kind === 'rematch')) { pending.push({ player: active, command: { kind: 'rematch' } }); k = IDLE_KEYS(); moved(); } }
      else if (pacer.reasons.size === 0) { if (k.presses.switch > 0) moved(); k = play(k); }   // while paused, gameplay presses are dropped; the camera still moves
      // Quantised as online (H-2 spec §3), and neutral on the end card as online sends it.
      activeHeld = ended() ? NEUTRAL : { moveX: Math.sign(k.moveX) || 0, moveY: Math.sign(k.moveY) || 0, interactHeld: k.interactHeld };
      pacer.sync();   // an Escape this frame pauses before any due tick runs
      pacer.pump();
      frameAlpha = alphaAt(deps.now(), lastTickTime);
      const view = seatOf(d, active), cam = view === 'helm' ? cameras.helm : view === 'weapons' ? cameras.weapons : view === 'science' ? cameras.science : null;
      if (cam) cameraInput.apply(cam, k, pointer);
      else cameraInput.applyInterior(interiorCamera, k, pointer);
      for (const c of [cameras.helm, cameras.weapons, cameras.science]) {
        if (c.follow === 'missile' && !missileOf(d.tactical, 0)) followBody(c, 'ship');   // the followed missile ended
        // A followed missile is tracked at its interpolated (drawn) position, as the ship is (H-1 spec §6).
        const target = c.follow === 'missile' ? interpolatedMissile(d.tactical, missilePrev, frameAlpha, 0) : followTarget(d.tactical, prev, frameAlpha, c.follow);
        updateCamera(c, deps.viewport, dt, target);
      }
    },
    pause(reason) { pacer.reasons.add(reason); pacer.sync(); },
    resume(reason) { pacer.reasons.delete(reason); pacer.sync(); },
    paused: () => pacer.reasons.size > 0,
    reasons: () => pacer.reasons,
    drainEvents() { const out = events; events = []; return out; },
    lastResults: () => results,
    ended,
    menuRequested: () => menuAsked,
    mode: 'single' as const,
    uiHeld: () => lastHeld,
    running: () => pacer.reasons.size === 0 && !ended(),
    throttle: throttleBase,
    dispose() { pacer.dispose(); disposeDuel(d); }
  };
}

// The local runtimes for the Helm demo views (H-1 spec §4, §9): the renderer steps the sim itself on a 60 Hz wall-clock
// driver until H-0c-ii puts the duel behind the authority. The flight runtime steps the single-ship flight; the duel
// runtime steps stepDuelTick with the solo player's commands (spec §5) and owns both console cameras. H-2 spec §3, §7:
// held axes are quantised to −1, 0 or 1 as online, and a decided round's end card keeps ticking until Enter sends the
// same `rematch` command the online duel sends. H-2b: the duel runtime keeps the round's telemetry accumulator, as the
// authority does, and hands each decided round's record to `onRound` (Single player's solo playtest records).
import { createTickDriver } from '../../authority/tickDriver';
import type { HeldInput, Scheduler } from '../../net/contracts';
import { Position } from '../../sim/components';
import { LOCAL_DUEL_RUN, type DuelCommand, type DuelEnvelope, type DuelResult } from '../../sim/duel/commands';
import { rockAlive } from '../../sim/tactical/rocks';
import { throttleCap, WeaponSlot } from '../../sim/tactical/bars';
import { weaponPowerRefusal } from '../../sim/duel/weaponSlots';
import { canCharge, canLaunch, validRockLock, validTarget } from '../../sim/tactical/weapons';
import { createDuel, disposeDuel, DUEL_CREW_MIN, type DuelState } from '../../sim/duel/state';
import { crewAxes, helmTurn, stepDuelTick } from '../../sim/duel/step';
import { throttleThrust } from '../../sim/duel/throttle';
import { duelEndSummary, duelRoundRecord, type DuelRoundRecord } from '../../sim/duel/summary';
import { createTelemetry, recordTick } from '../../sim/duel/telemetry';
import type { ShipLayout } from '../../sim/ship/schema';
import { stepSoloFlight } from '../../sim/tactical/physics';
import { classOf, CONTACT_MAX_LEVEL, createTacticalState, missileOf, NO_AXES, Outcome, type Axes, type Missile, type TacticalState } from '../../sim/tactical/state';
import { TICK_HZ } from '../../sim/tuning';
import { HEADING_COUNT } from '../../sim/tactical/tuning';
import { createCamera, followBody, pan, snapBack, updateCamera, zoomBy, type Camera, type Viewport } from '../../render/tactical/camera';
import { createFeelTracker, recordFeel, type FeelTracker } from '../../render/tactical/feelModel';
import { createInteriorCamera, interiorInput, refollowInteriorCamera, resetInteriorCamera, type InteriorCamera } from '../../render/duel/interiorCamera';
import { interpolatedMissile, type ViewEvent } from '../../render/tactical/fxModel';
import { followTarget, type PrevBody } from '../../render/tactical/tacticalModel';
import { manualTorpedoFlying } from '../../sim/tactical/manualTorpedo';
import { createTorpedoFollow, trackManualTorpedo } from './torpedoCamera';
import { consoleInReach, crewHelmSeat, cycleLock, houndWeaponsSeat, repairInReach, seatOf, stepTorpRoom } from './controls';
import { flightFrame, gunFreqRequest, laserFreqKey, modeRequests, nextWeaponSel, NO_FLIGHT, powerDelta, weaponsSeatHeld, type FlightLatch } from './weaponsSeat';
import type { ContactRequests } from './contactController';
import type { Refusal } from './scene';
import { lockRefusal, NO_LASER, refusal } from '../../render/duel/situationModel';
import { accumulateWheel, crewHelmHeld, emptyPresses, frequencyRequest, helmAxes, NO_HELD_FLAGS, throttleRequest, WHEEL_IDLE_MS, type HeldFlags, type KeySample, type PointerSample } from './input';

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
    /** `aims` (Feel-ii spec §1.1): the right button aims the Helm's heading, so only the rest of the drag pans. */
    apply(camera: Camera, k: KeySample, p: PointerSample, aims = false): void {
      zoomBy(camera, vp, k.presses.zoomIn - k.presses.zoomOut);
      pan(camera, p.dragX - (aims ? p.rightX ?? 0 : 0), p.dragY - (aims ? p.rightY ?? 0 : 0));
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

/** What the active character's screen is (spec §1): its console's map view when seated, the interior when standing.
 *  Valkyrn spec §5: `flight` is the Helm map with the Weapons side tools (one seat for both). */
export type DuelView = 'helm' | 'weapons' | 'science' | 'flight' | 'interior';
/** The console camera a map view uses: the Flight seat flies the Helm's (Valkyrn spec §5). */
export function viewCamera(view: Exclude<DuelView, 'interior'>): 'helm' | 'weapons' | 'science' { return view === 'flight' ? 'helm' : view; }

export interface DuelRuntimeDeps extends FlightRuntimeDeps {
  /** The duel ship: the Hound, or the Single player picker's ship (Valkyrn spec §9). */
  layout: ShipLayout;
  /** Valkyrn spec §8: the crew slot's class index (the laser fit); absent: the layout's shipClass. */
  cls?: number;
  /** Valkyrn spec §5.1: the Flight map's pointer bearing since the last frame (mapRequests.ts), or null. */
  takeSteer?(): number | null;
  /** Valkyrn spec §5.1: right-button presses on the Flight map since the last frame (torpedo launches). */
  takeLaunches?(): number;
  /** Valkyrn spec §5.1: whether the left button is held on the canvas (the Flight seat's gun). */
  gunHeld?(): boolean;
  /** Playtest2feedback §4a: whether the left button is held on the canvas (the crew Helm steers while it is). */
  steerHeld?(): boolean;
  /** Drop the keyboard's held keys and press edges (Tab and restart, spec §4, §5). */
  clearKeys?(): void;
  /** Playtest2feedback (final review I1): the keys held now stop counting for the crew Helm's held fields until pressed
   *  again (the keyboard's staleHeld); called on the frame the active character's seat becomes the crew Helm. */
  staleKeys?(): void;
  /** Each decided round's record, once, on the tick it is decided (H-2 spec §8: Single player's solo records). */
  onRound?(record: DuelRoundRecord): void;
  /** The contact window's requests since the last frame (Sci-1 spec §7.2, §7.3): designate and scan, sent by seat. */
  takeContactRequests?(): ContactRequests;
  /** Feel-ii §1.1: the Helm map's heading request since the last frame (mapRequests.ts), sent from the Helm only. */
  takeHeading?(): number | null;
  /** W-1 (pew pew spec §1): the Weapons map's pew aim since the last frame (mapRequests.ts), a fine heading, or null. */
  takePew?(): number | null;
  /** W-2, W-4: the reticle (mapRequests reticleAim, kept, not drained): the latest fine heading the pointer gave on the open
   *  Weapons map, or null before any (the MANUAL laser then fires along the nose; the Hound's MAN turret holds). */
  reticleAim?(): number | null;
  /** W-3 (pew pew spec §3): the Weapons map's right button since the last frame while the crew's MANUAL torpedo flies
   *  (mapRequests.ts takeTorpHeading, drained): a heading index to hold, −1 to clear, or null. */
  takeTorpHeading?(): number | null;
  /** W-4 spec §8, §9: the held left button over the open Weapons map at the Hound's seat (mapRequests.ts triggerHeld). */
  triggerHeld?(): boolean;
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
  /** Before the last tick: each ship's position and heading, each ship's missile (or null), each character's position. */
  readonly prev: readonly PrevBody[];
  readonly missilePrev: readonly (PrevBody | null)[];
  readonly crewPrev: readonly { x: number; y: number }[];
  /** Each console's own camera, kept for whoever sits there next (spec §6). */
  readonly cameras: { readonly helm: Camera; readonly weapons: Camera; readonly science: Camera };
  /** The interior's zoom and follow (interior zoom spec): kept across pause, re-following on Tab, reset each round. */
  readonly interiorCamera: InteriorCamera;
  /** The Helm's axes the last tick flew: the held turn and the throttle's thrust (Artemis spec §5.3). Zero while the
   *  Helm is empty or the round is decided. */
  axes(): Axes;
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
  /** Playtest2feedback §3, §6: the crew Helm's thrMille the console shows (the sim's: Single player steps it locally). */
  thrMille(): number;
  /** W-4 spec §10: the Hound's selected weapon (0..2). */
  weaponSel(): number;
  /** W-4 spec §11: gun slot's turret offset (the sim's; no lag locally). */
  turret(slot: 0 | 1): number;
  /** Feel-ii §2.8: the console controls refused since the last take (the scene flashes them). */
  takeRefusals(): Refusal[];
  dispose(): void;
}

const isWeaponsCommand = (c: DuelCommand): boolean => c.kind === 'laserMode' || c.kind === 'torpMode' || c.kind === 'gunMode' || c.kind === 'laserLock' || c.kind === 'torpLock' || c.kind === 'rockLock' || c.kind === 'laserCharge' || c.kind === 'laserFire' || c.kind === 'missileLaunch' || c.kind === 'pewFire';
/** The commands only a seated console's player sends (Weapons, the Helm's throttle, Sci-1's three): a Tab or a stand drops them. */
const isConsoleCommand = (c: DuelCommand): boolean => isWeaponsCommand(c) || c.kind === 'throttle' || c.kind === 'heading' || c.kind === 'laserFrequency' || c.kind === 'designate' || c.kind === 'contactScan';
const NO_REQUESTS: ContactRequests = { designate: null, scan: null };
const NEUTRAL: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const IDLE_KEYS = (): KeySample => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() });
const shipBody = (s: TacticalState['ships'][number]): PrevBody => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc });
const missileBody = (m: Missile | null): PrevBody | null => (m ? { x: m.x, y: m.y, h: m.heading + m.headingAcc } : null);
/** The turn the Helm's held input flies (the sim's rule, helmTurn in sim/duel/step.ts): A/D, else auto-face's turn, else
 *  the held heading's (Feel-ii), else none. */
export function heldTurn(d: DuelState, h: HeldInput): number { return helmTurn(d, { ...h, moveX: Math.sign(h.moveX) || 0 }); }
const hitCounts = (d: DuelState): number[][] => d.tactical.ships.map((s) => [s.planetHits, s.asteroidHits, s.shipHits]);

export function createDuelRuntime(deps: DuelRuntimeDeps): DuelRuntime {
  const crew = deps.layout.crew ?? DUEL_CREW_MIN;   // Valkyrn spec §4.4: the layout's fixed crew (1 on the Valkyrn), else Sci-2's two
  const d = createDuel(deps.layout, deps.seed, 0, crew, deps.cls);
  const idleHeld = (): HeldInput[] => Array.from({ length: crew }, () => NEUTRAL);
  // Valkyrn spec §4.4, §5.1: Tab's ship view while seated (n = 1), the Flight seat's held bearing, and the gun's last frame.
  let shipView = false, steer = -1, gunPrev = false, torpHold = -1;   // W-3: the MANUAL torpedo's held heading (−1 none), re-sent every frame
  // W-4 spec §9: the Hound's Weapons selection (client state, the pew at a sit), the last gun selected (W-4c) and the trigger's last frame.
  let weaponSel = 0, lastGunSel = 0, triggerPrev = false, flight: FlightLatch = NO_FLIGHT, triggerLive = false;   // W-4 spec §7: the seat's flight latch and this frame's gated trigger
  // Playtest2feedback §4a: whether this left-button hold has steered yet (the refusal's press edge), and whether the active
  // character flew the crew Helm on the last frame (final review I1).
  let steerPrev = false, crewHelmPrev = false;
  const newtonian = (): boolean => classOf(d.tactical, 0).newtonianHelm;
  const hasGun = (): boolean => classOf(d.tactical, 0).slots.gun !== null;
  const hasLaser = (): boolean => classOf(d.tactical, 0).slots.laser !== null;
  let telemetry = createTelemetry(d);   // the round's accumulator, as the authority's duel rules keep it
  let round = 0, active: 0 | 1 = 0, firstTick = true, seq = [0, 0], pending: { player: number; command: DuelCommand }[] = [];
  // The sim checks sits and stands against presence before it applies that tick's presence commands, so a seat change
  // queued after a Tab waits here until the Tab's presence tick has run, then goes out on the following tick.
  let switching = false, deferred: { player: number; command: DuelCommand }[] = [];
  let lastHeld: HeldFlags = NO_HELD_FLAGS, prevHeld: HeldFlags = NO_HELD_FLAGS;   // the last frame's merged held flags (Artemis spec §6.1), and the frame's before
  let refusals: Refusal[] = [];   // Feel-ii §2.8: refused controls since the scene's last take
  const refuse = (control: Refusal['control'], reason: string): void => { refusals.push({ control, reason }); };
  let activeHeld: HeldInput = NEUTRAL, sentHeld: readonly HeldInput[] = idleHeld(), sentAxes: Axes = NO_AXES;
  let menuAsked = false;
  let events: ViewEvent[] = [], results: DuelResult[] = [], counts = hitCounts(d), lastTickTime: number | null = null, frameAlpha = 1;
  let prev: PrevBody[] = [], missilePrev: (PrevBody | null)[] = [], crewPrev: { x: number; y: number }[] = [], cameras = { helm: createCamera(), weapons: createCamera(), science: createCamera() }, torpFollow = createTorpedoFollow();
  const interiorCamera = createInteriorCamera();
  const capture = (): void => {
    prev = d.tactical.ships.map(shipBody);
    missilePrev = d.tactical.ships.map((_, i) => missileBody(missileOf(d.tactical, i)));   // by owner, as interpolatedMissile reads it
    crewPrev = d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! }));
  };
  const freshCameras = (): void => { const s = d.tactical.ships[0]; cameras = { helm: createCamera(s.x, s.y), weapons: createCamera(s.x, s.y), science: createCamera(s.x, s.y) }; torpFollow = createTorpedoFollow(); };   // W-3: a new round's Weapons camera follows no torpedo yet
  capture(); freshCameras();
  const ended = (): boolean => d.tactical.outcome !== Outcome.Running;
  /** The player seated at station i who is present, or −1 (the sim's attendant rule). */
  const attendant = (station: number): number => { const pid = d.interior.stations.occupant[station]!; return pid >= 0 && d.present[pid as 0 | 1] ? pid : -1; };
  /** Single player only: whether a character the keyboard leaves stays present, i.e. it sits at a console. */
  const stayPresent = (pid: 0 | 1): boolean => seatOf(d, pid) !== 'standing';
  const viewOf = (): DuelView => { const s = seatOf(d, active); return s === 'standing' || shipView ? 'interior' : s; };

  const onTick = (_tick: number, tickTimeMs: number): void => {
    capture();
    const commands: DuelEnvelope[] = [];
    const envelope = (player: number, command: DuelCommand): DuelEnvelope => ({ runId: LOCAL_DUEL_RUN, id: { player, sequence: seq[player]!++ }, requestedTick: d.interior.tick, command });
    if (firstTick) { if (crew > 1) commands.push(envelope(1, { kind: 'presence', present: false })); firstTick = false; }   // the solo start rule (spec §4); n = 1 has no second (Valkyrn spec §4.4)
    else if (!switching && crew > 1) {   // a character left seated (stayPresent) that is now on foot (stood by the sim) goes away, as a Tab would have sent
      const other = active === 0 ? 1 : 0;
      if (d.present[other] && !stayPresent(other) && !pending.some((c) => c.player === other && c.command.kind === 'presence')) commands.push(envelope(other, { kind: 'presence', present: false }));
    }
    // Weapons commands go out only when the sim would accept them (spec §7 table; canCharge / canLaunch), judged against the
    // state this tick will see. FTL targeting spec §2: Space is a single press (a full laser fires), with no release.
    // Spike ii §6.1: a launch is judged with this tick's effective torpedo rock target (the sim's rule: the last valid
    // rockLock(torpedo), else −1 after a torpLock, else the stored value).
    let torpRockNext: number | null = null, torpLocked = false;
    for (const c of pending) {
      const k = c.command;
      if (k.kind === 'torpLock' && validTarget(k.room)) torpLocked = true;
      else if (k.kind === 'rockLock' && k.weapon === 'torpedo' && validRockLock(d.tactical, k.weapon, k.rock) && (k.rock < 0 || rockAlive(d.tactical, k.rock))) torpRockNext = k.rock;
    }
    const torpRockNow = torpRockNext ?? (torpLocked ? -1 : d.tactical.systems[0].torpRock);
    // W-3 (pew pew spec §3): a launch is judged in this tick's torpedo mode (the sim sets a queued torpMode first).
    const queuedMode = [...pending].reverse().find((c) => c.command.kind === 'torpMode')?.command;
    const torpManualNow = queuedMode && queuedMode.kind === 'torpMode' ? queuedMode.manual : d.tactical.systems[0].torpManual;
    let launched = false;
    for (const c of pending) {
      const k = c.command;
      if (k.kind === 'laserCharge') {
        // The sim applies charge before launch within a tick (lock, charge, launch), so a launch in this tick never voids a
        // charge command; only a missile already flying does.
        if (!canCharge(d.tactical, 0)) continue;
      } else if (k.kind === 'missileLaunch') {
        if (launched || !canLaunch(d.tactical, 0, torpRockNow, torpManualNow)) continue;
        launched = true;
      }
      commands.push(envelope(c.player, k));
    }
    const sentSwitch = switching;
    pending = [];
    const held: HeldInput[] = idleHeld();
    held[active] = activeHeld;
    const roundBefore = d.round, running = d.tactical.outcome === Outcome.Running;
    results = stepDuelTick(d, { held, commands });
    if (d.round !== roundBefore) telemetry = createTelemetry(d);   // a rematch: a fresh accumulator
    else {
      recordTick(telemetry, d, { held, commands });
      if (running && d.tactical.outcome !== Outcome.Running) deps.onRound?.(duelRoundRecord(duelEndSummary(telemetry), d.round, d.tactical.seed, d.baseTick));
    }
    sentHeld = held;
    const helm = attendant(d.nav);
    sentAxes = ended() ? NO_AXES : newtonian() ? crewAxes(d, helm >= 0 ? held[helm]! : NEUTRAL)   // playtest2feedback §3, §6: the sim's rule, attended or not
      : helm >= 0 ? { turn: heldTurn(d, held[helm]!), thrust: throttleThrust(d.throttle) }   // Artemis spec §5.3; Feel-i's auto-face
      : d.interior.layout.helmHoldsUnattended === true ? { turn: helmTurn(d, NEUTRAL), thrust: throttleThrust(d.throttle) } : NO_AXES;   // Valkyrn spec §4.4: out of the seat it flies on (mirrors the sim's helmHoldsUnattended rule)
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
  /** The active player's latest queued designation and laser frequency, else the sim's (as throttleBase). */
  const designateBase = (): number => { const c = [...pending].reverse().find((x) => x.player === active && x.command.kind === 'designate')?.command; return c && c.kind === 'designate' ? c.contact : d.tactical.designated; };
  /** Feel-ii §1.1: the active player's latest queued heading, else the sim's held one; −1 while A/D or auto-face is held at
   *  the Helm (`turning`), since the sim clears the hold after the tick's commands. */
  const headingBase = (turning: boolean): number => { if (turning) return -1; const c = [...pending].reverse().find((x) => x.player === active && x.command.kind === 'heading')?.command; return c && c.kind === 'heading' ? c.heading : d.holdHeading; };
  const freqBase = (): number => { const c = [...pending].reverse().find((x) => x.player === active && x.command.kind === 'laserFrequency')?.command; return c && c.kind === 'laserFrequency' ? c.freq : d.tactical.systems[0].freq; };
  /** W-2 (pew pew spec §2): the active player's latest queued laser mode, else the sim's (as freqBase). */
  const laserModeBase = (): boolean => { const c = [...pending].reverse().find((x) => x.player === active && x.command.kind === 'laserMode')?.command; return c && c.kind === 'laserMode' ? c.manual : d.tactical.systems[0].laserManual; };
  /** W-3 (pew pew spec §3): the active player's latest queued torpedo mode, else the sim's (as laserModeBase). */
  const torpModeBase = (): boolean => { const c = [...pending].reverse().find((x) => x.player === active && x.command.kind === 'torpMode')?.command; return c && c.kind === 'torpMode' ? c.manual : d.tactical.systems[0].torpManual; };
  /** W-4 amendment §2.4: the active player's latest queued gunMode for gun `slot` (0 pew pew, 1 the autocannon), else the
   *  sim's flag (as torpModeBase). */
  const gunModeBase = (slot: 0 | 1): boolean => {
    const c = [...pending].reverse().find((x) => x.player === active && x.command.kind === 'gunMode' && x.command.slot === slot)?.command;
    return c && c.kind === 'gunMode' ? c.manual : slot === 0 ? d.tactical.systems[0].pewManual : d.tactical.systems[0].gunManual;
  };

  /** A new round (H-2 spec §7): its seed and presence came with the rematch; the view's state starts again. */
  function newRound(): void {
    round = d.round; pending = []; switching = false; deferred = [];
    activeHeld = NEUTRAL; sentHeld = idleHeld(); sentAxes = NO_AXES;
    shipView = false; steer = -1; gunPrev = false; torpHold = -1; steerPrev = false; crewHelmPrev = false;
    weaponSel = 0; lastGunSel = 0; triggerPrev = false; flight = NO_FLIGHT; triggerLive = false;
    events = []; counts = hitCounts(d);
    capture(); freshCameras(); cameraInput.reset(); resetInteriorCamera(interiorCamera);
    deps.clearKeys?.();
  }

  /** One frame's press edges for the active character, by where it is (spec §5 table). */
  function play(k: KeySample, requests: ContactRequests, heading: number | null, launches: number, pew: number | null, steerNow: number | null): KeySample {
    for (const c of k.ship ?? []) queue(c);   // Engineering spike §7: the ship view's clicks, on foot or seated, before a Tab
    if (k.presses.switch > 0 && crew === 1) {   // Valkyrn spec §4.4: no other character; Tab toggles the console and the ship view while seated
      if (seatOf(d, active) !== 'standing' && k.presses.switch % 2 === 1) shipView = !shipView;
      cameraInput.reset(); refollowInteriorCamera(interiorCamera);
      return IDLE_KEYS();
    }
    if (k.presses.switch > 0) {   // Tab: presence true for the one taken; false for the character left unless it is seated; nothing carries over
      // The left character's queued weapons commands would reach the sim after it has gone (not-at-weapons): drop them.
      pending = pending.filter((c) => !isConsoleCommand(c.command));
      cameraInput.reset(); refollowInteriorCamera(interiorCamera);
      for (let n = 0; n < k.presses.switch; n++) {
        // Feel-i review (single player fires while you fly): a character left seated stays present, so its console stays
        // attended (the laser auto-fires, the Helm's throttle flies) under the sim's own attendant rule; one left on foot goes away.
        if (!stayPresent(active)) queue({ kind: 'presence', present: false });
        active = active === 0 ? 1 : 0;
        queue({ kind: 'presence', present: true });
      }
      switching = true;
      deps.clearKeys?.();
      return IDLE_KEYS();
    }
    const seat = seatOf(d, active), p = k.presses;
    if (!houndWeaponsSeat(d, active)) { weaponSel = 0; lastGunSel = 0; triggerPrev = false; flight = NO_FLIGHT; triggerLive = false; }   // W-4 spec §9: a sit starts on pew pew
    if (seat !== 'flight') gunPrev = false;
    if (seat === 'standing') {
      if (p.interact > 0 && repairInReach(d, active) < 0) { const c = consoleInReach(d, active); if (c >= 0) queue({ kind: 'sit', station: c }); }
      return k;
    }
    if (p.stand > 0) { pending = pending.filter((c) => !isConsoleCommand(c.command)); queue({ kind: 'stand' }); return k; }   // the stand empties the seat first, as a Tab does
    // Sci-1 spec §5: a scan from any of the three consoles, unless that contact is fully known.
    if (requests.scan !== null && d.tactical.known[requests.scan] < CONTACT_MAX_LEVEL[requests.scan]) queue({ kind: 'contactScan', contact: requests.scan });
    if (seat === 'flight') {   // Valkyrn spec §5.1: the Flight seat, the Helm and Weapons in one
      if (p.camera > 0) snapBack(cameras.helm);
      const level = throttleRequest(throttleBase(), p, k.throttleTo, throttleCap(d.tactical.systems[0]!));
      if (level !== null) queue({ kind: 'throttle', level });
      // Q/E (and E/Q while the torpedo is picked up, the contact controller's torpStep) step the torpedo's room.
      const steps = p.interact - p.prevLock + (requests.torpStep ?? 0);
      if (steps !== 0) {
        const last = [...pending].reverse().find((c) => c.player === active && c.command.kind === 'torpLock')?.command;
        const room = stepTorpRoom(last && last.kind === 'torpLock' ? last.room : d.tactical.systems[0].torpLock, steps);
        queue({ kind: 'torpLock', room });
        const why = room >= 0 ? lockRefusal(d) : null; if (why) refuse('launch', why);   // spec §10.4: the sim refuses a lock on an unseen enemy
      }
      if (k.torpTo !== undefined && k.torpTo !== null && k.torpTo >= -1 && k.torpTo <= 2) queue({ kind: 'torpLock', room: k.torpTo });
      // Spike ii §6.5 on the Flight seat (merge): a rock drop or a card's clear sends rockLock; the laser's only on the laser fit.
      for (const rl of [requests.rockLock, k.rockTo]) if (rl && (rl.weapon === 'torpedo' || hasLaser())) queue({ kind: 'rockLock', weapon: rl.weapon, rock: rl.rock });
      if (hasLaser()) {   // §8, the laser fit: the LASER card's room and 3/4/5
        if (k.lockTo !== undefined && k.lockTo !== null && k.lockTo >= -1 && k.lockTo <= 2) queue({ kind: 'laserLock', room: k.lockTo });
        const freq = frequencyRequest(freqBase(), laserFreqKey(k));   // W-4 spec §9: 3/4/5 is the key field
        if (freq !== null) queue({ kind: 'laserFrequency', freq });
      } else if (requests.noLaser || (laserFreqKey(k) !== undefined && laserFreqKey(k) !== null) || (k.lockTo !== undefined && k.lockTo !== null)) refuse('laser', NO_LASER);   // §6.1: 1 or 3/4/5 on the gun fit
      if (p.launch + launches > 0) { queue({ kind: 'missileLaunch' }); const why = refusal(d, 'launch'); if (why) refuse('launch', why); }   // F or the right button
      const gun = !shipView && hasGun() && (deps.gunHeld?.() ?? false);
      if (gun && !gunPrev) { const why = refusal(d, 'fire'); if (why) refuse('fire', why); }   // a dead trigger says why (Feel-ii §2.8)
      gunPrev = gun;
      const off = refusal(d, 'turn'), held = k.held ?? NO_HELD_FLAGS;
      if (off) {
        if (held.fire && !prevHeld.fire) refuse('auto-face', off);
        if (level !== null) refuse('throttle', off);
      }
      return k;
    }
    if (crewHelmSeat(d, active)) {   // playtest2feedback §3-§5: W/S, the thrusters and the steer go out on the held frame
      if (p.camera > 0) snapBack(cameras.helm);
      if (heading !== null && Number.isInteger(heading) && heading >= -1 && heading < 256 && heading !== headingBase(k.fireHeld)) queue({ kind: 'heading', heading });   // RMB; only auto-face clears the hold
      // §4a: a hold steers once the map gives a bearing (a press over a block or the ship steers nothing yet).
      const off = refusal(d, 'turn'), held = k.held ?? NO_HELD_FLAGS, steering = deps.steerHeld?.() ?? false, steered = steering && steerNow !== null;
      if (off) {
        if (steered && !steerPrev) refuse('turn', off);   // §4a: the hold's first steer, not A/D (final review M1)
        if (held.fire && !prevHeld.fire) refuse('auto-face', off);
        if ((held.up && !prevHeld.up) || (held.down && !prevHeld.down)) refuse('throttle', off);
        if (heading !== null && heading >= 0) refuse('heading', off);
      }
      steerPrev = steering && (steerPrev || steered);   // owner 2026-11-19: the free cold gas has no refusal
      return k;
    }
    if (seat === 'helm') {
      if (p.camera > 0) snapBack(cameras.helm);
      const level = throttleRequest(throttleBase(), p, k.throttleTo, throttleCap(d.tactical.systems[0]!));   // W/S a notch, or a notch click (Artemis spec §5.4)
      if (level !== null) queue({ kind: 'throttle', level });
      if (heading !== null && Number.isInteger(heading) && heading >= -1 && heading < 256 && heading !== headingBase((Math.sign(k.moveX) || 0) !== 0 || k.fireHeld)) queue({ kind: 'heading', heading });   // Feel-ii §1.1
      // Feel-ii §2.8: with Engines off the Helm's controls fly nothing (the commands still go: they apply once repaired).
      const off = refusal(d, 'turn'), held = k.held ?? NO_HELD_FLAGS;
      if (off) {
        if ((held.left && !prevHeld.left) || (held.right && !prevHeld.right)) refuse('turn', off);
        if (held.fire && !prevHeld.fire) refuse('auto-face', off);
        if (level !== null) refuse('throttle', off);
        if (heading !== null && heading >= 0) refuse('heading', off);
      }
      return k;
    }
    if (seat === 'science') {   // Sci-1 spec §7.3: the window's selection designates; C snaps the Science camera back
      if (requests.designate !== null && requests.designate !== designateBase()) queue({ kind: 'designate', contact: requests.designate });
      if (p.camera > 0) snapBack(cameras.science);
      return k;
    }
    if (houndWeaponsSeat(d, active)) {   // W-4 spec §9 (W-4a): the Hound's Weapons seat
      // W-4 spec §7: around a MANUAL flight: the latch first (a torpedo selection returns to the last gun when it ends), then this
      // frame's keys (A/D select during a flight too); LMB clicks and the trigger are dropped while it flies.
      const ff = flightFrame(flight, manualTorpedoFlying(d.tactical), weaponSel, lastGunSel, deps.triggerHeld?.() ?? false, deps.gunHeld?.() ?? false);   // gunHeld: the raw left button (duelMode's pointer.leftHeld(); the Flight seat's trigger elsewhere)
      flight = ff.latch; triggerLive = ff.trigger;
      weaponSel = nextWeaponSel(ff.sel, k);
      if (weaponSel !== WeaponSlot.Torpedo) lastGunSel = weaponSel;
      const click = ff.clicks ? pew : null;   // the map's left click this frame, unless it is the start of a steer
      const dw = powerDelta(p);   // W / S: a bar on or off the selected weapon (at Weapons they are not the throttle)
      if (dw !== 0) {
        for (let n = 0; n < Math.abs(dw); n++) queue({ kind: 'weaponPower', slot: weaponSel, delta: Math.sign(dw) });
        const why = weaponPowerRefusal(d, weaponSel, Math.sign(dw)); if (why) refuse('power', why);
      }
      // W-4 amendment §3.6: E / Q step the target room (Weapons → Shields → Engines, wrapping), judged from the latest queued
      // laserLock, else the sim's lock; a plain room click in the enemy window (the console's lock request) sets it. Neither
      // makes a torpedo lock (that is only the pick-up click, k.torpTo below), and requests.torpStep is not read here.
      const steps = p.interact - p.prevLock;
      if (steps !== 0) {
        const last = [...pending].reverse().find((c) => c.player === active && c.command.kind === 'laserLock')?.command;
        let room = last && last.kind === 'laserLock' && last.room >= 0 ? last.room : d.tactical.systems[0].lock;
        for (let n = 0; n < Math.abs(steps); n++) room = cycleLock(room, steps > 0 ? 1 : -1);
        queue({ kind: 'laserLock', room });
        const why = lockRefusal(d); if (why) refuse('laser', why);   // NO CONTACT: the sim refuses a room on an unseen enemy
      }
      if (k.lockTo !== undefined && k.lockTo !== null && k.lockTo >= 0 && k.lockTo <= 2) {   // a clear (−1) is never sent: the target room has no "none"
        queue({ kind: 'laserLock', room: k.lockTo });
        const why = lockRefusal(d); if (why) refuse('laser', why);
      }
      if (k.torpTo !== undefined && k.torpTo !== null && k.torpTo >= -1 && k.torpTo <= 2) queue({ kind: 'torpLock', room: k.torpTo });
      for (const rl of [requests.rockLock, k.rockTo]) if (rl && rl.weapon === 'torpedo') queue({ kind: 'rockLock', weapon: 'torpedo', rock: rl.rock });
      const freq = gunFreqRequest(freqBase(), k);   // 4 / 5 / 6 or the row's buttons (§5.2); 3 selects
      if (freq !== null) queue({ kind: 'laserFrequency', freq });
      // W-4 amendment §2.4, §2.5: R flips the selected weapon's switch (a gun's gunMode; the torpedo's torpMode when it is
      // selected), Shift+R sets both guns together, and a tag click flips its own weapon; each judged from the latest queued
      // mode, else the sim's. Z and V (p.laserMode, p.torpMode) are not read at this seat.
      const mode = modeRequests([gunModeBase(0), gunModeBase(1), torpModeBase()], weaponSel, p, k.modeTaps);
      for (const slot of [0, 1] as const) if (mode.changed[slot]) queue({ kind: 'gunMode', slot, manual: mode.modes[slot] });
      if (mode.changed[2]) queue({ kind: 'torpMode', manual: mode.modes[2] });
      const pewManual = mode.modes[0], gunManual = mode.modes[1], torpManual = mode.modes[2];
      const lmbLaunch = click !== null && weaponSel === WeaponSlot.Torpedo;   // LMB on the map with the torpedo selected launches it, as F
      if (p.launch > 0 || lmbLaunch) { queue({ kind: 'missileLaunch' }); const why = refusal(d, 'launch', torpManual); if (why) refuse('launch', why); }
      if (click !== null && weaponSel === WeaponSlot.Pew && pewManual) {   // W-4 spec §4.3: on AUTO the click does nothing; on MAN, LMB with pew pew selected: one round along its turret
        const why = refusal(d, 'pew');
        if (why) refuse('pew', why); else queue({ kind: 'pewFire' });
      }
      const trig = triggerLive;   // W-4 spec §7: the gated trigger; the autocannon fires while held (the held frame's gunHeld); a dead trigger says why
      if (trig && !triggerPrev && weaponSel === WeaponSlot.Autocannon && gunManual) { const why = refusal(d, 'autocannon'); if (why) refuse('autocannon', why); }
      triggerPrev = trig;
      if (p.camera > 0) { const cam = cameras.weapons; snapBack(cam, missileOf(d.tactical, 0) && cam.follow !== 'missile' ? 'missile' : 'ship'); }
      return k;   // Space, Z and V do nothing here (W-4 amendment §2.4)
    }
    // E and Q step the laser's target room (FTL targeting spec §1: a target, so it auto-fires), from the latest queued one.
    const steps = p.interact - p.prevLock;
    if (p.interact + p.prevLock > 0) {
      const last = [...pending].reverse().find((c) => c.player === active && c.command.kind === 'laserLock')?.command;
      let room = last && last.kind === 'laserLock' && last.room >= 0 ? last.room : d.tactical.systems[0].lock;
      for (let n = 0; n < Math.abs(steps); n++) room = cycleLock(room, steps > 0 ? 1 : -1);
      queue({ kind: 'laserLock', room });
      const why = lockRefusal(d); if (why) refuse('laser', why);   // spec §10.4: the sim refuses a lock on an unseen enemy
    }
    if (k.lockTo !== undefined && k.lockTo !== null && k.lockTo >= -1 && k.lockTo <= 2) queue({ kind: 'laserLock', room: k.lockTo });   // a room click or a card's clear
    // The torpedo's target (FTL targeting spec §1): a room click or a card's clear, then E / Q while it is picked up.
    if (k.torpTo !== undefined && k.torpTo !== null && k.torpTo >= -1 && k.torpTo <= 2) queue({ kind: 'torpLock', room: k.torpTo });
    // Spike ii §6.5: a rock drop (the contact controller) or a card's clear (a right-click) sends rockLock.
    if (requests.rockLock) queue({ kind: 'rockLock', weapon: requests.rockLock.weapon, rock: requests.rockLock.rock });
    if (k.rockTo) queue({ kind: 'rockLock', weapon: k.rockTo.weapon, rock: k.rockTo.rock });
    if (requests.torpStep) {
      // From the torpedo's own target (the latest queued one, else the sim's), never the laser's.
      const last = [...pending].reverse().find((c) => c.player === active && c.command.kind === 'torpLock')?.command;
      const from = last && last.kind === 'torpLock' ? last.room : d.tactical.systems[0].torpLock;
      queue({ kind: 'torpLock', room: stepTorpRoom(from, requests.torpStep) });
      const why = lockRefusal(d); if (why) refuse('launch', why);   // spec §10.4: as the laser's E/Q
    }
    const freq = frequencyRequest(freqBase(), laserFreqKey(k));   // 3/4/5 or a console button (Sci-1 spec §7.4; W-4 spec §9: the key field)
    if (freq !== null) queue({ kind: 'laserFrequency', freq });
    // W-2 (pew pew spec §2): Z or the LASER card's AUTO / MAN tag toggles the laser's mode, from the latest queued one (an odd
    // number of presses this frame toggles it).
    let manual = laserModeBase();
    if (p.laserMode % 2 === 1 && hasLaser()) { manual = !manual; queue({ kind: 'laserMode', manual }); }
    if (manual) {
      // W-2: in MANUAL Space fires the laser along the Weapons map's aim (else the nose), or says why not (NO CHARGE without a
      // full charge) and queues nothing.
      if (p.fireDown > 0) {
        const why = refusal(d, 'fire', true);
        if (why) refuse('fire', why);
        else { const aim = deps.reticleAim?.() ?? d.tactical.ships[0].heading * HEADING_COUNT; queue({ kind: 'laserFire', aim: Math.floor(aim / HEADING_COUNT), aimAcc: aim % HEADING_COUNT }); }
      }
    } else if (p.fireDown > 0) queue({ kind: 'laserCharge', held: true });   // FTL targeting spec §2: one press fires a full laser
    // W-3 (pew pew spec §3): V or the TORPEDO card's AUTO / MAN tag toggles the torpedo's mode, from the latest queued one (an
    // odd number of presses this frame toggles it); F is judged in that mode (in MANUAL: no lock, no range).
    let torpManual = torpModeBase();
    if (p.torpMode % 2 === 1) { torpManual = !torpManual; queue({ kind: 'torpMode', manual: torpManual }); }
    if (p.launch > 0) queue({ kind: 'missileLaunch' });
    // Feel-ii §2.8: FIRE and LAUNCH say why when the sim would refuse them (the tick drops them by the same checks).
    const fireWhy = p.fireDown > 0 && !manual ? refusal(d, 'fire', false) : null, launchWhy = p.launch > 0 ? refusal(d, 'launch', torpManual) : null;
    if (fireWhy) refuse('fire', fireWhy);
    if (launchWhy) refuse('launch', launchWhy);
    // W-1 (pew pew spec §1): a left click on the Weapons map fires the pew along its aim; with less than a third stored it
    // says NO CHARGE and nothing is queued.
    if (pew !== null) {
      const why = refusal(d, 'pew');
      if (why) refuse('pew', why);
      else queue({ kind: 'pewFire' });
    }
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
    view: viewOf,
    axes: () => sentAxes,
    held: () => sentHeld,
    alpha: () => frameAlpha,
    frame(dt) {
      let k = deps.sampleKeys();
      // Final review I1: on the frame the active character's seat becomes the crew Helm, the keys held now (E sits and is a
      // thruster; W, A and D walk) are stale until pressed again, and this sample's crew fields are dropped.
      const crewHelmAtSample = crewHelmSeat(d, active);
      if (crewHelmAtSample && !crewHelmPrev) { deps.staleKeys?.(); k = { ...k, throttleHeld: 0, rcsX: 0, rcsY: 0 }; }
      crewHelmPrev = crewHelmAtSample;
      prevHeld = lastHeld; lastHeld = k.held ?? NO_HELD_FLAGS;
      const requests = deps.takeContactRequests?.() ?? NO_REQUESTS;   // drained every frame; dropped while paused or ended
      const heading = deps.takeHeading?.() ?? null;   // Feel-ii §1.1: drained every frame, like the contact requests
      const steerNow = deps.takeSteer?.() ?? null, launchesNow = deps.takeLaunches?.() ?? 0, pewNow = deps.takePew?.() ?? null;   // Valkyrn spec §5.1: drained every frame
      const torpNow = deps.takeTorpHeading?.() ?? null;   // W-3: drained every frame
      const sampled = deps.samplePointer();
      let pointer = sampled;
      pacer.toggleUser(k.presses.pause);
      if (k.presses.menu > 0 && (ended() || pacer.reasons.has('user'))) menuAsked = true;
      // A Tab or a rematch changes which camera the pointer would move: this frame's sampled drag and wheel belong to the old one.
      const moved = (): void => { pointer = { ...sampled, wheel: 0, dragX: 0, dragY: 0, rightX: 0, rightY: 0 }; };   // the right drag too: the Helm pans by minus it
      if (ended()) { if (k.presses.confirm > 0 && !pending.some((c) => c.command.kind === 'rematch')) { pending.push({ player: active, command: { kind: 'rematch' } }); k = IDLE_KEYS(); moved(); } }
      else if (pacer.reasons.size === 0) { if (k.presses.switch > 0) moved(); k = play(k, requests, heading, launchesNow, pewNow, steerNow); }   // while paused, gameplay presses are dropped; the camera still moves
      // Quantised as online (H-2 spec §3), and neutral on the end card as online sends it.
      // Feel-i (console feel spec §2): Space held at the Helm is auto-face, sent only from the Helm, as the sim admits it.
      const seatNow = seatOf(d, active);
      if (seatNow === 'standing') shipView = false;
      // Playtest2feedback §4a: the crew Helm steers only while the left button is held (the last bearing holds over a block);
      // let go, no aim goes out and the sim holds the last one as the held heading.
      const crewHelmNow = crewHelmSeat(d, active), steering = crewHelmNow && (deps.steerHeld?.() ?? false);
      if (crewHelmNow) steer = steering ? steerNow ?? steer : -1;
      else if (seatNow !== 'flight') steer = -1; else if (steerNow !== null && !shipView) steer = steerNow;   // the last bearing holds over the side tools
      const gunNow = seatNow === 'flight' && !shipView && hasGun() && (deps.gunHeld?.() ?? false);
      const look = seatNow === 'flight' && shipView;   // Decision 11: the ship view keeps the course (no turn keys, no face)
      // W-3 (pew pew spec §3), W-4 spec §7: at Weapons, while the crew's MANUAL torpedo flies, the map's LMB steer gives it a heading
      // to hold (torpHold, re-sent every frame; letting go keeps the last one) until the flight ends. A/D no longer steer it.
      const torpSteering = seatNow === 'weapons' && !ended() && manualTorpedoFlying(d.tactical);
      if (!torpSteering) torpHold = -1; else if (torpNow !== null && torpNow >= 0) torpHold = torpNow;
      activeHeld = ended() ? NEUTRAL : { moveX: look || crewHelmNow ? 0 : Math.sign(k.moveX) || 0, moveY: Math.sign(k.moveY) || 0, interactHeld: k.interactHeld,   // playtest2feedback §4: A/D are thrusters at the crew Helm
        ...(crewHelmNow ? crewHelmHeld(k, -1) : {}),
        ...(k.fireHeld && !look && (seatNow === 'helm' || seatNow === 'flight') ? { face: true } : {}),
        ...(steer >= 0 ? { aim: steer } : {}), ...(gunNow ? { gunHeld: true } : {}),   // Valkyrn spec §5.1
        ...(torpHold >= 0 ? { torpHeading: torpHold } : {}) };   // W-3, W-4 spec §7
      if (!ended() && houndWeaponsSeat(d, active)) activeHeld = { ...activeHeld, ...weaponsSeatHeld(weaponSel, triggerLive && gunModeBase(1), deps.reticleAim?.() ?? -1) };   // W-4 spec §7, §8: the gated trigger, only while the autocannon's own switch is MAN
      pacer.sync();   // an Escape this frame pauses before any due tick runs
      pacer.pump();
      frameAlpha = alphaAt(deps.now(), lastTickTime);
      const shown = viewOf(), cam = shown === 'interior' ? null : cameras[viewCamera(shown)];
      if (cam) cameraInput.apply(cam, k, pointer, shown === 'helm' || shown === 'flight');   // the Flight seat's right button is the torpedo, not a pan; W-4 spec §7: at Weapons it pans again
      else cameraInput.applyInterior(interiorCamera, k, pointer);
      trackManualTorpedo(cameras.weapons, torpFollow, manualTorpedoFlying(d.tactical));   // W-3 (pew pew spec §3): follow a MANUAL torpedo, then go back
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
    thrMille: () => d.thrMille,
    weaponSel: () => weaponSel,   // W-4 spec §10: the selected card
    turret: (slot: 0 | 1) => (slot === 0 ? d.tactical.systems[0].pewTurret : d.tactical.systems[0].gunTurret),   // W-4 spec §11: no lag locally
    takeRefusals() { const out = refusals; refusals = []; return out; },
    dispose() { pacer.dispose(); disposeDuel(d); }
  };
}

// The online duel session (H-2 spec §3, §7, §8): one machine's renderer in a networked duel. It attaches to the
// authority through the port main hands it (the host's renderer and each guest alike), keeps the duel stream client and
// its view source, draws the same scene as Single player, and turns this seat's keyboard into held frames and commands
// at 60 Hz, independently of Pixi. Keyboard and mouse only; Tab does nothing online (one character per machine). Each
// decided round is written as a playtest record through the preload, with the link's route and RTT read from main
// about once a second (H-2b); F3 shows the live latency overlay over the scene.
import type { OnlinePortDescriptor, OnlinePreloadApi, OnlineStatus } from '../../../../shared/onlineSession';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import { createPortLink } from '../../../../network/portLink';
import { browserPortEndpoint } from '../../../../network/transport/bridge';
import { classifyStreamPacket } from '../../../../network/state/imageCodec';
import { createDuelRemoteClient } from '../../../../network/modes/duelStream';
import type { CommandEnvelope, CommandId, DuelCommand, HeldInput, Link, Scheduler, Cue } from '../../net/contracts';
import { createDuelPredictor, type DuelPredictor, type LocalInput, type PredictionStats } from '../../clientControl/duelPredictor';
import { arrivalJitter, fineFigure, latencyFigure, type DuelPlaytestRecord } from '../../net/duelRecord';
import type { ShipLayout } from '../../sim/ship/schema';
import { loadDuelSnapshot, saveDuelSnapshot } from '../../sim/duel/snapshot';
import { disposeDuel, type DuelState } from '../../sim/duel/state';
import type { DuelRoundRecord } from '../../sim/duel/summary';
import { Outcome } from '../../sim/tactical/state';
import { throttleCap, WeaponSlot } from '../../sim/tactical/bars';
import { weaponPowerRefusal } from '../../sim/duel/weaponSlots';
import { canCharge, canLaunch } from '../../sim/tactical/weapons';
import { manualTorpedoFlying } from '../../sim/tactical/manualTorpedo';
import { HEADING_COUNT } from '../../sim/tactical/tuning';
import { computeLetterbox } from '../../render/letterbox';
import { endModel } from '../../render/duel/endModel';
import { createKeyToggle, latencyOverlayLines, type KeyTarget } from '../../render/duel/latencyOverlay';
import { snapBack } from '../../render/tactical/camera';
import type { Renderer } from '../../render/renderer';
import { classOf, CONTACT_MAX_LEVEL, missileOf } from '../../sim/tactical/state';
import { consoleInReach, crewHelmSeat, cycleLock, houndWeaponsSeat, repairInReach, seatOf, stepTorpRoom } from './controls';
import { crewHelmHeld, createDuelKeyboard, createPointerSource, emptyPresses, NO_HELD_FLAGS, PING_CODE, throttleRequest, type ConsoleInput, type EventSource, type HeldFlags, type KeySample } from './input';
import { createMapRequests } from './mapRequests';
import { pingAllowed, type PingRequest } from '../../render/duel/pingModel';
import { lockRefusal, refusal } from '../../render/duel/situationModel';
import { consoleChange } from './consoleChange';
import { createContactController, type ContactActions, type ContactRequests } from './contactController';
import { createOnlineDuelSource, type OnlineDuelSource } from './onlineSource';
import type { DuelSink, LatencySink } from '../../ui/sinks';
import { createDuelScene, type DuelScene } from './scene';
import { flightFrame, laserFreqKey, modeRequests, nextWeaponSel, NO_FLIGHT, powerDelta, weaponsSeatHeld, type FlightLatch } from './weaponsSeat';
import type { AudioOut } from '../audio';

export interface OnlineDuelDeps {
  renderer: Renderer; ui: DuelSink; now(): number; scheduler: Scheduler; contentDigest: string; resolveLayout(id: string): ShipLayout;
  /** The F3 latency overlay's React sink (H-2b Decision 5): frame(lines) shows it, clear() hides it; absent, no overlay. */
  latency?: LatencySink;
  api: Pick<OnlinePreloadApi, 'viewState' | 'linkStats'>;
  /** Leave the online session as the menu's Leave does (Escape on the end card, then Enter). */
  leave(): void;
  playCue?(cue: Cue): void;
  /** The app's audio (Audio-i spec section 4): every duel sound comes from local events and state, as in Single player. */
  audio?: AudioOut;
  recordDuel?(record: DuelPlaytestRecord): Promise<boolean> | void;
  /** The console's click slot (Artemis spec §6.2): filled with this session's keyboard, emptied on dispose. */
  setConsole?(input: ConsoleInput | null): void;
  /** The contact window's click slot (enemy ship window spec §6.1, §6.6): filled with this session's controller, emptied on dispose. */
  setContact?(contact: ContactActions | null): void;
}
const NOTICE_MS = 3000;
/** How often the session asks main for the link's figures, and how many recent samples the F3 overlay reads. */
export const LINK_POLL_MS = 1000, LIVE_SAMPLES = 300;
/** The camera's presses: the zoom keys, and C, which only the interior's camera reads here (the consoles' C is in play()). */
const keysOnly = (k: KeySample): KeySample => ({ ...k, presses: { ...emptyPresses(), zoomIn: k.presses.zoomIn, zoomOut: k.presses.zoomOut, camera: k.presses.camera } });
/** Net-4a §3.3: the local tick (60 a second, as the authority's tick driver) and the most one pump runs; the rest are dropped. */
export const LOCAL_TICK_MS = 1000 / 60, LOCAL_TICKS_MAX = 4;
const neutral = (): HeldInput => ({ moveX: 0, moveY: 0, interactHeld: false });
/** Playtest2feedback §3, §4, §4a: this seat's held frame. At the crew Helm (a newtonianHelm class): A/D's turn, the held
 *  throttle and thrusters and the left button's steer (crewHelmHeld). Elsewhere, and on any other class: quantised to -1,
 *  0 and 1 (H-2 spec §3), with Space at the Helm as auto-face (Feel-i). W-4 spec §11: at the Hound's Weapons seat,
 *  `weapons` adds weaponSel, the trigger (gunHeld with the autocannon selected) and the reticle as turretAim (W-4b). */
export function sessionHeld(k: KeySample, d: DuelState, me: number, steer: number, weapons?: { sel: number; trigger: boolean; aim?: number }): HeldInput {
  const seat = seatOf(d, me), crewHelm = crewHelmSeat(d, me);
  return { moveX: Math.sign(k.moveX) || 0, moveY: Math.sign(k.moveY) || 0, interactHeld: k.interactHeld,
    ...(k.fireHeld && seat === 'helm' ? { face: true } : {}), ...(crewHelm ? crewHelmHeld(k, steer) : {}),
    ...(weapons && houndWeaponsSeat(d, me) ? weaponsSeatHeld(weapons.sel, weapons.trigger, weapons.aim ?? -1) : {}) };   // W-4 spec §11: the Hound's Weapons seat
}
/** Whether two held frames differ (a change is stamped for the held delay). */
export const heldChanged = (a: HeldInput, b: HeldInput): boolean => a.moveX !== b.moveX || a.moveY !== b.moveY || a.interactHeld !== b.interactHeld || a.face !== b.face
  || a.aim !== b.aim || a.torpHeading !== b.torpHeading || a.throttleHeld !== b.throttleHeld || a.rcsX !== b.rcsX || a.rcsY !== b.rcsY   // W-3; playtest2feedback §7
  || a.weaponSel !== b.weaponSel || a.gunHeld !== b.gunHeld   // W-4
  || a.turretAim !== b.turretAim;   // W-4b
/** The session phases a Leave passes through, which show "LEAVING…" over the frozen view rather than CONNECTION LOST. */
const LEAVING_PHASES: readonly string[] = ['saving', 'idle', 'ended'];
/** The end card's leave prompt: open, and the round it was opened on. */
export interface LeavePrompt { open: boolean; round: number }
export const CLOSED_PROMPT: LeavePrompt = { open: false, round: -1 };
/** One pump's Escape and Enter against the leave prompt (spec §7). The prompt lives only on a decided, running round:
 *  a rematch from the partner (a new round), a pause or an undecided replica closes it before Escape is read, so that
 *  Escape then pauses as in play. Returns the next prompt, the command to send (setPaused) and whether to Leave. */
export function leavePromptKeys(prompt: LeavePrompt, d: DuelState, phase: string, presses: { pause: number; confirm: number }): { prompt: LeavePrompt; send: DuelCommand | null; leave: boolean } {
  const decided = d.tactical.outcome !== Outcome.Running;
  let open = prompt.open && decided && phase === 'running' && d.round === prompt.round, round = open ? prompt.round : -1, send: DuelCommand | null = null, leave = false;
  if (presses.pause > 0) {
    if (decided && phase === 'running') { open = !open; round = open ? d.round : -1; }   // on the end card Escape asks to leave
    else if (phase === 'running' || phase === 'paused') { open = false; round = -1; send = { kind: 'setPaused', paused: phase === 'running' }; }
  }
  if (open && presses.confirm > 0) { open = false; round = -1; leave = true; }
  return { prompt: { open, round }, send, leave };
}

export function createOnlineDuelSession(deps: OnlineDuelDeps) {
  const canvas = deps.renderer.app.canvas;
  // Enemy ship window spec §6.1, §6.2: local to this screen, never sent. While the window is shown its intercept takes Esc
  // (and T), so the leave prompt and setPaused below never see that Escape.
  const contact = createContactController(), requests = createMapRequests();
  // Feel-ii §2.7: G pings at the pointer (taken from the keyboard as the contact window's keys are), a middle click too.
  let pingKey = false, lastPing: number | null = null, pingsIn: (PingRequest & { player: number })[] = [];
  const keyboard = createDuelKeyboard(window as unknown as EventSource, { intercept: (code) => focused && !blocked && (contact.intercept(code) || (code === PING_CODE && (pingKey = true))) });
  deps.setConsole?.(keyboard.ui);
  deps.setContact?.(contact);
  const trackConsole = consoleChange(() => keyboard.clearUi());   // Artemis spec §6.2: a console change drops its holds
  const pointer = createPointerSource(canvas as unknown as EventSource, (cx, cy) => {
    const rect = canvas.getBoundingClientRect(), lb = computeLetterbox(rect.width, rect.height, INTERNAL_W, INTERNAL_H);
    return { x: (cx - rect.left - lb.offsetX) / lb.scale, y: (cy - rect.top - lb.offsetY) / lb.scale };
  });
  let client: ReturnType<typeof createDuelRemoteClient> | null = null, link: Link | null = null, source: OnlineDuelSource | null = null, scene: DuelScene | null = null;
  let descriptor: OnlinePortDescriptor | null = null, status: OnlineStatus | null = null;
  let frozen: DuelState | null = null, frozenPublication: { publicationSequence: number; tick: number; phase: string; pauseReason: string | null; pauseOwner: number | null } | null = null;
  let focused = true, blocked = false, synced = false, linkClosed = false, presenceSent = false, producing = false, disposed = false, leaveConfirm = CLOSED_PROMPT;
  let lastPhase = '', noticeUntil = 0, notice: string | null = null, lastFrame = 0, cameraKeys = keysOnly(sampleIdle());
  let attaches = 0, pauses = 0, roundAttaches = 1, roundPauses = 0, startedAtIso = new Date().toISOString(), cancel = () => {}, offClose = () => {};
  let lastHeld: HeldInput = { moveX: 0, moveY: 0, interactHeld: false }, lastFlags: HeldFlags = NO_HELD_FLAGS;
  // Playtest2feedback §4a: the crew Helm's held steer and its left button on the last pump.
  let steer = -1, steerPrev = false;
  let crewHelmPrev = false;   // final review I1: this seat flew the crew Helm on the last producing pump (in P, Net-4a §3.9)
  const requests0 = (): number | null => requests.takeHeading();   // Feel-ii §1.1: drained every pump
  // Playtest2feedback §4a: the map's steer bearing, drained every pump beside the heading. Inside pump the name `requests`
  // is shadowed by contact.takeRequests() (a ContactRequests, which has no takeSteer), so it is read through this closure.
  const takeSteer0 = (): number | null => requests.takeSteer();
  const pewRequest = (): number | null => requests.takePew();   // W-1: the Weapons map's pew aim, drained every pump
  const reticleNow = (): number | null => requests.reticleAim();   // W-2, W-4: the reticle (kept, not drained)
  const torpRequest = (): number | null => requests.takeTorpHeading();   // W-3: the MANUAL torpedo's held heading from the right button, drained every pump
  // W-4 spec §8: the map's trigger. Inside play and pump the name requests is a ContactRequests (shadowed), so it is read through this closure, as takeSteer0.
  const triggerNow = (): boolean => requests.triggerHeld();
  // Net-4a §3.9: the throttle, heading, modes and lock this seat asked for are in P (it holds every unacknowledged input), so
  // the decisions below read P and keep no in-flight copies. W-2 (pew pew spec §2): the laserFire commands this seat sent,
  // whose 'unavailable' answer shows NO CHARGE (W-1 review F2's rule).
  const laserSent = new Set<number>();
  // W-3 (pew pew spec §3): the MANUAL launches this seat sent, whose 'unavailable' answer names the reason (the always-send
  // rule); the MANUAL torpedo's held heading, re-sent in every held frame while it flies (−1 none), and the round it was reset on.
  // W-4 spec §9, §11: the Hound's Weapons seat's selection (pew pew at a sit), the last gun selected (W-4c reads it) and the
  // trigger on the last pump (the autocannon's refusal is on its press edge), and the round the selection was last reset on.
  let torpHold = -1, torpRound = -1, weaponSel = 0, lastGunSel = 0, triggerPrev = false, selRound = -1, flight: FlightLatch = NO_FLIGHT, triggerLive = false;   // W-4 spec §7: the seat's flight latch and this pump's gated trigger
  // Net-4a §3.9: the autocannon's mode this pump's play() decided (P's, after this pump's R or tag), or null. Its gunMode rides
  // this tick's entry with the held frame and the sim sets the mode before the gun fires (step.ts), so the trigger reads it.
  let gunManualNow: boolean | null = null;
  const torpSent = new Set<number>();
  // Net-4a §3.3, §3.4: the predictor (owned with the stream client), the last publication it was given, the local tick
  // clock, this tick's commands (collected by send), a neutralize's held sequence for the next entry, and the timings (§3.10).
  let predictor: DuelPredictor | null = null, confirmedSequence = 0, clockBase: number | null = null, localDone = 0, lastLocalAt = 0;
  let capped = false;   // Fable #8: the last local tick left P at the cap (it did not step), so the view holds at alpha 1
  let collected: CommandEnvelope<DuelCommand>[] | null = null, neutralSequence: number | null = null;
  const keep = (list: number[], ms: number): void => { list.push(ms); if (list.length > LIVE_SAMPLES) list.shift(); };
  const p99 = (xs: readonly number[]): number | null => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.ceil(0.99 * s.length) - 1)]! * 1000) / 1000; };
  const roundLead: number[] = [], roundCorrection: number[] = [], roundResim: number[] = [], liveResim: number[] = []; let roundVerified = 0, roundConfirms = 0;   // liveResim: F3's recent re-simulation times (R1-F12)
  // Fable #1, #2: the round's heading corrections (steps), its retargets' sizes (ticks) and count, the confirmed ticks its
  // predicted play spans (for the rate), F3's retarget times (ms) and the predictor's retarget count last seen.
  const roundHeading: number[] = [], roundRetarget: number[] = [], liveRetargets: number[] = [];
  let roundRetargets = 0, roundFirstTick: number | null = null, roundLastTick = 0, seenRetargets = 0;
  const RETARGET_WINDOW_MS = 60_000;
  const recentRetargets = (now: number): number => { while (liveRetargets.length && now - liveRetargets[0]! >= RETARGET_WINDOW_MS) liveRetargets.shift(); return liveRetargets.length; };
  const retargetsPerMin = (): number | null => { const minutes = roundFirstTick === null ? 0 : (roundLastTick - roundFirstTick) / 3600; return minutes > 0 ? Math.round(roundRetargets / minutes * 10) / 10 : null; };
  const heldStamps: { sequence: number; at: number }[] = [], commandStamps = new Map<number, number>(), pewSent = new Set<number>(), heldSamples: number[] = [], commandSamples: number[] = [], roundGaps: number[] = [];
  // The link (H-2b): the route label and RTT from main, the round's RTT samples; the overlay's recent delays.
  const liveHeld: number[] = [], liveCommand: number[] = [], roundRtt: number[] = [], debug = createKeyToggle(window as unknown as KeyTarget);
  let route: 'lan' | 'internet' | null = null, rttMs: number | null = null, lastPoll = -Infinity, polling = false;
  const sample = (round: number[], recent: number[], ms: number): void => { round.push(ms); recent.push(ms); if (recent.length > LIVE_SAMPLES) recent.shift(); };
  const transport = (): DuelPlaytestRecord['transport'] => (status?.role === 'host' ? 'loopback' : route);
  function pollLink(): void {
    const now = deps.now();
    if (!deps.api.linkStats || polling || now - lastPoll < LINK_POLL_MS) return;
    polling = true; lastPoll = now;
    void deps.api.linkStats().then((s) => {
      if (disposed) return;
      // No figure now: the label stays (Decision 4), the live RTT does not.
      if (!s) { rttMs = null; return; }
      route = s.route; rttMs = s.rttMs; roundRtt.push(s.rttMs); if (roundRtt.length > 4096) roundRtt.shift();
    }, () => {}).finally(() => { polling = false; });
  }
  function sampleIdle(): KeySample { return { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() }; }
  // Once the link has closed the frozen copy is the view, whatever the closed client still holds.
  const state = (): DuelState | null => (linkClosed ? null : client?.state()) ?? frozen;
  const publication = () => (linkClosed ? null : client?.publication()) ?? frozenPublication;
  const live = (): boolean => !!client && !linkClosed && !!client.publication();
  function hint(phase: 'synced' | 'running' | 'paused' | 'ended') { if (descriptor) void deps.api.viewState(descriptor.epoch, phase).catch(() => {}); }
  function send(command: DuelCommand): CommandId | null {
    if (!client || !descriptor) return null;
    const id = client.command(descriptor.seatId, command);
    if (id && command.kind !== 'presence') commandStamps.set(id.sequence, deps.now());
    // Net-4a §3.3: this local tick's commands go into its log entry; setPaused, rematch and presence are never predicted.
    if (id && collected && command.kind !== 'setPaused' && command.kind !== 'rematch' && command.kind !== 'presence') collected.push({ runId: descriptor.runId, id, requestedTick: 0, command });
    return id;
  }
  /** Fable #4: a predictor that throws is dropped for this attach; the view falls back to the confirmed replica. */
  function dropPredictor(err: unknown): void {
    console.error('[online duel] the predictor failed; drawing the confirmed replica', err);
    predictor?.dispose(); predictor = null; confirmedSequence = 0; seenRetargets = 0;
  }
  /** The authority's held frame is neutral once input stops, so this seat's drawn axes drop too. */
  function neutralSource(): void { source?.sent(neutral()); }
  function stopInput(): void {
    if (client && descriptor && producing) {
      const s = client.neutralize(descriptor.seatId); if (s !== null) neutralSequence = s;   // Net-4a §3.3: the next entry carries it. FTL targeting spec §2: the crew's Space is a single press, so there is no held charge to let go of
    }
    producing = false; keyboard.clear(); pointer.clear(); crewHelmPrev = false;   // I1: back at the crew Helm, its held keys go stale again
    neutralSource();
  }
  function release(): void {
    stopInput(); offClose(); offClose = () => {};
    client?.dispose(); client = null; predictor?.dispose(); predictor = null; confirmedSequence = 0; neutralSequence = null; link?.close('renderer-detached'); link = null;
  }
  function freeze(): void {
    if (linkClosed) return;   // frozen at the close: the copy is final until the next attach
    const d = client?.state(), p = client?.publication();
    if (!d || !p || !descriptor) return;
    if (frozen) disposeDuel(frozen);
    frozen = loadDuelSnapshot(deps.resolveLayout(d.interior.layout.id), saveDuelSnapshot(d, deps.contentDigest), deps.contentDigest);
    frozenPublication = { publicationSequence: p.publicationSequence, tick: p.tick, phase: p.phase, pauseReason: p.pauseReason, pauseOwner: p.pauseOwner };
  }
  function record(summary: DuelRoundRecord): void {
    const d = state(); if (!d || !descriptor) return;
    const r: DuelPlaytestRecord = { version: 1, session: 'online', role: status?.role === 'host' ? 'host' : 'guest', transport: transport(),
      seat: descriptor.seatId, helmPlayer: d.helmPlayer, seed: summary.seed, round: summary.round, startedAtIso,
      // The RTT is the median of the round's samples from the RTC window's stats (null when main reported none).
      summary, latency: { held: latencyFigure(heldSamples), command: latencyFigure(commandSamples), rttMs: latencyFigure(roundRtt.splice(0)).median },
      // Per round: the disconnects and pauses since the last record (the first attach is not a disconnect).
      jitter: arrivalJitter([...roundGaps.splice(0), ...(source?.takeArrivals() ?? [])]), disconnects: Math.max(0, attaches - roundAttaches), pauses: pauses - roundPauses,
      ...(roundConfirms > 0 ? { prediction: { lead: latencyFigure(roundLead), verifiedShare: roundVerified / roundConfirms, correction: fineFigure(roundCorrection), heading: fineFigure(roundHeading),
        resimP99Ms: p99(roundResim), retargetsPerMin: retargetsPerMin(), retarget: latencyFigure(roundRetarget) } } : {}) };
    heldSamples.length = 0; commandSamples.length = 0; roundLead.length = 0; roundCorrection.length = 0; roundResim.length = 0; roundVerified = 0; roundConfirms = 0;
    roundHeading.length = 0; roundRetarget.length = 0; roundRetargets = 0; roundFirstTick = null; roundLastTick = 0; roundAttaches = Math.max(1, attaches); roundPauses = pauses; startedAtIso = new Date().toISOString();
    void Promise.resolve(deps.recordDuel?.(r)).catch(() => {});
  }
  function observe(): void {
    if (!client || !descriptor || !source) return;
    const fresh = source.observe(), p = client.publication(), d = client.state();
    if (!p || !d) return;
    if (predictor && p.publicationSequence !== confirmedSequence) {   // Net-4a §3.4: verify, else re-simulate, else reset
      confirmedSequence = p.publicationSequence;
      let done: { result: ReturnType<DuelPredictor['confirm']>; ms: number; st: PredictionStats } | null = null;
      try { const t0 = deps.now(), result = predictor.confirm(p, d); done = { result, ms: deps.now() - t0, st: predictor.stats() }; } catch (err) { dropPredictor(err); }   // Fable #4
      if (done) {
        // §3.10: the round's figures. A reset (a pause, a new or decided round) is not a prediction.
        const { result, ms, st } = done, bound = (list: number[], v: number): void => { list.push(v); if (list.length > 4096) list.shift(); };
        if (result !== 'reset') { roundConfirms++; if (result === 'verified') roundVerified++; bound(roundLead, st.lead); roundFirstTick ??= p.tick; roundLastTick = p.tick; }
        if (result === 'resimulated') { bound(roundResim, ms); keep(liveResim, ms); if (st.correction) { bound(roundCorrection, st.correction.ship); bound(roundHeading, st.correction.heading); } }
        if (st.retargets > seenRetargets) { roundRetargets++; bound(roundRetarget, Math.abs(st.lastRetarget)); bound(liveRetargets, deps.now()); }   // Fable #2: one confirm moves the target at most once
        seenRetargets = st.retargets;
      }
    }
    if (!synced && client.commandStatus(descriptor.seatId).state === 'ready') {
      synced = true; hint('synced');
      if (!presenceSent) { presenceSent = true; send({ kind: 'presence', present: true }); }   // the first command after every attach (spec §6)
      notice = seatOf(d, descriptor.seatId) === 'helm' ? 'YOU: HELM' : seatOf(d, descriptor.seatId) === 'weapons' ? 'YOU: WEAPONS' : seatOf(d, descriptor.seatId) === 'science' ? 'YOU: SCIENCE' : 'TAKE A CONSOLE: E TO SIT';   // a round starts aboard, standing (start-aboard spec §1)
      noticeUntil = deps.now() + NOTICE_MS;
    }
    if (synced && p.phase !== lastPhase) { if (p.phase === 'paused' && lastPhase === 'running') pauses++; lastPhase = p.phase; if (p.phase !== 'error') hint(p.phase); }
    const now = deps.now();
    if (fresh) while (heldStamps.length && heldStamps[0]!.sequence <= p.heldHighWater[descriptor.seatId]!) sample(heldSamples, liveHeld, now - heldStamps.shift()!.at);
    for (const result of client.takeResults()) {
      // W-1 review F2: the authority decides NO CHARGE (the lagging replica cannot): its 'unavailable' for a pewFire this seat sent shows it.
      if (result.id.player === descriptor.seatId && pewSent.delete(result.id.sequence) && result.status === 'rejected' && result.reason === 'unavailable') source.refuse('pew', 'NO CHARGE');
      if (result.id.player === descriptor.seatId && laserSent.delete(result.id.sequence) && result.status === 'rejected' && result.reason === 'unavailable') source.refuse('fire', 'NO CHARGE');   // W-2
      if (result.id.player === descriptor.seatId && torpSent.delete(result.id.sequence) && result.status === 'rejected' && result.reason === 'unavailable') source.refuse('launch', refusal(d, 'launch', true) ?? 'NO TORPEDOES');   // W-3
      const at = result.id.player === descriptor.seatId ? commandStamps.get(result.id.sequence) : undefined;
      if (at !== undefined) { commandStamps.delete(result.id.sequence); if (result.status === 'applied') sample(commandSamples, liveCommand, now - at); }
    }
    for (const event of client.takeEvents()) {
      if (event.payload.kind === 'cue') deps.playCue?.(event.payload.cue);
      if (event.payload.kind === 'ping') { const p = event.payload; pingsIn.push({ player: p.player, x: p.x, y: p.y, target: p.target }); if (pingsIn.length > 16) pingsIn.shift(); }
      if (event.payload.kind === 'round') record(event.payload.record);
    }
  }
  /** One frame's press edges for this seat, by where its character is (H-1 spec §5 table, without Tab). */
  function play(k: KeySample, d: DuelState, me: number, requests: ContactRequests, heading: number | null, prevHeld: HeldFlags, pew: number | null, steerNow: number | null): void {
    for (const c of k.ship ?? []) send(c);   // Engineering spike §7: the ship view's clicks, as Single player queues them
    const seat = seatOf(d, me), p = k.presses;
    if (!houndWeaponsSeat(d, me)) { weaponSel = 0; lastGunSel = 0; triggerPrev = false; flight = NO_FLIGHT; triggerLive = false; }   // W-4 spec §9: a sit starts on pew pew (as Single player, before the standing return)
    if (seat === 'standing') {
      if (p.interact > 0 && repairInReach(d, me) < 0) { const c = consoleInReach(d, me); if (c >= 0) { torpHold = -1; weaponSel = 0; lastGunSel = 0; triggerPrev = false; flight = NO_FLIGHT; triggerLive = false; send({ kind: 'sit', station: c }); } }
      return;
    }
    if (p.stand > 0) { torpHold = -1; weaponSel = 0; lastGunSel = 0; triggerPrev = false; flight = NO_FLIGHT; triggerLive = false; send({ kind: 'stand' }); return; }
    if (requests.scan !== null && d.tactical.known[requests.scan] < CONTACT_MAX_LEVEL[requests.scan]) send({ kind: 'contactScan', contact: requests.scan });   // Sci-1 spec §5
    if (crewHelmSeat(d, me)) {   // playtest2feedback §3-§5: the held frame carries the rest
      if (p.camera > 0 && source) snapBack(source.cameras.helm);
      // Net-4a §3.9: deduped against P's hold (P already cleared it on the ticks auto-face was held).
      if (heading !== null && Number.isInteger(heading) && heading >= -1 && heading < 256 && heading !== d.holdHeading) send({ kind: 'heading', heading });
      // §4a: a hold steers once the map gives a bearing (a press over a block or the ship steers nothing yet).
      const off = refusal(d, 'turn'), held = k.held ?? NO_HELD_FLAGS, steering = pointer.leftHeld(), steered = steering && steerNow !== null;
      if (off) {
        if (steered && !steerPrev) source?.refuse('turn', off);   // the hold's first steer (final review M1)
        if (held.fire && !prevHeld.fire) source?.refuse('auto-face', off);
        if ((held.up && !prevHeld.up) || (held.down && !prevHeld.down)) source?.refuse('throttle', off);
        if (heading !== null && heading >= 0) source?.refuse('heading', off);
      }
      steerPrev = steering && (steerPrev || steered);   // owner 2026-11-19: the free cold gas has no refusal
      return;
    }
    if (seat === 'helm') {
      if (p.camera > 0 && source) snapBack(source.cameras.helm);
      const level = throttleRequest(d.throttle, p, k.throttleTo, throttleCap(d.tactical.systems[0]!));   // Artemis spec §5.4; Net-4a §3.9: from P's level
      if (level !== null) send({ kind: 'throttle', level });
      // Feel-ii §1.1, Net-4a §3.9: deduped against P's hold (P already cleared it on the ticks A/D or auto-face were held).
      if (heading !== null && Number.isInteger(heading) && heading >= -1 && heading < 256 && heading !== d.holdHeading) send({ kind: 'heading', heading });
      // Feel-ii §2.8: with Engines off the Helm's controls fly nothing (the commands still go).
      const off = refusal(d, 'turn'), held = k.held ?? NO_HELD_FLAGS;
      if (off) {
        if ((held.left && !prevHeld.left) || (held.right && !prevHeld.right)) source?.refuse('turn', off);
        if (held.fire && !prevHeld.fire) source?.refuse('auto-face', off);
        if (level !== null) source?.refuse('throttle', off);
        if (heading !== null && heading >= 0) source?.refuse('heading', off);
      }
      return;
    }
    if (seat === 'science') {   // Sci-1 spec §7.3
      if (requests.designate !== null) send({ kind: 'designate', contact: requests.designate });
      if (p.camera > 0 && source) snapBack(source.cameras.science);
      return;
    }
    if (houndWeaponsSeat(d, me)) {   // W-4 spec §9, §11 (W-4a): the Hound's Weapons seat, as Single player's
      const sys0 = d.tactical.systems[0];
      const ff = flightFrame(flight, manualTorpedoFlying(d.tactical), weaponSel, lastGunSel, triggerNow(), pointer.leftHeld());   // W-4 spec §7: P's flight (Net-4a §3.9); the raw left button (Decision 7)
      flight = ff.latch; triggerLive = ff.trigger;
      weaponSel = nextWeaponSel(ff.sel, k);   // W-4 spec §7: A/D select during a flight too
      if (weaponSel !== WeaponSlot.Torpedo) lastGunSel = weaponSel;
      const click = ff.clicks ? pew : null;   // the map's left click, unless it is the start of a steer
      const dw = powerDelta(p);   // W / S: a bar on or off the selected weapon (at Weapons they are not the throttle)
      if (dw !== 0) {
        for (let n = 0; n < Math.abs(dw); n++) send({ kind: 'weaponPower', slot: weaponSel, delta: Math.sign(dw) });
        const why = weaponPowerRefusal(d, weaponSel, Math.sign(dw)); if (why) source?.refuse('power', why);
      }
      // W-4 amendment §3.6, Net-4a §3.9: E / Q step the target room from P's lock; a plain room click in the enemy window sets
      // it. Neither makes a torpedo lock, and requests.torpStep is not read here.
      const sendLock = (room: number): void => {
        send({ kind: 'laserLock', room });
        const why = lockRefusal(d); if (why) source?.refuse('laser', why);   // NO CONTACT: the authority refuses a room on an unseen enemy
      };
      const steps = p.interact - p.prevLock;
      if (steps !== 0) {
        let room = sys0.lock;
        for (let n = 0; n < Math.abs(steps); n++) room = cycleLock(room, steps > 0 ? 1 : -1);
        sendLock(room);
      }
      if (k.lockTo !== undefined && k.lockTo !== null && k.lockTo >= 0 && k.lockTo <= 2) sendLock(k.lockTo);   // a clear (−1) is never sent
      if (k.torpTo !== undefined && k.torpTo !== null && k.torpTo >= -1 && k.torpTo <= 2) send({ kind: 'torpLock', room: k.torpTo });
      for (const rl of [requests.rockLock, k.rockTo]) if (rl && rl.weapon === 'torpedo') send({ kind: 'rockLock', weapon: 'torpedo', rock: rl.rock });
      const fk = k.gunFreqKeyTo ?? k.freqTo;   // 4 / 5 / 6 or the row's buttons (§5.2), a one-shot edge sent as it comes (Sci-1 §7.4's online rule); 3 selects
      if (fk !== undefined && fk !== null && Number.isInteger(fk) && fk >= 0 && fk <= 2) send({ kind: 'laserFrequency', freq: fk });
      // W-4 amendment §2.4, §2.5, Net-4a §3.9: R, Shift+R and the tags, each weapon judged from its mode in P. Z and V are not
      // read at this seat.
      const mode = modeRequests([sys0.pewManual, sys0.gunManual, sys0.torpManual], weaponSel, p, k.modeTaps);
      for (const slot of [0, 1] as const) if (mode.changed[slot]) send({ kind: 'gunMode', slot, manual: mode.modes[slot] });
      if (mode.changed[2]) send({ kind: 'torpMode', manual: mode.modes[2] });
      const pewManual = mode.modes[0], gunManual = mode.modes[1], torpManual = mode.modes[2];
      gunManualNow = gunManual;
      const launches = p.launch + (click !== null && weaponSel === WeaponSlot.Torpedo ? 1 : 0);   // F, or LMB with the torpedo selected
      if (launches > 0 && torpManual) {   // W-3's MANUAL rule for the lagging replica, as the laser branch's
        const why = refusal(d, 'launch', true);
        if (why && why !== 'NO TORPEDOES') source?.refuse('launch', why);
        else { const id = send({ kind: 'missileLaunch' }); if (id) torpSent.add(id.sequence); }
      } else if (launches > 0 && canLaunch(d.tactical, 0, sys0.torpRock, false)) send({ kind: 'missileLaunch' });
      const launchWhy = launches > 0 && !torpManual ? refusal(d, 'launch', false) : null;   // Feel-ii §2.8, as the laser branch's
      if (launchWhy) source?.refuse('launch', launchWhy);
      if (click !== null && weaponSel === WeaponSlot.Pew && pewManual) {   // W-4 spec §4.3: on AUTO the click does nothing; on MAN, LMB with pew pew selected; W-1 review F2's rule: NO CHARGE is the authority's
        const why = refusal(d, 'pew');
        if (why && why !== 'NO CHARGE') source?.refuse('pew', why);
        else { const id = send({ kind: 'pewFire' }); if (id) pewSent.add(id.sequence); }
      }
      const trig = triggerLive;   // W-4 spec §7: the gated trigger; the autocannon fires while held (the held frame's gunHeld); a dead trigger says why
      if (trig && !triggerPrev && weaponSel === WeaponSlot.Autocannon && gunManual) { const why = refusal(d, 'autocannon'); if (why) source?.refuse('autocannon', why); }
      triggerPrev = trig;
      if (p.camera > 0 && source) { const cam = source.cameras.weapons; snapBack(cam, missileOf(d.tactical, 0) && cam.follow !== 'missile' ? 'missile' : 'ship'); }
      return;   // Space, Z and V do nothing here (W-4 amendment §2.4)
    }
    // E and Q step the laser's target room from P's lock (FTL targeting spec §1: a target, so it auto-fires; Net-4a §3.9).
    const steps = p.interact - p.prevLock, sys = d.tactical.systems[0];
    if (p.interact + p.prevLock > 0 && steps !== 0) {
      let room = sys.lock;
      for (let n = 0; n < Math.abs(steps); n++) room = cycleLock(room, steps > 0 ? 1 : -1);
      send({ kind: 'laserLock', room });
      const why = lockRefusal(d); if (why) source?.refuse('laser', why);   // Engineering spike §10.4: the sim refuses a lock on an unseen enemy
    }
    if (k.lockTo !== undefined && k.lockTo !== null && k.lockTo >= -1 && k.lockTo <= 2) send({ kind: 'laserLock', room: k.lockTo });   // a room click or a card's clear
    if (k.torpTo !== undefined && k.torpTo !== null && k.torpTo >= -1 && k.torpTo <= 2) send({ kind: 'torpLock', room: k.torpTo });   // the torpedo's
    if (requests.rockLock) send({ kind: 'rockLock', weapon: requests.rockLock.weapon, rock: requests.rockLock.rock });   // spike ii §6.5
    if (k.rockTo) send({ kind: 'rockLock', weapon: k.rockTo.weapon, rock: k.rockTo.rock });
    if (requests.torpStep) {   // E / Q while the torpedo is picked up: its own target
      send({ kind: 'torpLock', room: stepTorpRoom(sys.torpLock, requests.torpStep) });
      const why = lockRefusal(d); if (why) source?.refuse('launch', why);   // spec §10.4: as the laser's E/Q
    }
    // Sci-1 spec §7.4: a one-shot edge, sent as it comes (the lagging replica is no base, a quick undo would be dropped); the sim answers noop to an unchanged value
    const lk = laserFreqKey(k);   // W-4 spec §9: 3/4/5 (the key field) or a console button
    if (lk !== undefined && lk !== null && Number.isInteger(lk) && lk >= 0 && lk <= 2) send({ kind: 'laserFrequency', freq: lk });
    // W-2 (pew pew spec §2), Net-4a §3.9: Z or the LASER card's AUTO / MAN tag toggles the laser's mode, from P's (an odd
    // number of presses this pump toggles it).
    let manual = sys.laserManual;
    if (p.laserMode % 2 === 1 && classOf(d.tactical, 0).slots.laser !== null) { manual = !manual; send({ kind: 'laserMode', manual }); }
    if (manual) {
      // W-2: in MANUAL Space fires the laser along the Weapons map's aim (else the nose). The replica lags the authority, so its
      // charge is no gate (W-1 review F2's rule): NO GUNNER, TORPEDO FLYING and WEAPONS OFFLINE refuse locally, a press on a
      // seemingly uncharged replica is sent anyway, and the authority's 'unavailable' answer (observe) shows NO CHARGE.
      if (p.fireDown > 0) {
        const why = refusal(d, 'fire', true);
        if (why && why !== 'NO CHARGE') source?.refuse('fire', why);
        else {
          const aim = reticleNow() ?? d.tactical.ships[0].heading * HEADING_COUNT, id = send({ kind: 'laserFire', aim: Math.floor(aim / HEADING_COUNT), aimAcc: aim % HEADING_COUNT });
          if (id) laserSent.add(id.sequence);
        }
      }
    } else if (p.fireDown > 0 && canCharge(d.tactical, 0)) send({ kind: 'laserCharge', held: true });   // FTL targeting spec §2: Space is a single press that fires a full laser; there is no release to send
    // W-3 (pew pew spec §3), Net-4a §3.9: V or the TORPEDO card's AUTO / MAN tag toggles the torpedo's mode, from P's (an odd
    // number of presses this pump toggles it).
    let torpManual = sys.torpManual;
    if (p.torpMode % 2 === 1) { torpManual = !torpManual; send({ kind: 'torpMode', manual: torpManual }); }
    if (p.launch > 0 && torpManual) {
      // W-3: in MANUAL F needs no target and no range. The replica lags the authority, so its magazine is no gate (W-1 review
      // F2's rule): NO GUNNER, TORPEDO FLYING and WEAPONS OFFLINE refuse locally, a press on a seemingly empty magazine is
      // sent anyway, and the authority's 'unavailable' answer (observe) names the reason.
      const why = refusal(d, 'launch', true);
      if (why && why !== 'NO TORPEDOES') source?.refuse('launch', why);
      else { const id = send({ kind: 'missileLaunch' }); if (id) torpSent.add(id.sequence); }
    } else if (p.launch > 0 && canLaunch(d.tactical, 0, sys.torpRock, false)) send({ kind: 'missileLaunch' });
    // Feel-ii §2.8: FIRE and LAUNCH say why when the sim would refuse them (the same checks that hold them back above).
    const fireWhy = p.fireDown > 0 && !manual ? refusal(d, 'fire', false) : null, launchWhy = p.launch > 0 && !torpManual ? refusal(d, 'launch', false) : null;
    if (fireWhy) source?.refuse('fire', fireWhy);
    if (launchWhy) source?.refuse('launch', launchWhy);
    // W-1 (pew pew spec §1): the pew from the Weapons map's left click. The replica lags the authority, so its charge is no gate
    // (review F2): NO GUNNER and NO PEW refuse locally, a click on a seemingly empty replica is sent anyway, and the authority's
    // 'unavailable' answer (observe) shows NO CHARGE.
    if (pew !== null) {
      const why = refusal(d, 'pew');
      if (why && why !== 'NO CHARGE') source?.refuse('pew', why);
      else { const id = send({ kind: 'pewFire' }); if (id) pewSent.add(id.sequence); }
    }
    if (p.camera > 0 && source) { const cam = source.cameras.weapons; snapBack(cam, missileOf(d.tactical, 0) && cam.follow !== 'missile' ? 'missile' : 'ship'); }
  }
  /** Net-4a §3.3: a producing local tick (the first of a pump): the presses, the commands and this seat's held frame. */
  function produce(): LocalInput {
    collected = null; gunManualNow = null;   // a throw in play() on an earlier tick leaves no stale list, and no stale gunManualNow
    let k = keyboard.sample();
    const requests = contact.takeRequests(), heading = requests0(), steerTaken = takeSteer0(), pew = pewRequest(), torpNow = torpRequest();   // drained before any early return, so a steer never goes stale
    const prevHeld = lastFlags; lastFlags = k.held ?? NO_HELD_FLAGS;
    source?.heldFlags(k.held ?? NO_HELD_FLAGS);
    cameraKeys = { ...cameraKeys, presses: { ...cameraKeys.presses, zoomIn: cameraKeys.presses.zoomIn + k.presses.zoomIn, zoomOut: cameraKeys.presses.zoomOut + k.presses.zoomOut, camera: cameraKeys.presses.camera + k.presses.camera } };
    // Net-4a §3.9, §3.6: the console decisions read the prediction (P); the round's outcome and the leave prompt stay on the
    // confirmed replica (c), so a predicted kill never neutralizes input or opens the prompt ahead of the authority (R1-F8).
    const c = client?.state(), d = predictor?.state() ?? c, p = client?.publication();
    if (d && d.round !== torpRound) { torpRound = d.round; torpHold = -1; }   // W-3: a new round holds no MANUAL heading
    if (d && d.round !== selRound) { selRound = d.round; weaponSel = 0; lastGunSel = 0; triggerPrev = false; flight = NO_FLIGHT; triggerLive = false; }   // W-4 spec §9: every round starts on pew pew
    if (!client || linkClosed || !c || !d || !p || !descriptor || !synced || !focused || blocked) { if (producing) stopInput(); return idle(); }
    const me = descriptor.seatId, decided = c.tactical.outcome !== Outcome.Running;
    // Final review I1: on the pump this seat becomes the crew Helm (P's predicted sit, Net-4a §3.9), the keys held now are
    // stale until pressed again (E sits and is a thruster; W, A and D walk), and this sample's crew fields are dropped.
    const crewHelmNow = crewHelmSeat(d, me);
    if (crewHelmNow && !crewHelmPrev) { keyboard.staleHeld(); k = { ...k, throttleHeld: 0, rcsX: 0, rcsY: 0 }; }
    crewHelmPrev = crewHelmNow;
    // Escape and the leave prompt (spec §7): a prompt from a round that is no longer decided and running closes first.
    const keys = leavePromptKeys(leaveConfirm, c, p.phase, k.presses);
    leaveConfirm = keys.prompt;
    if (keys.send) send(keys.send);
    if (keys.leave) deps.leave();
    if (leaveConfirm.open || keys.leave) { producing = true; const s = client.held(me, neutral()); neutralSource(); if (s === null) return idle(); neutralSequence = null; return { heldSequence: s, held: neutral(), commands: [] }; }
    if (p.phase !== 'running') { neutralSource(); return idle(); }
    collected = [];
    if (decided) { if (k.presses.confirm > 0) send({ kind: 'rematch' }); }
    else play(k, d, me, requests, heading, prevHeld, pew, steerTaken);
    // Held input every pump, quantised to −1, 0 and 1 (spec §3); a change is stamped for the held delay.
    // Feel-i (console feel spec §2): Space held at the Helm is auto-face, sent only from the Helm, as the sim admits it.
    // Playtest2feedback §4a: the crew Helm steers by the map's bearing only while the left button is held (Decision 9's rule
    // for the player: let go, no aim goes out and the sim holds the last one).
    steer = crewHelmNow && pointer.leftHeld() ? steerTaken ?? steer : -1;
    // W-3 (pew pew spec §3), W-4 spec §7: at Weapons, while P shows the crew's MANUAL torpedo flying, the map's LMB steer
    // gives it a heading to hold (torpHold, re-sent every pump; letting go keeps the last one) until the flight ends.
    const torpSteering = !decided && seatOf(d, me) === 'weapons' && manualTorpedoFlying(d.tactical);
    if (!torpSteering) torpHold = -1; else if (torpNow !== null && torpNow >= 0) torpHold = torpNow;
    const held: HeldInput = { ...sessionHeld(k, d, me, steer, { sel: weaponSel, trigger: triggerLive && (gunManualNow ?? d.tactical.systems[0].gunManual), aim: reticleNow() ?? -1 }), ...(torpHold >= 0 ? { torpHeading: torpHold } : {}) };
    const sent = decided ? neutral() : held, sequence = client.held(me, sent);
    if (sequence !== null && !decided && heldChanged(held, lastHeld)) {
      heldStamps.push({ sequence, at: deps.now() }); if (heldStamps.length > 64) heldStamps.shift();
    }
    if (!decided) { lastHeld = held; source?.sent(held); }
    producing = true;
    const commands = collected; collected = null;
    if (sequence === null) return idle();
    neutralSequence = null;   // a newer held frame supersedes a parked neutralize's sequence
    return { heldSequence: sequence, held: sent, commands };
  }
  /** Net-4a §3.3: a not-producing local tick: neutral, no commands, and the sequence of a neutralize sent since, if any. */
  function idle(): LocalInput { const s = neutralSequence; neutralSequence = null; return { heldSequence: s, held: neutral(), commands: [] }; }
  /** A later local tick of the same pump: the first's held input again, no presses and no commands, its own held frame. */
  function repeat(first: LocalInput): LocalInput {
    if (first.heldSequence === null || !client || !descriptor || !producing) return idle();
    const s = client.held(descriptor.seatId, first.held);
    return s === null ? idle() : { heldSequence: s, held: first.held, commands: [] };
  }
  /** Net-4a §3.3: the local ticks due by elapsed time, 60 a second; the first call runs one; at most LOCAL_TICKS_MAX a
   *  call. One call samples input once (Task 7): its first tick produces, the rest repeat it. Fable #7: the pump and every
   *  drawn frame call it, so a frame drawn after a tick boundary but before the late timer fires is never behind. */
  function runLocalTicks(): void {
    const now = deps.now();
    if (clockBase === null) { clockBase = now - LOCAL_TICK_MS; localDone = 0; }
    const due = Math.floor((now - clockBase) / LOCAL_TICK_MS + 1e-6);
    let n = due - localDone;
    if (n > LOCAL_TICKS_MAX) { localDone = due - LOCAL_TICKS_MAX; n = LOCAL_TICKS_MAX; }
    let first: LocalInput | null = null;
    for (let i = 0; i < n; i++) {
      localDone++; lastLocalAt = clockBase + localDone * LOCAL_TICK_MS;
      const entry: LocalInput = first ? repeat(first) : produce();
      first ??= entry;
      if (predictor) try { capped = !predictor.tick(entry); } catch (err) { dropPredictor(err); }
    }
  }
  function pump(): void {
    if (disposed) return;
    observe(); pollLink();
    runLocalTicks();
  }
  // Fable #4: a throw in one pump must not stop the session: the next pump is scheduled whatever happens.
  function schedule(): void { cancel = deps.scheduler.schedule(1000 / 60, () => { try { pump(); } finally { if (!disposed) schedule(); } }); }
  schedule();
  function bannerText(): string | null {
    const p = publication();
    // A deliberate Leave (the end card's or the menu's button) saves, then goes idle or ended: no reconnect is coming.
    if ((!client || linkClosed) && frozen) return status && LEAVING_PHASES.includes(status.phase) ? 'LEAVING…' : 'CONNECTION LOST — RECONNECTING';
    if (leaveConfirm.open) return 'LEAVE THE DUEL?   ENTER: LEAVE   ESC: STAY';
    if (p?.phase !== 'paused') return null;
    const reason = (p as { pauseReason?: string | null }).pauseReason, owner = (p as { pauseOwner?: number | null }).pauseOwner;
    const why = reason === 'player' && owner !== null && owner !== undefined ? `PAUSED BY PLAYER ${owner + 1}` : reason === 'peer-lost' ? 'PARTNER LOST' : 'PAUSED';
    return `${why}   ESC: RESUME`;
  }
  return {
    attach(next: OnlinePortDescriptor, port: MessagePort): void {
      if (disposed || next.epoch <= (descriptor?.epoch ?? 0)) { port.close(); return; }
      observe(); release();
      // This round's gaps before the re-attach stay in its record (the reconnect time itself is never one).
      if (source) { roundGaps.push(...source.takeArrivals()); if (roundGaps.length > 4096) roundGaps.splice(0, roundGaps.length - 4096); }
      descriptor = next; linkClosed = false; synced = false; presenceSent = false; lastPhase = ''; leaveConfirm = CLOSED_PROMPT; torpHold = -1; weaponSel = 0; lastGunSel = 0; triggerPrev = false; flight = NO_FLIGHT; triggerLive = false; steer = -1; steerPrev = false; attaches++;
      heldStamps.length = 0; commandStamps.clear(); pewSent.clear(); laserSent.clear(); torpSent.clear();   // the new client restarts its sequences: an old stamp would match a new frame
      // Spec §6.2: a map click counts only while this window has focus and input is not blocked; otherwise it is drained and dropped.
      scene ??= createDuelScene(deps.renderer, { seed: 0, pauseText: 'PAUSED', ui: deps.ui, audio: deps.audio, contact,
        takeClick: () => { const click = pointer.takeClick(); return focused && !blocked ? click : null; },
        pointer: () => (focused && !blocked ? pointer.position() : null),
        // Feel-ii §1.1, §2.7: the Helm's right-button aim, and the pings (out on the cosmetic channel, back as events).
        takeAim: () => { const aim = pointer.takeAim(); return focused && !blocked ? aim : null; }, requests,
        leftHeld: () => focused && !blocked && pointer.leftHeld(),   // playtest2feedback §4a: the crew Helm's steer
        takePingAt: () => { const key = pingKey ? pointer.position() : null, click = pointer.takeMiddleClick(); pingKey = false; return focused && !blocked ? click ?? key : null; },
        sendPing: (p) => { const now = deps.now(); if (!client || !descriptor || !pingAllowed(lastPing, now)) return; lastPing = now; client.ping(descriptor.seatId, p.x, p.y, p.target); },
        takePings: () => pingsIn.splice(0),
        shipCommand: (c) => { if (focused && !blocked) keyboard.ui.ship?.(c); } });   // Engineering spike §5: as the map click, only while focused
      link = createPortLink(browserPortEndpoint(port), `online:${next.seatId}`, { latestStreamKey: bytes => classifyStreamPacket(bytes).stream });
      // Subscribe before the client, which releases its replica on close: keep the last view frozen.
      offClose = link.onClose(() => { freeze(); stopInput(); linkClosed = true; predictor?.dispose(); predictor = null; confirmedSequence = 0; });   // Net-4a §3.4: no hidden P steps on after a close
      client = createDuelRemoteClient(link, [next.seatId], { runId: next.runId, contentDigest: deps.contentDigest, resolveLayout: deps.resolveLayout, clock: { nowMs: deps.now } });
      predictor = createDuelPredictor({ seat: next.seatId, contentDigest: deps.contentDigest, resolveLayout: deps.resolveLayout }); seenRetargets = 0; capped = false;   // Net-4a §3.4: one per client
      source = createOnlineDuelSource({ client: { state, publication, live }, seat: next.seatId, now: deps.now, viewport: { w: INTERNAL_W, h: INTERNAL_H },
        prediction: { active: () => !linkClosed && (predictor?.active() ?? false), state: () => predictor?.state() ?? null, before: () => predictor?.before() ?? null,
          alpha: () => (capped ? 1 : Math.max(0, Math.min(1, (deps.now() - lastLocalAt) / LOCAL_TICK_MS))) } });
    },
    setStatus(next: OnlineStatus): void {
      status = next;
      if (['error', 'reconnecting', 'saved', 'saving', 'rehosting', 'idle', 'ended'].includes(next.phase) && client) { observe(); freeze(); release(); }
    },
    setFocused(value: boolean): void { if (focused === value) return; focused = value; if (!value) stopInput(); },
    setInputBlocked(value: boolean): void { if (blocked === value) return; blocked = value; if (value) stopInput(); },
    pause(): void { const p = client?.publication(); if (focused && synced && client && !linkClosed && p && (p.phase === 'running' || p.phase === 'paused')) send({ kind: 'setPaused', paused: p.phase === 'running' }); },
    frame(): void {
      if (disposed) return;
      // Nothing to draw: hide the overlay rather than freeze it.
      if (!scene || !source) { deps.latency?.clear(); return; }
      if (client && !linkClosed) runLocalTicks();   // Fable #7: the ticks due by now, so alpha stays in [0, 1] without a clamp
      const now = deps.now(), dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 1 / 60; lastFrame = now;
      const d = state(); if (!d) { deps.latency?.clear(); return; }
      source.frame(dt, focused && !blocked ? cameraKeys : null, focused && !blocked ? pointer.sample() : null);
      cameraKeys = keysOnly(sampleIdle());
      const ticks = (d.decidedTick >= 0 ? d.decidedTick : d.tactical.tick) - d.baseTick;
      const station = scene.draw(source, dt, { banner: bannerText(), layerPaused: false, end: endModel(d.tactical.outcome, ticks, 'ENTER: REMATCH   ESC: LEAVE'), notice: now < noticeUntil ? notice : null });
      trackConsole(station);
      if (debug.on()) {
        const ps = predictor?.stats(), checked = ps ? ps.verified + ps.resimulated : 0;   // only while F3 shows: stats() copies
        deps.latency?.frame(latencyOverlayLines({ transport: transport(), held: latencyFigure(liveHeld), command: latencyFigure(liveCommand), rttMs,
          prediction: ps ? { leadTicks: ps.lead, verifiedShare: checked ? ps.verified / checked : null, resimP99Ms: p99(liveResim), correction: ps.correction?.ship ?? null,
            heading: ps.correction?.heading ?? null, retargetsPerMin: recentRetargets(now) } : null }));
      } else deps.latency?.clear();
    },
    dispose(): void {
      if (disposed) return; disposed = true; cancel(); release();
      deps.setConsole?.(null); deps.setContact?.(null);
      keyboard.destroy(); pointer.destroy(); debug.destroy(); deps.latency?.clear(); scene?.dispose(); scene = null;
      if (frozen) disposeDuel(frozen); frozen = null;
    }
  };
}
export type OnlineDuelSession = ReturnType<typeof createOnlineDuelSession>;

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
import type { CommandId, DuelCommand, HeldInput, Link, Scheduler, Cue } from '../../net/contracts';
import { arrivalJitter, latencyFigure, type DuelPlaytestRecord } from '../../net/duelRecord';
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
import { laserFreqKey, modeRequests, nextWeaponSel, powerDelta, weaponsSeatHeld } from './weaponsSeat';
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
/** Playtest2feedback Decision 14: the most unacknowledged held frames the local throttle prediction counts. */
export const UNACKED_MAX = 30;
/** Playtest2feedback §3, §4, §4a: this seat's held frame. At the crew Helm (a newtonianHelm class): moveX 0, the held
 *  throttle and thrusters and the left button's steer (crewHelmHeld). Elsewhere, and on any other class: quantised to -1,
 *  0 and 1 (H-2 spec §3), with Space at the Helm as auto-face (Feel-i). W-4 spec §11: at the Hound's Weapons seat,
 *  `weapons` adds weaponSel, the trigger (gunHeld with the autocannon selected) and the reticle as turretAim (W-4b). */
export function sessionHeld(k: KeySample, d: DuelState, me: number, steer: number, weapons?: { sel: number; trigger: boolean; aim?: number }): HeldInput {
  const seat = seatOf(d, me), crewHelm = crewHelmSeat(d, me);
  return { moveX: crewHelm ? 0 : Math.sign(k.moveX) || 0, moveY: Math.sign(k.moveY) || 0, interactHeld: k.interactHeld,
    ...(k.fireHeld && seat === 'helm' ? { face: true } : {}), ...(crewHelm ? crewHelmHeld(k, steer) : {}),
    ...(weapons && houndWeaponsSeat(d, me) ? weaponsSeatHeld(weapons.sel, weapons.trigger, weapons.aim ?? -1) : {}) };   // W-4 spec §11: the Hound's Weapons seat
}
/** Whether two held frames differ (a change is stamped for the held delay). */
export const heldChanged = (a: HeldInput, b: HeldInput): boolean => a.moveX !== b.moveX || a.moveY !== b.moveY || a.interactHeld !== b.interactHeld || a.face !== b.face
  || a.aim !== b.aim || a.torpTurn !== b.torpTurn || a.torpHeading !== b.torpHeading || a.throttleHeld !== b.throttleHeld || a.rcsX !== b.rcsX || a.rcsY !== b.rcsY   // W-3; playtest2feedback §7
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

/** A mode this seat asked for, until its result comes back. */
type ModeSent = { manual: boolean; sequence: number; round: number };

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
  // Playtest2feedback §4a: the crew Helm's held steer, its left button on the last pump, and the last held sequence sent.
  let steer = -1, steerPrev = false, lastHeldSequence = 0;
  let crewHelmPrev = false;   // final review I1: this seat flew the crew Helm on the last pump that saw the replica
  const requests0 = (): number | null => requests.takeHeading();   // Feel-ii §1.1: drained every pump
  // Playtest2feedback §4a: the map's steer bearing, drained every pump beside the heading. Inside pump the name `requests`
  // is shadowed by contact.takeRequests() (a ContactRequests, which has no takeSteer), so it is read through this closure.
  const takeSteer0 = (): number | null => requests.takeSteer();
  const pewRequest = (): number | null => requests.takePew();   // W-1: the Weapons map's pew aim, drained every pump
  const reticleNow = (): number | null => requests.reticleAim();   // W-2, W-4: the reticle (kept, not drained)
  const torpRequest = (): number | null => requests.takeTorpHeading();   // W-3: the MANUAL torpedo's held heading from the right button, drained every pump
  // W-4 spec §8: the map's trigger. Inside play and pump the name requests is a ContactRequests (shadowed), so it is read through this closure, as takeSteer0.
  const triggerNow = (): boolean => requests.triggerHeld();
  // Artemis spec §5.4: the throttle this seat last asked for, until its result comes back; the base W, S and the console build on.
  let throttleSent: { level: number; sequence: number; round: number } | null = null;
  // Feel-ii §1.1: the heading this seat last asked for, until its result comes back (as throttleSent); the dedupe's base.
  // A null sequence: A/D or auto-face held at the Helm cleared the hold locally (the sim clears it), until the replica shows it.
  let headingSent: { heading: number; sequence: number | null; round: number } | null = null;
  // W-2 (pew pew spec §2): the laser mode this seat last asked for, until its result comes back (as throttleSent); and the
  // laserFire commands it sent, whose 'unavailable' answer shows NO CHARGE (W-1 review F2's rule).
  let laserModeSent: { manual: boolean; sequence: number; round: number } | null = null;
  // W-4 spec §4.1, §11, amendment §2.4: each gun's mode this seat last asked for, [pew pew, the autocannon], until its result
  // comes back (as laserModeSent): the base R, Shift+R and the tags build on, so two quick presses flip twice.
  let gunModeSent: [ModeSent | null, ModeSent | null] = [null, null];
  const laserSent = new Set<number>();
  // W-3 (pew pew spec §3): the torpedo mode this seat last asked for, until its result comes back (as laserModeSent); the
  // MANUAL launches it sent, whose 'unavailable' answer names the reason (the always-send rule); and the MANUAL torpedo's
  // held heading, re-sent in every held frame while it flies (−1 none).
  // W-4 spec §9, §11: the Hound's Weapons seat's selection (pew pew at a sit), the last gun selected (W-4c reads it) and the
  // trigger on the last pump (the autocannon's refusal is on its press edge), and the round the selection was last reset on.
  let torpModeSent: { manual: boolean; sequence: number; round: number } | null = null, torpHold = -1, weaponSel = 0, lastGunSel = 0, triggerPrev = false, selRound = -1;
  const torpSent = new Set<number>();
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
    return id;
  }
  /** The authority's held frame is neutral once input stops, so the local prediction (throttle ramp, vent, puffs) drops too. */
  function neutralSource(): void { source?.sent({ moveX: 0, moveY: 0, interactHeld: false }); source?.unacked(0); }
  function stopInput(): void {
    if (client && descriptor && producing) {
      client.neutralize(descriptor.seatId);   // FTL targeting spec §2: the crew's Space is a single press, so there is no held charge to let go of
    }
    producing = false; keyboard.clear(); pointer.clear(); crewHelmPrev = false;   // I1: back at the crew Helm, its held keys go stale again
    neutralSource();
  }
  function release(): void {
    stopInput(); offClose(); offClose = () => {};
    client?.dispose(); client = null; link?.close('renderer-detached'); link = null;
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
      jitter: arrivalJitter([...roundGaps.splice(0), ...(source?.takeArrivals() ?? [])]), disconnects: Math.max(0, attaches - roundAttaches), pauses: pauses - roundPauses };
    heldSamples.length = 0; commandSamples.length = 0; roundAttaches = Math.max(1, attaches); roundPauses = pauses; startedAtIso = new Date().toISOString();
    void Promise.resolve(deps.recordDuel?.(r)).catch(() => {});
  }
  function observe(): void {
    if (!client || !descriptor || !source) return;
    const fresh = source.observe(), p = client.publication(), d = client.state();
    if (!p || !d) return;
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
      if (throttleSent && result.id.player === descriptor.seatId && result.id.sequence === throttleSent.sequence) throttleSent = null;   // applied, noop or rejected: the replica is the base again
      if (headingSent && result.id.player === descriptor.seatId && result.id.sequence === headingSent.sequence) headingSent = null;
      // W-1 review F2: the authority decides NO CHARGE (the lagging replica cannot): its 'unavailable' for a pewFire this seat sent shows it.
      if (result.id.player === descriptor.seatId && pewSent.delete(result.id.sequence) && result.status === 'rejected' && result.reason === 'unavailable') source.refuse('pew', 'NO CHARGE');
      if (laserModeSent && result.id.player === descriptor.seatId && result.id.sequence === laserModeSent.sequence) laserModeSent = null;   // W-2: the replica is the base again
      if (result.id.player === descriptor.seatId && laserSent.delete(result.id.sequence) && result.status === 'rejected' && result.reason === 'unavailable') source.refuse('fire', 'NO CHARGE');   // W-2
      if (torpModeSent && result.id.player === descriptor.seatId && result.id.sequence === torpModeSent.sequence) torpModeSent = null;   // W-3: the replica is the base again
      for (const slot of [0, 1] as const) { const sent = gunModeSent[slot]; if (sent && result.id.player === descriptor.seatId && result.id.sequence === sent.sequence) gunModeSent[slot] = null; }   // W-4: the replica is the base again
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
    if (!houndWeaponsSeat(d, me)) { weaponSel = 0; lastGunSel = 0; triggerPrev = false; }   // W-4 spec §9: a sit starts on pew pew (as Single player, before the standing return)
    if (seat === 'standing') {
      if (p.interact > 0 && repairInReach(d, me) < 0) { const c = consoleInReach(d, me); if (c >= 0) { throttleSent = null; headingSent = null; laserModeSent = null; torpModeSent = null; gunModeSent = [null, null]; torpHold = -1; weaponSel = 0; lastGunSel = 0; triggerPrev = false; send({ kind: 'sit', station: c }); } }
      return;
    }
    if (p.stand > 0) { throttleSent = null; headingSent = null; laserModeSent = null; torpModeSent = null; gunModeSent = [null, null]; torpHold = -1; weaponSel = 0; lastGunSel = 0; triggerPrev = false; send({ kind: 'stand' }); return; }
    if (requests.scan !== null && d.tactical.known[requests.scan] < CONTACT_MAX_LEVEL[requests.scan]) send({ kind: 'contactScan', contact: requests.scan });   // Sci-1 spec §5
    if (crewHelmSeat(d, me)) {   // playtest2feedback §3-§5: the held frame carries the rest
      if (p.camera > 0 && source) snapBack(source.cameras.helm);
      if (k.fireHeld) headingSent = { heading: -1, sequence: null, round: d.round };   // only auto-face clears the hold here
      if (heading !== null && Number.isInteger(heading) && heading >= -1 && heading < 256 && heading !== (headingSent ? headingSent.heading : d.holdHeading)) {
        const id = send({ kind: 'heading', heading }); if (id) headingSent = { heading, sequence: id.sequence, round: d.round };
      }
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
      const level = throttleRequest(throttleSent ? throttleSent.level : d.throttle, p, k.throttleTo, throttleCap(d.tactical.systems[0]!));   // Artemis spec §5.4
      if (level !== null) { const id = send({ kind: 'throttle', level }); if (id) throttleSent = { level, sequence: id.sequence, round: d.round }; }
      // Feel-ii §1.1: deduped against the heading in flight, else the replica's; A/D or auto-face held clears the hold (the sim
      // clears it after this tick's commands), so the base is −1 before and after this frame's request.
      const turning = (Math.sign(k.moveX) || 0) !== 0 || k.fireHeld;
      if (turning) headingSent = { heading: -1, sequence: null, round: d.round };
      if (heading !== null && Number.isInteger(heading) && heading >= -1 && heading < 256 && heading !== (headingSent ? headingSent.heading : d.holdHeading)) {
        const id = send({ kind: 'heading', heading }); if (id) headingSent = { heading, sequence: id.sequence, round: d.round };
      }
      if (turning) headingSent = { heading: -1, sequence: null, round: d.round };
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
      weaponSel = nextWeaponSel(weaponSel, k, manualTorpedoFlying(d.tactical));   // §19.1: until W-4c, A/D steer a MANUAL torpedo in flight
      if (weaponSel !== WeaponSlot.Torpedo) lastGunSel = weaponSel;
      const dw = powerDelta(p);   // W / S: a bar on or off the selected weapon (at Weapons they are not the throttle)
      if (dw !== 0) {
        for (let n = 0; n < Math.abs(dw); n++) send({ kind: 'weaponPower', slot: weaponSel, delta: Math.sign(dw) });
        const why = weaponPowerRefusal(d, weaponSel, Math.sign(dw)); if (why) source?.refuse('power', why);
      }
      // E / Q (and E/Q while the torpedo is picked up) step the torpedo's target room from the replica's, as the Flight seat does (§9).
      const steps = p.interact - p.prevLock + (requests.torpStep ?? 0);
      if (steps !== 0) {
        const room = stepTorpRoom(sys0.torpLock, steps);
        send({ kind: 'torpLock', room });
        const why = room >= 0 ? lockRefusal(d) : null; if (why) source?.refuse('launch', why);
      }
      if (k.torpTo !== undefined && k.torpTo !== null && k.torpTo >= -1 && k.torpTo <= 2) send({ kind: 'torpLock', room: k.torpTo });
      for (const rl of [requests.rockLock, k.rockTo]) if (rl && rl.weapon === 'torpedo') send({ kind: 'rockLock', weapon: 'torpedo', rock: rl.rock });
      const fk = k.gunFreqKeyTo ?? k.freqTo;   // 4 / 5 / 6 or the row's buttons (§5.2), a one-shot edge sent as it comes (Sci-1 §7.4's online rule); 3 selects
      if (fk !== undefined && fk !== null && Number.isInteger(fk) && fk >= 0 && fk <= 2) send({ kind: 'laserFrequency', freq: fk });
      // W-4 amendment §2.4, §2.5: R, Shift+R and the tags, each weapon judged from the mode in flight for it, else the
      // replica's. Z and V are not read at this seat.
      const mode = modeRequests([gunModeSent[0] ? gunModeSent[0].manual : sys0.pewManual, gunModeSent[1] ? gunModeSent[1].manual : sys0.gunManual, torpModeSent ? torpModeSent.manual : sys0.torpManual], weaponSel, p, k.modeTaps);
      for (const slot of [0, 1] as const) if (mode.changed[slot]) { const id = send({ kind: 'gunMode', slot, manual: mode.modes[slot] }); if (id) gunModeSent[slot] = { manual: mode.modes[slot], sequence: id.sequence, round: d.round }; }
      if (mode.changed[2]) { const id = send({ kind: 'torpMode', manual: mode.modes[2] }); if (id) torpModeSent = { manual: mode.modes[2], sequence: id.sequence, round: d.round }; }
      const pewManual = mode.modes[0], gunManual = mode.modes[1], torpManual = mode.modes[2];
      const launches = p.launch + (pew !== null && weaponSel === WeaponSlot.Torpedo ? 1 : 0);   // F, or LMB with the torpedo selected
      if (launches > 0 && torpManual) {   // W-3's MANUAL rule for the lagging replica, as the laser branch's
        const why = refusal(d, 'launch', true);
        if (why && why !== 'NO TORPEDOES') source?.refuse('launch', why);
        else { const id = send({ kind: 'missileLaunch' }); if (id) torpSent.add(id.sequence); }
      } else if (launches > 0 && canLaunch(d.tactical, 0, sys0.torpRock, false)) send({ kind: 'missileLaunch' });
      const launchWhy = launches > 0 && !torpManual ? refusal(d, 'launch', false) : null;   // Feel-ii §2.8, as the laser branch's
      if (launchWhy) source?.refuse('launch', launchWhy);
      if (pew !== null && weaponSel === WeaponSlot.Pew && pewManual) {   // W-4 spec §4.3: on AUTO the click does nothing; on MAN, LMB with pew pew selected; W-1 review F2's rule: NO CHARGE is the authority's
        const why = refusal(d, 'pew');
        if (why && why !== 'NO CHARGE') source?.refuse('pew', why);
        else { const id = send({ kind: 'pewFire' }); if (id) pewSent.add(id.sequence); }
      }
      const trig = triggerNow();   // the autocannon fires while held (the held frame's gunHeld); a dead trigger says why
      if (trig && !triggerPrev && weaponSel === WeaponSlot.Autocannon && gunManual) { const why = refusal(d, 'autocannon'); if (why) source?.refuse('autocannon', why); }
      triggerPrev = trig;
      if (p.camera > 0 && source) { const cam = source.cameras.weapons; snapBack(cam, missileOf(d.tactical, 0) && cam.follow !== 'missile' ? 'missile' : 'ship'); }
      return;   // Space, Z and V do nothing here (W-4 amendment §2.4)
    }
    // E and Q step the laser's target room from the replica's lock (FTL targeting spec §1: a target, so it auto-fires).
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
    // W-2 (pew pew spec §2): Z or the LASER card's AUTO / MAN tag toggles the laser's mode, from the mode in flight, else the
    // replica's (an odd number of presses this pump toggles it).
    let manual = laserModeSent ? laserModeSent.manual : sys.laserManual;
    if (p.laserMode % 2 === 1 && classOf(d.tactical, 0).slots.laser !== null) {
      manual = !manual;
      const id = send({ kind: 'laserMode', manual }); if (id) laserModeSent = { manual, sequence: id.sequence, round: d.round };
    }
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
    // W-3 (pew pew spec §3): V or the TORPEDO card's AUTO / MAN tag toggles the torpedo's mode, from the mode in flight, else
    // the replica's (an odd number of presses this pump toggles it).
    let torpManual = torpModeSent ? torpModeSent.manual : sys.torpManual;
    if (p.torpMode % 2 === 1) {
      torpManual = !torpManual;
      const id = send({ kind: 'torpMode', manual: torpManual }); if (id) torpModeSent = { manual: torpManual, sequence: id.sequence, round: d.round };
    }
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
  function pump(): void {
    if (disposed) return;
    observe(); pollLink();
    let k = keyboard.sample();
    const requests = contact.takeRequests(), heading = requests0(), steerTaken = takeSteer0(), pew = pewRequest(), torpNow = torpRequest();   // drained before any early return, so a steer never goes stale
    const prevHeld = lastFlags; lastFlags = k.held ?? NO_HELD_FLAGS;
    source?.heldFlags(k.held ?? NO_HELD_FLAGS);
    cameraKeys = { ...cameraKeys, presses: { ...cameraKeys.presses, zoomIn: cameraKeys.presses.zoomIn + k.presses.zoomIn, zoomOut: cameraKeys.presses.zoomOut + k.presses.zoomOut, camera: cameraKeys.presses.camera + k.presses.camera } };
    const d = client?.state(), p = client?.publication();
    if (throttleSent && d && d.round !== throttleSent.round) throttleSent = null;   // a new round starts at STOP
    if (laserModeSent && d && d.round !== laserModeSent.round) laserModeSent = null;   // W-2: every round starts AUTO
    if (torpModeSent && d && d.round !== torpModeSent.round) { torpModeSent = null; torpHold = -1; }   // W-3: every round starts AUTO
    for (const slot of [0, 1] as const) { const sent = gunModeSent[slot]; if (sent && d && d.round !== sent.round) gunModeSent[slot] = null; }   // W-4: every round starts AUTO
    if (d && d.round !== selRound) { selRound = d.round; weaponSel = 0; lastGunSel = 0; triggerPrev = false; }   // W-4 spec §9: every round starts on pew pew
    if (headingSent && d && (d.round !== headingSent.round || (headingSent.sequence === null && d.holdHeading === -1))) headingSent = null;   // a new round holds none; the replica caught up with the local clear
    source?.throttleBase(throttleSent ? throttleSent.level : null);
    for (const slot of [0, 1] as const) source?.gunModeBase(slot, gunModeSent[slot] ? gunModeSent[slot]!.manual : null);   // W-4 spec §11, amendment §2.6
    if (!client || linkClosed || !d || !p || !descriptor || !synced || !focused || blocked) { if (producing) stopInput(); return; }
    const me = descriptor.seatId, decided = d.tactical.outcome !== Outcome.Running;
    // Final review I1: on the pump this seat becomes the crew Helm (the sit's publication arrived), the keys held now are
    // stale until pressed again (E sits and is a thruster; W, A and D walk), and this sample's crew fields are dropped.
    const crewHelmNow = crewHelmSeat(d, me);
    if (crewHelmNow && !crewHelmPrev) { keyboard.staleHeld(); k = { ...k, throttleHeld: 0, rcsX: 0, rcsY: 0 }; }
    crewHelmPrev = crewHelmNow;
    // Escape and the leave prompt (spec §7): a prompt from a round that is no longer decided and running closes first.
    const keys = leavePromptKeys(leaveConfirm, d, p.phase, k.presses);
    leaveConfirm = keys.prompt;
    if (keys.send) send(keys.send);
    if (keys.leave) deps.leave();
    if (leaveConfirm.open || keys.leave) { producing = true; client.held(me, { moveX: 0, moveY: 0, interactHeld: false }); neutralSource(); return; }
    if (p.phase !== 'running') { neutralSource(); return; }
    if (decided) { if (k.presses.confirm > 0) send({ kind: 'rematch' }); }
    else play(k, d, me, requests, heading, prevHeld, pew, steerTaken);
    // Held input every pump, quantised to −1, 0 and 1 (spec §3); a change is stamped for the held delay.
    // Feel-i (console feel spec §2): Space held at the Helm is auto-face, sent only from the Helm, as the sim admits it.
    // Playtest2feedback §4a: the crew Helm steers by the map's bearing only while the left button is held (Decision 9's rule
    // for the player: let go, no aim goes out and the sim holds the last one).
    steer = crewHelmNow && pointer.leftHeld() ? steerTaken ?? steer : -1;
    // W-3 (pew pew spec §3): at Weapons, while the replica shows the crew's MANUAL torpedo flying, A/D turn it (torpTurn) and the
    // map's right button gives it a heading to hold (torpHold, re-sent every pump) until A or D, a click on it or the flight's end clears it.
    const torpSteering = !decided && seatOf(d, me) === 'weapons' && manualTorpedoFlying(d.tactical), torpTurn = torpSteering ? Math.sign(k.moveX) || 0 : 0;
    if (!torpSteering || torpTurn !== 0) torpHold = -1; else if (torpNow !== null) torpHold = torpNow;
    const held: HeldInput = { ...sessionHeld(k, d, me, steer, { sel: weaponSel, trigger: triggerNow() && (gunModeSent[1] ? gunModeSent[1].manual : d.tactical.systems[0].gunManual), aim: reticleNow() ?? -1 }), ...(torpTurn !== 0 ? { torpTurn } : {}), ...(torpHold >= 0 ? { torpHeading: torpHold } : {}) };
    const sequence = client.held(me, decided ? { moveX: 0, moveY: 0, interactHeld: false } : held);
    if (sequence !== null) lastHeldSequence = sequence;
    source?.unacked(Math.min(UNACKED_MAX, Math.max(0, lastHeldSequence - (p.heldHighWater[me] ?? 0))));   // Decision 14
    if (sequence !== null && !decided && heldChanged(held, lastHeld)) {
      heldStamps.push({ sequence, at: deps.now() }); if (heldStamps.length > 64) heldStamps.shift();
    }
    if (!decided) { lastHeld = held; source?.sent(held); }
    source?.throttleBase(throttleSent ? throttleSent.level : null);   // a press this pump shows this pump
    for (const slot of [0, 1] as const) source?.gunModeBase(slot, gunModeSent[slot] ? gunModeSent[slot]!.manual : null);   // W-4 spec §11, amendment §2.6
    producing = true;
  }
  function schedule(): void { cancel = deps.scheduler.schedule(1000 / 60, () => { pump(); if (!disposed) schedule(); }); }
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
      descriptor = next; linkClosed = false; synced = false; presenceSent = false; lastPhase = ''; leaveConfirm = CLOSED_PROMPT; throttleSent = null; headingSent = null; laserModeSent = null; torpModeSent = null; gunModeSent = [null, null]; torpHold = -1; weaponSel = 0; lastGunSel = 0; triggerPrev = false; steer = -1; steerPrev = false; lastHeldSequence = 0; attaches++;
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
      offClose = link.onClose(() => { freeze(); stopInput(); linkClosed = true; });
      client = createDuelRemoteClient(link, [next.seatId], { runId: next.runId, contentDigest: deps.contentDigest, resolveLayout: deps.resolveLayout, clock: { nowMs: deps.now } });
      source = createOnlineDuelSource({ client: { state, publication, live }, seat: next.seatId, now: deps.now, viewport: { w: INTERNAL_W, h: INTERNAL_H } });
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
      const now = deps.now(), dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 1 / 60; lastFrame = now;
      const d = state(); if (!d) { deps.latency?.clear(); return; }
      source.frame(dt, focused && !blocked ? cameraKeys : null, focused && !blocked ? pointer.sample() : null);
      cameraKeys = keysOnly(sampleIdle());
      const ticks = (d.decidedTick >= 0 ? d.decidedTick : d.tactical.tick) - d.baseTick;
      const station = scene.draw(source, dt, { banner: bannerText(), layerPaused: false, end: endModel(d.tactical.outcome, ticks, 'ENTER: REMATCH   ESC: LEAVE'), notice: now < noticeUntil ? notice : null });
      trackConsole(station);
      if (debug.on()) deps.latency?.frame(latencyOverlayLines({ transport: transport(), held: latencyFigure(liveHeld), command: latencyFigure(liveCommand), rttMs }));
      else deps.latency?.clear();
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

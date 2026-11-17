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
import type { DuelCommand, Link, Scheduler, Cue } from '../../net/contracts';
import { arrivalJitter, latencyFigure, type DuelPlaytestRecord } from '../../net/duelRecord';
import type { ShipLayout } from '../../sim/ship/schema';
import { loadDuelSnapshot, saveDuelSnapshot } from '../../sim/duel/snapshot';
import { disposeDuel, type DuelState } from '../../sim/duel/state';
import type { DuelRoundRecord } from '../../sim/duel/summary';
import { Outcome } from '../../sim/tactical/state';
import { canCharge, canLaunch } from '../../sim/tactical/weapons';
import { computeLetterbox } from '../../render/letterbox';
import { endModel } from '../../render/duel/endModel';
import { createKeyToggle, latencyOverlayLines, type KeyTarget } from '../../render/duel/latencyOverlay';
import { snapBack } from '../../render/tactical/camera';
import type { Renderer } from '../../render/renderer';
import { missileOf } from '../../sim/tactical/state';
import { consoleInReach, cycleLock, repairInReach, seatOf } from './controls';
import { createDuelKeyboard, createPointerSource, emptyPresses, NO_HELD_FLAGS, type ConsoleInput, type EventSource, type KeySample } from './input';
import { consoleChange } from './consoleChange';
import { createOnlineDuelSource, type OnlineDuelSource } from './onlineSource';
import type { DuelSink, LatencySink } from '../../ui/sinks';
import { createDuelScene, type DuelScene } from './scene';

export interface OnlineDuelDeps {
  renderer: Renderer; ui: DuelSink; now(): number; scheduler: Scheduler; contentDigest: string; resolveLayout(id: string): ShipLayout;
  /** The F3 latency overlay's React sink (H-2b Decision 5): frame(lines) shows it, clear() hides it; absent, no overlay. */
  latency?: LatencySink;
  api: Pick<OnlinePreloadApi, 'viewState' | 'linkStats'>;
  /** Leave the online session as the menu's Leave does (Escape on the end card, then Enter). */
  leave(): void;
  playCue?(cue: Cue): void;
  recordDuel?(record: DuelPlaytestRecord): Promise<boolean> | void;
  /** The console's click slot (Artemis spec §6.2): filled with this session's keyboard, emptied on dispose. */
  setConsole?(input: ConsoleInput | null): void;
}
const NOTICE_MS = 3000;
/** How often the session asks main for the link's figures, and how many recent samples the F3 overlay reads. */
export const LINK_POLL_MS = 1000, LIVE_SAMPLES = 300;
/** The camera's presses: the zoom keys, and C, which only the interior's camera reads here (the consoles' C is in play()). */
const keysOnly = (k: KeySample): KeySample => ({ ...k, presses: { ...emptyPresses(), zoomIn: k.presses.zoomIn, zoomOut: k.presses.zoomOut, camera: k.presses.camera } });
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
  const keyboard = createDuelKeyboard(window as unknown as EventSource);
  deps.setConsole?.(keyboard.ui);
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
  let attaches = 0, pauses = 0, roundAttaches = 1, roundPauses = 0, startedAtIso = new Date().toISOString(), chargePressed = false, releaseSentAt = -1, cancel = () => {}, offClose = () => {};
  let lastHeld = { moveX: 0, moveY: 0, interactHeld: false };
  const heldStamps: { sequence: number; at: number }[] = [], commandStamps = new Map<number, number>(), heldSamples: number[] = [], commandSamples: number[] = [], roundGaps: number[] = [];
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
  function send(command: DuelCommand): void {
    if (!client || !descriptor) return;
    const id = client.command(descriptor.seatId, command);
    if (id && command.kind !== 'presence') commandStamps.set(id.sequence, deps.now());
  }
  function stopInput(): void {
    if (client && descriptor && producing) {
      client.neutralize(descriptor.seatId);
      const d = client.state();
      if (d && seatOf(d, descriptor.seatId) === 'weapons' && d.tactical.systems[0].fireHeld) send({ kind: 'laserCharge', held: false });   // let go of a held charge
    }
    producing = false; chargePressed = false; keyboard.clear(); pointer.clear();
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
      seat: descriptor.seatId as 0 | 1, helmPlayer: d.helmPlayer, seed: summary.seed, round: summary.round, startedAtIso,
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
      notice = seatOf(d, descriptor.seatId) === 'helm' ? 'YOU: HELM' : seatOf(d, descriptor.seatId) === 'weapons' ? 'YOU: WEAPONS' : null; noticeUntil = deps.now() + NOTICE_MS;
    }
    if (synced && p.phase !== lastPhase) { if (p.phase === 'paused' && lastPhase === 'running') pauses++; lastPhase = p.phase; if (p.phase !== 'error') hint(p.phase); }
    const now = deps.now();
    if (fresh) while (heldStamps.length && heldStamps[0]!.sequence <= p.heldHighWater[descriptor.seatId]!) sample(heldSamples, liveHeld, now - heldStamps.shift()!.at);
    for (const result of client.takeResults()) {
      const at = result.id.player === descriptor.seatId ? commandStamps.get(result.id.sequence) : undefined;
      if (at !== undefined) { commandStamps.delete(result.id.sequence); if (result.status === 'applied') sample(commandSamples, liveCommand, now - at); }
    }
    for (const event of client.takeEvents()) {
      if (event.payload.kind === 'cue') deps.playCue?.(event.payload.cue);
      if (event.payload.kind === 'round') record(event.payload.record);
    }
  }
  /** One frame's press edges for this seat, by where its character is (H-1 spec §5 table, without Tab). */
  function play(k: KeySample, d: DuelState, me: number): void {
    const seat = seatOf(d, me), p = k.presses;
    if (seat === 'standing') {
      if (p.interact > 0 && repairInReach(d, me) < 0) { const c = consoleInReach(d, me); if (c >= 0) send({ kind: 'sit', station: c }); }
      return;
    }
    if (p.stand > 0) { if (chargePressed || d.tactical.systems[0].fireHeld) send({ kind: 'laserCharge', held: false }); chargePressed = false; send({ kind: 'stand' }); return; }
    if (seat === 'helm') { if (p.camera > 0 && source) snapBack(source.cameras.helm); return; }
    const steps = p.interact - p.prevLock;
    if (p.interact + p.prevLock > 0 && steps !== 0) {
      let room = d.tactical.systems[0].lock;
      for (let n = 0; n < Math.abs(steps); n++) room = cycleLock(room, steps > 0 ? 1 : -1);
      send({ kind: 'laserLock', room });
    }
    if (k.lockTo !== undefined && k.lockTo !== null && k.lockTo >= 0 && k.lockTo <= 2 && k.lockTo !== d.tactical.systems[0].lock) send({ kind: 'laserLock', room: k.lockTo });   // a console lock click (Artemis spec §4.1)
    // The truth about a held charge is the confirmed replica plus what this seat sent (spec §3): a lost release is re-sent,
    // a release swallowed by a pause included (Space let go while paused leaves chargePressed set).
    const held = d.tactical.systems[0].fireHeld, now = deps.now();
    if (p.fireDown > 0 && canCharge(d.tactical, 0)) { send({ kind: 'laserCharge', held: true }); chargePressed = true; }
    if ((p.fireUp > 0 && (chargePressed || held)) || (!k.fireHeld && held && now - releaseSentAt > 250)) {
      send({ kind: 'laserCharge', held: false }); chargePressed = false; releaseSentAt = now;
    }
    if (p.launch > 0 && canLaunch(d.tactical, 0)) send({ kind: 'missileLaunch' });
    if (p.camera > 0 && source) { const cam = source.cameras.weapons; snapBack(cam, missileOf(d.tactical, 0) && cam.follow !== 'missile' ? 'missile' : 'ship'); }
  }
  function pump(): void {
    if (disposed) return;
    observe(); pollLink();
    const k = keyboard.sample();
    source?.heldFlags(k.held ?? NO_HELD_FLAGS);
    cameraKeys = { ...cameraKeys, presses: { ...cameraKeys.presses, zoomIn: cameraKeys.presses.zoomIn + k.presses.zoomIn, zoomOut: cameraKeys.presses.zoomOut + k.presses.zoomOut, camera: cameraKeys.presses.camera + k.presses.camera } };
    const d = client?.state(), p = client?.publication();
    if (!client || linkClosed || !d || !p || !descriptor || !synced || !focused || blocked) { if (producing) stopInput(); return; }
    const me = descriptor.seatId, decided = d.tactical.outcome !== Outcome.Running;
    // Escape and the leave prompt (spec §7): a prompt from a round that is no longer decided and running closes first.
    const keys = leavePromptKeys(leaveConfirm, d, p.phase, k.presses);
    leaveConfirm = keys.prompt;
    if (keys.send) send(keys.send);
    if (keys.leave) deps.leave();
    if (leaveConfirm.open || keys.leave) { producing = true; client.held(me, { moveX: 0, moveY: 0, interactHeld: false }); return; }
    if (p.phase !== 'running') return;
    if (decided) { if (k.presses.confirm > 0) send({ kind: 'rematch' }); }
    else play(k, d, me);
    // Held input every pump, quantised to −1, 0 and 1 (spec §3); a change is stamped for the held delay.
    const held = { moveX: Math.sign(k.moveX) || 0, moveY: Math.sign(k.moveY) || 0, interactHeld: k.interactHeld };
    const sequence = client.held(me, decided ? { moveX: 0, moveY: 0, interactHeld: false } : held);
    if (sequence !== null && !decided && (held.moveX !== lastHeld.moveX || held.moveY !== lastHeld.moveY || held.interactHeld !== lastHeld.interactHeld)) {
      heldStamps.push({ sequence, at: deps.now() }); if (heldStamps.length > 64) heldStamps.shift();
    }
    if (!decided) { lastHeld = held; source?.sent(held); }
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
      descriptor = next; linkClosed = false; synced = false; presenceSent = false; lastPhase = ''; leaveConfirm = CLOSED_PROMPT; attaches++;
      heldStamps.length = 0; commandStamps.clear();   // the new client restarts its sequences: an old stamp would match a new frame
      scene ??= createDuelScene(deps.renderer, { seed: 0, pauseText: 'PAUSED', ui: deps.ui });
      link = createPortLink(browserPortEndpoint(port), `online:${next.seatId}`, { latestStreamKey: bytes => classifyStreamPacket(bytes).stream });
      // Subscribe before the client, which releases its replica on close: keep the last view frozen.
      offClose = link.onClose(() => { freeze(); stopInput(); linkClosed = true; });
      client = createDuelRemoteClient(link, [next.seatId], { runId: next.runId, contentDigest: deps.contentDigest, resolveLayout: deps.resolveLayout, clock: { nowMs: deps.now } });
      source = createOnlineDuelSource({ client: { state, publication, live }, seat: next.seatId as 0 | 1, now: deps.now, viewport: { w: INTERNAL_W, h: INTERNAL_H } });
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
      deps.setConsole?.(null);
      keyboard.destroy(); pointer.destroy(); debug.destroy(); deps.latency?.clear(); scene?.dispose(); scene = null;
      if (frozen) disposeDuel(frozen); frozen = null;
    }
  };
}
export type OnlineDuelSession = ReturnType<typeof createOnlineDuelSession>;

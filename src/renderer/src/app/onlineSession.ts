import type { OnlinePortDescriptor, OnlinePreloadApi, OnlineStatus } from '../../../shared/onlineSession';
import { createPortLink } from '../../../network/portLink';
import { browserPortEndpoint } from '../../../network/transport/bridge';
import { classifyStreamPacket } from '../../../network/state/imageCodec';
import { createSectorRemoteClient } from '../../../network/modes/sectorStream';
import type { PresentationPoint } from '../../../network/state/timeline';
import type { ShipLayout } from '../sim/ship/schema';
import { disposeSimState, type SimState } from '../sim/state';
import { loadSnapshot, restoreSnapshot } from '../sim/snapshot';
import type { Scheduler, Link } from '../net/contracts';
import type { SessionDeps } from './session';
import { createOnlineInput } from '../input/onlineInput';
import { NEUTRAL_FRAME } from './intents';
import { createCardUi, pauseActions, translateTick } from '../clientControl/cardController';
import { buildHudModel } from '../render/hudModel';
import { CUE_ORDER, type Cue } from '../events/audioCues';
import { calloutIcon } from '../events/callout';
import { bubbles, flashingKinds, type Callout } from '../render/calloutModel';

export interface OnlineRendererDeps extends Pick<SessionDeps, 'sampleDevices' | 'renderer' | 'hud' | 'now' | 'playCue' | 'contentDigest'> {
  scheduler: Scheduler; resolveLayout(id: string): ShipLayout; resetInput(): void;
  api: Pick<OnlinePreloadApi, 'viewState'>;
}
export function createOnlineRendererSession(deps: OnlineRendererDeps) {
  const input = createOnlineInput(), cues = new Set<Cue>();
  let client: ReturnType<typeof createSectorRemoteClient> | null = null, link: Link | null = null;
  let descriptor: OnlinePortDescriptor | null = null, status: OnlineStatus | null = null;
  let frozen: SimState | null = null, points: readonly PresentationPoint[] = [], callouts: Callout[] = [];
  let frozenUi = createCardUi();
  let focused = true, blocked = false, producing = false, disposed = false, synced = false;
  let lastSequence = 0, lastPhase = '', cancel = () => {}, offClose = () => {};
  function resetInput() { deps.resetInput(); input.reset(); }
  function stopInput() { if (producing && descriptor) client?.neutralize(descriptor.seatId); producing = false; resetInput(); }
  function hint(phase: 'synced' | 'running' | 'paused' | 'ended') {
    if (descriptor) void deps.api.viewState(descriptor.epoch, phase).catch(() => {});
  }
  function release() { stopInput(); offClose(); offClose = () => {}; client?.dispose(); client = null; link?.close('renderer-detached'); link = null; }
  function observe() {
    const publication = client?.publication(), state = client?.state();
    if (!client || !publication || !state || !descriptor) return;
    if (descriptor.seatId >= state.playerCount) { link?.close('invalid-seat'); return; }
    if (publication.publicationSequence !== lastSequence) {
      if (lastSequence === 0) { points = []; callouts = []; }
      // This allocation belongs to this session, never to the disposable replica.
      if (!frozen || frozen.derived.layoutHash !== publication.snapshot.header.layoutHash || frozen.playerCount !== publication.snapshot.header.playerCount) { if (frozen) disposeSimState(frozen); frozen = loadSnapshot(deps.resolveLayout(publication.snapshot.header.layoutId), publication.snapshot, deps.contentDigest); }
      else restoreSnapshot(frozen, publication.snapshot, deps.contentDigest);
      lastSequence = publication.publicationSequence;
    }
    const newlySynced = !synced && client.commandStatus(descriptor.seatId).state !== 'waiting-state';
    if (newlySynced) { synced = true; resetInput(); hint('synced'); }
    if (synced && (newlySynced || publication.phase !== lastPhase)) { lastPhase = publication.phase; if (publication.phase !== 'error') hint(publication.phase); }
    frozenUi = structuredClone(client.ui);
    client.takeResults();
    for (const event of client.takeEvents()) {
      if (event.payload.kind === 'cue') cues.add(event.payload.cue);
      if (event.payload.kind === 'callout') {
        const p = event.payload; callouts = [...callouts.filter(c => c.pid !== p.player && event.tick - c.tick < 180), { pid: p.player, tick: event.tick, text: p.text, icon: calloutIcon(p.text), flash: p.station }].slice(-4); cues.add('callout');
      }
    }
  }
  function pump() {
    if (disposed) return;
    observe();
    const state = client?.state(), publication = client?.publication();
    if (!focused || blocked || !synced || !state || publication?.phase !== 'running' || !descriptor || !client) { if (producing) stopInput(); else deps.sampleDevices(); return; }
    const frame = input.sample(deps.sampleDevices());
    if (input.changed) { client.neutralize(descriptor.seatId); producing = false; return; }
    if (input.key === null) return;
    const frames = Array.from({ length: state.playerCount }, () => ({ ...NEUTRAL_FRAME }));
    frames[descriptor.seatId] = frame;
    client.send(translateTick(state, client.ui, frames, publication.tick, [descriptor.seatId], client.commandBudget));
    if (input.callouts) client.callout(descriptor.seatId);
    producing = true;
  }
  function schedule() { cancel = deps.scheduler.schedule(1000 / 60, () => { pump(); if (!disposed) schedule(); }); }
  schedule();
  return {
    attach(next: OnlinePortDescriptor, port: MessagePort) {
      if (disposed || next.epoch <= (descriptor?.epoch ?? 0)) { port.close(); return; }
      observe(); release(); cues.clear(); lastSequence = 0; synced = false;
      descriptor = next; resetInput(); deps.renderer?.reset();
      link = createPortLink(browserPortEndpoint(port), `online:${next.seatId}`, { latestStreamKey: bytes => classifyStreamPacket(bytes).stream });
      // Subscribe before the client, which releases its replica on close.
      offClose = link.onClose(() => { observe(); producing = false; resetInput(); });
      client = createSectorRemoteClient(link, [next.seatId], { runId: next.runId, contentDigest: deps.contentDigest, resolveLayout: deps.resolveLayout, clock: { nowMs: deps.now }, presentation: { delayMs: 100 } });
    },
    setStatus(next: OnlineStatus) {
      status = next;
      if (['error', 'reconnecting', 'saved', 'saving', 'rehosting', 'idle', 'ended'].includes(next.phase) && client) { observe(); release(); }
    },
    setFocused(value: boolean) { if (focused === value) return; focused = value; if (!value) stopInput(); else resetInput(); },
    setInputBlocked(value: boolean) { if (blocked === value) return; blocked = value; if (value) stopInput(); else resetInput(); },
    pause() { if (!focused || !synced || !client || !descriptor) return; const publication = client.publication(); if (publication && ['running', 'paused'].includes(publication.phase)) client.send(pauseActions(client.ui, descriptor.seatId, publication.tick, publication.phase !== 'paused', client.commandBudget)); },
    frame() {
      if (disposed) return; observe();
      const state = client?.state() ?? frozen; if (!state || !descriptor) return;
      if (client?.state()) points = client.presentation.sample(deps.now());
      const phase = lastPhase === 'ended' ? 'gameover' : lastPhase === 'paused' ? 'paused' : 'running';
      const ui = client?.state() ? client.ui : frozenUi;
      deps.renderer?.draw(state, 1, bubbles(state, callouts, state.tick), ui, points, phase === 'paused');
      deps.hud?.update(buildHudModel(state, { mode: 'player', player: descriptor.seatId, ui }, {
        slots: state.crew.map((_, pid) => ({ status: status?.snapshot?.seats.find(s => s.seatId === pid)?.connected || pid === descriptor!.seatId && !!client?.state() ? 'active' : pid === descriptor!.seatId ? 'reconnect' : 'bot', key: pid === descriptor!.seatId ? input.key : null })),
        phase, message: `PLAYER ${descriptor.seatId + 1}${client?.state() ? '' : ' — CONNECTION LOST'}`, callouts, calloutFlash: flashingKinds(callouts, state.tick)
      }));
      for (const cue of CUE_ORDER) if (cues.has(cue)) deps.playCue?.(cue); cues.clear();
    },
    dispose() { if (disposed) return; disposed = true; cancel(); release(); if (frozen) disposeSimState(frozen); frozen = null; points = []; callouts = []; cues.clear(); }
  };
}

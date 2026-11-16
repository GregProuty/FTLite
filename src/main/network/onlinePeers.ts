import type { MessagePortMain } from 'electron';
import type { RoomServiceClient } from '../../network/session/serviceClient';
import type { LinkIssued, RoomSnapshot } from '../../shared/roomSession';
import { isRtcSignal, RTC_PRE_DESCRIPTION_CANDIDATES, RTC_SETUP_MS, RTC_TOTAL_CANDIDATES, type RtcSignal } from '../../shared/rtcSession';
import type { TransportController } from './rtcTransport';
import { sameIceOwner, type IceOwner, type OnlineIce } from './onlineIce';
import { onlineFault, type OnlineClock, type OnlineScheduler } from './onlineRetry';

export interface OnlinePeer { seatId: number; seatGeneration: number; attemptId: string; port: MessagePortMain; latestPayloadLimit: number; transferred: boolean }
export interface OnlinePeersDeps {
  controller: TransportController; service: RoomServiceClient; ownSeat: number; snapshot(): RoomSnapshot;
  ice: OnlineIce; iceOwner(): IceOwner; clock?: OnlineClock; scheduler?: OnlineScheduler;
  channel(): { port1: MessagePortMain; port2: MessagePortMain };
  onReady(peer: OnlinePeer): void; onLost(seatId: number): void; onFailure(error?: unknown): void;
  onChange?(): void;
}
const close = (port: MessagePortMain) => { try { port.close(); } catch {} };
/** Bounded private peer ownership. Issuance is serialized because equal seat generations do not identify a seat. */
export function createOnlinePeers(deps: OnlinePeersDeps) {
  const clock = deps.clock ?? { nowMs: () => performance.now(), epochMs: () => Date.now() };
  const scheduler = deps.scheduler ?? { setTimeout: (cb: () => void, ms: number) => setTimeout(cb, ms), clearTimeout: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>) };
  let disposed = false, issuing: number | undefined, requesting = false, reconcileAgain = false, forwards = 0;
  type Entry = OnlinePeer & { ready: boolean; serviceReady: boolean; started: boolean; startPort?: MessagePortMain; abort: AbortController;
    timer: unknown; deadline: number; owner: IceOwner; link: LinkIssued; early: RtcSignal[]; bytes: number; candidates: number; description: boolean; draining: boolean };
  const peers = new Map<number, Entry>();
  const blocked = new Map<number, number>();
  const retryTimers = new Map<number, unknown>();
  const failed = (error?: unknown) => { if (!disposed) deps.onFailure(error); };
  const current = (peer: Entry) => !disposed && peers.get(peer.seatId) === peer;
  function retire(peer: Entry) {
    if (peers.get(peer.seatId) !== peer) return;
    peers.delete(peer.seatId); peer.abort.abort(); scheduler.clearTimeout(peer.timer); peer.early.length = 0; peer.bytes = 0;
    if (peer.startPort) { close(peer.startPort); peer.startPort = undefined; }
    if (!peer.transferred) close(peer.port);
    if (!disposed) deps.onChange?.();
    void deps.controller.closeAttempt(peer.attemptId).catch(() => {});
  }
  async function drain(peer: Entry) {
    if (peer.draining || !peer.started) return;
    peer.draining = true;
    try {
      while (current(peer) && peer.early.length) {
        const signal = peer.early.shift()!;
        peer.bytes -= signalBytes(signal);
        await deps.controller.receiveSignal(signal);
      }
    } catch { if (current(peer)) lost(peer.attemptId); }
    finally { peer.draining = false; }
  }
  const signalBytes = (signal: RtcSignal) => new TextEncoder().encode(JSON.stringify({ type: 'signal', signal })).byteLength;
  function receive(signal: RtcSignal) {
    if (disposed) return;
    const peer = [...peers.values()].find(p => p.attemptId === signal.attemptId);
    if (!peer) { void deps.controller.closeAttempt(signal.attemptId).catch(() => {}); return; }
    const identity = peer.link.identity;
    if (!isRtcSignal(signal) || signal.seatGeneration !== peer.seatGeneration || signal.roomId !== identity.roomId
      || signal.hostGeneration !== identity.hostGeneration || signal.from !== identity.remoteConnectionId || signal.to !== identity.localConnectionId
      || (signal.kind === 'description' && (peer.description || signal.description.type !== (peer.link.role === 'offerer' ? 'answer' : 'offer')))) { lost(peer.attemptId); return; }
    const bytes = signalBytes(signal);
    if (signal.kind === 'candidate') {
      peer.candidates++;
      if (peer.candidates > RTC_TOTAL_CANDIDATES || !peer.description && peer.candidates > RTC_PRE_DESCRIPTION_CANDIDATES) { lost(peer.attemptId); return; }
    } else peer.description = true;
    if (peer.bytes + bytes > 1048576) { lost(peer.attemptId); return; }
    peer.bytes += bytes; peer.early.push(structuredClone(signal)); void drain(peer);
  }
  function lost(attemptId: string) {
    const peer = [...peers.values()].find(p => p.attemptId === attemptId); if (!peer) return;
    retire(peer); deps.onLost(peer.seatId);
  }
  function forward(peer: Entry, work: () => Promise<unknown>) {
    if (disposed) return;
    if (forwards >= 64) { failed(); return; }
    forwards++;
    const reject = () => { if (current(peer)) lost(peer.attemptId); };
    try { void work().catch(reject).finally(() => { forwards--; }); }
    catch { forwards--; reject(); }
  }
  const removers = [deps.controller.onAttemptClosed(lost), deps.controller.onSignal(signal => {
    const peer = [...peers.values()].find(p => p.attemptId === signal.attemptId);
    if (peer && peer.seatGeneration === signal.seatGeneration) forward(peer, () => deps.service.request({ type: 'signal', signal }));
  })];
  function issued(link: LinkIssued) {
    if (disposed) return;
    const snapshot = deps.snapshot(), host = deps.ownSeat === snapshot.hostSeatId;
    const seatId = host ? issuing : deps.ownSeat;
    if (seatId === undefined || (host ? link.role !== 'offerer' : link.role !== 'answerer')
      || link.identity.hostGeneration !== snapshot.hostGeneration || link.identity.seatGeneration !== snapshot.seats[seatId]?.seatGeneration) { failed(); return; }
    const previous = peers.get(seatId); if (previous?.attemptId === link.attemptId) return;
    if (previous) retire(previous);
    let owner: IceOwner;
    try { owner = structuredClone(deps.iceOwner()); }
    catch { failed(onlineFault('stale-connection')); return; }
    if (owner.roomId !== link.identity.roomId || owner.hostGeneration !== link.identity.hostGeneration || owner.connectionId !== link.identity.localConnectionId) { failed(onlineFault('stale-connection')); return; }
    const { port1, port2 } = deps.channel();
    const duration = Math.max(0, Math.min(RTC_SETUP_MS, link.ticketExpiresAtEpochMs - clock.epochMs()));
    const peer: Entry = { seatId, seatGeneration: link.identity.seatGeneration, attemptId: link.attemptId, port: port2, latestPayloadLimit: 0, ready: false, serviceReady: false, transferred: false,
      started: false, startPort: port1, owner, link: structuredClone(link), abort: new AbortController(), timer: undefined,
      deadline: clock.nowMs() + duration, early: [], bytes: 0, candidates: 0, description: false, draining: false };
    peers.set(seatId, peer);
    peer.timer = scheduler.setTimeout(() => lost(peer.attemptId), duration);
    deps.onChange?.();
    if (!current(peer)) return;
    // Reserve synchronously; bounded service signals may arrive while credentials are pending.
    try {
      void deps.ice.get(owner, peer.abort.signal).then(async credentials => {
        if (!current(peer)) return;
        if (clock.nowMs() >= peer.deadline || !sameIceOwner(owner, deps.iceOwner()) || credentials.expiresAtEpochMs <= clock.epochMs()) { lost(peer.attemptId); return; }
        const readyPromise = deps.controller.startAttempt({ ...peer.link,
          ticketExpiresAtEpochMs: Math.min(peer.link.ticketExpiresAtEpochMs, clock.epochMs() + peer.deadline - clock.nowMs()),
          iceServers: credentials.iceServers, iceTransportPolicy: 'all' }, port1);
        peer.startPort = undefined; peer.started = true; void drain(peer);
        const ready = await readyPromise;
        if (!current(peer)) return;
        peer.latestPayloadLimit = ready.latestPayloadLimit;
        await deps.service.request({ type: 'link-ready', attemptId: peer.attemptId });
        if (!current(peer)) return;
        scheduler.clearTimeout(peer.timer); peer.ready = true; deps.onChange?.(); if (current(peer)) deps.onReady(peer);
      }).catch(error => {
        if (!current(peer)) return;
        // Retain a bounded cooldown even when a callback immediately requests reconciliation.
        blocked.set(peer.seatId, clock.nowMs() + Math.max(1000, error?.retryAfterMs ?? 0));
        const acquisition = !peer.started;
        if (acquisition) {
          retire(peer);
          if (host && error?.retryable === true && !disposed) {
            // A provider cooldown belongs to this link, not to the running authority.
            // The old ticket is retired; retry obtains a new bounded setup attempt.
            const previous = retryTimers.get(peer.seatId);
            if (previous !== undefined) scheduler.clearTimeout(previous);
            retryTimers.set(peer.seatId, scheduler.setTimeout(() => {
              retryTimers.delete(peer.seatId);
              if (disposed) return;
              try { if (!sameIceOwner(peer.owner, deps.iceOwner())) return; } catch { return; }
              void reconcile();
            }, Math.max(0, blocked.get(peer.seatId)! - clock.nowMs())));
          } else failed(error);
        } else lost(peer.attemptId);
      });
    } catch (error) { lost(peer.attemptId); failed(error); }
  }
  async function reconcile() {
    if (disposed) return;
    const snapshot = deps.snapshot();
    for (const peer of peers.values()) {
      const seat = snapshot.seats[peer.seatId];
      if (!seat?.occupied || !seat.connected || seat.seatGeneration !== peer.seatGeneration) retire(peer);
    }
    if (deps.ownSeat !== snapshot.hostSeatId) return;
    reconcileAgain = true;
    if (requesting) return;
    requesting = true;
    // One attempt per seat generation per drain prevents reentrant failure callbacks
    // from spinning, while a newer generation can still replace a pending issuance.
    const attempted = new Map<number, number>();
    try {
      while (reconcileAgain && !disposed) {
        reconcileAgain = false;
        for (let seatId = 0; seatId < deps.snapshot().capacity; seatId++) {
          const seat = deps.snapshot().seats[seatId];
          if (disposed) return;
          if (seatId === deps.ownSeat || !seat?.occupied || !seat.connected || peers.has(seatId)
            || (blocked.get(seatId) ?? -Infinity) > clock.nowMs()
            || attempted.get(seatId) === seat.seatGeneration) continue;
          const generation = seat.seatGeneration;
          attempted.set(seatId, generation); issuing = seatId;
          try { await deps.service.request({ type: 'link-request', guestSeatId: seatId }); }
          catch {
            // A departed guest must not block later seats or retire a newer owner.
            if (!disposed) {
              const peer = peers.get(seatId); if (peer?.seatGeneration === generation) retire(peer);
              if (deps.snapshot().seats[seatId]?.seatGeneration === generation) deps.onLost(seatId);
            }
          } finally { issuing = undefined; }
        }
      }
    }
    finally { issuing = undefined; requesting = false; }
  }
  return {
    issued, reconcile, closed: lost,
    serviceReady(attemptId: string) { const peer = [...peers.values()].find(p => p.attemptId === attemptId); if (peer && !peer.serviceReady) { peer.serviceReady = true; deps.onChange?.(); } },
    signal: receive,
    ready(): readonly OnlinePeer[] { return [...peers.values()].filter(p => p.ready); },
    allReady() { const s = deps.snapshot(); return !disposed && s.seats.every(seat => { const peer = peers.get(seat.seatId); return !seat.occupied || seat.connected && (seat.seatId === deps.ownSeat || !!peer?.ready && peer.serviceReady && peer.seatGeneration === seat.seatGeneration); }); },
    async dispose() { if (disposed) return; disposed = true; for (const id of retryTimers.values()) scheduler.clearTimeout(id); retryTimers.clear(); for (const off of removers) off(); for (const peer of [...peers.values()]) retire(peer); }
  };
}

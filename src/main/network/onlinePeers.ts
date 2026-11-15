import type { MessagePortMain } from 'electron';
import type { RoomServiceClient } from '../../network/session/serviceClient';
import type { LinkIssued, RoomSnapshot } from '../../shared/roomSession';
import type { RtcSignal } from '../../shared/rtcSession';
import type { TransportController } from './rtcTransport';

export interface OnlinePeer { seatId: number; seatGeneration: number; attemptId: string; port: MessagePortMain; latestPayloadLimit: number; transferred: boolean }
export interface OnlinePeersDeps {
  controller: TransportController; service: RoomServiceClient; ownSeat: number; snapshot(): RoomSnapshot;
  channel(): { port1: MessagePortMain; port2: MessagePortMain };
  onReady(peer: OnlinePeer): void; onLost(seatId: number): void; onFailure(): void;
}
const close = (port: MessagePortMain) => { try { port.close(); } catch {} };
/** Bounded private peer ownership. Issuance is serialized because equal seat generations do not identify a seat. */
export function createOnlinePeers(deps: OnlinePeersDeps) {
  let disposed = false, issuing: number | undefined, requesting = false, forwards = 0;
  type Entry = OnlinePeer & { ready: boolean; serviceReady: boolean };
  const peers = new Map<number, Entry>();
  const failed = () => { if (!disposed) deps.onFailure(); };
  const current = (peer: Entry) => !disposed && peers.get(peer.seatId) === peer;
  function retire(peer: Entry) {
    if (peers.get(peer.seatId) !== peer) return;
    peers.delete(peer.seatId); if (!peer.transferred) close(peer.port);
    void deps.controller.closeAttempt(peer.attemptId).catch(() => {});
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
    const { port1, port2 } = deps.channel();
    const peer: Entry = { seatId, seatGeneration: link.identity.seatGeneration, attemptId: link.attemptId, port: port2, latestPayloadLimit: 0, ready: false, serviceReady: false, transferred: false };
    peers.set(seatId, peer);
    // Do not await here: service signal events may follow immediately in the same dispatch turn.
    try {
      void deps.controller.startAttempt({ ...link, iceServers: [] }, port1).then(async ready => {
        if (!current(peer)) return;
        peer.latestPayloadLimit = ready.latestPayloadLimit;
        await deps.service.request({ type: 'link-ready', attemptId: peer.attemptId });
        if (!current(peer)) return;
        peer.ready = true; deps.onReady(peer);
      }).catch(() => { if (current(peer)) lost(peer.attemptId); });
    } catch { close(port1); lost(peer.attemptId); }
  }
  async function reconcile() {
    if (disposed) return;
    const snapshot = deps.snapshot();
    for (const peer of peers.values()) {
      const seat = snapshot.seats[peer.seatId];
      if (!seat?.occupied || !seat.connected || seat.seatGeneration !== peer.seatGeneration) retire(peer);
    }
    if (requesting || deps.ownSeat !== snapshot.hostSeatId) return;
    requesting = true;
    try {
      for (let seatId = 0; seatId < snapshot.capacity; seatId++) {
        const seat = deps.snapshot().seats[seatId];
        if (disposed) return;
        if (seatId === deps.ownSeat || !seat?.occupied || !seat.connected || peers.has(seatId)) continue;
        issuing = seatId;
        await deps.service.request({ type: 'link-request', guestSeatId: seatId });
        issuing = undefined;
      }
    } catch {
      // A guest can depart while issuance is pending; the service's own error event owns host socket loss.
      if (!disposed && issuing !== undefined) { const peer = peers.get(issuing); if (peer) retire(peer); deps.onLost(issuing); }
    }
    finally { issuing = undefined; requesting = false; }
  }
  return {
    issued, reconcile, closed: lost,
    serviceReady(attemptId: string) { const peer = [...peers.values()].find(p => p.attemptId === attemptId); if (peer) peer.serviceReady = true; },
    signal(signal: RtcSignal) { const peer = [...peers.values()].find(p => p.attemptId === signal.attemptId && p.seatGeneration === signal.seatGeneration); if (peer) forward(peer, () => deps.controller.receiveSignal(signal)); },
    ready(): readonly OnlinePeer[] { return [...peers.values()].filter(p => p.ready); },
    allReady() { const s = deps.snapshot(); return s.seats.every(seat => { const peer = peers.get(seat.seatId); return !seat.occupied || seat.seatId === deps.ownSeat || !!peer?.ready && peer.serviceReady; }); },
    async dispose() { if (disposed) return; disposed = true; for (const off of removers) off(); for (const peer of [...peers.values()]) retire(peer); }
  };
}

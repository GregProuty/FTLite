import type { LinkIssued, ReplyOutcome } from '../../../../src/shared/roomSession';
import type { RtcSignal } from '../../../../src/shared/rtcSession';
import { randomHex128, randomToken256, tokenHash } from '../crypto';
import { failure } from '../errors';
import { RoomStore } from './store';
import { SocketDelivery, type ConnectionRow } from './sockets';
export type AttemptRow = { attempt_id: string; host_seat: number; guest_seat: number; host_seat_generation: number;
  guest_generation: number; host_generation: number; host_connection: string; guest_connection: string;
  host_ticket_hash: string; guest_ticket_hash: string; issued_at: number; expires_at: number;
  host_ready: number; guest_ready: number; host_candidates: number; guest_candidates: number; live: number };
export class SignalCoordinator {
  constructor(readonly store: RoomStore, readonly sockets: SocketDelivery) {}
  rows(): AttemptRow[] { return this.store.sql.exec<AttemptRow>('SELECT * FROM room_attempts').toArray(); }
  private endpoints(a: AttemptRow): { host: ConnectionRow; guest: ConnectionRow } {
    const m = this.store.requireConfirmed();
    if (m.phase !== 'lobby' && m.phase !== 'active') failure('invalid-state');
    const host = this.sockets.byConnection(a.host_connection), guest = this.sockets.byConnection(a.guest_connection);
    if (!a.live || (!a.host_ready || !a.guest_ready) && a.expires_at <= Date.now()) failure('invalid-state');
    if (!host || !guest || host.seat_id !== a.host_seat || guest.seat_id !== a.guest_seat
      || host.generation !== a.host_seat_generation || guest.generation !== a.guest_generation
      || m.host_generation !== a.host_generation || m.host_seat_id !== a.host_seat) failure('stale-generation');
    this.sockets.current(host); this.sockets.current(guest);
    return { host, guest };
  }
  private notify(a: AttemptRow, state: 'ready' | 'closed'): void {
    for (const id of [a.guest_connection, a.host_connection]) {
      // Delivery can synchronously retire an endpoint and invalidate this attempt.
      if (state === 'ready' && !this.store.sql.exec<{ live: number }>('SELECT live FROM room_attempts WHERE attempt_id = ?', a.attempt_id).toArray()[0]?.live) return;
      const row = this.sockets.byConnection(id);
      const sent = row && this.sockets.send(row, { type: 'link-state', attemptId: a.attempt_id, state });
      if (state === 'ready' && !sent) { this.invalidate(a); return; }
    }
  }
  invalidate(a: AttemptRow): void {
    const current = this.store.sql.exec<AttemptRow>('SELECT * FROM room_attempts WHERE attempt_id = ?', a.attempt_id).toArray()[0];
    if (!current?.live) return;
    this.store.sql.exec('UPDATE room_attempts SET live = 0 WHERE attempt_id = ?', a.attempt_id);
    this.notify(a, 'closed');
  }
  retire(connection: ConnectionRow): void {
    this.store.sql.exec('DELETE FROM room_link_pending WHERE host_connection = ? OR guest_connection = ?', connection.connection_id, connection.connection_id);
    for (const a of this.rows()) if (a.host_connection === connection.connection_id || a.guest_connection === connection.connection_id) this.invalidate(a);
  }
  sweep(): void {
    this.store.sql.exec('DELETE FROM room_link_pending WHERE expires_at <= ?', Date.now());
    for (const a of this.rows()) if (a.live) {
      try { this.endpoints(a); } catch { this.invalidate(a); }
    }
    this.store.sql.exec('DELETE FROM room_attempts WHERE live = 0 AND expires_at <= ?', Date.now());
  }
  /** Task4 must require a current ready pair for every occupied guest before start. */
  allGuestsReady(): boolean {
    this.sweep(); const m = this.store.requireConfirmed();
    return this.store.seats().filter(s => s.token_hash && s.seat_id !== m.host_seat_id).every(s =>
      this.rows().some(a => a.live && a.guest_seat === s.seat_id && a.host_ready && a.guest_ready));
  }
  async issue(sender: ConnectionRow, guestSeat: number): Promise<ReplyOutcome> {
    this.sweep();
    const observed = this.store.requireConfirmed(); this.sockets.current(sender);
    if (sender.seat_id !== observed.host_seat_id) failure('forbidden');
    if (guestSeat === observed.host_seat_id) failure('invalid-request');
    const seat = this.store.seat(guestSeat), guest = seat?.connection_id ? this.sockets.byConnection(seat.connection_id) : undefined;
    if (!guest) failure('invalid-state'); this.sockets.current(guest);
    const operationId = randomHex128();
    this.store.sql.exec('INSERT OR REPLACE INTO room_link_pending VALUES (?, ?, ?, ?, ?)', guestSeat, operationId, sender.connection_id!, guest.connection_id!, Date.now() + 30000);
    try {
      await this.store.schedule();
      const hostTicket = randomToken256(); let guestTicket = randomToken256();
      while (guestTicket === hostTicket) guestTicket = randomToken256();
      const [hostHash, guestHash] = await Promise.all([tokenHash(hostTicket), tokenHash(guestTicket)]);
      const old: AttemptRow[] = [];
      const attempt = this.store.transaction(() => {
        this.sockets.current(sender); this.sockets.current(guest);
        const m = this.store.requireConfirmed();
        if (m.phase !== 'lobby' && m.phase !== 'active') failure('invalid-state');
        if (m.host_generation !== observed.host_generation || m.host_seat_id !== sender.seat_id) failure('stale-generation');
        const pending = this.store.sql.exec<{ operation_id: string; expires_at: number }>('SELECT operation_id, expires_at FROM room_link_pending WHERE guest_seat = ?', guestSeat).toArray()[0];
        if (pending?.operation_id !== operationId || pending.expires_at <= Date.now()) failure('conflict');
        const rows = this.rows();
        if (rows.length >= 128) failure('capacity');
        old.push(...rows.filter(a => a.live && a.guest_seat === guestSeat));
        if (rows.filter(a => a.live && a.guest_seat !== guestSeat).length >= 3) failure('capacity');
        for (const a of old) this.store.sql.exec('UPDATE room_attempts SET live = 0 WHERE attempt_id = ?', a.attempt_id);
        const now = Date.now();
        const a: AttemptRow = { attempt_id: randomHex128(), host_seat: sender.seat_id!, guest_seat: guestSeat,
          host_seat_generation: sender.generation!, guest_generation: guest.generation!, host_generation: m.host_generation,
          host_connection: sender.connection_id!, guest_connection: guest.connection_id!, host_ticket_hash: hostHash!, guest_ticket_hash: guestHash!,
          issued_at: now, expires_at: now + 30000, host_ready: 0, guest_ready: 0, host_candidates: 0, guest_candidates: 0, live: 1 };
        this.store.sql.exec('INSERT INTO room_attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 1)',
          a.attempt_id, a.host_seat, a.guest_seat, a.host_seat_generation, a.guest_generation, a.host_generation,
          a.host_connection, a.guest_connection, a.host_ticket_hash, a.guest_ticket_hash, a.issued_at, a.expires_at);
        return a;
      });
      for (const a of old) this.notify(a, 'closed');
      this.endpoints(attempt);
      const m = this.store.requireConfirmed();
      const common = { ...JSON.parse(m.compatibility), roomId: m.room_id, runId: m.run_id, hostGeneration: m.host_generation,
        seatGeneration: attempt.guest_generation };
      const guestLink: LinkIssued = { attemptId: attempt.attempt_id, role: 'answerer', identity: { ...common,
        localConnectionId: attempt.guest_connection, remoteConnectionId: attempt.host_connection },
        localTicket: guestTicket, expectedRemoteTicket: hostTicket, ticketExpiresAtEpochMs: attempt.expires_at };
      const hostLink: LinkIssued = { attemptId: attempt.attempt_id, role: 'offerer', identity: { ...common,
        localConnectionId: attempt.host_connection, remoteConnectionId: attempt.guest_connection },
        localTicket: hostTicket, expectedRemoteTicket: guestTicket, ticketExpiresAtEpochMs: attempt.expires_at };
      // Publish answerer then offerer synchronously: no later signal event can run between these sends.
      const guestSent = this.sockets.send(guest, { type: 'link-issued', link: guestLink });
      const hostSent = guestSent && this.sockets.send(sender, { type: 'link-issued', link: hostLink });
      if (!guestSent || !hostSent) { this.invalidate(attempt); failure('unavailable'); }
      return { kind: 'attempt', attemptId: attempt.attempt_id };
    } finally {
      this.store.sql.exec('DELETE FROM room_link_pending WHERE guest_seat = ? AND operation_id = ?', guestSeat, operationId);
    }
  }
  private route(sender: ConnectionRow, id: string): { attempt: AttemptRow; target: ConnectionRow; isHost: boolean } {
    this.sweep(); this.sockets.current(sender);
    const attempt = this.store.sql.exec<AttemptRow>('SELECT * FROM room_attempts WHERE attempt_id = ?', id).toArray()[0] ?? failure('not-found');
    const endpoints = this.endpoints(attempt), isHost = sender.connection_id === attempt.host_connection;
    if (!isHost && sender.connection_id !== attempt.guest_connection) failure('forbidden');
    return { attempt, target: isHost ? endpoints.guest : endpoints.host, isHost };
  }
  forward(sender: ConnectionRow, signal: RtcSignal): ReplyOutcome {
    const { attempt: a, target, isHost } = this.route(sender, signal.attemptId);
    if (signal.roomId !== this.store.meta()!.room_id || signal.hostGeneration !== a.host_generation
      || signal.seatGeneration !== a.guest_generation || signal.from !== sender.connection_id || signal.to !== target.connection_id) failure('forbidden');
    if (signal.kind === 'description') {
      if (signal.description.type !== (isHost ? 'offer' : 'answer')) failure('forbidden');
    } else {
      const field = isHost ? 'host_candidates' : 'guest_candidates';
      if (a.host_candidates + a.guest_candidates >= 128) failure('capacity');
      this.store.sql.exec(`UPDATE room_attempts SET ${field} = ${field} + 1 WHERE attempt_id = ?`, a.attempt_id);
    }
    if (!this.sockets.send(target, { type: 'signal', signal })) { this.invalidate(a); failure('unavailable'); }
    return { kind: 'void' };
  }
  ready(sender: ConnectionRow, id: string): ReplyOutcome {
    const { attempt: a, isHost } = this.route(sender, id);
    if (!(isHost ? a.host_ready : a.guest_ready)) {
      this.store.sql.exec(`UPDATE room_attempts SET ${isHost ? 'host_ready' : 'guest_ready'} = 1 WHERE attempt_id = ?`, id);
      if (isHost ? a.guest_ready : a.host_ready) this.notify(a, 'ready');
    }
    return { kind: 'void' };
  }
}

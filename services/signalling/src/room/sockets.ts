import { encodeServerEnvelope, parseClientFrame, type RequestFrame, type ReplyOutcome, type ServerPayload } from '../../../../src/shared/roomSession';
import { randomHex128, tokenHash } from '../crypto';
import { failure, wrapDomain } from '../errors';
import { RoomStore, type SeatRow, type TicketRow } from './store';

export type ConnectionRow = { socket_id: string; connection_id: string | null; seat_id: number | null; generation: number | null;
  auth_deadline: number; last_request: number; last_sent: number; last_ack: number; auth_started: number };
export type LifecycleRequest = Exclude<RequestFrame, { type: 'ready' | 'remove-seat' | 'link-request' | 'signal' | 'link-ready' }>;
export type RequestHandler = (connection: ConnectionRow, request: RequestFrame) => Promise<ReplyOutcome> | ReplyOutcome;
/** Transport handles are reconstructed from attachment IDs; all mutable authority is read from SQL. */
export class SocketDelivery {
  onRetire?: (connection: ConnectionRow) => void;
  onRequest?: RequestHandler;
  onRosterChange?: () => void;
  constructor(readonly store: RoomStore, private readonly ctx: DurableObjectState) {}
  row(id: string): ConnectionRow | undefined { return this.store.sql.exec<ConnectionRow>('SELECT * FROM room_connections WHERE socket_id = ?', id).toArray()[0]; }
  rows(): ConnectionRow[] { return this.store.sql.exec<ConnectionRow>('SELECT * FROM room_connections').toArray(); }
  id(socket: WebSocket): string | undefined { return (socket.deserializeAttachment() as { socketId?: string } | null)?.socketId; }
  socket(id: string): WebSocket | undefined { return this.ctx.getWebSockets().find(s => this.id(s) === id); }
  current(row: ConnectionRow): SeatRow {
    const m = this.store.requireConfirmed();
    if (m.phase === 'ended') failure('invalid-state');
    const seat = row.seat_id === null ? undefined : this.store.seat(row.seat_id);
    if (!this.row(row.socket_id) || !seat?.token_hash || !seat.connected || seat.generation !== row.generation || seat.connection_id !== row.connection_id) failure('stale-connection');
    return seat;
  }
  byConnection(id: string): ConnectionRow | undefined { return this.store.sql.exec<ConnectionRow>('SELECT * FROM room_connections WHERE connection_id = ?', id).toArray()[0]; }
  async upgrade(): Promise<Response> {
    this.sweep(); this.store.requireConfirmed();
    if (this.store.meta()!.phase === 'ended') failure('invalid-state');
    if (this.rows().filter(r => r.seat_id === null).length >= 8) failure('capacity');
    const pair = new WebSocketPair(), id = randomHex128();
    this.store.sql.exec('INSERT INTO room_connections VALUES (?, NULL, NULL, NULL, ?, 0, 0, 0, 0)', id, Date.now() + 5000);
    pair[1].serializeAttachment({ socketId: id });
    this.ctx.acceptWebSocket(pair[1]);
    await this.store.schedule();
    return new Response(null, { status: 101, webSocket: pair[0], headers: { 'Cache-Control': 'no-store' } });
  }
  close(id: string, code = 1008): void {
    const row = this.row(id), socket = this.socket(id);
    if (row) {
      this.store.transaction(() => {
        this.store.sql.exec('DELETE FROM room_connections WHERE socket_id = ?', id);
        this.store.sql.exec('DELETE FROM room_credits WHERE socket_id = ?', id);
        const seat = row.seat_id === null ? undefined : this.store.seat(row.seat_id);
        if (seat?.connection_id === row.connection_id && seat.generation === row.generation) {
          this.store.sql.exec('UPDATE room_seats SET connected = 0, ready = 0 WHERE seat_id = ?', row.seat_id!);
          this.store.bumpRevision();
        }
      });
      this.onRetire?.(row); this.onRosterChange?.();
    }
    try { socket?.close(code, code === 1013 ? 'capacity' : 'closed'); } catch { /* Only this connection is released. */ }
  }
  retireSeat(seat: SeatRow): void {
    for (const row of this.rows()) if (row.seat_id === seat.seat_id && row.generation === seat.generation) this.close(row.socket_id, 1000);
  }
  sweep(): void {
    this.store.expire();
    for (const row of this.rows()) {
      if (row.seat_id === null) { if (row.auth_deadline <= Date.now()) this.close(row.socket_id); }
      else { try { this.current(row); } catch { this.close(row.socket_id); } }
    }
  }
  send(row: ConnectionRow, payload: ServerPayload): boolean {
    const current = this.row(row.socket_id);
    if (!current) return false;
    try { this.current(current); } catch { this.close(row.socket_id); return false; }
    const socket = this.socket(row.socket_id);
    if (!socket) { this.close(row.socket_id); return false; }
    const sequence = current.last_sent + 1;
    const text = encodeServerEnvelope({ sequence, payload }), bytes = new TextEncoder().encode(text).byteLength;
    const credit = this.store.sql.exec<{ count: number; bytes: number }>('SELECT COUNT(*) AS count, COALESCE(SUM(bytes), 0) AS bytes FROM room_credits WHERE socket_id = ?', row.socket_id).one();
    if (credit.count >= 64 || credit.bytes + bytes > 262144) { this.close(row.socket_id, 1013); return false; }
    this.store.transaction(() => {
      this.store.sql.exec('INSERT INTO room_credits VALUES (?, ?, ?)', row.socket_id, sequence, bytes);
      this.store.sql.exec('UPDATE room_connections SET last_sent = ? WHERE socket_id = ?', sequence, row.socket_id);
    });
    try { socket.send(text); return true; } catch { this.close(row.socket_id, 1013); return false; }
  }
  broadcast(payload: ServerPayload): void {
    for (const row of this.rows()) if (row.seat_id !== null) {
      try { this.current(row); } catch { this.close(row.socket_id); continue; }
      this.send(row, payload);
    }
  }
  roster(): void { if (this.store.meta()) this.broadcast({ type: 'roster', snapshot: this.store.snapshot() }); }
  takeRate(row: ConnectionRow, ack: boolean): boolean {
    const now = Date.now(), field = ack ? 'ack' : 'signal', rate = ack ? 120 : 30, burst = rate * 2;
    this.store.sql.exec('INSERT OR IGNORE INTO room_socket_rates VALUES (?, 60, ?, 240, ?)', row.seat_id!, now, now);
    const r = this.store.sql.exec<Record<string, number>>('SELECT * FROM room_socket_rates WHERE seat_id = ?', row.seat_id!).one();
    const tokens = Math.min(burst, r[field + '_tokens']! + Math.max(0, now - r[field + '_at']!) * rate / 1000);
    this.store.sql.exec(`UPDATE room_socket_rates SET ${field}_tokens = ?, ${field}_at = ? WHERE seat_id = ?`, Math.max(0, tokens - 1), now, row.seat_id!);
    return tokens >= 1;
  }
  async message(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.sweep();
    const id = this.id(socket), row = id ? this.row(id) : undefined;
    if (!row) { try { socket.close(1008, 'closed'); } catch {} return; }
    const frame = parseClientFrame(message);
    if (!frame) { this.close(row.socket_id); return; }
    if (row.seat_id === null) {
      if (frame.type !== 'auth' || row.auth_started) { this.close(row.socket_id); return; }
      this.store.sql.exec('UPDATE room_connections SET auth_started = 1 WHERE socket_id = ?', row.socket_id);
      const result = await wrapDomain(async () => {
        const hash = await tokenHash(frame.ticket);
        this.store.transaction(() => {
          const pending = this.row(row.socket_id);
          if (!pending || pending.seat_id !== null || pending.auth_deadline <= Date.now()) failure('timeout');
          this.store.requireConfirmed();
          const t = this.store.sql.exec<TicketRow>('SELECT * FROM room_tickets WHERE ticket_hash = ? AND connection_id = ?', hash, frame.connectionId).toArray()[0] ?? failure('unauthorized');
          if (t.expires_at <= Date.now()) failure('ticket-expired');
          if (t.consumed) failure('ticket-used');
          const seat = this.store.seat(t.seat_id) ?? failure('unauthorized');
          if (!seat.token_hash || seat.generation !== t.generation || seat.connection_id !== null) failure('stale-generation');
          this.store.sql.exec('UPDATE room_tickets SET consumed = 1 WHERE seat_id = ?', seat.seat_id);
          this.store.sql.exec('UPDATE room_seats SET connection_id = ?, connected = 1, ready = 0 WHERE seat_id = ?', t.connection_id, seat.seat_id);
          this.store.sql.exec('UPDATE room_connections SET connection_id = ?, seat_id = ?, generation = ? WHERE socket_id = ?', t.connection_id, seat.seat_id, seat.generation, row.socket_id);
          this.store.bumpRevision();
        });
      });
      if (!result.ok) { this.close(row.socket_id); return; }
      const authenticated = this.row(row.socket_id);
      if (!authenticated) return; // Retirement may win after the transaction's promise resolves.
      this.send(authenticated, { type: 'authenticated', session: { snapshot: this.store.snapshot(), seatId: authenticated.seat_id!, seatGeneration: authenticated.generation! } });
      this.onRosterChange?.(); this.roster(); await this.store.schedule(); return;
    }
    this.current(row);
    if (frame.type === 'auth') { this.close(row.socket_id); return; }
    if (!this.takeRate(row, frame.type === 'ack')) { this.close(row.socket_id, 1013); return; }
    if (frame.type === 'ack') {
      if (frame.sequence <= row.last_ack || frame.sequence > row.last_sent) return;
      this.store.transaction(() => {
        this.store.sql.exec('DELETE FROM room_credits WHERE socket_id = ? AND sequence <= ?', row.socket_id, frame.sequence);
        this.store.sql.exec('UPDATE room_connections SET last_ack = ? WHERE socket_id = ?', frame.sequence, row.socket_id);
      }); return;
    }
    if (frame.requestId <= row.last_request) { this.close(row.socket_id); return; }
    this.store.sql.exec('UPDATE room_connections SET last_request = ? WHERE socket_id = ?', frame.requestId, row.socket_id);
    const result = await wrapDomain(async (): Promise<ReplyOutcome> => {
      if (frame.type === 'ready') {
        if (this.store.requireConfirmed().phase !== 'lobby') failure('invalid-state');
        this.store.sql.exec('UPDATE room_seats SET ready = ? WHERE seat_id = ?', frame.ready ? 1 : 0, row.seat_id!);
        this.store.bumpRevision(); this.onRosterChange?.(); this.roster();
        return { kind: 'snapshot', snapshot: this.store.snapshot() };
      }
      if (frame.type === 'remove-seat') {
        if (row.seat_id !== this.store.requireConfirmed().host_seat_id) failure('forbidden');
        const old = this.store.seat(frame.seatId) ?? failure('invalid-request');
        this.store.revokeSeat(frame.seatId); this.retireSeat(old); this.onRosterChange?.(); this.roster();
        return { kind: 'snapshot', snapshot: this.store.snapshot() };
      }
      return this.onRequest ? await this.onRequest(row, frame) : failure('unavailable');
    });
    if (this.row(row.socket_id)) this.send(row, { type: 'reply', requestId: frame.requestId, outcome: result.ok ? result.value : { kind: 'error', error: result.error } });
    await this.store.schedule();
  }
}

import { isRoomId, validateCompatibility, type RoomCompatibility, type RoomPhase, type RoomSnapshot } from '../../../../src/shared/roomSession';
import { type Reservation, type ExpiryReceipt, LOBBY_MS, RETENTION_MS } from '../directory';
import { normalizeJoinCode } from '../crypto';
import { failure } from '../errors';
import { initializeServiceSchema } from '../storage';

export type RoomMeta = {
  singleton: number; reservation: string; initial_host_hash: string; epoch: string; room_id: string; join_code: string;
  run_id: string; compatibility: string; capacity: number; host_seat_id: number; host_generation: number;
  phase: RoomPhase; roster_revision: number; confirmed: number; deadline: number; retain_until: number;
}
export type SeatRow = {
  seat_id: number; generation: number; token_hash: string | null; connection_id: string | null;
  connected: number; ready: number; ticket_eligible: number;
}
export type TicketRow = { seat_id: number; generation: number; ticket_hash: string; connection_id: string; expires_at: number; consumed: number };
export type ActivationRow = { singleton: number; operation_id: string; previous_epoch: string; expected_generation: number; target_generation: number;
  kind: 'start' | 'rehost'; request_key: string; connection_id: string; seat_id: number; seat_generation: number;
  revision: number; expires_at: number; state: 'prepared' | 'committed' | 'acknowledged' | 'fenced'; active_deadline: number; nonce: string };
export type LeaseRow = { singleton: number; nonce: string; expires_at: number; connection_id: string; seat_generation: number };
export type ProposalRow = { singleton: number; proposal_id: string; revision: number; expires_at: number; init_base64: string; init_hash: string };
export function compatibilityKey(c: RoomCompatibility): string {
  return JSON.stringify([c.protocolVersion, c.modeId, c.schemaVersion, c.simVersion, c.contentDigest, c.layoutHash]);
}
function reservationKey(r: Reservation): string {
  return JSON.stringify([r.roomId, r.joinCode, r.runId, compatibilityKey(r.compatibility), r.capacity,
    r.chargeEpoch, r.createdAtEpochMs, r.reservationExpiresAtEpochMs, r.lobbyExpiresAtEpochMs]);
}

/** All authority lives here. Callers may compose synchronous transactions, never await inside them. */
export class RoomStore {
  readonly sql: SqlStorage;
  onFence?: () => void;
  constructor(readonly storage: DurableObjectStorage) {
    this.sql = storage.sql;
    initializeServiceSchema(storage);
    this.transaction(() => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS room_meta (
        singleton INTEGER PRIMARY KEY CHECK(singleton = 1), reservation TEXT NOT NULL, initial_host_hash TEXT NOT NULL,
        epoch TEXT NOT NULL, room_id TEXT NOT NULL, join_code TEXT NOT NULL, run_id TEXT NOT NULL, compatibility TEXT NOT NULL,
        capacity INTEGER NOT NULL, host_seat_id INTEGER NOT NULL, host_generation INTEGER NOT NULL, phase TEXT NOT NULL,
        roster_revision INTEGER NOT NULL, confirmed INTEGER NOT NULL, deadline INTEGER NOT NULL, retain_until INTEGER NOT NULL)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS room_seats (seat_id INTEGER PRIMARY KEY, generation INTEGER NOT NULL,
        token_hash TEXT UNIQUE, connection_id TEXT, connected INTEGER NOT NULL, ready INTEGER NOT NULL, ticket_eligible INTEGER NOT NULL)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS room_tickets (seat_id INTEGER PRIMARY KEY, generation INTEGER NOT NULL,
        ticket_hash TEXT UNIQUE NOT NULL, connection_id TEXT UNIQUE NOT NULL, expires_at INTEGER NOT NULL, consumed INTEGER NOT NULL)`);
      this.sql.exec('CREATE TABLE IF NOT EXISTS room_fence (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), epoch TEXT NOT NULL)');
      this.sql.exec(`CREATE TABLE IF NOT EXISTS room_connections (socket_id TEXT PRIMARY KEY, connection_id TEXT UNIQUE,
        seat_id INTEGER UNIQUE, generation INTEGER, auth_deadline INTEGER NOT NULL, last_request INTEGER NOT NULL,
        last_sent INTEGER NOT NULL, last_ack INTEGER NOT NULL, auth_started INTEGER NOT NULL)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS room_credits (socket_id TEXT NOT NULL, sequence INTEGER NOT NULL,
        bytes INTEGER NOT NULL, PRIMARY KEY(socket_id, sequence))`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS room_socket_rates (seat_id INTEGER PRIMARY KEY, signal_tokens REAL NOT NULL,
        signal_at INTEGER NOT NULL, ack_tokens REAL NOT NULL, ack_at INTEGER NOT NULL)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS room_attempts (attempt_id TEXT PRIMARY KEY, host_seat INTEGER NOT NULL,
        guest_seat INTEGER NOT NULL, host_seat_generation INTEGER NOT NULL, guest_generation INTEGER NOT NULL,
        host_generation INTEGER NOT NULL, host_connection TEXT NOT NULL, guest_connection TEXT NOT NULL,
        host_ticket_hash TEXT NOT NULL, guest_ticket_hash TEXT NOT NULL, issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        host_ready INTEGER NOT NULL, guest_ready INTEGER NOT NULL, host_candidates INTEGER NOT NULL,
        guest_candidates INTEGER NOT NULL, live INTEGER NOT NULL)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS room_link_pending (guest_seat INTEGER PRIMARY KEY, operation_id TEXT NOT NULL,
        host_connection TEXT NOT NULL, guest_connection TEXT NOT NULL, expires_at INTEGER NOT NULL)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS room_proposal (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), proposal_id TEXT NOT NULL,
        revision INTEGER NOT NULL, expires_at INTEGER NOT NULL, init_base64 TEXT NOT NULL, init_hash TEXT NOT NULL)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS room_activation (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), operation_id TEXT NOT NULL,
        previous_epoch TEXT NOT NULL, expected_generation INTEGER NOT NULL, target_generation INTEGER NOT NULL, kind TEXT NOT NULL,
        request_key TEXT NOT NULL, connection_id TEXT NOT NULL, seat_id INTEGER NOT NULL, seat_generation INTEGER NOT NULL,
        revision INTEGER NOT NULL, expires_at INTEGER NOT NULL, state TEXT NOT NULL, active_deadline INTEGER NOT NULL, nonce TEXT NOT NULL)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS room_lease (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), nonce TEXT NOT NULL,
        expires_at INTEGER NOT NULL, connection_id TEXT NOT NULL, seat_generation INTEGER NOT NULL)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS room_start (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), proposal_id TEXT NOT NULL,
        revision INTEGER NOT NULL, init_base64 TEXT NOT NULL, init_hash TEXT NOT NULL, roster TEXT NOT NULL, first_lease TEXT NOT NULL, active_deadline INTEGER NOT NULL)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS room_checkpoint (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), metadata TEXT NOT NULL, payload BLOB NOT NULL)`);
      this.sql.exec('CREATE TABLE IF NOT EXISTS room_accounting (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), epoch TEXT NOT NULL, retry_at INTEGER NOT NULL)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS room_activation_grant (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), lease TEXT NOT NULL)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS room_proposal_pending (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), operation_id TEXT NOT NULL, expires_at INTEGER NOT NULL)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS room_turn (seat_id INTEGER PRIMARY KEY, attempted_at INTEGER NOT NULL)');
    });
  }
  transaction<T>(body: () => T): T { return this.storage.transactionSync(body); }
  meta(): RoomMeta | undefined { return this.sql.exec<RoomMeta>('SELECT * FROM room_meta WHERE singleton = 1').toArray()[0]; }
  activation(): ActivationRow | undefined { return this.sql.exec<ActivationRow>('SELECT * FROM room_activation').toArray()[0]; }
  lease(): LeaseRow | undefined { return this.sql.exec<LeaseRow>('SELECT * FROM room_lease').toArray()[0]; }
  proposal(): ProposalRow | undefined { return this.sql.exec<ProposalRow>('SELECT * FROM room_proposal').toArray()[0]; }
  seats(): SeatRow[] { return this.sql.exec<SeatRow>('SELECT * FROM room_seats ORDER BY seat_id').toArray(); }
  seatByHash(hash: string): SeatRow | undefined { return this.sql.exec<SeatRow>('SELECT * FROM room_seats WHERE token_hash = ?', hash).toArray()[0]; }
  seat(id: number): SeatRow | undefined { return this.sql.exec<SeatRow>('SELECT * FROM room_seats WHERE seat_id = ?', id).toArray()[0]; }
  snapshot(): RoomSnapshot {
    const m = this.meta() ?? failure('not-found');
    return { roomId: m.room_id, joinCode: m.join_code, runId: m.run_id, compatibility: JSON.parse(m.compatibility),
      capacity: m.capacity, hostSeatId: m.host_seat_id, hostGeneration: m.host_generation, phase: m.phase, rosterRevision: m.roster_revision,
      seats: this.seats().map(s => ({ seatId: s.seat_id, seatGeneration: s.generation, occupied: s.token_hash !== null, connected: !!s.connected, ready: !!s.ready })) };
  }
  initialize(r: Reservation, hostHash: string): RoomSnapshot {
    if (![r.roomId, r.runId, r.chargeEpoch].every(isRoomId) || normalizeJoinCode(r.joinCode) !== r.joinCode
      || !validateCompatibility(r.compatibility) || !Number.isInteger(r.capacity) || r.capacity < 1 || r.capacity > 4
      || !/^[a-f0-9]{64}$/.test(hostHash) || !Number.isSafeInteger(r.createdAtEpochMs) || r.createdAtEpochMs <= 0
      || r.reservationExpiresAtEpochMs !== r.createdAtEpochMs + 60000 || r.lobbyExpiresAtEpochMs !== r.createdAtEpochMs + LOBBY_MS) failure('invalid-request');
    return this.transaction(() => {
      const current = this.meta();
      if (current) {
        if (current.reservation !== reservationKey(r) || current.initial_host_hash !== hostHash) failure('conflict');
        return this.snapshot();
      }
      if (this.sql.exec('SELECT * FROM room_fence').toArray().length || Date.now() >= r.reservationExpiresAtEpochMs) failure('conflict');
      this.sql.exec('INSERT INTO room_meta VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, 1, 0, ?, 0)',
        reservationKey(r), hostHash, r.chargeEpoch, r.roomId, r.joinCode, r.runId, JSON.stringify(r.compatibility), r.capacity, 'lobby', r.reservationExpiresAtEpochMs);
      for (let id = 0; id < r.capacity; id++) this.sql.exec('INSERT INTO room_seats VALUES (?, ?, ?, NULL, 0, 0, ?)', id, id === 0 ? 1 : 0, id === 0 ? hostHash : null, id === 0 ? 1 : 0);
      return this.snapshot();
    });
  }
  confirmCreation(epoch: string): number {
    this.expire();
    return this.transaction(() => {
      const m = this.meta() ?? failure('conflict');
      if (m.epoch !== epoch || m.phase !== 'lobby' || m.deadline <= Date.now()) failure('conflict');
      if (!m.confirmed) {
        const initial = JSON.parse(m.reservation) as unknown[];
        this.sql.exec('UPDATE room_meta SET confirmed = 1, deadline = ? WHERE singleton = 1', initial[8] as number);
      }
      return this.meta()!.deadline;
    });
  }
  expire(): void {
    const m = this.meta();
    if (m) this.reconcileExpiry(m.epoch, Date.now());
    this.sql.exec('DELETE FROM room_tickets WHERE expires_at <= ?', Date.now());
    this.sql.exec('DELETE FROM room_proposal WHERE expires_at <= ?', Date.now());
    this.sql.exec('DELETE FROM room_proposal_pending WHERE expires_at <= ?', Date.now());
  }
  requireConfirmed(): RoomMeta {
    const m = this.meta() ?? failure('not-found');
    if (!m.confirmed) failure('unavailable');
    if (m.deadline <= Date.now()) failure('invalid-state');
    return m;
  }
  reconcileExpiry(epoch: string, now: number): ExpiryReceipt {
    return this.transaction(() => {
      const m = this.meta();
      if (!m) {
        this.sql.exec('INSERT OR IGNORE INTO room_fence VALUES (1, ?)', epoch);
        return { kind: 'absent', epoch };
      }
      const op = this.activation(), lease = this.lease();
      const pending = op && (op.state === 'prepared' || op.state === 'committed');
      if (pending && (epoch === op.operation_id || epoch === m.epoch)) {
        const deadline = Math.min(m.deadline, op.expires_at, op.state === 'committed' ? lease?.expires_at ?? 0 : Infinity);
        if (deadline > now) return { kind: 'live', epoch, generation: epoch === op.operation_id ? op.target_generation : m.host_generation, phase: m.phase, deadline };
        this.fence(now, op.kind === 'start' && op.state === 'prepared' ? 'ended' : 'lost');
        // The prepared nonce is also the reserved epoch, even if its response was lost.
        if (epoch === op.operation_id) this.sql.exec('UPDATE room_meta SET epoch = ?, host_generation = ? WHERE singleton = 1', epoch, op.target_generation);
        return { kind: 'fenced', epoch, generation: epoch === op.operation_id ? op.target_generation : m.host_generation,
          phase: this.meta()!.phase as 'lost' | 'ended', retainUntilEpochMs: this.meta()!.retain_until };
      }
      if (op?.state === 'fenced' && epoch === op.operation_id && m.epoch !== epoch) {
        return { kind: 'fenced', epoch, generation: op.target_generation, phase: m.phase as 'lost' | 'ended', retainUntilEpochMs: m.retain_until };
      }
      if (m.epoch !== epoch) return { kind: 'live', epoch: m.epoch, generation: m.host_generation, phase: m.phase, deadline: m.deadline };
      if (m.phase === 'active') {
        const deadline = Math.min(m.deadline, lease?.expires_at ?? 0);
        if (deadline > now) return { kind: 'live', epoch, generation: m.host_generation, phase: m.phase, deadline };
        this.fence(deadline, m.deadline <= now ? 'ended' : 'lost');
        return { kind: 'fenced', epoch, generation: m.host_generation, phase: this.meta()!.phase as 'lost' | 'ended', retainUntilEpochMs: this.meta()!.retain_until };
      }
      if ((m.phase === 'lost' || m.phase === 'ended') && m.deadline > now) return { kind: 'fenced', epoch, generation: m.host_generation, phase: m.phase, retainUntilEpochMs: m.retain_until };
      if (m.deadline > now) return { kind: 'live', epoch, generation: m.host_generation, phase: m.phase, deadline: m.deadline };
      if (m.phase === 'lobby') {
        const retainUntil = m.deadline + RETENTION_MS;
        this.sql.exec("UPDATE room_meta SET phase = 'ended', deadline = ?, retain_until = ?, roster_revision = roster_revision + 1 WHERE singleton = 1", retainUntil, retainUntil);
        this.sql.exec('UPDATE room_seats SET connection_id = NULL, connected = 0, ready = 0, ticket_eligible = 0');
        this.sql.exec('DELETE FROM room_tickets');
        return { kind: 'fenced', epoch, generation: m.host_generation, phase: 'ended', retainUntilEpochMs: retainUntil };
      }
      this.sql.exec('DELETE FROM room_tickets');
      this.sql.exec('DELETE FROM room_seats');
      this.sql.exec('DELETE FROM room_meta');
      this.sql.exec('DELETE FROM room_socket_rates');
      this.sql.exec('DELETE FROM room_attempts');
      this.sql.exec('DELETE FROM room_link_pending');
      this.sql.exec('DELETE FROM room_proposal'); this.sql.exec('DELETE FROM room_activation'); this.sql.exec('DELETE FROM room_lease');
      this.sql.exec('DELETE FROM room_start'); this.sql.exec('DELETE FROM room_checkpoint');
      this.sql.exec('DELETE FROM room_accounting');
      this.sql.exec('DELETE FROM room_activation_grant'); this.sql.exec('DELETE FROM room_proposal_pending');
      this.sql.exec('DELETE FROM room_turn');
      this.sql.exec('INSERT OR REPLACE INTO room_fence VALUES (1, ?)', epoch);
      return { kind: 'absent', epoch };
    });
  }
  fence(now: number, phase: 'lost' | 'ended' = 'lost'): void {
    let changed = false;
    this.transaction(() => {
      const m = this.meta(); if (!m) return;
      this.sql.exec('INSERT OR REPLACE INTO room_accounting VALUES (1, ?, ?)', m.epoch, Date.now() + 5000);
      if (m.phase === 'lost' || m.phase === 'ended') {
        this.sql.exec("UPDATE room_activation SET state = 'fenced' WHERE state IN ('prepared', 'committed')"); return;
      }
      this.sql.exec('UPDATE room_meta SET phase = ?, deadline = ?, retain_until = ?, roster_revision = roster_revision + 1 WHERE singleton = 1', phase, now + RETENTION_MS, now + RETENTION_MS);
      changed = true;
      this.sql.exec("UPDATE room_activation SET state = 'fenced'");
      this.sql.exec('DELETE FROM room_lease'); this.sql.exec('DELETE FROM room_proposal');
      this.sql.exec('DELETE FROM room_link_pending');
    });
    if (changed) this.onFence?.();
    this.sql.exec('UPDATE room_attempts SET live = 0');
  }
  /** Internal primitive; websocket host/lobby authorization belongs to the caller. */
  revokeSeat(seatId: number): void {
    this.transaction(() => {
      const m = this.requireConfirmed();
      const seat = this.seat(seatId);
      if (m.phase !== 'lobby' || seatId === m.host_seat_id || !seat?.token_hash) failure('invalid-state');
      this.sql.exec('UPDATE room_seats SET generation = generation + 1, token_hash = NULL, connection_id = NULL, connected = 0, ready = 0, ticket_eligible = 0 WHERE seat_id = ?', seatId);
      this.sql.exec('DELETE FROM room_tickets WHERE seat_id = ?', seatId);
      this.bumpRevision();
    });
  }
  bumpRevision(): void { this.sql.exec('UPDATE room_meta SET roster_revision = roster_revision + 1 WHERE singleton = 1'); }
  async schedule(): Promise<void> {
    // workerd limits compound SELECT terms; scalar bounded aggregates avoid that limit.
    const values = [
      'SELECT MIN(deadline) AS deadline FROM room_meta',
      'SELECT MIN(expires_at) AS deadline FROM room_tickets',
      'SELECT MIN(auth_deadline) AS deadline FROM room_connections WHERE seat_id IS NULL',
      'SELECT MIN(expires_at) AS deadline FROM room_link_pending',
      'SELECT MIN(expires_at) AS deadline FROM room_proposal',
      'SELECT MIN(expires_at) AS deadline FROM room_lease',
      'SELECT MIN(retry_at) AS deadline FROM room_accounting',
      'SELECT MIN(expires_at) AS deadline FROM room_proposal_pending',
      "SELECT MIN(expires_at) AS deadline FROM room_activation WHERE state IN ('prepared', 'committed')",
      'SELECT MIN(expires_at) AS deadline FROM room_attempts WHERE live = 0 OR host_ready = 0 OR guest_ready = 0',
    ].map(query => this.sql.exec<{ deadline: number | null }>(query).one().deadline).filter((value): value is number => value !== null);
    if (values.length) await this.storage.setAlarm(Math.max(Date.now() + 1000, Math.min(...values)));
    else await this.storage.deleteAlarm();
  }
}

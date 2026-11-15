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
    });
  }
  transaction<T>(body: () => T): T { return this.storage.transactionSync(body); }
  meta(): RoomMeta | undefined { return this.sql.exec<RoomMeta>('SELECT * FROM room_meta WHERE singleton = 1').toArray()[0]; }
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
    if (m && m.deadline <= Date.now()) this.reconcileExpiry(m.epoch, Date.now());
    this.sql.exec('DELETE FROM room_tickets WHERE expires_at <= ?', Date.now());
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
      if (m.epoch !== epoch) return { kind: 'live', epoch: m.epoch, generation: m.host_generation, phase: m.phase, deadline: m.deadline };
      if (m.phase === 'active') failure('unavailable'); // Task4 owns live leases/activations.
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
      this.sql.exec('INSERT OR REPLACE INTO room_fence VALUES (1, ?)', epoch);
      return { kind: 'absent', epoch };
    });
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
    const deadlines = this.sql.exec<{ deadline: number | null }>('SELECT MIN(deadline) AS deadline FROM (SELECT deadline FROM room_meta UNION ALL SELECT expires_at AS deadline FROM room_tickets)').one();
    if (deadlines.deadline !== null) await this.storage.setAlarm(Math.max(Date.now() + 1000, deadlines.deadline));
    else await this.storage.deleteAlarm();
  }
}

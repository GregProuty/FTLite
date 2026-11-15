import { validateCompatibility, type RoomCompatibility, type SeatSessionView, type SocketTicket } from '../../../../src/shared/roomSession';
import { randomHex128, randomToken256, tokenHash } from '../crypto';
import { failure } from '../errors';
import { RoomStore, compatibilityKey, type SeatRow } from './store';

export class RoomAuth {
  constructor(private readonly store: RoomStore) {}
  join(compatibility: RoomCompatibility, existingHash: string | undefined, freshHash: string): { session: SeatSessionView; retired: SeatRow | undefined } {
    if (!validateCompatibility(compatibility)) failure('invalid-request');
    this.store.expire();
    return this.store.transaction(() => {
      const m = this.store.requireConfirmed();
      if (compatibilityKey(JSON.parse(m.compatibility)) !== compatibilityKey(compatibility)) failure('incompatible');
      const retired = existingHash ? this.store.seatByHash(existingHash) : undefined;
      if (existingHash && !retired) failure('unauthorized');
      if (!existingHash && m.phase !== 'lobby') failure('invalid-state');
      const seat = retired ?? this.store.seats().find(s => s.token_hash === null) ?? failure('capacity');
      this.store.sql.exec('UPDATE room_seats SET generation = generation + 1, token_hash = ?, connection_id = NULL, connected = 0, ready = 0, ticket_eligible = 1 WHERE seat_id = ?', existingHash ?? freshHash, seat.seat_id);
      this.store.sql.exec('DELETE FROM room_tickets WHERE seat_id = ?', seat.seat_id);
      this.store.bumpRevision();
      return { session: { snapshot: this.store.snapshot(), seatId: seat.seat_id, seatGeneration: seat.generation + 1 }, retired };
    });
  }
  authenticateHash(hash: string): SeatRow {
    this.store.requireConfirmed();
    return this.store.seatByHash(hash) ?? failure('unauthorized');
  }
  async socketTicket(hash: string): Promise<SocketTicket> {
    this.store.expire();
    const observed = this.authenticateHash(hash);
    const ticket = randomToken256(), connectionId = randomHex128();
    const hashed = await tokenHash(ticket);
    const result = this.store.transaction(() => {
      const seat = this.authenticateHash(hash);
      if (seat.generation !== observed.generation) failure('stale-generation');
      if (!seat.ticket_eligible || seat.connection_id !== null) failure('ticket-used');
      const expiresAtEpochMs = Date.now() + 30_000;
      this.store.sql.exec('INSERT OR REPLACE INTO room_tickets VALUES (?, ?, ?, ?, ?, 0)', seat.seat_id, seat.generation, hashed, connectionId, expiresAtEpochMs);
      this.store.sql.exec('UPDATE room_seats SET ticket_eligible = 0 WHERE seat_id = ?', seat.seat_id);
      return { ticket, connectionId, expiresAtEpochMs };
    });
    await this.store.schedule();
    return result;
  }
}

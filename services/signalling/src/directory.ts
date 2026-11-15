import { DurableObject } from 'cloudflare:workers';
import { isRoomId, validateCompatibility, type RoomCompatibility, type RoomPhase } from '../../../src/shared/roomSession';
import { randomHex128, randomJoinCode, normalizeJoinCode } from './crypto';
import { failure, serviceError, wrapDomain, unwrapDomain, type DomainResult } from './errors';
import { initializeServiceSchema } from './storage';
import type { Env } from './index';

export const LOBBY_MS = 30 * 60_000;
export const RETENTION_MS = 7 * 24 * 60 * 60_000;
export interface Reservation {
  roomId: string; joinCode: string; runId: string; compatibility: RoomCompatibility; capacity: number;
  chargeEpoch: string; createdAtEpochMs: number; reservationExpiresAtEpochMs: number; lobbyExpiresAtEpochMs: number;
}
export type ExpiryReceipt =
  | { kind: 'absent'; epoch: string }
  | { kind: 'live'; epoch: string; generation: number; phase: RoomPhase; deadline: number }
  | { kind: 'fenced'; epoch: string; generation: number; phase: 'lost' | 'ended'; retainUntilEpochMs: number };
export interface ActivationReservation { roomId: string; chargeEpoch: string; operationId: string; generation: number; expiresAtEpochMs: number }
export interface ActivationFence { roomId: string; chargeEpoch: string; operationId: string; generation: number }
type DirectoryRow = {
  room_id: string; code: string; reservation: string; epoch: string; generation: number; phase: RoomPhase;
  charged: number; committed: number; deadline: number;
};
type ActivationRecord = { room_id: string; operation_id: string; previous_epoch: string; expected_generation: number;
  target_generation: number; expires_at: number; active_deadline: number; acknowledged: number };

export class Directory extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    initializeServiceSchema(ctx.storage);
    ctx.storage.transactionSync(() => {
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS directory_rooms (
        room_id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, reservation TEXT NOT NULL, epoch TEXT NOT NULL,
        generation INTEGER NOT NULL, phase TEXT NOT NULL, charged INTEGER NOT NULL, committed INTEGER NOT NULL, deadline INTEGER NOT NULL)`);
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS directory_ip (
        ip_hash TEXT PRIMARY KEY, window_start INTEGER NOT NULL, creates INTEGER NOT NULL, joins INTEGER NOT NULL,
        upgrades INTEGER NOT NULL, expires_at INTEGER NOT NULL)`);
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS directory_activations (room_id TEXT PRIMARY KEY, operation_id TEXT UNIQUE NOT NULL,
        previous_epoch TEXT NOT NULL, expected_generation INTEGER NOT NULL, target_generation INTEGER NOT NULL,
        expires_at INTEGER NOT NULL, active_deadline INTEGER NOT NULL, acknowledged INTEGER NOT NULL)`);
    });
  }
  fetch(): Response { return serviceError('unavailable', 503); }
  async reserveRoom(compatibility: RoomCompatibility, capacity: number, ipHash: string): Promise<DomainResult<Reservation>> {
    return wrapDomain(async () => {
      if (!validateCompatibility(compatibility) || !Number.isInteger(capacity) || capacity < 1 || capacity > 4) failure('invalid-request');
      this.chargeIp(ipHash, 'creates', 5);
      unwrapDomain(await this.reconcile());
      const reservation = this.ctx.storage.transactionSync(() => {
        const count = this.ctx.storage.sql.exec<{ stored: number; charged: number }>('SELECT COUNT(*) AS stored, COALESCE(SUM(charged), 0) AS charged FROM directory_rooms').one();
        if (count.stored >= 1000 || count.charged >= 100) failure('capacity');
        for (let attempt = 0; attempt < 16; attempt++) {
          const roomId = randomHex128(), joinCode = randomJoinCode();
          if (this.ctx.storage.sql.exec('SELECT room_id FROM directory_rooms WHERE code = ? OR room_id = ?', joinCode, roomId).toArray().length) continue;
          const now = Date.now();
          const value: Reservation = { roomId, joinCode, runId: randomHex128(), compatibility, capacity,
            chargeEpoch: randomHex128(), createdAtEpochMs: now, reservationExpiresAtEpochMs: now + 60_000, lobbyExpiresAtEpochMs: now + LOBBY_MS };
          this.ctx.storage.sql.exec('INSERT INTO directory_rooms VALUES (?, ?, ?, ?, 1, ?, 1, 0, ?)', roomId, joinCode,
            JSON.stringify(value), value.chargeEpoch, 'lobby', value.reservationExpiresAtEpochMs);
          return value;
        }
        return failure('unavailable');
      });
      await this.schedule();
      return reservation;
    });
  }
  async commitRoom(roomId: string, epoch: string): Promise<DomainResult<void>> {
    return wrapDomain(async () => {
      const row = this.row(roomId);
      if (!row || row.epoch !== epoch) failure('conflict');
      if (row.committed) return;
      const deadline = unwrapDomain(await this.env.ROOMS.get(this.env.ROOMS.idFromName(roomId)).confirmCreation(epoch));
      this.ctx.storage.transactionSync(() => {
        const current = this.row(roomId);
        if (!current || current.epoch !== epoch || current.phase !== 'lobby') failure('conflict');
        this.ctx.storage.sql.exec('UPDATE directory_rooms SET committed = 1, deadline = ? WHERE room_id = ? AND epoch = ?', deadline, roomId, epoch);
      });
      await this.schedule();
    });
  }
  async resolveCode(code: string): Promise<DomainResult<{ roomId: string } | null>> {
    return wrapDomain(async () => {
      const normalized = normalizeJoinCode(code);
      if (!normalized) return null;
      unwrapDomain(await this.reconcile());
      const row = this.ctx.storage.sql.exec<DirectoryRow>('SELECT * FROM directory_rooms WHERE code = ? AND committed = 1', normalized).toArray()[0];
      return row ? { roomId: row.room_id } : null;
    });
  }
  async resolveRoom(roomId: string): Promise<DomainResult<{ roomId: string } | null>> {
    return wrapDomain(async () => {
      unwrapDomain(await this.reconcile());
      return this.row(roomId)?.committed ? { roomId } : null;
    });
  }
  async reserveJoin(ipHash: string): Promise<DomainResult<void>> { return wrapDomain(async () => { this.chargeIp(ipHash, 'joins', 20); await this.schedule(); }); }
  async reserveSocketUpgrade(ipHash: string): Promise<DomainResult<void>> { return wrapDomain(async () => { this.chargeIp(ipHash, 'upgrades', 20); await this.schedule(); }); }
  private chargeIp(ipHash: string, column: 'creates' | 'joins' | 'upgrades', limit: number): void {
    if (!/^[a-f0-9]{64}$/.test(ipHash)) failure('unavailable');
    this.ctx.storage.transactionSync(() => {
      const now = Date.now();
      this.ctx.storage.sql.exec('DELETE FROM directory_ip WHERE expires_at <= ?', now);
      const row = this.ctx.storage.sql.exec<{ window_start: number; creates: number; joins: number; upgrades: number }>('SELECT * FROM directory_ip WHERE ip_hash = ?', ipHash).toArray()[0];
      if (!row) {
        if (this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM directory_ip').one().n >= 10000) failure('capacity');
        this.ctx.storage.sql.exec('INSERT INTO directory_ip VALUES (?, ?, 0, 0, 0, ?)', ipHash, now, now + 120_000);
      } else if (now - row.window_start >= 60_000) {
        this.ctx.storage.sql.exec('UPDATE directory_ip SET window_start = ?, creates = 0, joins = 0, upgrades = 0 WHERE ip_hash = ?', now, ipHash);
      } else if (row[column] >= limit) failure('rate-limited');
      this.ctx.storage.sql.exec(`UPDATE directory_ip SET ${column} = ${column} + 1, expires_at = ? WHERE ip_hash = ?`, now + 120_000, ipHash);
    });
  }
  async reconcile(): Promise<DomainResult<void>> {
    return wrapDomain(async () => {
      const now = Date.now();
      const expired = this.ctx.storage.sql.exec<DirectoryRow>('SELECT * FROM directory_rooms WHERE deadline <= ? LIMIT 1000', now).toArray();
      for (const row of expired) {
        try {
          const receipt = unwrapDomain(await this.env.ROOMS.get(this.env.ROOMS.idFromName(row.room_id)).reconcileExpiry(row.epoch, now));
          if (receipt.epoch === row.epoch) this.applyReceipt(row.room_id, receipt);
        } catch { /* Unknown outcome retains the charge and mapping. */ }
      }
      this.ctx.storage.sql.exec('DELETE FROM directory_ip WHERE expires_at <= ?', now);
      await this.schedule();
    });
  }
  async releaseFenced(roomId: string, receipt: ExpiryReceipt): Promise<DomainResult<void>> {
    return wrapDomain(async () => {
      if (receipt.kind === 'live') failure('invalid-request');
      this.applyReceipt(roomId, receipt);
      await this.schedule();
    });
  }
  private applyReceipt(roomId: string, receipt: ExpiryReceipt): void {
    this.ctx.storage.transactionSync(() => {
      const row = this.row(roomId);
      if (!row || row.epoch !== receipt.epoch) return;
      if (receipt.kind === 'absent') {
        this.ctx.storage.sql.exec('DELETE FROM directory_activations WHERE room_id = ?', roomId);
        this.ctx.storage.sql.exec('DELETE FROM directory_rooms WHERE room_id = ? AND epoch = ?', roomId, receipt.epoch);
      } else if (receipt.generation !== row.generation) return;
      else if (receipt.kind === 'live') {
        this.ctx.storage.sql.exec('UPDATE directory_rooms SET deadline = ? WHERE room_id = ? AND epoch = ?', receipt.deadline, roomId, receipt.epoch);
      } else {
        this.ctx.storage.sql.exec('UPDATE directory_rooms SET charged = 0, phase = ?, deadline = ? WHERE room_id = ? AND epoch = ?',
          receipt.phase, receipt.retainUntilEpochMs, roomId, receipt.epoch);
      }
    });
  }
  private row(roomId: string): DirectoryRow | undefined { return this.ctx.storage.sql.exec<DirectoryRow>('SELECT * FROM directory_rooms WHERE room_id = ?', roomId).toArray()[0]; }
  private async schedule(): Promise<void> {
    const row = this.ctx.storage.sql.exec<{ deadline: number | null }>('SELECT MIN(deadline) AS deadline FROM (SELECT deadline FROM directory_rooms UNION ALL SELECT expires_at AS deadline FROM directory_ip)').one();
    if (row.deadline !== null) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, row.deadline));
    else await this.ctx.storage.deleteAlarm();
  }
  async alarm(): Promise<void> { unwrapDomain(await this.reconcile()); }
  async reserveActivation(roomId: string, previousEpoch: string, operationId: string, expectedGeneration: number, targetGeneration: number): Promise<DomainResult<ActivationReservation>> {
    return wrapDomain(async () => {
      if (![roomId, previousEpoch, operationId].every(isRoomId) || operationId === previousEpoch || !Number.isSafeInteger(expectedGeneration)
        || expectedGeneration < 1 || !Number.isSafeInteger(targetGeneration) || (targetGeneration !== expectedGeneration && targetGeneration !== expectedGeneration + 1)) failure('invalid-request');
      // Activation can be called by Room: never call Room back from this RPC.
      // Independent alarms/public allocation reclaim stale charges; false-full admission fails closed.
      const value = this.ctx.storage.transactionSync(() => {
        const row = this.row(roomId) ?? failure('not-found');
        const op = this.ctx.storage.sql.exec<ActivationRecord>('SELECT * FROM directory_activations WHERE room_id = ?', roomId).toArray()[0];
        if (op?.operation_id === operationId) {
          if (op.previous_epoch !== previousEpoch || op.expected_generation !== expectedGeneration || op.target_generation !== targetGeneration) failure('conflict');
          if (op.acknowledged === -1 || row.epoch !== operationId || !row.charged || row.phase === 'lost' || row.phase === 'ended') failure('conflict');
          return { roomId, chargeEpoch: operationId, operationId, generation: targetGeneration, expiresAtEpochMs: op.expires_at };
        }
        if (!row.committed || row.epoch !== previousEpoch || row.generation !== expectedGeneration || row.phase === 'ended'
          || (targetGeneration === expectedGeneration ? row.phase !== 'lobby' : row.phase !== 'lost')) failure('conflict');
        if (!row.charged && this.ctx.storage.sql.exec<{ n: number }>('SELECT COALESCE(SUM(charged), 0) AS n FROM directory_rooms').one().n >= 100) failure('capacity');
        if (this.ctx.storage.sql.exec('SELECT room_id FROM directory_activations WHERE operation_id = ?', operationId).toArray().length) failure('conflict');
        const expires = Date.now() + 60000;
        this.ctx.storage.sql.exec('INSERT OR REPLACE INTO directory_activations VALUES (?, ?, ?, ?, ?, ?, 0, 0)', roomId, operationId, previousEpoch, expectedGeneration, targetGeneration, expires);
        this.ctx.storage.sql.exec("UPDATE directory_rooms SET epoch = ?, generation = ?, charged = 1, phase = 'active', deadline = ? WHERE room_id = ?", operationId, targetGeneration, expires, roomId);
        return { roomId, chargeEpoch: operationId, operationId, generation: targetGeneration, expiresAtEpochMs: expires };
      });
      await this.schedule(); return value;
    });
  }
  async commitActivation(roomId: string, epoch: string, operationId: string, generation: number, activeDeadline: number): Promise<DomainResult<void>> {
    return wrapDomain(async () => {
      this.ctx.storage.transactionSync(() => {
        const row = this.row(roomId), op = this.ctx.storage.sql.exec<ActivationRecord>('SELECT * FROM directory_activations WHERE room_id = ?', roomId).toArray()[0];
        if (!row || !op || row.epoch !== epoch || epoch !== operationId || op.operation_id !== operationId || row.generation !== generation
          || op.target_generation !== generation || !row.charged || row.phase !== 'active') failure('conflict');
        if (!Number.isSafeInteger(activeDeadline) || activeDeadline <= Date.now() || activeDeadline > Date.now() + 86400000) failure('invalid-state');
        if (op.acknowledged && op.active_deadline !== activeDeadline) failure('conflict');
        this.ctx.storage.sql.exec('UPDATE directory_activations SET acknowledged = 1, active_deadline = ? WHERE room_id = ?', activeDeadline, roomId);
        this.ctx.storage.sql.exec('UPDATE directory_rooms SET deadline = ? WHERE room_id = ? AND epoch = ?', activeDeadline, roomId, epoch);
      });
      await this.schedule();
    });
  }
  /** Room has irreversibly fenced this tuple. Advancing the epoch is also a barrier against a reserve still in flight. */
  async fenceActivation(roomId: string, previousEpoch: string, operationId: string, expectedGeneration: number, targetGeneration: number,
    phase: 'lost' | 'ended', retainUntil: number): Promise<DomainResult<ActivationFence>> {
    return wrapDomain(async () => {
      if (![roomId, previousEpoch, operationId].every(isRoomId) || operationId === previousEpoch || !Number.isSafeInteger(expectedGeneration)
        || expectedGeneration < 1 || !Number.isSafeInteger(targetGeneration) || (targetGeneration !== expectedGeneration && targetGeneration !== expectedGeneration + 1)
        || (phase !== 'lost' && phase !== 'ended') || !Number.isSafeInteger(retainUntil) || retainUntil < 0) failure('invalid-request');
      const result = this.ctx.storage.transactionSync(() => {
        const row = this.row(roomId) ?? failure('not-found');
        const op = this.ctx.storage.sql.exec<ActivationRecord>('SELECT * FROM directory_activations WHERE room_id = ?', roomId).toArray()[0];
        if (row.epoch === operationId) {
          if (!op || op.operation_id !== operationId || op.previous_epoch !== previousEpoch || op.expected_generation !== expectedGeneration
            || op.target_generation !== targetGeneration || row.generation !== targetGeneration) failure('conflict');
        } else {
          if (row.epoch !== previousEpoch || row.generation !== expectedGeneration || !row.committed) failure('conflict');
          if (this.ctx.storage.sql.exec('SELECT room_id FROM directory_activations WHERE operation_id = ?', operationId).toArray().length) failure('conflict');
          this.ctx.storage.sql.exec('INSERT OR REPLACE INTO directory_activations VALUES (?, ?, ?, ?, ?, ?, 0, -1)', roomId, operationId, previousEpoch, expectedGeneration, targetGeneration, Date.now());
        }
        this.ctx.storage.sql.exec('UPDATE directory_activations SET acknowledged = -1 WHERE room_id = ? AND operation_id = ?', roomId, operationId);
        this.ctx.storage.sql.exec('UPDATE directory_rooms SET epoch = ?, generation = ?, phase = ?, charged = 0, deadline = ? WHERE room_id = ?', operationId, targetGeneration, phase, retainUntil, roomId);
        return { roomId, chargeEpoch: operationId, operationId, generation: targetGeneration };
      });
      await this.schedule(); return result;
    });
  }
  async reserveTurn(_authorization: { roomId: string; seatId: number; seatGeneration: number; connectionId: string }): Promise<DomainResult<void>> { return wrapDomain(() => failure('unavailable')); }
}

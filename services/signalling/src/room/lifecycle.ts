import { validateInitBase64, type LeaseGrant, type ReplyOutcome } from '../../../../src/shared/roomSession';
import { randomHex128 } from '../crypto';
import { failure, unwrapDomain } from '../errors';
import type { Directory } from '../directory';
import { RoomStore, type ActivationRow } from './store';
import { SocketDelivery, type ConnectionRow, type LifecycleRequest } from './sockets';
import { SignalCoordinator } from './signals';

export const LEASE_MS = 15000;
const ACTIVE_MS = 86400000;
export async function bytesHash(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
/** Backend lease bookkeeping only. The utility authority gate is a later integration. */
export class RoomLifecycle {
  constructor(readonly store: RoomStore, readonly sockets: SocketDelivery, readonly signals: SignalCoordinator,
    readonly directory: DurableObjectStub<Directory>) {}
  rosterChanged(): void {
    this.store.sql.exec('DELETE FROM room_proposal');
    this.store.sql.exec('DELETE FROM room_proposal_pending');
    const m = this.store.meta();
    if (m?.phase === 'active') {
      const lease = this.store.lease(), seat = this.store.seat(m.host_seat_id);
      if (!lease || !seat?.connected || seat.connection_id !== lease.connection_id || seat.generation !== lease.seat_generation) this.store.fence(Date.now());
    }
  }
  host(connection: ConnectionRow): void {
    this.sockets.current(connection);
    if (connection.seat_id !== this.store.requireConfirmed().host_seat_id) failure('forbidden');
  }
  ready(connection: ConnectionRow, revision: number): void {
    this.host(connection);
    const m = this.store.requireConfirmed();
    if (m.phase !== 'lobby') failure('invalid-state');
    if (revision !== m.roster_revision) failure('conflict');
    if (this.store.seats().some(s => s.token_hash && (!s.connected || !s.ready)) || !this.signals.allGuestsReady()) failure('invalid-state');
  }
  grant(): LeaseGrant {
    const m = this.store.requireConfirmed(), lease = this.store.lease() ?? failure('lease-expired');
    return { roomId: m.room_id, hostSeatId: m.host_seat_id, hostGeneration: m.host_generation, nonce: lease.nonce, expiresAtEpochMs: lease.expires_at };
  }
  leased(connection: ConnectionRow): LeaseGrant {
    this.store.expire(); this.host(connection);
    const m = this.store.requireConfirmed(), lease = this.store.lease();
    if (m.phase !== 'active' || !lease || lease.expires_at <= Date.now()) failure('lease-expired');
    if (this.store.activation()?.state !== 'acknowledged') failure('unavailable');
    if (lease.connection_id !== connection.connection_id || lease.seat_generation !== connection.generation) failure('stale-connection');
    return this.grant();
  }
  async request(connection: ConnectionRow, request: LifecycleRequest): Promise<ReplyOutcome> {
    this.store.expire(); this.sockets.current(connection);
    if (request.type === 'start-propose') {
      this.ready(connection, request.expectedRosterRevision);
      if (this.store.activation()?.state === 'prepared') failure('conflict');
      if (!validateInitBase64(request.initBase64)) failure('too-large');
      const bytes = Uint8Array.from(atob(request.initBase64), c => c.charCodeAt(0));
      const operationId = randomHex128();
      this.store.sql.exec('INSERT OR REPLACE INTO room_proposal_pending VALUES (1, ?, ?)', operationId, Date.now() + 30000);
      try {
        await this.store.schedule();
        this.ready(connection, request.expectedRosterRevision);
        if (!this.store.sql.exec('SELECT singleton FROM room_proposal_pending WHERE operation_id = ? AND expires_at > ?', operationId, Date.now()).toArray().length) failure('conflict');
        const hash = await bytesHash(bytes);
        this.ready(connection, request.expectedRosterRevision);
        if (!this.store.sql.exec('SELECT singleton FROM room_proposal_pending WHERE operation_id = ? AND expires_at > ?', operationId, Date.now()).toArray().length) failure('conflict');
        if (hash !== request.initHash) failure('hash-mismatch');
        if (this.store.activation()?.state === 'prepared') failure('conflict');
        const old = this.store.proposal();
        if (old && old.revision === request.expectedRosterRevision && old.init_hash === hash && old.init_base64 === request.initBase64) return { kind: 'proposal', proposalId: old.proposal_id };
        const id = randomHex128(), expires = Date.now() + 30000;
        this.store.sql.exec('INSERT OR REPLACE INTO room_proposal VALUES (1, ?, ?, ?, ?, ?)', id, request.expectedRosterRevision, expires, request.initBase64, hash);
        this.sockets.broadcast({ type: 'start-proposed', proposalId: id, expectedRosterRevision: request.expectedRosterRevision, expiresAtEpochMs: expires });
        return { kind: 'proposal', proposalId: id };
      } finally { this.store.sql.exec('DELETE FROM room_proposal_pending WHERE operation_id = ?', operationId); }
    }
    if (request.type === 'lease-renew') {
      this.leased(connection);
      const lease = this.store.lease()!;
      if (lease.nonce !== request.nonce) this.store.sql.exec('UPDATE room_lease SET nonce = ?, expires_at = ? WHERE singleton = 1', request.nonce, Math.min(Date.now() + LEASE_MS, this.store.meta()!.deadline));
      return { kind: 'lease', lease: this.grant() };
    }
    if (request.type === 'host-release') {
      this.host(connection);
      const m = this.store.requireConfirmed();
      if (m.phase !== 'active' && m.phase !== 'lost') failure('invalid-state');
      this.store.fence(Date.now());
      await this.release();
      this.sockets.current(connection);
      return { kind: 'void' };
    }
    let op = this.store.activation();
    const key = request.type === 'start-commit' ? request.proposalId : request.nonce;
    const exact = op && op.request_key === key && op.kind === (request.type === 'start-commit' ? 'start' : 'rehost');
    if (exact) {
      if (op!.connection_id !== connection.connection_id || op!.seat_generation !== connection.generation || op!.seat_id !== connection.seat_id
        || (request.type === 'start-commit' ? op!.revision !== request.expectedRosterRevision : op!.expected_generation !== request.expectedHostGeneration)) failure('conflict');
      if (op!.state === 'fenced') failure('lease-expired');
      return this.activate(op!, connection);
    }
    if (op && (op.state === 'prepared' || op.state === 'committed')) failure('conflict');
    if (request.type === 'start-commit') {
      this.ready(connection, request.expectedRosterRevision);
      const proposal = this.store.proposal();
      if (!proposal || proposal.proposal_id !== request.proposalId || proposal.expires_at <= Date.now()) failure('conflict');
    } else {
      const m = this.store.requireConfirmed();
      if (m.phase !== 'lost' || m.host_generation !== request.expectedHostGeneration) failure('conflict');
      if (!this.store.sql.exec('SELECT singleton FROM room_checkpoint').toArray().length) failure('no-checkpoint');
      // Loss is committed before admission; stale release receipts cannot affect a newer epoch.
      await this.release();
      this.sockets.current(connection);
      const current = this.store.requireConfirmed();
      if (current.phase !== 'lost' || current.host_generation !== request.expectedHostGeneration) failure('conflict');
      op = this.store.activation();
      if (op && (op.state === 'prepared' || op.state === 'committed')) failure('conflict');
    }
    const m = this.store.requireConfirmed();
    op = { singleton: 1, operation_id: randomHex128(), previous_epoch: m.epoch, expected_generation: m.host_generation,
      target_generation: m.host_generation + (request.type === 'rehost-claim' ? 1 : 0), kind: request.type === 'start-commit' ? 'start' : 'rehost',
      request_key: key, connection_id: connection.connection_id!, seat_id: connection.seat_id!, seat_generation: connection.generation!,
      revision: m.roster_revision, expires_at: Math.min(Date.now() + 60000, m.deadline, request.type === 'start-commit' ? this.store.proposal()!.expires_at : Infinity),
      state: 'prepared', active_deadline: 0, nonce: request.type === 'rehost-claim' ? request.nonce : randomHex128() };
    this.store.sql.exec('INSERT OR REPLACE INTO room_activation VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      op.operation_id, op.previous_epoch, op.expected_generation, op.target_generation, op.kind, op.request_key, op.connection_id,
      op.seat_id, op.seat_generation, op.revision, op.expires_at, op.state, op.active_deadline, op.nonce);
    await this.store.schedule();
    return this.activate(op, connection);
  }
  private currentOperation(op: ActivationRow, connection: ConnectionRow): ActivationRow {
    this.store.expire(); this.sockets.current(connection);
    const current = this.store.activation();
    if (!current || current.operation_id !== op.operation_id) failure('conflict');
    if (current.state === 'fenced') failure('lease-expired');
    if (current.connection_id !== connection.connection_id || current.seat_generation !== connection.generation) failure('stale-connection');
    return current;
  }
  async activate(op: ActivationRow, connection: ConnectionRow): Promise<ReplyOutcome> {
    let current = this.currentOperation(op, connection);
    if (current.state === 'prepared') {
      const reservation = await this.directory.reserveActivation(this.store.meta()!.room_id, op.previous_epoch, op.operation_id, op.expected_generation, op.target_generation);
      current = this.currentOperation(op, connection);
      if (!reservation.ok) {
        // A definitive admission refusal performed no reservation. Unknown transport outcomes retain the operation.
        if (current.state === 'prepared' && (reservation.error.code === 'capacity' || reservation.error.code === 'conflict' || reservation.error.code === 'not-found')) this.store.sql.exec('DELETE FROM room_activation WHERE operation_id = ?', op.operation_id);
        unwrapDomain(reservation);
      }
      const reserved = unwrapDomain(reservation);
      if (reserved.chargeEpoch !== op.operation_id || reserved.operationId !== op.operation_id || reserved.generation !== op.target_generation) failure('unavailable');
      if (current.state === 'prepared') this.store.transaction(() => {
        current = this.currentOperation(op, connection);
        const m = this.store.requireConfirmed();
        if (op.kind === 'start') this.ready(connection, op.revision);
        else if (m.phase !== 'lost' || m.host_generation !== op.expected_generation) failure('conflict');
        if (reserved.expiresAtEpochMs <= Date.now() || op.expires_at <= Date.now()) failure('timeout');
        const deadline = op.kind === 'start' ? Date.now() + ACTIVE_MS : this.store.sql.exec<{ active_deadline: number }>('SELECT active_deadline FROM room_start').one().active_deadline;
        if (deadline <= Date.now()) failure('invalid-state');
        const expires = Math.min(Date.now() + LEASE_MS, deadline);
        this.store.sql.exec("UPDATE room_meta SET epoch = ?, host_generation = ?, host_seat_id = ?, phase = 'active', deadline = ?, retain_until = 0 WHERE singleton = 1", op.operation_id, op.target_generation, op.seat_id, deadline);
        this.store.sql.exec('INSERT OR REPLACE INTO room_lease VALUES (1, ?, ?, ?, ?)', op.nonce, expires, op.connection_id, op.seat_generation);
        this.store.sql.exec('INSERT OR REPLACE INTO room_activation_grant VALUES (1, ?)', JSON.stringify(this.grant()));
        this.store.sql.exec("UPDATE room_activation SET state = 'committed', active_deadline = ? WHERE operation_id = ?", deadline, op.operation_id);
        if (op.kind === 'start') {
          const proposal = this.store.proposal() ?? failure('conflict');
          this.store.sql.exec('INSERT INTO room_start VALUES (1, ?, ?, ?, ?, ?, ?, ?)', proposal.proposal_id, proposal.revision, proposal.init_base64, proposal.init_hash, JSON.stringify(this.store.snapshot()), JSON.stringify(this.grant()), deadline);
          this.store.sql.exec('DELETE FROM room_proposal');
        }
      });
      current = this.currentOperation(op, connection);
    }
    if (current.state === 'committed') {
      await this.store.schedule();
      current = this.currentOperation(op, connection);
      unwrapDomain(await this.directory.commitActivation(this.store.meta()!.room_id, op.operation_id, op.operation_id, op.target_generation, current.active_deadline));
      current = this.currentOperation(op, connection);
      if (op.kind === 'start' && this.store.meta()!.roster_revision !== op.revision) { this.store.fence(Date.now()); failure('conflict'); }
      if (current.state === 'committed') {
        this.store.sql.exec("UPDATE room_activation SET state = 'acknowledged' WHERE operation_id = ? AND state = 'committed'", op.operation_id);
        const outcome = this.outcome(op, connection);
        if (outcome.kind === 'started') this.sockets.broadcast({ type: 'started', initBase64: outcome.initBase64, initHash: outcome.initHash, lease: outcome.lease });
        else if (outcome.kind === 'lease') this.sockets.broadcast({ type: 'host-changed', snapshot: this.store.snapshot(), lease: outcome.lease });
      }
    }
    return this.outcome(op, connection);
  }
  private outcome(op: ActivationRow, connection: ConnectionRow): ReplyOutcome {
    this.currentOperation(op, connection); this.leased(connection);
    const first = JSON.parse(this.store.sql.exec<{ lease: string }>('SELECT lease FROM room_activation_grant').one().lease) as LeaseGrant;
    if (first.expiresAtEpochMs <= Date.now()) failure('lease-expired');
    if (op.kind === 'rehost') return { kind: 'lease', lease: first };
    const start = this.store.sql.exec<{ init_base64: string; init_hash: string; first_lease: string }>('SELECT * FROM room_start').one();
    const lease = JSON.parse(start.first_lease) as LeaseGrant;
    if (lease.expiresAtEpochMs <= Date.now()) failure('lease-expired');
    return { kind: 'started', initBase64: start.init_base64, initHash: start.init_hash, lease };
  }
  async release(): Promise<void> {
    const m = this.store.meta(); if (!m || (m.phase !== 'lost' && m.phase !== 'ended')) return;
    this.store.sql.exec('INSERT OR REPLACE INTO room_accounting VALUES (1, ?, ?)', m.epoch, Date.now() + 5000);
    const op = this.store.activation();
    if (op?.state === 'fenced') {
      const result = unwrapDomain(await this.directory.fenceActivation(m.room_id, op.previous_epoch, op.operation_id, op.expected_generation, op.target_generation, m.phase, m.retain_until));
      this.store.transaction(() => {
        const current = this.store.meta(), operation = this.store.activation();
        if (!current || current.epoch !== m.epoch || current.host_generation !== m.host_generation || current.phase !== m.phase
          || operation?.operation_id !== op.operation_id || operation.state !== 'fenced') return;
        if (result.operationId !== op.operation_id || result.chargeEpoch !== op.operation_id || result.generation !== op.target_generation || result.roomId !== m.room_id) failure('unavailable');
        this.store.sql.exec('UPDATE room_meta SET epoch = ?, host_generation = ? WHERE singleton = 1', op.operation_id, op.target_generation);
        this.store.sql.exec('DELETE FROM room_accounting WHERE epoch = ?', m.epoch);
      });
      if (this.store.meta()?.epoch === op.operation_id && this.store.meta()?.phase === m.phase) this.sockets.roster();
    } else {
      unwrapDomain(await this.directory.releaseFenced(m.room_id, { kind: 'fenced', epoch: m.epoch, generation: m.host_generation, phase: m.phase, retainUntilEpochMs: m.retain_until }));
      this.store.sql.exec('DELETE FROM room_accounting WHERE epoch = ?', m.epoch);
    }
  }
  async recover(): Promise<void> {
    this.store.expire();
    const op = this.store.activation();
    if (op && (op.state === 'prepared' || op.state === 'committed')) {
      const connection = this.sockets.byConnection(op.connection_id);
      if (connection) await this.activate(op, connection);
      else this.store.fence(Date.now());
    }
    await this.release();
  }
}

import { DurableObject } from 'cloudflare:workers';
import { isRoomToken, type RoomCompatibility, type RoomSnapshot, type SeatSession, type SocketTicket } from '../../../src/shared/roomSession';
import { failure, serviceError, wrapDomain, type DomainResult } from './errors';
import { randomToken256, tokenHash } from './crypto';
import type { Reservation, ExpiryReceipt } from './directory';
import type { Env } from './index';
import { RoomStore, type SeatRow } from './room/store';
import { RoomAuth } from './room/auth';
export class Room extends DurableObject<Env> {
  readonly store: RoomStore;
  readonly auth: RoomAuth;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new RoomStore(ctx.storage);
    this.auth = new RoomAuth(this.store);
  }
  fetch(): Response { return serviceError('unavailable', 503); }
  async initialize(reservation: Reservation, hostTokenHash: string): Promise<DomainResult<RoomSnapshot>> {
    return wrapDomain(async () => {
      if (!this.ctx.id.equals(this.env.ROOMS.idFromName(reservation.roomId))) failure('conflict');
      const result = this.store.initialize(reservation, hostTokenHash);
      await this.store.schedule();
      return result;
    });
  }
  async confirmCreation(epoch: string): Promise<DomainResult<number>> {
    return wrapDomain(async () => {
      const deadline = this.store.confirmCreation(epoch);
      await this.store.schedule();
      return deadline;
    });
  }
  async join(compatibility: RoomCompatibility, token?: string): Promise<DomainResult<SeatSession>> {
    return wrapDomain(async () => {
      if (token !== undefined && !isRoomToken(token)) failure('invalid-request');
      const seatToken = token ?? randomToken256();
      const hash = await tokenHash(seatToken);
      const result = this.auth.join(compatibility, token ? hash : undefined, hash);
      if (result.retired) this.retireSeat(result.retired);
      await this.store.schedule();
      return { ...result.session, seatToken };
    });
  }
  async socketTicket(token: string): Promise<DomainResult<SocketTicket>> {
    return wrapDomain(async () => {
      if (!isRoomToken(token)) failure('invalid-request');
      return this.auth.socketTicket(await tokenHash(token));
    });
  }
  private retireSeat(seat: SeatRow): void {
    // SQLite was fenced first. Socket attachments only locate transport handles.
    for (const socket of this.ctx.getWebSockets()) {
      const a = socket.deserializeAttachment() as { seatId?: number; seatGeneration?: number; connectionId?: string } | null;
      if (a?.seatId === seat.seat_id && a.seatGeneration === seat.generation) {
        try { socket.close(1000, 'replaced'); } catch { /* Already closed. */ }
      }
    }
  }
  async reconcileExpiry(epoch: string, now: number): Promise<DomainResult<ExpiryReceipt>> {
    return wrapDomain(async () => {
      const receipt = this.store.reconcileExpiry(epoch, now);
      await this.store.schedule();
      return receipt;
    });
  }
  async alarm(): Promise<void> { this.store.expire(); await this.store.schedule(); }
}

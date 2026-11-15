import { DurableObject } from 'cloudflare:workers';
import { isRoomToken, type RoomCompatibility, type RoomSnapshot, type SeatSession, type SocketTicket } from '../../../src/shared/roomSession';
import { failure, serviceError, errorResponse, wrapDomain, type DomainResult } from './errors';
import { randomToken256, tokenHash } from './crypto';
import type { Reservation, ExpiryReceipt } from './directory';
import type { Env } from './index';
import { RoomStore, type SeatRow } from './room/store';
import { RoomAuth } from './room/auth';
import { SocketDelivery, type ConnectionRow, type LifecycleRequest } from './room/sockets';
import { SignalCoordinator } from './room/signals';
import { RoomLifecycle } from './room/lifecycle';
import { RoomCheckpoints } from './room/checkpoints';
import { RoomTurn } from './turn';
import type { ReplyOutcome } from '../../../src/shared/roomSession';
export class Room extends DurableObject<Env> {
  readonly store: RoomStore;
  readonly auth: RoomAuth;
  readonly sockets: SocketDelivery;
  readonly signals: SignalCoordinator;
  readonly lifecycle: RoomLifecycle;
  readonly checkpoints: RoomCheckpoints;
  readonly turn: RoomTurn;
  lifecycleRequest?: (connection: ConnectionRow, request: LifecycleRequest) => ReplyOutcome | Promise<ReplyOutcome>;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new RoomStore(ctx.storage);
    this.auth = new RoomAuth(this.store);
    this.sockets = new SocketDelivery(this.store, ctx);
    this.signals = new SignalCoordinator(this.store, this.sockets);
    this.lifecycle = new RoomLifecycle(this.store, this.sockets, this.signals, env.DIRECTORY.get(env.DIRECTORY.idFromName('global')));
    this.checkpoints = new RoomCheckpoints(this.store, this.auth, this.lifecycle);
    this.turn = new RoomTurn(this.store, this.auth, this.sockets, this.lifecycle, env);
    this.store.onFence = () => {
      this.signals.sweep();
      // A provisional rehost may have changed both generation and host seat.
      // Publish the complete non-authoritative fence before its departure.
      this.sockets.roster();
      this.sockets.broadcast({ type: 'host-departed', hostGeneration: this.store.meta()!.host_generation });
    };
    this.lifecycleRequest = (connection, request) => this.lifecycle.request(connection, request);
    this.sockets.onRosterChange = () => this.lifecycle.rosterChanged();
    this.sockets.onRetire = connection => this.signals.retire(connection);
    this.sockets.onRequest = (connection, request) => {
      if (request.type === 'link-request') return this.signals.issue(connection, request.guestSeatId);
      if (request.type === 'signal') return this.signals.forward(connection, request.signal);
      if (request.type === 'link-ready') return this.signals.ready(connection, request.attemptId);
      if (request.type === 'ready' || request.type === 'remove-seat') failure('invalid-request');
      return this.lifecycleRequest ? this.lifecycleRequest(connection, request) : failure('unavailable');
    };
  }
  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === '/turn' && request.method === 'POST') {
      try { return await this.turn.fetch(request); } catch (error) { return errorResponse(error); }
      finally { if (!request.body?.locked) void request.body?.cancel().catch(() => {}); }
    }
    if (new URL(request.url).pathname === '/checkpoint' && (request.method === 'PUT' || request.method === 'GET')) {
      try { return await this.checkpoints.fetch(request); } catch (error) { return errorResponse(error); }
      finally { if (!request.body?.locked) void request.body?.cancel().catch(() => {}); }
    }
    if (request.method !== 'GET' || new URL(request.url).pathname !== '/socket' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return serviceError('unavailable', 503);
    try { return await this.sockets.upgrade(); } catch (error) { return errorResponse(error); }
  }
  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> { await this.sockets.message(socket, message); }
  async webSocketClose(socket: WebSocket): Promise<void> { const id = this.sockets.id(socket); if (id) this.sockets.close(id, 1000); this.sockets.roster(); await this.store.schedule(); }
  async webSocketError(socket: WebSocket): Promise<void> { const id = this.sockets.id(socket); if (id) this.sockets.close(id); this.sockets.roster(); await this.store.schedule(); }
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
      this.sockets.onRosterChange?.();
      this.sockets.roster();
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
    this.sockets.retireSeat(seat);
  }
  async reconcileExpiry(epoch: string, now: number): Promise<DomainResult<ExpiryReceipt>> {
    return wrapDomain(async () => {
      const receipt = this.store.reconcileExpiry(epoch, now);
      this.sockets.sweep(); this.signals.sweep();
      await this.store.schedule();
      return receipt;
    });
  }
  async alarm(): Promise<void> {
    this.sockets.sweep(); this.signals.sweep();
    // Expected accounting failures retain the durable retry; programming/storage exceptions still escape.
    try { await wrapDomain(() => this.lifecycle.recover()); } finally { await this.store.schedule(); }
  }
}

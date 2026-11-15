import { isRoomId, parseBoundedJson, type TurnCredentials } from '../../../src/shared/roomSession';
import { copyRtcIceServers, type RtcIceServerConfig } from '../../../src/shared/rtcSession';
import { tokenHash } from './crypto';
import { failure, unwrapDomain } from './errors';
import { bearerToken, exactKeys, readBoundedBody, readSmallJson } from './http';
import type { Env } from './index';
import type { RoomAuth } from './room/auth';
import type { RoomLifecycle } from './room/lifecycle';
import type { RoomStore } from './room/store';
import type { ConnectionRow, SocketDelivery } from './room/sockets';

type CurrentSeatConnection = { connection: ConnectionRow; hostGeneration: number; startedAt: number };
const utf8 = new TextEncoder();
function providerServers(value: unknown): RtcIceServerConfig[] {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !exactKeys(value as Record<string, unknown>, ['iceServers'])) failure('turn-unavailable');
  const servers = copyRtcIceServers((value as { iceServers: RtcIceServerConfig[] }).iceServers);
  if (!servers?.length) failure('turn-unavailable');
  let usableTurn = false;
  const filtered: RtcIceServerConfig[] = [];
  for (const server of servers) {
    const urls: string[] = [];
    for (const url of server.urls) {
      if (utf8.encode(url).byteLength > 2048) failure('turn-unavailable');
      // ICE URLs are opaque URIs: a strict grammar avoids URL normalization,
      // userinfo, encoded hosts, paths, fragments, and alternate destinations.
      const match = /^(stun|stuns|turn|turns):(stun\.cloudflare\.com|turn\.cloudflare\.com)(?::([1-9][0-9]{0,4}))?(?:\?transport=(udp|tcp))?$/.exec(url);
      if (!match || (match[3] !== undefined && Number(match[3]) > 65535)) failure('turn-unavailable');
      const relay = match[1] === 'turn' || match[1] === 'turns';
      if (match[2] !== (relay ? 'turn.cloudflare.com' : 'stun.cloudflare.com')) failure('turn-unavailable');
      if (match[3] === '53') continue;
      if (relay) {
        if (!server.username || !server.credential) failure('turn-unavailable');
        usableTurn = true;
      }
      urls.push(url);
    }
    if ((server.username !== undefined && utf8.encode(server.username).byteLength > 512)
      || (server.credential !== undefined && utf8.encode(server.credential).byteLength > 512)) failure('turn-unavailable');
    if (urls.length) filtered.push({ ...server, urls });
  }
  if (!usableTurn) failure('turn-unavailable');
  return filtered;
}

/** Only the fixed provider endpoint is callable; tests intercept runtime fetch. */
async function generate(env: Env, startedAt: number): Promise<TurnCredentials> {
  const key = env.TURN_KEY_ID, secret = env.TURN_KEY_API_TOKEN;
  if (!key || !/^[a-fA-F0-9]{32}$/.test(key) || !secret || !/^[\x21-\x7e]{1,4096}$/.test(secret)) failure('turn-unavailable');
  const controller = new AbortController();
  const expires = Date.now() + 5000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(Error('turn-unavailable')); }, 5000);
  });
  let response: Response | undefined;
  const operation = async (): Promise<TurnCredentials> => {
    response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${key}/credentials/generate-ice-servers`, {
      method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      // workerd rejects Request redirect:'error'. Manual plus the strict 201
      // check below provides the same no-follow policy without forwarding secrets.
      body: '{"ttl":3600}', redirect: 'manual', signal: controller.signal,
    });
    if (controller.signal.aborted || response.status !== 201 || response.redirected) failure('turn-unavailable');
    const remaining = expires - Date.now();
    if (remaining <= 0) failure('turn-unavailable');
    const bytes = await readBoundedBody(new Request('https://provider-response', { method: 'POST', headers: response.headers, body: response.body }), 16384, remaining);
    if (controller.signal.aborted || Date.now() >= expires) failure('turn-unavailable');
    const body = parseBoundedJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes), 16384);
    return { iceServers: providerServers(body), expiresAtEpochMs: startedAt + 3600000 };
  };
  try { return await Promise.race([operation(), deadline]); }
  catch { return failure('turn-unavailable'); }
  finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
    if (response && !response.body?.locked) void response.body?.cancel().catch(() => {});
  }
}

export class RoomTurn {
  constructor(readonly store: RoomStore, readonly auth: RoomAuth, readonly sockets: SocketDelivery,
    readonly lifecycle: RoomLifecycle, readonly env: Env) {}
  private current(observed: CurrentSeatConnection): void {
    this.store.expire();
    const m = this.store.requireConfirmed();
    if (m.phase !== 'lobby' && m.phase !== 'active') failure('invalid-state');
    if (m.host_generation !== observed.hostGeneration) failure('stale-generation');
    this.sockets.current(observed.connection);
    if (this.sockets.socket(observed.connection.socket_id)?.readyState !== WebSocket.OPEN) failure('stale-connection');
    const op = this.store.activation();
    if (m.phase === 'lobby') {
      if (op?.state === 'prepared' || op?.state === 'committed') failure('unavailable');
    } else {
      if (!op || op.state !== 'acknowledged' || op.operation_id !== m.epoch || op.target_generation !== m.host_generation) failure('unavailable');
      const lease = this.store.lease() ?? failure('lease-expired');
      const host = this.sockets.byConnection(lease.connection_id) ?? failure('stale-connection');
      this.lifecycle.leased(host);
      if (this.sockets.socket(host.socket_id)?.readyState !== WebSocket.OPEN) failure('stale-connection');
    }
  }
  async issueTurn(currentSeatConnection: CurrentSeatConnection): Promise<TurnCredentials> {
    const observed = currentSeatConnection;
    this.store.transaction(() => {
      this.current(observed);
      const previous = this.store.sql.exec<{ attempted_at: number }>('SELECT attempted_at FROM room_turn WHERE seat_id = ?', observed.connection.seat_id!).toArray()[0];
      if (previous && Date.now() - previous.attempted_at < 60000) failure('rate-limited');
      this.store.sql.exec('INSERT OR REPLACE INTO room_turn VALUES (?, ?)', observed.connection.seat_id!, Date.now());
    });
    unwrapDomain(await this.lifecycle.directory.reserveTurn({ roomId: this.store.meta()!.room_id, seatId: observed.connection.seat_id!,
      seatGeneration: observed.connection.generation!, connectionId: observed.connection.connection_id! }));
    this.current(observed);
    const result = await generate(this.env, observed.startedAt);
    this.current(observed);
    return result;
  }
  async fetch(request: Request): Promise<Response> {
    const startedAt = Date.now(), token = bearerToken(request)!;
    const body = await readSmallJson(request);
    if (!exactKeys(body, ['connectionId', 'seatGeneration', 'hostGeneration']) || !isRoomId(body.connectionId)
      || !Number.isSafeInteger(body.seatGeneration) || (body.seatGeneration as number) < 1
      || !Number.isSafeInteger(body.hostGeneration) || (body.hostGeneration as number) < 1) failure('invalid-request');
    const hash = await tokenHash(token);
    this.store.expire();
    const seat = this.auth.authenticateHash(hash);
    if (seat.generation !== body.seatGeneration) failure('stale-generation');
    if (seat.connection_id !== body.connectionId) failure('stale-connection');
    const connection = this.sockets.byConnection(body.connectionId) ?? failure('stale-connection');
    const observed = { connection, hostGeneration: body.hostGeneration as number, startedAt };
    const value = await this.issueTurn(observed);
    this.current(observed);
    return Response.json(value, { headers: { 'Cache-Control': 'no-store' } });
  }
}

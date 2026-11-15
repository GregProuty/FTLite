import { isRoomId, validateCompatibility } from '../../../src/shared/roomSession';
import { errorResponse, failure, serviceError, unwrapDomain } from './errors';
import { hashPlatformIp, normalizeJoinCode, randomToken256, tokenHash } from './crypto';
import { bearerToken, exactKeys, readSmallJson } from './http';
import type { Room } from './room';
import type { Directory } from './directory';
export { Room } from './room';
export { Directory } from './directory';
export interface Env {
  ROOMS: DurableObjectNamespace<Room>; DIRECTORY: DurableObjectNamespace<Directory>;
  IP_HASH_SALT?: string; ALLOWED_ORIGINS?: string;
  TURN_KEY_ID?: string; TURN_KEY_API_TOKEN?: string;
}
async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.search) failure('invalid-request');
  const create = url.pathname === '/v2/rooms';
  const match = /^\/v2\/rooms\/([^/]+)\/(join|socket-ticket|socket|turn|checkpoint)$/.exec(url.pathname);
  if (!create && !match) failure('not-found');
  const operation = create ? 'create' : match![2]!;
  const id = match?.[1];
  if (id && (operation === 'join' ? !normalizeJoinCode(id) : !isRoomId(id))) failure('invalid-request');
  const methods = operation === 'socket' ? ['GET'] : operation === 'checkpoint' ? ['GET', 'PUT'] : ['POST'];
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
    'Cache-Control': 'no-store', 'Access-Control-Allow-Methods': methods.join(', '),
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-FTL-Checkpoint, X-FTL-Connection, X-FTL-Seat-Generation',
  } });
  if (!methods.includes(request.method)) failure('invalid-request');
  const token = operation === 'create' || operation === 'socket' ? undefined : bearerToken(request, operation !== 'join');
  const body = ['create', 'join', 'socket-ticket'].includes(operation) ? await readSmallJson(request) : undefined;
  if (operation === 'create' && (!exactKeys(body!, ['compatibility', 'capacity']) || !validateCompatibility(body!.compatibility)
    || !Number.isInteger(body!.capacity) || (body!.capacity as number) < 1 || (body!.capacity as number) > 4)) failure('invalid-request');
  if (operation === 'join' && (!exactKeys(body!, ['compatibility']) || !validateCompatibility(body!.compatibility))) failure('invalid-request');
  if (operation === 'socket-ticket' && !exactKeys(body!, [])) failure('invalid-request');
  const ipHash = await hashPlatformIp(request, env.IP_HASH_SALT);
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('global'));
  if (operation === 'create') {
    const r = unwrapDomain(await directory.reserveRoom(body!.compatibility as Parameters<Directory['reserveRoom']>[0], body!.capacity as number, ipHash));
    const seatToken = randomToken256();
    const room = env.ROOMS.get(env.ROOMS.idFromName(r.roomId));
    const snapshot = unwrapDomain(await room.initialize(r, await tokenHash(seatToken)));
    unwrapDomain(await directory.commitRoom(r.roomId, r.chargeEpoch));
    return Response.json({ snapshot, seatId: 0, seatGeneration: 1, seatToken }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (operation === 'join') unwrapDomain(await directory.reserveJoin(ipHash));
  if (operation === 'socket') unwrapDomain(await directory.reserveSocketUpgrade(ipHash));
  const found = unwrapDomain(operation === 'join' ? await directory.resolveCode(id!) : await directory.resolveRoom(id!));
  if (!found) failure('not-found');
  const room = env.ROOMS.get(env.ROOMS.idFromName(found.roomId));
  if (operation === 'join') return Response.json(unwrapDomain(await room.join(body!.compatibility as Parameters<Room['join']>[0], token)), { headers: { 'Cache-Control': 'no-store' } });
  if (operation === 'socket-ticket') return Response.json(unwrapDomain(await room.socketTicket(token!)), { headers: { 'Cache-Control': 'no-store' } });
  if (operation === 'socket') return room.fetch(new Request('https://room/socket', { headers: { Upgrade: request.headers.get('Upgrade') ?? '' } }));
  if (operation === 'checkpoint') return room.fetch(new Request('https://room/checkpoint', request));
  if (operation === 'turn') return room.fetch(new Request('https://room/turn', request));
  return serviceError('unavailable', 503);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const allowed = origin === null || origin === 'null' || (env.ALLOWED_ORIGINS ?? '').split(',').map(x => x.trim()).includes(origin);
    let response: Response;
    try { response = allowed ? await route(request, env) : serviceError('forbidden', 403); }
    catch (error) { response = errorResponse(error); }
    finally {
      // Early auth/origin/route failures must also release an unread request.
      // Never await an untrusted stream's cancellation promise.
      if (!request.body?.locked) void request.body?.cancel().catch(() => {});
    }
    if (allowed && origin !== null) { response.headers.set('Access-Control-Allow-Origin', origin); response.headers.set('Vary', 'Origin'); }
    return response;
  },
} satisfies ExportedHandler<Env>;

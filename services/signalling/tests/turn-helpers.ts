import { setupNetwork } from '@msw/cloudflare';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { request, stub } from './socket-helpers';
import type { SeatSession } from '../../../src/shared/roomSession';

export const network = setupNetwork();
// This version names onUnhandledRequest's fail-closed strategy onUnhandledFrame.
network.configure({ onUnhandledFrame: 'error' });
// MSW creates a response clone for observation. Release that unused tee branch,
// so the real reader's cancellation reaches our synthetic streamed source.
network.events.on('response:mocked', event => { void event.response.body?.cancel().catch(() => {}); });
beforeAll(() => network.enable());
afterEach(() => network.resetHandlers());
afterAll(() => network.disable());
export const directory = () => env.DIRECTORY.get(env.DIRECTORY.idFromName('global'));
beforeEach(async () => {
  await runInDurableObject(directory(), (_, state) => {
    state.storage.sql.exec('DELETE FROM directory_turn');
  });
});
export const endpoint = 'https://rtc.live.cloudflare.com/v1/turn/keys/' + '1'.repeat(32) + '/credentials/generate-ice-servers';
export const synthetic = { iceServers: [
  { urls: ['stun:stun.cloudflare.com:3478'] },
  { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=tcp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'synthetic-ephemeral-user', credential: 'synthetic-ephemeral-password' },
] };
export function provider(body: unknown = synthetic, status = 201) {
  let calls = 0;
  network.use(http.post(endpoint, async ({ request: outgoing }) => {
    calls++;
    expect(outgoing.headers.get('Authorization')).toBe('Bearer synthetic-server-turn-secret');
    expect(outgoing.headers.get('Content-Type')).toBe('application/json');
    expect(outgoing.redirect).toBe('manual');
    expect(await outgoing.json()).toEqual({ ttl: 3600 });
    return HttpResponse.json(body as object, { status });
  }));
  return () => calls;
}
export async function identity(session: SeatSession) {
  return runInDurableObject(stub(session), room => ({ connectionId: room.store.seat(session.seatId)!.connection_id!, seatGeneration: room.store.seat(session.seatId)!.generation, hostGeneration: room.store.meta()!.host_generation }));
}
export async function turn(session: SeatSession, body?: unknown, token = session.seatToken) {
  return request(`/v2/rooms/${session.snapshot.roomId}/turn`, body ?? await identity(session), { Authorization: `Bearer ${token}` });
}
export async function error(response: Response, code: string, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toMatchObject({ error: { code } });
}
